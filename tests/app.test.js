import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { createApp } from '../server.js';
import * as totp from '../lib/totp.js';
import sharp from 'sharp';
import { createSermonPreviewRenderer } from '../lib/sermon-preview.js';

const PASSWORD = 'correct horse battery staple';

async function boot(options = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ica-'));
  await fs.mkdir(path.join(tmp, 'uploads/audio'), { recursive: true });
  const app = createApp({ dataDir: path.join(tmp, 'data'), uploadDir: path.join(tmp, 'uploads'), password: PASSWORD, ...options });
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
  assert.doesNotMatch(home, /data-website-id=/);
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
  assert.doesNotMatch(home, /class="scripture-picker"|class="scripture-language-links"/);
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
    'John Yoon', '(윤태선)', 'href="tel:+13237319191"',
    'Joshua Won', '(원 여호수아)', 'href="tel:+12132105582"',
    'Kyu Ho Yeo', '(여규호)', 'href="tel:+12135037883"',
    'Hyi Shik Lee', '(이희식)', 'href="tel:+12132486700"',
    'Eun Young Won', '(원은영)', 'Missionary', '전도사',
    'Myung Jun Park', '(박명준)', 'Conductor · Deacon', '지휘자 · 집사',
    'Bok Hee Jung', '(정복희)', 'Accompanist · Senior Deaconess', '반주자 · 권사',
    'Mark Iverson', 'Administrative Assistant', '행정간사',
    'Isaiah Yoon', '(윤이사야)', 'Webmaster · A/V Technician · Social Media Manager',
    '웹사이트 관리자 · 음향/영상 담당 · 소셜 미디어 관리자',
  ]) assert.ok(aboutHtml.includes(detail), `About page should include "${detail}"`);
  const leadership = aboutHtml.match(/<h2><span class="bilingual"><span lang="en">Leadership<\/span>[\s\S]*?<\/section>/)?.[0];
  assert.ok(leadership, 'About page should include its leadership section');
  assert.match(aboutHtml, /<section class="panel leadership">[\s\S]*?<span lang="en">Leadership<\/span>/);
  const leadershipOrder = ['Senior Pastor', 'Elders'];
  const headingPositions = leadershipOrder.map((heading) => leadership.indexOf(`<span lang="en">${heading}</span>`));
  assert.ok(headingPositions.every((position, index) => position >= 0 && (index === 0 || position > headingPositions[index - 1])),
    'Leadership should list the senior pastor and elders');
  const ministryTeam = aboutHtml.match(/<section class="panel ministry-team">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(ministryTeam, 'About page should show the ministry team in a separate card');
  assert.match(ministryTeam, /<h2><span class="bilingual"><span lang="en">Ministry Team<\/span>/);
  assert.match(ministryTeam, /Eun Young Won[\s\S]*class="person-role">[\s\S]*Missionary/);
  assert.match(ministryTeam, /Myung Jun Park[\s\S]*Bok Hee Jung[\s\S]*Mark Iverson/);
  const accompanist = ministryTeam.match(/<li><span class="person-name">Bok Hee Jung[\s\S]*?<\/li>/)?.[0];
  assert.ok(accompanist, 'Ministry team should include Bok Hee Jung');
  assert.match(accompanist, /lang="ko">\(정복희\)<\/span>/);
  assert.match(accompanist, /lang="en">Accompanist · Senior Deaconess<\/span>/);
  assert.match(accompanist, /lang="ko">반주자 · 권사<\/span>/);
  const administrativeAssistant = ministryTeam.match(/<li><span class="person-name">Mark Iverson[\s\S]*?<\/li>/)?.[0];
  assert.ok(administrativeAssistant, 'Ministry team should include Mark Iverson');
  assert.match(administrativeAssistant, /lang="en">Administrative Assistant<\/span>/);
  assert.match(administrativeAssistant, /lang="ko">행정간사<\/span>/);
  assert.doesNotMatch(administrativeAssistant, /person-ko|Deacon|집사/);
  const webmaster = ministryTeam.match(/<li><span class="person-name">Isaiah Yoon[\s\S]*?<\/li>/)?.[0];
  assert.ok(webmaster, 'Ministry team should include Isaiah Yoon');
  assert.match(webmaster, /lang="ko">\(윤이사야\)<\/span>/);
  assert.match(webmaster, /lang="en">Webmaster · A\/V Technician · Social Media Manager<\/span>/);
  assert.ok(webmaster.includes('<span lang="ko">웹사이트 관리자 · 음향/영상 담당 · 소셜 미디어 관리자</span>'),
    'Webmaster should show all three Korean roles');
  assert.doesNotMatch(ministryTeam, /Bok Hee Park|박복희|Kelly Kim|김켈리/);
  assert.equal((ministryTeam.match(/class="person-role"/g) || []).length, 5,
    'Each ministry team member should have a right-side role');
  const aboutCss = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(aboutCss, /\.contact-grid > \.panel\s*\{[^}]*min-width:\s*0/s);
  assert.match(aboutCss, /\.about-page \.contact-grid > \.leadership,\s*\.about-page \.contact-grid > \.ministry-team\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(aboutCss, /\.about-page \.people li\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/s);
  assert.match(aboutCss, /\.about-page \.person-role\s*\{[^}]*text-align:\s*right/);
  assert.match(aboutCss, /@media \(max-width:\s*420px\)\s*\{[^}]*\.about-page \.ministry-team \.people li\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(aboutHtml, /href="\/about" aria-current="page" class="is-active"/);
  const contact = await fetch(`${base}/contact`);
  assert.equal(contact.status, 200);
  const contactHtml = await contact.text();
  assert.match(contactHtml, /<h1>.*Contact.*연락처/s);
  assert.match(contactHtml, /class="contact-scripture cornerstone"[\s\S]*<img src="\/favicon\.png" alt="Immanuel Church of America logo"/);
  assert.match(contactHtml, /The Glass of the Word<\/span>[\s\S]*<img src="\/favicon\.png"[\s\S]*말씀의 거울/);
  assert.match(contactHtml, /For now we see through a glass, darkly;.*1 Corinthians 13:12/s);
  assert.match(contactHtml, /고린도전서 13:12/);
  assert.doesNotMatch(contactHtml, /class="scripture-picker"|class="scripture-language-links"|theamazingword\.org/);
  assert.match(contactHtml, /href="https:\/\/www\.google\.com\/maps\/place\/Immanuel\+Church\+of\+America\+%2F\+%EB%AF%B8%EC%A3%BC%EC%9E%84%EB%A7%88%EB%88%84%EC%97%98%EA%B5%90%ED%9A%8C\/@34\.0397122,-118\.3242422,17z\/data=!3m1!4b1!4m6!3m5!1s0x80c2b867941260c9:0xc64dfc88582a36a6!8m2!3d34\.0397078!4d-118\.3216673!16s%2Fg%2F1262s7wvv\?entry=ttu&amp;g_ep=EgoyMDI2MTEwMi4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noopener noreferrer">[\s\S]*3406 W Washington Blvd 2F<br>Los Angeles, CA 90018/);
  assert.match(contactHtml, /href="https:\/\/www\.instagram\.com\/immanuelchurchofamerica\/" target="_blank" rel="noopener noreferrer">@immanuelchurchofamerica/);
  const serviceDetails = [
    'Sunday: 9:00 am, 11:00 am, and 2:00 pm',
    'Wednesday: 7:30 pm',
    'Friday: 7:30 pm',
    'Lunch is provided after the 11:00 am Sunday service.',
    'English interpretation is available on request.',
    '주일: 오전 9시, 오전 11시, 오후 2시',
    '수요일: 오후 7시 30분',
    '금요일: 오후 7시 30분',
  ];
  for (const detail of serviceDetails) {
    assert.ok(aboutHtml.includes(detail), `About page should include "${detail}"`);
    assert.ok(!contactHtml.includes(detail), `Contact page should not duplicate "${detail}"`);
  }
  assert.match(contactHtml, /<a class="btn btn-primary" href="\/about#services">/);
  assert.match(aboutHtml, /<section class="panel" id="services">/);
  for (const detail of [
    'Our church is ADA accessible, with an elevator available to take you to the second floor.',
    '엘리베이터로 2층까지 이동하실 수 있습니다.',
    'All are welcome.',
  ]) assert.ok(contactHtml.includes(detail), `Contact page should include "${detail}"`);
  const headings = (html) => [...html.matchAll(/<h2><span class="bilingual"><span lang="en">([^<]+)<\/span>/g)].map((match) => match[1]);
  assert.deepEqual(headings(aboutHtml), ['A family church', 'Service Times', 'Worship', 'Preaching', 'What we affirm', 'Leadership', 'Ministry Team']);
  assert.deepEqual(headings(contactHtml), ['Visit us', 'A few helpful details', 'Stay connected']);
  const contactPanel = contactHtml.match(/<div class="panel visit-panel">([\s\S]*?)<\/div>\s*<\/div>\s*<section class="contact-scripture/);
  assert.ok(contactPanel, 'All contact information is in one panel, separate from the Scripture');
  assert.equal((contactPanel[1].match(/class="contact-section(?: contact-map)?"/g) || []).length, 4);
  assert.match(contactPanel[1], /Visit us[\s\S]*href="\/about#services"[\s\S]*class="contact-section contact-map"[\s\S]*class="visit-map"[\s\S]*visit-parking-note[\s\S]*A few helpful details[\s\S]*Stay connected/);
  const loginPage = await (await fetch(`${base}/admin/login`)).text();
  assert.match(loginPage, /<form method="post" action="\/admin\/login"/);
  assert.doesNotMatch(loginPage, /href="\/admin(?:\/login)?"/);
  assert.equal((await fetch(base + '/nope')).status, 404);
});

test('Umami tracks public rendered pages only when configured', async (t) => {
  const { base, close } = await boot({
    umamiWebsiteId: 'site-id" data-injected="no',
    umamiScriptUrl: 'https://analytics.example/script.js',
  });
  t.after(close);

  const home = await (await fetch(base)).text();
  assert.match(home, /<script defer src="https:\/\/analytics\.example\/script\.js" data-website-id="site-id&quot; data-injected=&quot;no"><\/script>/);
  assert.doesNotMatch(home, /data-injected="no"/);
  assert.match(await (await fetch(`${base}/sermons`)).text(), /data-website-id=/);
  assert.doesNotMatch(await (await fetch(`${base}/admin/login`)).text(), /data-website-id=/);

  assert.throws(() => createApp({
    password: PASSWORD,
    umamiWebsiteId: 'site-id',
    umamiScriptUrl: 'http://analytics.example/script.js',
  }), /UMAMI_SCRIPT_URL must be a valid HTTPS URL/);
});

test('contact visit panel includes an accessible location diagram with south-side parking', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  const response = await fetch(`${base}/contact`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const panel = html.match(/<div class="contact-section contact-map">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(panel, 'The diagram and parking note belong together');
  assert.match(panel, /<svg viewBox="0 0 760 440" role="img" aria-labelledby="visit-map-title visit-map-desc">/);
  assert.match(panel, /<title id="visit-map-title">Church location and parking · 교회 위치와 주차장<\/title>/);
  assert.match(panel, /<desc id="visit-map-desc">North is up\.[\s\S]*주차장은 건물 남쪽 바로 뒤편에/);
  for (const label of ['Crenshaw Blvd.', 'Washington Blvd.', '4th Avenue', 'Arlington', 'I-10', 'I-405', 'I-110', '미주임마누엘교회', 'Parking · South side', '주차장 · 건물 남쪽']) {
    assert.ok(panel.includes(label), `The diagram should include ${label}`);
  }
  const building = panel.match(/<rect class="map-building" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/);
  const parking = panel.match(/<rect class="map-parking" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/);
  assert.ok(building && parking, 'The building and parking lot are both drawn');
  assert.equal(parking[1], building[1], 'Parking is aligned directly behind the building');
  assert.equal(parking[3], building[3]);
  assert.ok(Number(parking[2]) > Number(building[2]) + Number(building[4]), 'Parking is south of the building on the north-up diagram');
  assert.doesNotMatch(panel, /<figcaption|Location guide|오시는 길 안내|Not to scale|실제 축척과 다릅니다/);
  assert.doesNotMatch(panel, /map-viewport|Scroll sideways/);
  assert.match(panel, /The parking lot is directly behind the south side of the building\./);
  assert.match(panel, /주차장은 건물 남쪽 바로 뒤편에 있습니다\./);
  const helpfulDetails = html.match(/<h2><span class="bilingual"><span lang="en">A few helpful details<\/span>[\s\S]*?<\/section>/)?.[0];
  assert.ok(helpfulDetails);
  assert.doesNotMatch(helpfulDetails, /parking|주차장/i);
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.visit-map\s*\{[^}]*max-width:\s*32rem/s);
  assert.match(css, /\.visit-map svg\s*\{[^}]*width:\s*100%;[^}]*height:\s*auto;/s);
  assert.doesNotMatch(css, /\.visit-map svg\s*\{[^}]*min-width:/s);
  assert.match(css, /\.contact-grid > \.panel p\.visit-parking-note\s*\{[^}]*margin-top:\s*1\.25rem/s);
  assert.match(css, /\.contact-grid > \.visit-panel\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media \(max-width: 680px\)\s*\{[\s\S]*?\.contact-grid > \.visit-panel\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width: 680px\)\s*\{[\s\S]*?\.visit-panel \.contact-section\s*\{[^}]*text-align:\s*center/s);
  assert.match(css, /@media \(max-width: 680px\)\s*\{[\s\S]*?\.contact-scripture\s*\{[^}]*flex-direction:\s*column;[^}]*text-align:\s*center/s);
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
  assert.match(html, /<h3><a href="\/sermons\/share-id">A sermon<\/a><\/h3>/);
  assert.match(html, /<script src="\/scripts\/sermon-sharing\.js" defer><\/script>/);
  assert.doesNotMatch(html, /<script>([\s\S]*?)<\/script>/);
  assert.match(html, /data-share-title="A sermon"/);
  assert.match(html, /class="btn btn-ghost sermon-action share-link" href="\/sermons\/share-id"/);
  assert.match(html, /class="btn btn-ghost sermon-action copy-link" href="\/sermons\/share-id"/);
  assert.match(html, /class="btn btn-ghost sermon-action share-link"[\s\S]*Share sermon[\s\S]*설교 공유/);
  assert.match(html, /class="btn btn-ghost sermon-action copy-link"[\s\S]*Copy link[\s\S]*링크 복사/);
  const detailResponse = await fetch(`${base}/sermons/share-id`);
  assert.equal(detailResponse.status, 200);
  const detailHtml = await detailResponse.text();
  assert.match(detailHtml, /href="\/sermons"><span class="bilingual"><span lang="en">All sermons<\/span>/);
  assert.match(detailHtml, /<h3><a href="\/sermons\/share-id">A sermon<\/a><\/h3>/);
  assert.doesNotMatch(detailHtml, /class="pagination"/);
  assert.equal((await fetch(`${base}/sermons/missing-sermon`)).status, 404);
  const scriptResponse = await fetch(`${base}/scripts/sermon-sharing.js`);
  assert.equal(scriptResponse.status, 200);
  const script = await scriptResponse.text();

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
  assert.equal(shared[0].text, 'A sermon');
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

test('scripture references offer language-specific Bible edition links', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify([
    {
      id: 'linked-reference', title: 'Linked reference', speaker: '', date: '',
      scripture: 'John 3:16-18', description: '', file: 'sermon.mp3', createdAt: new Date().toISOString(),
    },
    {
      id: 'korean-reference', title: 'Korean reference', speaker: '', date: '',
      scripture: '요한복음 3:16', description: '', file: 'sermon-2.mp3', createdAt: new Date().toISOString(),
    },
    {
      id: 'unlinked-reference', title: 'Unlinked reference', speaker: '', date: '',
      scripture: 'Song of Songs', description: '', file: 'sermon-3.mp3', createdAt: new Date().toISOString(),
    },
    {
      id: 'bilingual-reference', title: 'Bilingual reference', speaker: '', date: '',
      scripture: 'Song of Songs 1:1 (아가서 1:1)', description: '', file: 'sermon-4.mp3', createdAt: new Date().toISOString(),
    },
    {
      id: 'conflicting-reference', title: 'Conflicting reference', speaker: '', date: '',
      scripture: 'John 3:16 (요한복음 3:17)', description: '', file: 'sermon-5.mp3', createdAt: new Date().toISOString(),
    },
  ]));

  const html = await (await fetch(`${base}/sermons`)).text();
  for (const [edition, language] of [['krv', '한국어'], ['kjv', 'English']]) {
    assert.ok(
      html.includes(`href="https://theamazingword.org/${edition}/b/john/c/3/v/16-18"`),
      `should link John 3:16-18 in ${language}`,
    );
    const bilingualArticle = html.match(/<article class="sermon" id="sermon-bilingual-reference">([\s\S]*?)<\/article>/)?.[1];
    assert.ok(bilingualArticle);
    assert.ok(bilingualArticle.includes(`href="https://theamazingword.org/${edition}/b/song-of-solomon/c/1/v/1"`));
  }
  const languageMenus = [...html.matchAll(/<nav class="scripture-language-links"[^>]*>([\s\S]*?)<\/nav>/g)];
  assert.ok(languageMenus.length > 0);
  for (const [, menu] of languageMenus) {
    const links = [...menu.matchAll(/<a ([^>]+)>/g)];
    assert.equal(links.length, 2);
    for (const [, attributes] of links) {
      assert.match(attributes, /target="_blank"/);
      assert.match(attributes, /rel="noopener noreferrer"/);
    }
  }
  assert.doesNotMatch(html, /theamazingword\.org\/(?:diodati|licht|japbungo|moh|luz|alm)\//);
  assert.match(html, /href="https:\/\/theamazingword\.org\/krv\/b\/john\/c\/3\/v\/16"/);
  assert.match(html, /<summary class="scripture">John 3:16-18<\/summary>/);
  assert.match(html, /aria-label="Korean or English Bible · 한국어 또는 영어 성경"/);
  assert.match(html, /<p class="scripture">Song of Songs<\/p>/);
  assert.match(html, /<summary class="scripture" lang="ko">Song of Songs 1:1 \(아가서 1:1\)<\/summary>/);
  assert.match(html, /<p class="scripture" lang="ko">John 3:16 \(요한복음 3:17\)<\/p>/);
  const single = await (await fetch(`${base}/sermons/bilingual-reference`)).text();
  assert.match(single, /<summary class="scripture" lang="ko">Song of Songs 1:1 \(아가서 1:1\)<\/summary>/);
  assert.match(single, /href="https:\/\/theamazingword\.org\/kjv\/b\/song-of-solomon\/c\/1\/v\/1"/);
});

test('bilingual Scripture references display on separate lines and link each matching range', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  await fs.mkdir(dataDir, { recursive: true });
  const references = [
    ['slash', 'John 12:23-26 // 요한복음 12:23-26'],
    ['split', '2 Timothy 1:8-12, 16-18 // 디모데후서 1:8-12, 16-18'],
    ['newline', 'John 12:23-26\n요한복음 12:23-26'],
    ['newline-split', '2 Timothy 1:8-12, 16-18\r\n디모데후서 1:8-12, 16-18'],
    ['conflict', '2 Timothy 1:8-12, 16-18 // 디모데후서 1:8-12, 17-18'],
    ['newline-conflict', 'John 12:23-26\n요한복음 12:23-27'],
    ['invalid', 'John 12:23-26, 18-16 // 요한복음 12:23-26, 18-16'],
  ];
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(references.map(([id, scripture]) => ({
    id, title: id, scripture, file: 'sermon.mp3', createdAt: new Date().toISOString(),
  }))));
  for (const [id, reference] of references) {
    const html = await (await fetch(`${base}/sermons/${id}`)).text();
    const display = reference.replace(/\s*\/\/\s*/gu, '\n').replaceAll('\r\n', '\n');
    assert.ok(html.replaceAll('\r\n', '\n').includes(display));
    if (id === 'conflict' || id === 'newline-conflict' || id === 'invalid') {
      assert.match(html, /<p class="scripture" lang="ko">/);
      assert.doesNotMatch(html, /<details class="scripture-picker">/);
      continue;
    }
    for (const edition of ['kjv', 'krv']) {
      const ranges = id === 'slash' || id === 'newline' ? ['john/c/12/v/23-26'] : ['2-timothy/c/1/v/8-12', '2-timothy/c/1/v/16-18'];
      for (const range of ranges) assert.ok(html.includes(`href="https://theamazingword.org/${edition}/b/${range}"`));
    }
    if (id === 'split') {
      assert.match(html, />KJV · English · 8-12<\/a>/);
      assert.match(html, />KJV · English · 16-18<\/a>/);
    }
  }
});

test('clickable Scripture uses plated borders and hover, open, and keyboard-focus feedback', async () => {
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.scripture-picker > summary\s*\{[^}]*position:\s*relative;[^}]*background:\s*var\(--plate/s);
  assert.match(css, /\.scripture-picker > summary::before\s*\{[^}]*inset:\s*var\(--rim\)/s);
  assert.match(css, /\.scripture-picker > summary\s*\{[^}]*--plate:\s*var\(--silver\);[^}]*--fill:\s*linear-gradient[^;]+;[^}]*--rim:\s*2px;[^}]*display:\s*list-item;[^}]*max-width:\s*100%;[^}]*cursor:\s*pointer/s);
  assert.match(css, /\.scripture-picker > summary:hover,\s*\.scripture-picker > summary:focus-visible,\s*\.scripture-picker\[open\] > summary\s*\{[^}]*--plate:\s*var\(--gold\);[^}]*box-shadow:\s*var\(--shadow\)/s);
  assert.match(css, /\.scripture-picker > summary:focus-visible\s*\{[^}]*--plate:\s*linear-gradient\(var\(--focus\), var\(--focus\)\)/s);
  assert.match(css, /\.sermon p\.scripture\s*\{[^}]*border-left:/s);
  assert.match(css, /\.sermon \.scripture-picker > summary\s*\{[^}]*background:\s*none;[^}]*border-left:/s);
  assert.match(css, /\.sermon \.scripture-picker > summary::before\s*\{\s*content:\s*none/s);
  assert.match(css, /\.sermon \.scripture-picker > summary:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\)/s);
  assert.match(css, /\.sermon h3:lang\(ko\), \.sermon \.scripture:lang\(ko\)\s*\{[^}]*font-family:\s*var\(--serif-ko\)/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*\s*\{[^}]*transition:\s*none !important/s);
});

