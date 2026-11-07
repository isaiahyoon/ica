import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const exec = promisify(execFile);

test('local transcription supports sermon links, private outputs, chunking and explicit failures', async () => {
  const { stderr } = await exec('python3', [
    '-B', fileURLToPath(new URL('./transcription_test.py', import.meta.url)),
  ]);
  assert.match(stderr, /Ran 9 tests/);
  assert.match(stderr, /\bOK\b/);
});

test('local transcription help does not require model installation', async () => {
  const { stdout } = await exec('python3', [
    '-B', fileURLToPath(new URL('../scripts/transcribe-sermon.py', import.meta.url)), '--help',
  ]);
  assert.match(stdout, /No audio uploads/);
  assert.match(stdout, /--output/);
});
