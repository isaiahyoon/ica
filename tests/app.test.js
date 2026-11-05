import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

const PASSWORD = 'correct horse battery staple';

async function boot() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-'));
  await fs.mkdir(path.join(tmp, 'uploads/audio'), { recursive: true });
  await fs.mkdir(path.join(tmp, 'uploads/photos'), { recursive: true });
  const app = createApp({ dataDir: path.join(tmp, 'data'), uploadDir: path.join(tmp, 'uploads'), password: PASSWORD });
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  return {
    base,
    uploadDir: path.join(tmp, 'uploads'),
    dataDir: path.join(tmp, 'data'),
    close: async () => {
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closed;
      await fs.rm(tmp, { recursive: true, force: true });
    },
  };
}

async function login(base) {
  const res = await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  assert.equal(res.status, 302);
  return res.headers.get('set-cookie').split(';')[0];
}

async function csrfToken(base, cookie) {
  const html = await (await fetch(`${base}/admin`, { headers: { cookie } })).text();
  return html.match(/name="_csrf" value="([^"]+)"/)[1];
}

test('public pages render, landing is the information page', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  const home = await (await fetch(base)).text();
  assert.match(home, /Immanuel Church of America/);
  assert.match(home, /<link rel="icon" href="\/favicon\.png" type="image\/png">/);
  assert.match(home, /<img class="brand-mark" src="\/favicon.png"/);
  assert.match(home, /Since 1994/);
  assert.equal((await fetch(`${base}/favicon.png`)).status, 200);
  assert.equal((await fetch(`${base}/instagram-profile.png`)).status, 200);
  for (const p of ['/sermons', '/gallery']) {
    const response = await fetch(base + p);
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /href="\/admin(?:\/login)?"/);
  }
  assert.doesNotMatch(home, /href="\/admin(?:\/login)?"/);
  assert.match(home, /<a class="brand home-link" href="\/"/);
  assert.match(home, /<nav[^>]*>[\s\S]*href="\/contact"[\s\S]*<\/nav>/);
  const contact = await fetch(`${base}/contact`);
  assert.equal(contact.status, 200);
  assert.match(await contact.text(), /<h1>.*Contact.*연락처/s);
  const loginPage = await (await fetch(`${base}/admin/login`)).text();
  assert.match(loginPage, /<form method="post" action="\/admin\/login"/);
  assert.doesNotMatch(loginPage, /href="\/admin(?:\/login)?"/);
  assert.equal((await fetch(base + '/nope')).status, 404);
});

test('admin routes require sign in; missing and incorrect passwords are rejected', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  assert.throws(() => createApp({ password: 'too-short' }), /16 non-whitespace characters/);
  const r = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  const form = new FormData(); form.set('title', 'x');
  assert.equal((await fetch(`${base}/admin/sermons`, { method: 'POST', body: form, redirect: 'manual' })).status, 302);

  for (const password of ['', 'incorrect password']) {
    const bad = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
      body: new URLSearchParams({ password }),
    });
    assert.equal(bad.status, 401);
    assert.equal(bad.headers.get('set-cookie'), null);
  }
});

test('admin sessions use hardened cookies, require CSRF tokens, and revoke on logout', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  const loginResponse = await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  assert.equal(loginResponse.status, 302);
  const setCookie = loginResponse.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Path=\//i);
  assert.match(setCookie, /Max-Age=28800/i);
  assert.doesNotMatch(setCookie, /;\s*Domain=/i);
  const cookie = setCookie.split(';')[0];
  const [name, value] = cookie.split('=');
  const forgedCookie = `${name}=${value.slice(0, -1)}${value.endsWith('A') ? 'B' : 'A'}`;
  assert.equal((await fetch(`${base}/admin`, { headers: { cookie: forgedCookie }, redirect: 'manual' })).status, 302);
  const privatePage = await fetch(`${base}/admin`, { headers: { cookie } });
  assert.match(privatePage.headers.get('cache-control'), /no-store/i);
  const csrf = await csrfToken(base, cookie);

  const rejectedLogout = await fetch(`${base}/admin/logout`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: '',
  });
  assert.equal(rejectedLogout.status, 403);
  assert.equal((await fetch(`${base}/admin`, { headers: { cookie }, redirect: 'manual' })).status, 200);

  const logout = await fetch(`${base}/admin/logout`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf }),
  });
  assert.equal(logout.status, 302);
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
  assert.equal((await fetch(`${base}/admin`, { headers: { cookie }, redirect: 'manual' })).status, 302);
});

