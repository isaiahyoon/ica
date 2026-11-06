import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { createApp } from '../server.js';
import * as totp from '../lib/totp.js';

const PASSWORD = 'correct horse battery staple';

async function boot() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-'));
  await fs.mkdir(path.join(tmp, 'uploads/audio'), { recursive: true });
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

const FORM = (base) => ({ 'content-type': 'application/x-www-form-urlencoded', origin: base });
const secrets = new Map();
const lastSteps = new Map();
const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];

function currentCode(secret) {
  return totp.codeForStep(secret, totp.stepFor());
}

// Completes the password and authenticator steps. First use per account sets up the authenticator.
async function signIn(base, { password = PASSWORD, newPassword, name = 'owner' } = {}) {
  const first = await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual', headers: FORM(base), body: new URLSearchParams({ password }),
  });
  assert.equal(first.status, 302);
  let cookie = cookieOf(first);
  const key = `${base}:${name}`;
  if (first.headers.get('location') === '/admin/setup') {
    const html = await (await fetch(`${base}/admin/setup`, { headers: { cookie } })).text();
    const secret = base32FromSetup(html);
    const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
    const body = new URLSearchParams({ _csrf: csrf, code: currentCode(secret) });
    if (newPassword) { body.set('newPassword', newPassword); body.set('confirmPassword', newPassword); }
    const done = await fetch(`${base}/admin/setup`, { method: 'POST', headers: { ...FORM(base), cookie }, body });
    assert.equal(done.status, 200);
    secrets.set(key, secret);
    lastSteps.set(key, totp.stepFor());
    const codes = [...(await done.text()).matchAll(/<code>([A-Z0-9]{5}-[A-Z0-9]{5})<\/code>/g)].map((m) => m[1]);
    return { cookie: cookieOf(done), setCookie: done.headers.get('set-cookie'), codes, secret };
  }
  assert.equal(first.headers.get('location'), '/admin/verify');
  const html = await (await fetch(`${base}/admin/verify`, { headers: { cookie } })).text();
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  const secret = secrets.get(key);
  // A code works once, so move to the next 30-second step when the current one was already used.
  const step = Math.max(totp.stepFor(), (lastSteps.get(key) ?? 0) + 1);
  assert.ok(step <= totp.stepFor() + 1, 'too many sign-ins in one time window for this test');
  lastSteps.set(key, step);
  const done = await fetch(`${base}/admin/verify`, {
    method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie },
    body: new URLSearchParams({ _csrf: csrf, code: totp.codeForStep(secret, step) }),
  });
  assert.equal(done.status, 302);
  return { cookie: cookieOf(done), setCookie: done.headers.get('set-cookie'), secret };
}

function base32FromSetup(html) {
  return html.match(/<code>([A-Z2-7 ]+)<\/code>/)[1].replaceAll(' ', '');
}

