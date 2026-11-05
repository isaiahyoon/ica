import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

async function boot() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-'));
  await fs.mkdir(path.join(tmp, 'uploads/audio'), { recursive: true });
  await fs.mkdir(path.join(tmp, 'uploads/photos'), { recursive: true });
  const app = createApp({ dataDir: path.join(tmp, 'data'), uploadDir: path.join(tmp, 'uploads'), password: 'amen' });
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  return { base, close: () => server.close() };
}

async function login(base) {
  const res = await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'password=amen',
  });
  assert.equal(res.status, 302);
  return res.headers.get('set-cookie').split(';')[0];
}

test('public pages render, landing is the information page', async () => {
  const { base, close } = await boot();
  const home = await (await fetch(base)).text();
  assert.match(home, /Immanuel Church of America/);
  assert.match(home, /<link rel="icon" href="\/favicon\.png" type="image\/png">/);
  assert.match(home, /<img class="brand-mark" src="\/favicon\.png"/);
  assert.equal((await fetch(`${base}/favicon.png`)).status, 200);
  assert.equal((await fetch(`${base}/instagram-profile.png`)).status, 200);
  for (const p of ['/sermons', '/gallery']) assert.equal((await fetch(base + p)).status, 200);
  assert.equal((await fetch(base + '/nope')).status, 404);
  close();
});

test('admin routes require sign in; bad password rejected', async () => {
  const { base, close } = await boot();
  const r = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  const form = new FormData(); form.set('title', 'x');
  assert.equal((await fetch(`${base}/admin/sermons`, { method: 'POST', body: form, redirect: 'manual' })).status, 302);
  const bad = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=no' });
  assert.equal(bad.status, 401);
  close();
});

test('admin can upload, list and delete sermon audio and photos', async () => {
  const { base, close } = await boot();
  const cookie = await login(base);

  const s = new FormData();
  s.set('title', '<b>Grace</b>'); s.set('speaker', 'Pastor');
  s.set('audio', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }), 'a.mp3');
  assert.equal((await fetch(`${base}/admin/sermons`, { method: 'POST', body: s, headers: { cookie }, redirect: 'manual' })).status, 302);
  const sermons = await (await fetch(`${base}/sermons`)).text();
  assert.match(sermons, /&lt;b&gt;Grace&lt;\/b&gt;/);
  const src = sermons.match(/src="(\/uploads\/audio\/[^"]+)"/)[1];
  assert.equal((await fetch(base + src)).status, 200);

  const bad = new FormData();
  bad.set('title', 't'); bad.set('audio', new Blob(['x'], { type: 'text/html' }), 'x.html');
  assert.equal((await fetch(`${base}/admin/sermons`, { method: 'POST', body: bad, headers: { cookie } })).status, 400);

  const p = new FormData();
  p.append('photos', new Blob([new Uint8Array([1])], { type: 'image/png' }), 'a.png');
  p.set('caption', 'Picnic');
  assert.equal((await fetch(`${base}/admin/photos`, { method: 'POST', body: p, headers: { cookie }, redirect: 'manual' })).status, 302);
  assert.match(await (await fetch(`${base}/gallery`)).text(), /Picnic/);

  const admin = await (await fetch(`${base}/sermons`, { headers: { cookie } })).text();
  const del = admin.match(/action="(\/admin\/sermons\/[^"]+)"/)[1];
  await fetch(base + del, { method: 'POST', headers: { cookie }, redirect: 'manual' });
  assert.equal((await fetch(base + src)).status, 404);
  close();
});