test('admin login enforces same-origin requests and throttles failed attempts', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  const crossOrigin = await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://attacker.example' },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  assert.equal(crossOrigin.status, 403);
  const noOrigin = await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  assert.equal(noOrigin.status, 403);

  for (let i = 0; i < 8; i++) {
    const response = await fetch(`${base}/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
      body: new URLSearchParams({ password: 'incorrect password' }),
    });
    assert.equal(response.status, 401);
  }
  const limited = await fetch(`${base}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.match(limited.headers.get('cache-control'), /no-store/i);
});

test('admin can upload, list and delete sermon audio and photos', async (t) => {
  const { base, uploadDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const csrf = await csrfToken(base, cookie);
  const adminPage = await (await fetch(`${base}/admin`, { headers: { cookie } })).text();
  assert.match(adminPage, /id="photo-captions" class="photo-upload-list" role="list"/);
  assert.match(adminPage, /URL\.createObjectURL\(file\)/);
  assert.match(adminPage, /row\.append\(figure, label\)/);

  const s = new FormData();
  s.set('_csrf', csrf);
  s.set('title', '<b>Grace</b>'); s.set('speaker', 'Pastor');
  s.set('audio', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }), 'a.mp3');
  const noCsrf = new FormData();
  noCsrf.set('title', 'Rejected');
  noCsrf.set('audio', new Blob(['x'], { type: 'audio/mpeg' }), 'rejected.mp3');
  const rejectedUpload = await fetch(`${base}/admin/sermons`, {
    method: 'POST', body: noCsrf, headers: { cookie, origin: base },
  });
  assert.equal(rejectedUpload.status, 403);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'audio')), []);

  assert.equal((await fetch(`${base}/admin/sermons`, { method: 'POST', body: s, headers: { cookie, origin: base }, redirect: 'manual' })).status, 302);
  const sermons = await (await fetch(`${base}/sermons`)).text();
  assert.match(sermons, /&lt;b&gt;Grace&lt;\/b&gt;/);
  const sid = sermons.match(/id="sermon-([^"]+)"/)[1];
  assert.match(sermons, new RegExp(`href="/sermons#sermon-${sid}"`));
  const src = sermons.match(/src="(\/uploads\/audio\/[^"]+)"/)[1];
  assert.equal((await fetch(base + src)).status, 200);

  const bad = new FormData();
  bad.set('_csrf', csrf);
  bad.set('title', 't'); bad.set('audio', new Blob(['x'], { type: 'text/html' }), 'x.html');
  assert.equal((await fetch(`${base}/admin/sermons`, { method: 'POST', body: bad, headers: { cookie, origin: base } })).status, 400);

  const p = new FormData();
  p.set('_csrf', csrf);
  p.append('photos', new Blob([new Uint8Array([1])], { type: 'image/png' }), 'a.png');
  p.set('caption', 'Picnic');
  assert.equal((await fetch(`${base}/admin/photos`, { method: 'POST', body: p, headers: { cookie, origin: base }, redirect: 'manual' })).status, 302);
  assert.match(await (await fetch(`${base}/gallery`)).text(), /Picnic/);

  const b = new FormData();
  b.set('_csrf', csrf);
  for (const n of ['b1', 'b2']) b.append('photos', new Blob([new Uint8Array([1])], { type: 'image/png' }), n + '.png');
  b.set('caption', 'Shared');
  b.append('captions', 'First one'); b.append('captions', '');
  assert.equal((await fetch(`${base}/admin/photos`, { method: 'POST', body: b, headers: { cookie, origin: base }, redirect: 'manual' })).status, 302);
  const gal = await (await fetch(`${base}/gallery`, { headers: { cookie } })).text();
  assert.match(gal, /First one/);
  assert.match(gal, /Shared/);
  const pid = gal.match(/\/admin\/photos\/([^/]+)\/edit/)[1];
  const bodyEdit = new URLSearchParams({ _csrf: csrf, caption: 'Edited <i>' });
  const edit = await fetch(`${base}/admin/photos/${pid}/edit`, { method: 'POST', body: bodyEdit, headers: { cookie, origin: base }, redirect: 'manual' });
  assert.equal(edit.status, 302);
  assert.match(await (await fetch(`${base}/gallery`)).text(), /Edited &lt;i&gt;/);

  const maxBatch = new FormData();
  maxBatch.set('_csrf', csrf);
  for (let i = 0; i < 50; i++) {
    maxBatch.append('photos', new Blob([new Uint8Array([1])], { type: 'image/png' }), `batch-${i}.png`);
  }
  const batchUpload = await fetch(`${base}/admin/photos`, {
    method: 'POST', body: maxBatch, headers: { cookie, origin: base }, redirect: 'manual',
  });
  assert.equal(batchUpload.status, 302);
  assert.equal(new URL(batchUpload.headers.get('location'), base).searchParams.get('notice'), '50 photo(s) added.');

  const admin = await (await fetch(`${base}/sermons`, { headers: { cookie } })).text();
  const del = admin.match(/action="(\/admin\/sermons\/[^"]+)"/)[1];
  const deleted = await fetch(base + del, {
    method: 'POST',
    headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf }),
    redirect: 'manual',
  });
  assert.equal(deleted.status, 302);
  assert.equal((await fetch(base + src)).status, 404);
});

test('sermons paginate at 10 and gallery at 20', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const mk = (n, extra) => Array.from({ length: n }, (_, i) => ({
    id: `id${i}`, title: `T${i}`, caption: `C${i}`, file: `f${i}.mp3`, ...extra(i),
  }));
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(mk(23, (i) => ({ createdAt: new Date(i * 1000).toISOString() }))));
  await fs.writeFile(path.join(dataDir, 'photos.json'), JSON.stringify(mk(45, (i) => ({ createdAt: new Date(i * 1000).toISOString() }))));
  const count = (h, re) => (h.match(re) || []).length;
  const s1 = await (await fetch(`${base}/sermons`)).text();
  assert.equal(count(s1, /<article class="sermon"/g), 10);
  assert.match(s1, /page=2/);
  assert.match(s1, /class="page-num is-current" aria-current="page">1</);
  const s3 = await (await fetch(`${base}/sermons?page=3`)).text();
  assert.match(s3, /class="page-step next is-disabled"/);
  assert.match(s3, /rel="prev"/);
  assert.equal(count(s3, /<article class="sermon"/g), 3);
  assert.equal(count(await (await fetch(`${base}/sermons?page=99`)).text(), /<article class="sermon"/g), 3);
  assert.equal(count(await (await fetch(`${base}/sermons?page=abc`)).text(), /<article class="sermon"/g), 10);
  assert.equal(count(await (await fetch(`${base}/gallery`)).text(), /<img src="\/uploads\/photos/g), 20);
  assert.equal(count(await (await fetch(`${base}/gallery?page=3`)).text(), /<img src="\/uploads\/photos/g), 5);
});