test('sermon title links preserve heading styling until hover', async () => {
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.sermon h3 a\s*\{[^}]*color:\s*inherit;[^}]*font:\s*inherit;[^}]*text-decoration:\s*none/s);
  assert.match(css, /\.sermon h3 a:hover\s*\{[^}]*text-decoration:\s*underline/s);
});

test('sermon fields preserve line breaks and service through upload and editing', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const csrf = await csrfToken(base, cookie);
  const admin = await (await fetch(`${base}/admin`, { headers: { cookie } })).text();
  assert.match(admin, /<span lang="en">Sermon Overview<\/span><span lang="ko">설교 개요<\/span>[\s\S]*?<textarea name="description"[^>]*aria-label="Sermon Overview · 설교 개요"/);
  for (const name of ['title', 'speakerEn', 'speakerKo', 'scripture', 'description']) {
    assert.match(admin, new RegExp(`<textarea name="${name}"`));
  }
  const services = [
    'Sunday 1st Service 주일 1부 예베', 'Sunday 2nd Service 주일 2부 예배',
    'Wednesday Service 수요예배', 'Friday Service 금요예배',
  ];
  const select = admin.match(/<select name="service"[^>]*>([\s\S]*?)<\/select>/)?.[1];
  assert.ok(select);
  assert.match(select, /<option value="" selected>/);
  for (const service of services) assert.ok(select.includes(`<option value="${service}">${service}</option>`));
  const upload = new FormData();
  const fields = {
    title: 'Title <one>\n제목', speakerEn: 'Speaker\nName', speakerKo: '설교자\n이름', service: 'Sunday service\n주일 예배',
    date: '2026-11-08', scripture: 'John 12:23-26 //\n요한복음 12:23-26',
    description: 'First line & more\n둘째 줄',
  };
  for (const [name, value] of Object.entries(fields)) upload.set(name, value);
  upload.set('_csrf', csrf);
  upload.set('audio', new Blob(['audio'], { type: 'audio/mpeg' }), 'sermon.mp3');
  const response = await fetch(`${base}/admin/sermons`, { method: 'POST', body: upload, headers: { cookie, origin: base }, redirect: 'manual' });
  assert.equal(response.status, 302);
  const [stored] = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8'));
  for (const [name, value] of Object.entries(fields)) assert.equal(stored[name].replaceAll('\r\n', '\n'), value);
  for (const url of ['/sermons', `/sermons/${stored.id}`]) {
    const html = (await (await fetch(base + url)).text()).replaceAll('\r\n', '\n');
    assert.ok(html.includes(`<h3 lang="ko"><a href="/sermons/${stored.id}">Title &lt;one&gt;\n제목</a></h3>`));
    assert.match(html, /<span class="sermon-meta-line" lang="en"><span>Speaker\nName<\/span> · <span>Sunday service<\/span> · <span>November 8, 2026<\/span><\/span>/);
    assert.match(html, /<span class="sermon-meta-line" lang="ko"><span>설교자\n이름<\/span> · <span>주일 예배<\/span> · <span>2026년 11월 8일<\/span><\/span>/);
    assert.match(html, /<summary class="scripture" lang="ko">John 12:23-26\n요한복음 12:23-26<\/summary>/);
    assert.match(html, /<details class="sermon-description"><summary><span class="bilingual"><span lang="en">Sermon Overview<\/span><span lang="ko">설교 개요<\/span>/);
    assert.match(html, /<p>First line &amp; more\n둘째 줄<\/p><\/details>/);
    assert.match(html, /href="https:\/\/theamazingword\.org\/kjv\/b\/john\/c\/12\/v\/23-26"/);
  }
  const edit = await fetch(`${base}/admin/sermons/${stored.id}/edit`, {
    method: 'POST', headers: { ...FORM(base), cookie }, redirect: 'manual',
    body: new URLSearchParams({ _csrf: csrf, ...fields, scripture: 'John 12:23-26\n요한복음 12:23-26', service: 'Evening\n저녁 예배' }),
  });
  assert.equal(edit.status, 302);
  const edited = (await (await fetch(`${base}/sermons/${stored.id}`, { headers: { cookie } })).text()).replaceAll('\r\n', '\n');
  assert.match(edited, /<textarea name="description"[^>]*aria-label="Sermon Overview · 설교 개요">/);
  assert.match(edited, /<span>Evening<\/span>/);
  assert.match(edited, /<span>저녁 예배<\/span>/);
  assert.match(edited, /<textarea name="speakerEn"[^>]*>Speaker\nName<\/textarea>/);
  assert.match(edited, /<textarea name="speakerKo"[^>]*>설교자\n이름<\/textarea>/);
  assert.match(edited, /<textarea name="scripture"[^>]*>John 12:23-26\n요한복음 12:23-26<\/textarea>/);
  assert.match(edited, /href="https:\/\/theamazingword\.org\/kjv\/b\/john\/c\/12\/v\/23-26"/);
  assert.match(edited, /<option value="Evening&#10;저녁 예배" selected>Evening\n저녁 예배<\/option>/);
  const [saved] = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8'));
  assert.equal(saved.service, 'Evening\n저녁 예배');
  assert.equal(saved.scripture, 'John 12:23-26\n요한복음 12:23-26');
  for (const service of services) {
    const updated = await fetch(`${base}/admin/sermons/${stored.id}/edit`, {
      method: 'POST', headers: { ...FORM(base), cookie }, redirect: 'manual',
      body: new URLSearchParams({ _csrf: csrf, ...fields, service }),
    });
    assert.equal(updated.status, 302);
    const page = await (await fetch(`${base}/sermons/${stored.id}`, { headers: { cookie } })).text();
    assert.ok(page.includes(`<option value="${service}" selected>${service}</option>`));
    const koreanStart = service.search(/[\uAC00-\uD7AF]/u);
    assert.ok(page.includes(`<span>${service.slice(0, koreanStart).trim()}</span>`));
    assert.ok(page.includes(`<span>${service.slice(koreanStart)}</span>`));
    const [persisted] = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8'));
    assert.equal(persisted.service, service);
  }
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.sermon h3, \.sermon \.meta span, \.sermon \.scripture, \.sermon-description p\s*\{[^}]*white-space:\s*pre-line/s);
  assert.match(css, /\.sermon-description summary\s*\{[^}]*display:\s*list-item;[^}]*cursor:\s*pointer/s);
  assert.match(css, /\.sermon-description summary\s*\{[^}]*list-style-position:\s*inside/s);
  assert.match(css, /\.sermon-description summary \.bilingual\s*\{[^}]*margin-left:\s*\.45em/s);
  assert.match(css, /\.sermon-description summary::marker\s*\{[^}]*color:\s*var\(--brass\)/s);
  assert.match(css, /\.sermon-description summary:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\)/s);
  assert.match(css, /\.sermon\s*\{\s*padding:\s*1\.4rem 1\.75rem 1\.2rem 2\.25rem;/);
  assert.match(css, /\.sermon \.scripture-picker\s*\{\s*margin:\s*0 0 \.5rem;/);
  assert.match(css, /\.sermon p\.scripture\s*\{[^}]*margin:\s*0 0 \.5rem;/s);
  assert.match(css, /\.sermon-description\s*\{\s*margin:\s*\.15rem 0 \.4rem;/);
  assert.match(css, /\.sermon audio\s*\{\s*margin-top:\s*\.4rem;/);
});

test('existing and single-language speaker details remain editable and correctly displayed', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const csrf = await csrfToken(base, cookie);
  const fixtures = [
    { id: 'legacy', speaker: 'Pastor John // 윤태선 목사', service: 'Friday Service 금요예배', date: '2026-11-08' },
    { id: 'korean', speaker: '윤태선 목사', service: '', date: '' },
    { id: 'english', speaker: 'Pastor John', service: '', date: '' },
    { id: 'unsplit', speaker: 'First line\nSecond line\nThird line', service: '', date: '' },
  ].map((sermon) => ({ ...sermon, title: 'Sermon', file: 'sermon.mp3', createdAt: '2026-11-08T00:00:00Z' }));
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(fixtures));
  const legacy = await (await fetch(`${base}/sermons/legacy`, { headers: { cookie } })).text();
  assert.match(legacy, /<span class="sermon-meta-line" lang="en"><span>Pastor John<\/span> · <span>Friday Service<\/span> · <span>November 8, 2026<\/span><\/span>/);
  assert.match(legacy, /<span class="sermon-meta-line" lang="ko"><span>윤태선 목사<\/span> · <span>금요예배<\/span> · <span>2026년 11월 8일<\/span><\/span>/);
  assert.match(legacy, /<textarea name="speakerEn"[^>]*>Pastor John<\/textarea>/);
  assert.match(legacy, /<textarea name="speakerKo"[^>]*>윤태선 목사<\/textarea>/);
  for (const [id, language, speaker] of [['korean', 'ko', '윤태선 목사'], ['english', 'en', 'Pastor John']]) {
    const page = await (await fetch(`${base}/sermons/${id}`)).text();
    assert.ok(page.includes(`<span class="sermon-meta-line" lang="${language}"><span>${speaker}</span></span>`));
    assert.doesNotMatch(page, new RegExp(`<span class="sermon-meta-line" lang="${language === 'en' ? 'ko' : 'en'}">`));
  }
  const unsplit = await (await fetch(`${base}/sermons/unsplit`, { headers: { cookie } })).text();
  assert.match(unsplit, /<textarea name="speakerEn"[^>]*>First line\nSecond line\nThird line<\/textarea>/);
  const edit = await fetch(`${base}/admin/sermons/legacy/edit`, {
    method: 'POST', headers: { ...FORM(base), cookie }, redirect: 'manual',
    body: new URLSearchParams({ _csrf: csrf, title: 'Sermon', speakerEn: 'Pastor <John>', speakerKo: '윤태선 목사', service: 'Friday Service 금요예배', date: '2026-11-08' }),
  });
  assert.equal(edit.status, 302);
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8')).find((sermon) => sermon.id === 'legacy');
  assert.equal(saved.speakerEn, 'Pastor <John>');
  assert.equal(saved.speakerKo, '윤태선 목사');
  const edited = await (await fetch(`${base}/sermons/legacy`)).text();
  assert.match(edited, /<span>Pastor &lt;John&gt;<\/span>/);
});