async function login(base) {
  return (await signIn(base)).cookie;
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
  assert.match(home, /<h1><span class="bilingual"><span lang="en">Immanuel Church of America<\/span><span lang="ko">미주 임마누엘 교회<\/span><\/span><\/h1>/);
  assert.doesNotMatch(home, /<p class="eyebrow" lang="ko">미주 임마누엘 교회<\/p>/);
  assert.match(home, /<link rel="icon" href="\/favicon\.png" type="image\/png">/);
  assert.match(home, /<img class="brand-mark" src="\/favicon.png"/);
  assert.match(home, /Since 1994/);
  assert.equal((await fetch(`${base}/favicon.png`)).status, 200);
  assert.match(home, /<meta property="og:url" content="https:\/\/immanuelchurchofamerica\.org\/">/);
  assert.match(home, /<meta property="og:image" content="https:\/\/immanuelchurchofamerica\.org\/link-preview\.png">/);
  assert.match(home, /<meta property="og:image:width" content="1200">/);
  assert.match(home, /<meta property="og:image:height" content="630">/);
  assert.match(home, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(home, /<meta name="twitter:image" content="https:\/\/immanuelchurchofamerica\.org\/link-preview\.png">/);
  assert.match(home, /<link rel="canonical" href="https:\/\/immanuelchurchofamerica\.org\/">/);
  const preview = await fetch(`${base}/link-preview.png`);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-type'), /image\/png/);
  assert.equal((await fetch(`${base}/instagram-profile.png`)).status, 200);
  const sermons = await fetch(`${base}/sermons`);
  assert.equal(sermons.status, 200);
  assert.doesNotMatch(await sermons.text(), /href="\/admin(?:\/login)?"/);
  assert.equal((await fetch(`${base}/gallery`)).status, 404);
  assert.doesNotMatch(home, /Gallery|사진 갤러리|See our life together/);
  assert.doesNotMatch(home, /href="\/gallery"/);
  assert.doesNotMatch(home, /href="\/admin(?:\/login)?"/);
  assert.match(home, /<a class="brand home-link" href="\/"/);
  assert.match(home, /<nav[^>]*>[\s\S]*href="\/contact"[\s\S]*<\/nav>/);
  assert.match(home, /class="btn btn-hero btn-mint" href="\/about"/);
  assert.match(home, /<nav[^>]*>[\s\S]*href="\/about"[\s\S]*<\/nav>/);
  const about = await fetch(`${base}/about`);
  assert.equal(about.status, 200);
  const aboutHtml = await about.text();
  assert.match(aboutHtml, /<meta property="og:url" content="https:\/\/immanuelchurchofamerica\.org\/about">/);
  assert.match(aboutHtml, /<link rel="canonical" href="https:\/\/immanuelchurchofamerica\.org\/about">/);
  assert.match(aboutHtml, /<h1>.*About.*소개.*<\/h1>/s);
  for (const detail of [
    'We are a family church.', 'Our preaching is biblically sound.',
    'late 19th and 20th centuries', 'We affirm the Apostles’ Creed and the Lord’s Prayer.',
    'John Yoon', '(윤태선)', 'href="tel:+13237312323"',
    'Joshua Won', '(원여호수아)', 'href="tel:+12132105582"',
    'Kyu Ho Yeo', '(여규호)', 'href="tel:+12135037883"',
    'Hyi Shik Lee', '(이희식)', 'href="tel:+12132486700"',
  ]) assert.ok(aboutHtml.includes(detail), `About page should include "${detail}"`);
  assert.match(aboutHtml, /href="\/about" aria-current="page" class="is-active"/);
  const contact = await fetch(`${base}/contact`);
  assert.equal(contact.status, 200);
  const contactHtml = await contact.text();
  assert.match(contactHtml, /<h1>.*Contact.*연락처/s);
  assert.match(contactHtml, /class="contact-scripture cornerstone"[\s\S]*<img src="\/favicon\.png" alt="Immanuel Church of America logo"/);
  assert.match(contactHtml, /The Glass of the Word<\/span>[\s\S]*<img src="\/favicon\.png"[\s\S]*말씀의 거울/);
  assert.match(contactHtml, /For now we see through a glass, darkly;.*1 Corinthians 13:12/s);
  assert.match(contactHtml, /고린도전서 13:12/);
  assert.match(contactHtml, /href="https:\/\/www\.google\.com\/maps\/place\/Immanuel\+Church\+of\+America\+%2F\+%EB%AF%B8%EC%A3%BC%EC%9E%84%EB%A7%88%EB%88%84%EC%97%98%EA%B5%90%ED%9A%8C\/@34\.0397122,-118\.3242422,17z\/data=!3m1!4b1!4m6!3m5!1s0x80c2b867941260c9:0xc64dfc88582a36a6!8m2!3d34\.0397078!4d-118\.3216673!16s%2Fg%2F1262s7wvv\?entry=ttu&amp;g_ep=EgoyMDI2MTEwMi4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noopener noreferrer">[\s\S]*3406 W Washington Blvd 2F<br>Los Angeles, CA 90018/);
  assert.match(contactHtml, /href="https:\/\/www\.instagram\.com\/immanuelchurchofamerica\/" target="_blank" rel="noopener noreferrer">@immanuelchurchofamerica/);
  for (const detail of [
    'Sunday: 9:00 am, 11:00 am, and 2:00 pm',
    'Wednesday: 7:30 pm',
    'Friday: 7:30 pm',
    'Lunch is provided after the 11:00 am Sunday service.',
    'English interpretation is available on request.',
    'Free parking is available',
    'Our church is ADA accessible, with an elevator available to take you to the second floor.',
    '엘리베이터로 2층까지 이동하실 수 있습니다.',
    'All are welcome.',
    '주일: 오전 9시, 오전 11시, 오후 2시',
    '수요일: 오후 7시 30분',
    '금요일: 오후 7시 30분',
  ]) assert.ok(contactHtml.includes(detail), `Contact page should include "${detail}"`);
  const loginPage = await (await fetch(`${base}/admin/login`)).text();
  assert.match(loginPage, /<form method="post" action="\/admin\/login"/);
  assert.doesNotMatch(loginPage, /href="\/admin(?:\/login)?"/);
  assert.equal((await fetch(base + '/nope')).status, 404);
});

