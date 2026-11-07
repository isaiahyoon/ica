import argparse
import json
import os
import platform
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import wave
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener


ROOT = Path(__file__).resolve().parent.parent
MODEL = "mlx-community/whisper-large-v3-turbo"
CHUNK_SECONDS = 600
SAMPLE_RATE = 16000
CHURCH_HOST = "immanuelchurchofamerica.org"
MAX_AUDIO_BYTES = 200 * 1024 * 1024


def church_url(url):
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != CHURCH_HOST
        or parsed.port not in (None, 443)
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Only HTTPS links on immanuelchurchofamerica.org are supported.")
    return parsed


class ChurchRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        church_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url, destination, limit, cafile=None):
    church_url(url)
    opener = build_opener(
        ChurchRedirectHandler(), HTTPSHandler(context=ssl.create_default_context(cafile=cafile))
    )
    request = Request(url, headers={"User-Agent": "ICA-local-transcription"})
    with opener.open(request, timeout=60) as response, destination.open("xb") as output:
        total = 0
        while block := response.read(64 * 1024):
            total += len(block)
            if total > limit:
                raise ValueError(f"Download exceeds the {limit} byte limit.")
            output.write(block)


class SermonAudioParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.audio_sources = []

    def handle_starttag(self, tag, attrs):
        if tag == "audio":
            source = dict(attrs).get("src")
            if source:
                self.audio_sources.append(source)


def resolve_source(source, directory, cafile=None):
    if not source.startswith(("https://", "http://")):
        audio = Path(source).expanduser().resolve()
        if not audio.is_file():
            raise ValueError(f"Audio file not found: {audio}")
        return audio, audio.stem

    parsed = church_url(source)
    if not re.fullmatch(r"/sermons/[0-9a-fA-F-]{36}", parsed.path):
        raise ValueError("Provide an individual church sermon link, not a listing page.")
    page = directory / "sermon.html"
    download(source, page, 1024 * 1024, cafile=cafile)
    parser = SermonAudioParser()
    parser.feed(page.read_text(encoding="utf-8"))
    if len(parser.audio_sources) != 1:
        raise ValueError("The sermon page must contain exactly one audio recording.")
    audio_url = urljoin(source, parser.audio_sources[0])
    audio_path = church_url(audio_url).path
    if not re.fullmatch(r"/uploads/audio/[0-9a-fA-F-]{36}\.(mp3|m4a|aac|wav|ogg)", audio_path):
        raise ValueError("The sermon page has an unsupported audio URL.")
    audio = directory / Path(audio_path).name
    download(audio_url, audio, MAX_AUDIO_BYTES, cafile=cafile)
    return audio, parsed.path.rsplit("/", 1)[-1]


def convert_audio(source, destination):
    subprocess.run(
        [
            "afconvert", "-f", "WAVE", "-d", f"LEI16@{SAMPLE_RATE}",
            "-c", "1", "-o", str(destination), str(source),
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def timestamp(seconds):
    seconds = int(seconds)
    return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def offset_segments(segments, offset, duration):
    result = []
    for segment in segments:
        text = segment["text"].strip()
        if not text:
            continue
        start = max(offset, min(duration, offset + float(segment["start"])))
        end = max(start, min(duration, offset + float(segment["end"])))
        result.append({"start": round(start, 2), "end": round(end, 2), "text": text})
    return result


def save_transcript(prefix, document):
    content = {
        ".json": json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        ".txt": (
            f"Source: {document['source']}\n"
            f"Status: {'complete' if document['complete'] else 'INCOMPLETE'}\n"
            "Machine transcript: verify names, Scripture references, and quotations.\n\n"
            + "\n".join(
                f"[{timestamp(segment['start'])}] {segment['text']}"
                for segment in document["segments"]
            )
            + "\n"
        ),
    }
    for extension, text in content.items():
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=prefix.parent, delete=False
        ) as output:
            temporary = Path(output.name)
            try:
                output.write(text)
                output.close()
                os.replace(temporary, Path(str(prefix) + extension))
            finally:
                temporary.unlink(missing_ok=True)


def transcribe(wav_path, source, prefix, language, recognize, numpy):
    with wave.open(str(wav_path), "rb") as audio:
        rate = audio.getframerate()
        frames = audio.getnframes()
        if rate != SAMPLE_RATE or audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError("Speech recognition requires 16 kHz mono, 16-bit PCM audio.")
        if not frames:
            raise ValueError("The recording contains no audio.")
        duration = frames / rate
        document = {
            "source": source,
            "model": MODEL,
            "language": language,
            "duration": round(duration, 3),
            "complete": False,
            "segments": [],
        }
        save_transcript(prefix, document)
        chunk_frames = CHUNK_SECONDS * rate
        chunks = (frames + chunk_frames - 1) // chunk_frames
        for index in range(chunks):
            offset = index * CHUNK_SECONDS
            samples = numpy.frombuffer(
                audio.readframes(chunk_frames), dtype="<i2"
            ).astype(numpy.float32) / 32768.0
            began = time.monotonic()
            result = recognize(
                samples,
                path_or_hf_repo=MODEL,
                language=language,
                task="transcribe",
                temperature=0,
                condition_on_previous_text=False,
                verbose=None,
            )
            document["segments"].extend(
                offset_segments(result["segments"], offset, duration)
            )
            save_transcript(prefix, document)
            print(
                f"Transcribed {index + 1}/{chunks} chunks "
                f"({time.monotonic() - began:.1f}s)", flush=True
            )
        if not document["segments"]:
            raise ValueError("No speech was recognized. Check the recording and language.")
        document["complete"] = True
        save_transcript(prefix, document)
    return document


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe sermon audio locally on an Apple Silicon Mac. No audio uploads."
    )
    parser.add_argument("source", help="Audio file path or HTTPS church sermon page URL")
    parser.add_argument("--language", default="ko", help="Spoken language code (default: ko)")
    parser.add_argument(
        "--output", type=Path, help="Output prefix without extension (default: data/transcripts/<name>)"
    )
    args = parser.parse_args()
    if sys.platform != "darwin" or platform.machine() != "arm64":
        parser.error("This tool requires an Apple Silicon Mac.")
    if not shutil.which("afconvert"):
        parser.error("The macOS afconvert audio converter is required.")
    try:
        import certifi
        import mlx_whisper
        import numpy
    except ImportError as error:
        parser.exit(1, f"Missing transcription dependency: {error}. Run npm run transcribe:setup.\n")

    prefix = None
    try:
        with tempfile.TemporaryDirectory(prefix="ica-transcribe-") as temporary:
            directory = Path(temporary)
            source, name = resolve_source(args.source, directory, cafile=certifi.where())
            name = re.sub(r"[^\w-]+", "-", name).strip("-") or "sermon"
            prefix = (
                args.output.expanduser().resolve()
                if args.output
                else ROOT / "data" / "transcripts" / name
            )
            prefix.parent.mkdir(parents=True, exist_ok=True)
            if any(Path(str(prefix) + extension).exists() for extension in (".json", ".txt")):
                raise ValueError("Transcript already exists. Use --output with a new prefix.")
            wav_path = directory / "speech.wav"
            convert_audio(source, wav_path)
            transcribe(wav_path, args.source, prefix, args.language, mlx_whisper.transcribe, numpy)
        print(f"Saved {prefix}.txt and {prefix}.json")
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        details = error.stderr if isinstance(error, subprocess.CalledProcessError) else str(error)
        parser.exit(1, f"Transcription failed: {details}\nPartial transcripts, if any, remain marked INCOMPLETE.\n")


if __name__ == "__main__":
    main()