test('sermon link previews use the sermon title and passage reference, not verse text', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const sermons = [
    { id: 'english', title: 'Grace', scripture: 'John 3:16', service: '1st Sunday Service' },
    { id: 'bilingual', title: '사랑 · Love', scripture: 'Song of Songs 1:1 (아가서 1:1)', service: 'Sunday Worship\n주일 예배' },
    { id: 'escaped', title: 'Grace & "Truth" <hope>', scripture: 'John 3:16 & "요한복음" <3:16>', service: 'Service & <hope>' },
    { id: 'no-reference', title: 'Hope' },
    { id: 'empty-reference', title: 'Peace', scripture: '' },
    { id: 'long', title: '하나님의 사랑과 진리 '.repeat(10), scripture: 'John 12:23-26 //\n요한복음 12:23-26', service: '주일 예배 '.repeat(16) },
  ].map((sermon) => ({
    ...sermon, description: 'Verse text must not appear in the preview.',
    file: 'sermon.mp3', createdAt: '2026-11-08T00:00:00.000Z',
  }));
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(sermons));
  const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');

  for (const sermon of sermons) {
    const response = await fetch(`${base}/sermons/${sermon.id}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    const head = html.slice(0, html.indexOf('</head>'));
    const title = escapeAttribute(`${sermon.title} · Immanuel Church of America · 미주 임마누엘 교회`);
    const displayReference = (sermon.scripture || '').replace(/\s*\/\/\s*/gu, '\n');
    const description = escapeAttribute(displayReference || 'Listen to this sermon. 설교를 들어 보세요.');
    assert.ok(head.includes(`<title>${title}</title>`));
    for (const attribute of ['property="og:title"', 'name="twitter:title"']) {
      assert.ok(head.includes(`<meta ${attribute} content="${title}">`));
    }
    for (const attribute of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
      assert.ok(head.includes(`<meta ${attribute} content="${description}">`));
    }
    assert.ok(head.includes(`<meta property="og:url" content="https://immanuelchurchofamerica.org/sermons/${sermon.id}">`));
    assert.ok(head.includes(`<link rel="canonical" href="https://immanuelchurchofamerica.org/sermons/${sermon.id}">`));
    const imageUrl = head.match(/<meta property="og:image" content="([^"]+)">/)[1];
    assert.match(imageUrl, new RegExp(`^https://immanuelchurchofamerica.org/sermons/${sermon.id}/preview\\.png\\?v=[a-f\\d]{20}$`));
    assert.ok(head.includes(`<meta name="twitter:image" content="${imageUrl}">`));
    assert.ok(head.includes(`<meta property="og:image:alt" content="${escapeAttribute([sermon.title, displayReference, sermon.service].filter(Boolean).join(' · '))}">`));
    const image = await fetch(base + new URL(imageUrl).pathname + new URL(imageUrl).search);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.match(image.headers.get('cache-control'), /must-revalidate/);
    const png = Buffer.from(await image.arrayBuffer());
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 630);
    assert.equal(metadata.format, 'png');
    assert.equal((await fetch(base + new URL(imageUrl).pathname, {
      headers: { 'if-none-match': image.headers.get('etag'), 'cache-control': 'max-age=0' },
    })).status, 304);
    assert.doesNotMatch(head, /Verse text must not appear|A welcoming church family/);
    assert.ok(html.includes('Verse text must not appear in the preview.'));
  }

  const list = await (await fetch(`${base}/sermons`)).text();
  assert.match(list, /<meta property="og:title" content="Sermons · 설교 · Immanuel Church of America · 미주 임마누엘 교회">/);
  assert.match(list, /<meta property="og:description" content="A welcoming church family\./);
  const missing = await fetch(`${base}/sermons/missing`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /<meta property="og:title" content="Not found · 페이지를 찾을 수 없습니다 · Immanuel Church of America · 미주 임마누엘 교회">/);
  assert.equal((await fetch(`${base}/sermons/missing/preview.png`)).status, 404);

  const before = await fetch(`${base}/sermons/english/preview.png`);
  const oldImage = Buffer.from(await before.arrayBuffer());
  const oldEtag = before.headers.get('etag');
  const oldPage = await (await fetch(`${base}/sermons/english`)).text();
  sermons[0].title = 'Updated grace';
  sermons[0].scripture = 'Romans 8:28';
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(sermons));
  const updated = await fetch(`${base}/sermons/english/preview.png`, { headers: { 'if-none-match': oldEtag } });
  assert.equal(updated.status, 200);
  assert.notEqual(updated.headers.get('etag'), oldEtag);
  assert.notDeepEqual(Buffer.from(await updated.arrayBuffer()), oldImage);
  const updatedPage = await (await fetch(`${base}/sermons/english`)).text();
  assert.notEqual(updatedPage.match(/property="og:image" content="([^"]+)"/)[1], oldPage.match(/property="og:image" content="([^"]+)"/)[1]);
  const previousImage = Buffer.from(await (await fetch(`${base}/sermons/english/preview.png`)).arrayBuffer());
  sermons[0].service = 'Evening Service';
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(sermons));
  const servicePage = await (await fetch(`${base}/sermons/english`)).text();
  assert.notEqual(servicePage.match(/property="og:image" content="([^"]+)"/)[1], updatedPage.match(/property="og:image" content="([^"]+)"/)[1]);
  assert.notDeepEqual(Buffer.from(await (await fetch(`${base}/sermons/english/preview.png`)).arrayBuffer()), previousImage);
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(sermons.slice(1)));
  assert.equal((await fetch(`${base}/sermons/english/preview.png`)).status, 404);
});