test('configured storage paths serve persistent sermon data and uploads', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-storage-'));
  const dataDir = path.join(tmp, 'data');
  const uploadDir = path.join(tmp, 'uploads');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(path.join(uploadDir, 'audio'), { recursive: true });
  await fs.mkdir(path.join(uploadDir, 'photos'), { recursive: true });
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify([{
    id: 'persisted-sermon', title: 'Persisted sermon', speaker: '', date: '',
    scripture: '', description: '', file: 'sermon.mp3', createdAt: new Date().toISOString(),
  }]));
  await fs.writeFile(path.join(uploadDir, 'photos', 'persisted.png'), 'photo');
  await fs.writeFile(path.join(dataDir, 'photos.json'), JSON.stringify([{
    id: 'legacy-photo', caption: 'Legacy photo', file: 'persisted.png',
    createdAt: new Date().toISOString(),
  }]));

  const previousDataDir = process.env.ICA_DATA_DIR;
  const previousUploadDir = process.env.ICA_UPLOAD_DIR;
  process.env.ICA_DATA_DIR = dataDir;
  process.env.ICA_UPLOAD_DIR = uploadDir;
  let app;
  try {
    app = createApp({ password: PASSWORD });
  } finally {
    if (previousDataDir === undefined) delete process.env.ICA_DATA_DIR;
    else process.env.ICA_DATA_DIR = previousDataDir;
    if (previousUploadDir === undefined) delete process.env.ICA_UPLOAD_DIR;
    else process.env.ICA_UPLOAD_DIR = previousUploadDir;
  }

  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  t.after(async () => {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const sermons = await (await fetch(`${base}/sermons`)).text();
  assert.match(sermons, /Persisted sermon/);
  assert.equal((await fetch(`${base}/gallery`)).status, 404);
  assert.equal((await fetch(`${base}/uploads/photos/persisted.png`)).status, 404);
});

