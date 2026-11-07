import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

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

test('transcription scripts and output files are not exposed by the website', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-transcript-'));
  const dataDir = path.join(directory, 'data');
  await fs.mkdir(path.join(dataDir, 'transcripts'), { recursive: true });
  await fs.writeFile(path.join(dataDir, 'transcripts', 'private.txt'), 'Private transcript');
  const app = createApp({
    dataDir, uploadDir: path.join(directory, 'uploads'),
    password: 'transcription test passphrase',
  });
  const server = app.listen(0);
  t.after(async () => {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = `http://localhost:${server.address().port}`;
  for (const route of [
    '/data/transcripts/private.txt',
    '/transcripts/private.txt',
    '/scripts/transcribe-sermon.py',
  ]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /Private transcript/);
  }
});