test('preview pixels contain title, reference, and service independently within the original artwork', async () => {
  const render = createSermonPreviewRenderer();
  const original = { title: 'Grace', scripture: 'John 3:16', service: '1st Sunday Service', description: 'Not in the image' };
  const first = await render(original);
  assert.deepEqual(await render({ ...original, description: 'Different description' }), first);
  assert.deepEqual(
    await render({ ...original, scripture: 'John 12:23-26 // 요한복음 12:23-26' }),
    await render({ ...original, scripture: 'John 12:23-26\n요한복음 12:23-26' }),
  );
  const pixels = async (png, top, height) => sharp(png)
    .extract({ left: 60, top, width: 540, height }).raw().toBuffer();
  const newTitle = await render({ ...original, title: 'Hope' });
  const newReference = await render({ ...original, scripture: 'Romans 8:28' });
  const newService = await render({ ...original, service: 'Evening Service' });
  const noService = await render({ ...original, service: '' });
  assert.notDeepEqual(await pixels(first, 228, 155), await pixels(newTitle, 228, 155));
  assert.deepEqual(await pixels(first, 410, 80), await pixels(newTitle, 410, 80));
  assert.notDeepEqual(await pixels(first, 410, 80), await pixels(newReference, 410, 80));
  assert.deepEqual(await pixels(first, 228, 155), await pixels(newReference, 228, 155));
  assert.notDeepEqual(await pixels(first, 523, 65), await pixels(newService, 523, 65));
  assert.notDeepEqual(await pixels(first, 523, 65), await pixels(noService, 523, 65));
  assert.deepEqual(await pixels(first, 228, 155), await pixels(newService, 228, 155));
  assert.deepEqual(await pixels(first, 410, 80), await pixels(newService, 410, 80));
  const artworkRegion = (input) => sharp(input).extract({ left: 720, top: 0, width: 480, height: 630 }).removeAlpha().raw().toBuffer();
  assert.deepEqual(await artworkRegion(first), await artworkRegion(new URL('../public/link-preview.png', import.meta.url).pathname));
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

test('sermon overviews accept up to 10000 characters on upload and edit', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const csrf = await csrfToken(base, cookie);
  const overview = '설'.repeat(10000);
  const admin = await (await fetch(`${base}/admin`, { headers: { cookie } })).text();
  assert.match(admin, /<textarea name="description" rows="3" maxlength="10000"/);

  const upload = new FormData();
  for (const [name, value] of Object.entries({
    title: 'Long overview', speakerEn: '', speakerKo: '', service: '', date: '', scripture: '', description: overview,
  })) upload.set(name, value);
  upload.set('_csrf', csrf);
  upload.set('audio', new Blob(['audio'], { type: 'audio/mpeg' }), 'sermon.mp3');
  const response = await fetch(`${base}/admin/sermons`, {
    method: 'POST', body: upload, headers: { cookie, origin: base }, redirect: 'manual',
  });
  assert.equal(response.status, 302);
  const [created] = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8'));
  assert.equal(created.description, overview);

  const editedOverview = `${overview}x`;
  const edit = await fetch(`${base}/admin/sermons/${created.id}/edit`, {
    method: 'POST', headers: { ...FORM(base), cookie }, redirect: 'manual',
    body: new URLSearchParams({
      _csrf: csrf, title: created.title, speakerEn: '', speakerKo: '', service: '', date: '',
      scripture: '', description: editedOverview,
    }),
  });
  assert.equal(edit.status, 302);
  const [updated] = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8'));
  assert.equal(updated.description, overview);
  const sermonPage = await (await fetch(`${base}/sermons/${created.id}`, { headers: { cookie } })).text();
  assert.match(sermonPage, /<textarea name="description" rows="3" maxlength="10000"/);
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
  const { base, dataDir, uploadDir, close } = await boot();
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
  s.set('service', 'Sunday 1st Service 주일 1부 예베');
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
  assert.match(sermons, /<span>Sunday 1st Service<\/span>/);
  assert.match(sermons, /<span>주일 1부 예베<\/span>/);
  const [uploadedSermon] = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8'));
  assert.equal(uploadedSermon.service, 'Sunday 1st Service 주일 1부 예베');
  const sid = sermons.match(/id="sermon-([^"]+)"/)[1];
  assert.match(sermons, new RegExp(`href="/sermons/${sid}"`));
  assert.equal((await fetch(`${base}/sermons/${sid}`)).status, 200);
  const src = sermons.match(/src="(\/uploads\/audio\/[^"]+)"/)[1];
  assert.equal((await fetch(base + src)).status, 200);
  assert.doesNotMatch(sermons, /data-audio-upload/);
  const replacementControls = (await fetch(`${base}/sermons`, { headers: { cookie } })).text();
  assert.match(await replacementControls, /<script src="\/scripts\/admin\.js" defer><\/script>/);
  assert.match(await replacementControls, new RegExp(`action="/admin/sermons/${sid}/audio"`));
  assert.match(await replacementControls, /Replace this sermon’s audio\?/);

  assert.doesNotMatch(sermons, /\/edit/);
  const sedit = (fields) => fetch(`${base}/admin/sermons/${sid}/edit`, { method: 'POST', body: new URLSearchParams({ _csrf: csrf, ...fields }), headers: { cookie, origin: base }, redirect: 'manual' });
  assert.equal((await sedit({ title: 'Renamed <b>', speaker: 'Pastor Kim', date: '2001-02-03' })).status, 302);
  const renamed = await (await fetch(`${base}/sermons`, { headers: { cookie } })).text();
  assert.match(renamed, /Renamed &lt;b&gt;/);
  assert.match(renamed, /Pastor Kim/);
  assert.equal((await sedit({ title: '은혜', scripture: '요한복음 3:16' })).status, 302);
  const koreanSermon = await (await fetch(`${base}/sermons`)).text();
  assert.ok(koreanSermon.includes(`<h3 lang="ko"><a href="/sermons/${sid}">은혜</a></h3>`));
  assert.match(koreanSermon, /<summary class="scripture" lang="ko">요한복음 3:16<\/summary>/);
  assert.equal((await sedit({ title: '' })).status, 400);
  assert.equal((await fetch(`${base}/admin/sermons/nope/edit`, { method: 'POST', body: new URLSearchParams({ _csrf: csrf, title: 'x' }), headers: { cookie, origin: base }, redirect: 'manual' })).status, 404);
  assert.equal((await fetch(`${base}/admin/sermons/${sid}/edit`, { method: 'POST', body: new URLSearchParams({ title: 'x' }), headers: { cookie, origin: base }, redirect: 'manual' })).status, 403);

  const bad = new FormData();
  bad.set('_csrf', csrf);
  bad.set('title', 't'); bad.set('audio', new Blob(['x'], { type: 'text/html' }), 'x.html');
  assert.equal((await fetch(`${base}/admin/sermons`, { method: 'POST', body: bad, headers: { cookie, origin: base } })).status, 400);

  const admin = await (await fetch(`${base}/sermons`, { headers: { cookie } })).text();
  const replacementAudio = new FormData();
  replacementAudio.set('_csrf', csrf);
  replacementAudio.set('audio', new Blob(['trimmed sermon audio'], { type: 'audio/mpeg' }), 'trimmed.mp3');
  const stagedReplacement = await fetch(`${base}/admin/sermons/audio`, {
    method: 'POST', body: replacementAudio, headers: { cookie, origin: base },
  });
  assert.equal(stagedReplacement.status, 201);
  const { uploadId: replacementId } = await stagedReplacement.json();
  const replacementWithoutCsrf = await fetch(`${base}/admin/sermons/${sid}/audio`, {
    method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ stagedAudio: replacementId }), redirect: 'manual',
  });
  assert.equal(replacementWithoutCsrf.status, 403);
  const replaced = await fetch(`${base}/admin/sermons/${sid}/audio`, {
    method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrf, stagedAudio: replacementId }), redirect: 'manual',
  });
  assert.equal(replaced.status, 302);
  assert.equal(replaced.headers.get('location'), `/sermons/${sid}`);
  assert.equal((await fetch(base + src)).status, 404);
  assert.equal(await (await fetch(`${base}/uploads/audio/${replacementId}`)).text(), 'trimmed sermon audio');
  const storedSermons = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8'));
  assert.equal(storedSermons[0].id, sid);
  assert.equal(storedSermons[0].title, '은혜');
  assert.equal(storedSermons[0].speaker, '');
  assert.equal(storedSermons[0].scripture, '요한복음 3:16');
  assert.equal(storedSermons[0].file, replacementId);

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

