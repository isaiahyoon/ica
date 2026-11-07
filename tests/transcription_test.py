import importlib.util
import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "transcribe-sermon.py"
SPEC = importlib.util.spec_from_file_location("transcribe_sermon", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tool)


class Samples:
    def astype(self, dtype):
        return self

    def __truediv__(self, divisor):
        return self


class FakeNumpy:
    float32 = "float32"

    @staticmethod
    def frombuffer(buffer, dtype):
        return Samples()


class TranscriptionTests(unittest.TestCase):
    def test_local_source_and_missing_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            audio = directory / "sermon.mp3"
            audio.write_bytes(b"audio")
            self.assertEqual(tool.resolve_source(str(audio), directory), (audio.resolve(), "sermon"))
            with self.assertRaisesRegex(ValueError, "not found"):
                tool.resolve_source(str(directory / "missing.mp3"), directory)

    def test_sermon_link_resolves_and_downloads_audio(self):
        sermon_id = "eb590a2a-e48d-4160-b335-cdff6b3352cc"
        audio_id = "c0b868fd-7301-4865-adac-f41f1f0fcb5e"
        url = f"https://{tool.CHURCH_HOST}/sermons/{sermon_id}"
        requests = []

        def download(source, destination, limit, cafile=None):
            requests.append((source, limit))
            if destination.suffix == ".html":
                destination.write_text(
                    f'<audio src="/uploads/audio/{audio_id}.m4a"></audio>'
                )
            else:
                destination.write_bytes(b"audio")

        with tempfile.TemporaryDirectory() as temporary, patch.object(tool, "download", download):
            audio, name = tool.resolve_source(url, Path(temporary))
            self.assertEqual(name, sermon_id)
            self.assertEqual(audio.read_bytes(), b"audio")
            self.assertEqual(requests[1], (
                f"https://{tool.CHURCH_HOST}/uploads/audio/{audio_id}.m4a",
                tool.MAX_AUDIO_BYTES,
            ))

    def test_rejects_other_hosts_http_and_external_redirects(self):
        for url in (
            "https://example.com/sermons/id",
            f"http://{tool.CHURCH_HOST}/sermons/id",
            f"https://{tool.CHURCH_HOST}:8080/sermons/id",
            f"https://user:password@{tool.CHURCH_HOST}/sermons/id",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                tool.church_url(url)
        with self.assertRaises(ValueError):
            tool.ChurchRedirectHandler().redirect_request(
                None, None, 302, "Found", {}, "https://example.com/audio"
            )

    def test_download_limit_is_enforced(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, size):
                return b"too much audio"

        class Opener:
            def open(self, request, timeout):
                return Response()

        with tempfile.TemporaryDirectory() as temporary, patch.object(
            tool, "build_opener", return_value=Opener()
        ):
            with self.assertRaisesRegex(ValueError, "exceeds"):
                tool.download(
                    f"https://{tool.CHURCH_HOST}/audio", Path(temporary) / "audio", 4
                )

    def test_rejects_missing_or_untrusted_audio_on_page(self):
        pages = [
            "<p>No audio</p>",
            '<audio src="https://example.com/audio.mp3"></audio>',
            '<audio src="/uploads/audio/../../secret"></audio>',
            '<audio src="/a.mp3"></audio><audio src="/b.mp3"></audio>',
        ]
        for page in pages:
            with self.subTest(page=page), tempfile.TemporaryDirectory() as temporary:
                def download(source, destination, limit, cafile=None):
                    destination.write_text(page)

                with patch.object(tool, "download", download), self.assertRaises(ValueError):
                    tool.resolve_source(
                        f"https://{tool.CHURCH_HOST}/sermons/eb590a2a-e48d-4160-b335-cdff6b3352cc",
                        Path(temporary),
                    )

    def test_offsets_timestamps_and_preserves_korean(self):
        segments = tool.offset_segments([
            {"start": 1.25, "end": 8.5, "text": "  하나님의 사랑  "},
            {"start": 9, "end": 9, "text": " "},
        ], 600, 605)
        self.assertEqual(segments, [{"start": 601.25, "end": 605, "text": "하나님의 사랑"}])
        self.assertEqual(tool.timestamp(3661.5), "01:01:01")

    def make_wav(self, directory, seconds=5):
        audio = directory / "audio.wav"
        with wave.open(str(audio), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(tool.SAMPLE_RATE)
            output.writeframes(b"\0\0" * tool.SAMPLE_RATE * seconds)
        return audio

    def test_chunked_transcription_is_complete_and_timestamped(self):
        calls = []

        def recognize(samples, **options):
            calls.append(options)
            return {"segments": [{"start": 0, "end": 1, "text": "사랑"}]}

        with tempfile.TemporaryDirectory() as temporary, patch.object(tool, "CHUNK_SECONDS", 2):
            directory = Path(temporary)
            prefix = directory / "transcript"
            result = tool.transcribe(
                self.make_wav(directory), "sermon.m4a", prefix, "ko", recognize, FakeNumpy
            )
            self.assertTrue(result["complete"])
            self.assertEqual(result["duration"], 5)
            self.assertEqual([s["start"] for s in result["segments"]], [0, 2, 4])
            self.assertEqual(len(calls), 3)
            self.assertTrue(all(c["task"] == "transcribe" and c["language"] == "ko" for c in calls))
            self.assertTrue(all("initial_prompt" not in c for c in calls))
            self.assertEqual(json.loads(prefix.with_suffix(".json").read_text()), result)
            text = prefix.with_suffix(".txt").read_text()
            self.assertIn("Status: complete", text)
            self.assertIn("[00:00:04] 사랑", text)
            self.assertEqual(sorted(p.name for p in directory.iterdir()), [
                "audio.wav", "transcript.json", "transcript.txt",
            ])

    def test_failure_keeps_explicitly_incomplete_checkpoint(self):
        calls = 0

        def recognize(samples, **options):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("Model failed")
            return {"segments": [{"start": 0, "end": 1, "text": "사랑"}]}

        with tempfile.TemporaryDirectory() as temporary, patch.object(tool, "CHUNK_SECONDS", 2):
            directory = Path(temporary)
            prefix = directory / "transcript"
            with self.assertRaisesRegex(RuntimeError, "Model failed"):
                tool.transcribe(
                    self.make_wav(directory), "sermon.m4a", prefix, "ko", recognize, FakeNumpy
                )
            result = json.loads(prefix.with_suffix(".json").read_text())
            self.assertFalse(result["complete"])
            self.assertEqual(len(result["segments"]), 1)
            self.assertIn("INCOMPLETE", prefix.with_suffix(".txt").read_text())

    def test_empty_recognition_is_not_reported_as_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            prefix = directory / "transcript"
            with self.assertRaisesRegex(ValueError, "No speech"):
                tool.transcribe(
                    self.make_wav(directory, 1), "sermon.m4a", prefix, "ko",
                    lambda *args, **kwargs: {"segments": []}, FakeNumpy,
                )
            self.assertFalse(json.loads(prefix.with_suffix(".json").read_text())["complete"])


if __name__ == "__main__":
    unittest.main()
