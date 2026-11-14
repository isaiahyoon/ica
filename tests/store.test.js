import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../lib/store.js';

test('store readers only observe complete JSON while an update is written', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-store-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

  const store = createStore(dataDir);
  const previous = { revision: 0, content: 'a'.repeat(4 * 1024 * 1024) };
  const next = { revision: 1, content: 'b'.repeat(4 * 1024 * 1024) };
  await store.update('gallery', () => previous);

  let markUpdateReady;
  const updateReady = new Promise((resolve) => {
    markUpdateReady = resolve;
  });
  const update = store.update('gallery', () => {
    markUpdateReady();
    return next;
  });
  await updateReady;
  await new Promise((resolve) => setImmediate(resolve));

  const snapshots = await Promise.all(
    Array.from({ length: 8 }, () => store.read('gallery')),
  );
  await update;
  snapshots.push(await store.read('gallery'));

  for (const snapshot of snapshots) {
    assert.ok(snapshot.revision === previous.revision || snapshot.revision === next.revision);
    assert.equal(snapshot.content, snapshot.revision === previous.revision ? previous.content : next.content);
  }
  assert.deepEqual(await fs.readdir(dataDir), ['gallery.json']);
});