test('admin can stage audio immediately and publish it with sermon details', async (t) => {
  const { base, uploadDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const csrf = await csrfToken(base, cookie);
  const page = await (await fetch(`${base}/admin`, { headers: { cookie } })).text();
  assert.match(page, /<script src="\/scripts\/admin\.js" defer><\/script>/);
  assert.doesNotMatch(page, /<script>([\s\S]*?)<\/script>/);
  assert.match(page, /id="sermon-upload-form"/);
  assert.match(page, /audio upload progress/i);
  const adminScript = await fetch(`${base}/scripts/admin.js`);
  assert.equal(adminScript.status, 200);
  const adminScriptSource = await adminScript.text();
  assert.match(page, /data-upload-url="\/admin\/sermons\/audio"/);
  assert.match(adminScriptSource, /form\.dataset\.uploadUrl/);
  assert.match(adminScriptSource, /form\[data-confirm\]/);
  let submitHandler;
  let allowSubmission = false;
  runInNewContext(adminScriptSource, {
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: (_type, handler) => { submitHandler = handler; },
    },
    window: { confirm: () => allowSubmission },
  });
  let prevented = false;
  submitHandler({
    target: { closest: () => ({ dataset: { confirm: 'Remove this sermon?' } }) },
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true, 'admin confirmations should prevent submission when declined');
  allowSubmission = true;
  prevented = false;
  submitHandler({
    target: { closest: () => ({ dataset: { confirm: 'Remove this sermon?' } }) },
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, false, 'admin confirmations should allow submission when accepted');

  const rejected = new FormData();
  rejected.set('_csrf', 'invalid');
  rejected.set('audio', new Blob(['private'], { type: 'audio/mpeg' }), 'private.mp3');
  const denied = await fetch(`${base}/admin/sermons/audio`, {
    method: 'POST', body: rejected, headers: { cookie, origin: base },
  });
  assert.equal(denied.status, 403);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'staging')), []);

  const audio = new FormData();
  audio.set('_csrf', csrf);
  audio.set('audio', new Blob(['sermon audio'], { type: 'audio/mpeg' }), 'sermon.mp3');
  const stagedResponse = await fetch(`${base}/admin/sermons/audio`, {
    method: 'POST', body: audio, headers: { cookie, origin: base },
  });
  assert.equal(stagedResponse.status, 201);
  const { uploadId } = await stagedResponse.json();
  assert.match(uploadId, /^[0-9a-f-]{36}\.mp3$/);
  assert.equal((await fetch(`${base}/uploads/audio/${uploadId}`)).status, 404);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'audio')), []);

  const otherCookie = await login(base);
  const otherCsrf = await csrfToken(base, otherCookie);
  const otherPublish = new FormData();
  otherPublish.set('_csrf', otherCsrf);
  otherPublish.set('stagedAudio', uploadId);
  otherPublish.set('title', 'Unauthorized publish');
  const otherResult = await fetch(`${base}/admin/sermons`, {
    method: 'POST', body: otherPublish, headers: { cookie: otherCookie, origin: base }, redirect: 'manual',
  });
  assert.equal(otherResult.status, 400);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'staging')), [uploadId]);

  const publish = new FormData();
  publish.set('_csrf', csrf);
  publish.set('stagedAudio', uploadId);
  publish.set('title', 'Song of Songs');
  publish.set('speaker', 'Pastor');
  publish.set('scripture', 'Song of Songs');
  const result = await fetch(`${base}/admin/sermons`, {
    method: 'POST', body: publish, headers: { cookie, origin: base }, redirect: 'manual',
  });
  assert.equal(result.status, 302);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'staging')), []);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'audio')), [uploadId]);
  const sermons = await (await fetch(`${base}/sermons`)).text();
  assert.match(sermons, /Song of Songs/);
  assert.match(sermons, /Pastor/);
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