test('sermons can be shared with the native share sheet or copied as a link', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify([{
    id: 'share-id', title: 'A sermon', speaker: '', date: '', scripture: '',
    description: '', file: 'sermon.mp3', createdAt: new Date().toISOString(),
  }]));
  const html = await (await fetch(`${base}/sermons`)).text();
  assert.match(html, /data-share-title="A sermon"/);
  assert.match(html, /class="btn btn-ghost sermon-action share-link" href="\/sermons\/share-id"/);
  assert.match(html, /class="btn btn-ghost sermon-action copy-link" href="\/sermons\/share-id"/);
  assert.match(html, /class="btn btn-ghost sermon-action share-link"[\s\S]*Share sermon[\s\S]*설교 공유/);
  assert.match(html, /class="btn btn-ghost sermon-action copy-link"[\s\S]*Copy link[\s\S]*링크 복사/);
  const detailResponse = await fetch(`${base}/sermons/share-id`);
  assert.equal(detailResponse.status, 200);
  const detailHtml = await detailResponse.text();
  assert.match(detailHtml, /href="\/sermons"><span class="bilingual"><span lang="en">All sermons<\/span>/);
  assert.match(detailHtml, /<h3>A sermon<\/h3>/);
  assert.doesNotMatch(detailHtml, /class="pagination"/);
  assert.equal((await fetch(`${base}/sermons/missing-sermon`)).status, 404);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);

  const createHandler = (navigator) => {
    let handler;
    const location = { origin: base, href: '' };
    runInNewContext(script, {
      document: { addEventListener: (_type, callback) => { handler = callback; } },
      navigator, location, URL, setTimeout: () => 0,
    });
    const links = {
      share: {
        dataset: { shareTitle: 'A sermon', copied: 'Link copied · 링크 복사됨' }, innerHTML: 'Share sermon', textContent: '',
        getAttribute: () => '/sermons/share-id',
      },
      copy: {
        dataset: { copied: 'Link copied · 링크 복사됨' }, innerHTML: 'Copy link', textContent: '',
        getAttribute: () => '/sermons/share-id',
      },
    };
    const eventFor = (action) => ({
      target: { closest: (selector) => selector === `.${action}-link` ? links[action] : null },
      prevented: false,
      preventDefault() { this.prevented = true; },
    });
    return { handler, links, eventFor, location };
  };

  const shared = [];
  const native = createHandler({ share: async (data) => shared.push(data) });
  const shareEvent = native.eventFor('share');
  await native.handler(shareEvent);
  assert.equal(shareEvent.prevented, true);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].title, 'A sermon');
  assert.equal(shared[0].url, `${base}/sermons/share-id`);

  let copied;
  const shareFallback = createHandler({ clipboard: { writeText: async (url) => { copied = url; } } });
  await shareFallback.handler(shareFallback.eventFor('share'));
  assert.equal(copied, `${base}/sermons/share-id`);
  assert.equal(shareFallback.links.share.textContent, 'Link copied · 링크 복사됨');

  const fallback = createHandler({
    share: async () => assert.fail('Copy link should not open the share sheet'),
    clipboard: { writeText: async (url) => { copied = url; } },
  });
  const copyEvent = fallback.eventFor('copy');
  await fallback.handler(copyEvent);
  assert.equal(copyEvent.prevented, true);
  assert.equal(copied, `${base}/sermons/share-id`);
  assert.equal(fallback.links.copy.textContent, 'Link copied · 링크 복사됨');

  const canceled = createHandler({
    share: async () => { throw Object.assign(new Error('Canceled'), { name: 'AbortError' }); },
    clipboard: { writeText: async () => assert.fail('Canceled sharing should not copy the link') },
  });
  await canceled.handler(canceled.eventFor('share'));
  assert.equal(canceled.location.href, '');

  const direct = createHandler({});
  await direct.handler(direct.eventFor('copy'));
  assert.equal(direct.location.href, `${base}/sermons/share-id`);
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
  const { setCookie } = await signIn(base);
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

test('admin can upload, list and delete sermon audio', async (t) => {
  const { base, uploadDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const csrf = await csrfToken(base, cookie);
  const adminPage = await (await fetch(`${base}/admin`, { headers: { cookie } })).text();
  assert.doesNotMatch(adminPage, /photo|gallery|사진|갤러리/i);
  assert.equal((await fetch(`${base}/gallery`)).status, 404);
  assert.equal((await fetch(`${base}/admin/photos`, {
    method: 'POST', headers: { cookie, origin: base }, redirect: 'manual',
  })).status, 404);

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
  assert.match(sermons, new RegExp(`href="/sermons/${sid}"`));
  assert.equal((await fetch(`${base}/sermons/${sid}`)).status, 200);
  const src = sermons.match(/src="(\/uploads\/audio\/[^"]+)"/)[1];
  assert.equal((await fetch(base + src)).status, 200);

  assert.doesNotMatch(sermons, /\/edit/);
  const sedit = (fields) => fetch(`${base}/admin/sermons/${sid}/edit`, { method: 'POST', body: new URLSearchParams({ _csrf: csrf, ...fields }), headers: { cookie, origin: base }, redirect: 'manual' });
  assert.equal((await sedit({ title: 'Renamed <b>', speaker: 'Pastor Kim', date: '2001-02-03' })).status, 302);
  const renamed = await (await fetch(`${base}/sermons`, { headers: { cookie } })).text();
  assert.match(renamed, /Renamed &lt;b&gt;/);
  assert.match(renamed, /Pastor Kim/);
  assert.equal((await sedit({ title: '' })).status, 400);
  assert.equal((await fetch(`${base}/admin/sermons/nope/edit`, { method: 'POST', body: new URLSearchParams({ _csrf: csrf, title: 'x' }), headers: { cookie, origin: base }, redirect: 'manual' })).status, 404);
  assert.equal((await fetch(`${base}/admin/sermons/${sid}/edit`, { method: 'POST', body: new URLSearchParams({ title: 'x' }), headers: { cookie, origin: base }, redirect: 'manual' })).status, 403);

  const bad = new FormData();
  bad.set('_csrf', csrf);
  bad.set('title', 't'); bad.set('audio', new Blob(['x'], { type: 'text/html' }), 'x.html');
  assert.equal((await fetch(`${base}/admin/sermons`, { method: 'POST', body: bad, headers: { cookie, origin: base } })).status, 400);

  const admin = await (await fetch(`${base}/sermons`, { headers: { cookie } })).text();
  const del = admin.match(/action="(\/admin\/sermons\/[^"]+\/delete)"/)[1];
  const deleted = await fetch(base + del, {
    method: 'POST',
    headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf }),
    redirect: 'manual',
  });
  assert.equal(deleted.status, 302);
  assert.equal((await fetch(base + src)).status, 404);
});

test('sermons paginate at 10', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const mk = (n, extra) => Array.from({ length: n }, (_, i) => ({
    id: `id${i}`, title: `T${i}`, file: `f${i}.mp3`, ...extra(i),
  }));
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(mk(23, (i) => ({ createdAt: new Date(i * 1000).toISOString() }))));
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
});

test('TOTP matches the RFC 6238 test vector', () => {
  const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totp.codeForStep(secret, 1), '287082');
  assert.equal(totp.verifyCode(secret, '287082', 59_000), 1);
  assert.equal(totp.verifyCode(secret, '000000', 59_000), null);
});

test('password alone never opens the admin area; setup and code steps need a pending session', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  for (const route of ['/admin/setup', '/admin/verify']) {
    const res = await fetch(`${base}${route}`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin/login');
  }
  const first = await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual', headers: FORM(base), body: new URLSearchParams({ password: PASSWORD }),
  });
  const cookie = cookieOf(first);
  assert.equal(first.headers.get('location'), '/admin/setup');
  assert.equal((await fetch(`${base}/admin`, { headers: { cookie }, redirect: 'manual' })).status, 302);
  const html = await (await fetch(`${base}/admin/setup`, { headers: { cookie } })).text();
  assert.match(html, /<svg/);
  assert.match(html, /Google Authenticator/);
  assert.match(html, /구글|Authenticator/);
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  const wrong = await fetch(`${base}/admin/setup`, {
    method: 'POST', headers: { ...FORM(base), cookie }, body: new URLSearchParams({ _csrf: csrf, code: '000000' }),
  });
  assert.equal(wrong.status, 400);
  assert.equal((await fetch(`${base}/admin`, { headers: { cookie }, redirect: 'manual' })).status, 302);
  const noCsrf = await fetch(`${base}/admin/setup`, {
    method: 'POST', headers: { ...FORM(base), cookie }, body: new URLSearchParams({ code: currentCode(base32FromSetup(html)) }),
  });
  assert.equal(noCsrf.status, 403);
});

test('second step rejects wrong and replayed codes, and recovery codes work once', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  const { codes, secret } = await signIn(base);
  assert.equal(codes.length, 8);

  const attempt = async (code) => {
    const first = await fetch(`${base}/admin/login`, {
      method: 'POST', redirect: 'manual', headers: FORM(base), body: new URLSearchParams({ password: PASSWORD }),
    });
    const cookie = cookieOf(first);
    assert.equal(first.headers.get('location'), '/admin/verify');
    const html = await (await fetch(`${base}/admin/verify`, { headers: { cookie } })).text();
    const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
    const res = await fetch(`${base}/admin/verify`, {
      method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie },
      body: new URLSearchParams({ _csrf: csrf, code }),
    });
    return { res, cookie: res.status === 302 ? cookieOf(res) : cookie };
  };

  assert.equal((await attempt('000000')).res.status, 401);
  // The code used during setup cannot be replayed.
  const used = lastSteps.get(`${base}:owner`);
  assert.equal((await attempt(totp.codeForStep(secret, used))).res.status, 401);
  const next = await attempt(totp.codeForStep(secret, used + 1));
  assert.equal(next.res.status, 302);
  assert.equal((await fetch(`${base}/admin`, { headers: { cookie: next.cookie } })).status, 200);

  const viaRecovery = await attempt(codes[0].toLowerCase());
  assert.equal(viaRecovery.res.status, 302);
  assert.equal((await fetch(`${base}/admin`, { headers: { cookie: viaRecovery.cookie } })).status, 200);
  assert.equal((await attempt(codes[0])).res.status, 401);
});

test('owner adds, resets and removes admins; admins have their own passwords', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  const owner = await signIn(base);
  const ownerCsrf = await csrfToken(base, owner.cookie);
  const post = (path, cookie, csrf, fields = {}) => fetch(`${base}${path}`, {
    method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie },
    body: new URLSearchParams({ _csrf: csrf, ...fields }),
  });

  assert.equal((await post('/admin/admins', owner.cookie, ownerCsrf, { name: '  ' })).status, 400);
  const added = await post('/admin/admins', owner.cookie, ownerCsrf, { name: 'Grace <b>' });
  assert.equal(added.status, 200);
  const addedHtml = await added.text();
  assert.match(addedHtml, /Grace &lt;b&gt;/);
  const temp = addedHtml.match(/<code>([A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})<\/code>/)[1];

  const newPassword = 'grace has her own long password';
  const grace = await signIn(base, { password: temp, newPassword, name: 'grace' });
  assert.equal(grace.codes.length, 8);
  const graceAdmin = await (await fetch(`${base}/admin`, { headers: { cookie: grace.cookie } })).text();
  assert.doesNotMatch(graceAdmin, /Add an admin/);
  const graceCsrf = graceAdmin.match(/name="_csrf" value="([^"]+)"/)[1];
  assert.equal((await post('/admin/admins', grace.cookie, graceCsrf, { name: 'Eve' })).status, 403);

  // The temporary code stops working; her own password works.
  const old = await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual', headers: FORM(base), body: new URLSearchParams({ password: temp }),
  });
  assert.equal(old.status, 401);
  const again = await signIn(base, { password: newPassword, name: 'grace' });
  assert.ok(again.cookie);

  const list = await (await fetch(`${base}/admin`, { headers: { cookie: owner.cookie } })).text();
  assert.match(list, /Grace &lt;b&gt;/);
  const id = list.match(/\/admin\/admins\/([0-9a-f-]{36})\/remove/)[1];

  const reset = await post(`/admin/admins/${id}/reset`, owner.cookie, ownerCsrf);
  assert.equal(reset.status, 200);
  assert.equal((await fetch(`${base}/admin`, { headers: { cookie: grace.cookie }, redirect: 'manual' })).status, 302);
  assert.equal((await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual', headers: FORM(base), body: new URLSearchParams({ password: newPassword }),
  })).status, 401);

  const removed = await post(`/admin/admins/${id}/remove`, owner.cookie, ownerCsrf);
  assert.equal(removed.status, 302);
  const after = await (await fetch(`${base}/admin`, { headers: { cookie: owner.cookie } })).text();
  assert.doesNotMatch(after, /Grace/);
  assert.equal((await post('/admin/admins/owner/remove', owner.cookie, ownerCsrf)).status, 302);
  assert.match(await (await fetch(`${base}/admin`, { headers: { cookie: owner.cookie } })).text(), /Owner/);
});

test('an admin cannot reuse another admin\'s password', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  const owner = await signIn(base);
  const csrf = await csrfToken(base, owner.cookie);
  const added = await (await fetch(`${base}/admin/admins`, {
    method: 'POST', headers: { ...FORM(base), cookie: owner.cookie }, body: new URLSearchParams({ _csrf: csrf, name: 'Sam' }),
  })).text();
  const temp = added.match(/<code>([A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})<\/code>/)[1];
  const first = await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual', headers: FORM(base), body: new URLSearchParams({ password: temp }),
  });
  const cookie = cookieOf(first);
  const html = await (await fetch(`${base}/admin/setup`, { headers: { cookie } })).text();
  const res = await fetch(`${base}/admin/setup`, {
    method: 'POST', headers: { ...FORM(base), cookie },
    body: new URLSearchParams({
      _csrf: html.match(/name="_csrf" value="([^"]+)"/)[1], code: currentCode(base32FromSetup(html)),
      newPassword: PASSWORD, confirmPassword: PASSWORD,
    }),
  });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /choose a different password/);
});
