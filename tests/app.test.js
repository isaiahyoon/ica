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
import { scriptureLanguageLinks } from '../lib/scripture-links.js';

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

test('pastor list is persistent and removal leaves saved sermons unchanged', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const token = await csrfToken(base, cookie);
  const admin = async () => (await (await fetch(`${base}/admin`, { headers: { cookie } })).text());
  assert.match(await admin(), /Pastor John Yoon · 윤태선 목사/);
  const post = (url, body, headers = {}) => fetch(base + url, {
    method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie, ...headers },
    body: new URLSearchParams({ _csrf: token, ...body }),
  });

  assert.equal((await fetch(`${base}/admin/pastors`, { method: 'POST', redirect: 'manual' })).status, 302);
  assert.equal((await post('/admin/pastors', { en: 'Grace', ko: '은혜' }, { origin: 'https://other.example' })).status, 403);
  assert.equal((await post('/admin/pastors', { _csrf: 'invalid', en: 'Grace', ko: '은혜' })).status, 403);
  assert.equal((await post('/admin/pastors', { en: '', ko: '은혜' })).status, 400);
  assert.equal((await post('/admin/pastors', { en: 'Grace <Kim>', ko: '김은혜 목사' })).status, 302);
  assert.equal((await post('/admin/pastors', { en: 'Grace <Kim>', ko: '김은혜 목사' })).status, 409);
  const list = JSON.parse(await fs.readFile(path.join(dataDir, 'pastors.json'), 'utf8')).entries;
  assert.equal(list.length, 2);
  assert.match(await admin(), /Grace &lt;Kim&gt; · 김은혜 목사/);
  const saved = [{ id: 'existing', title: 'Saved', speakerEn: list[1].en, speakerKo: list[1].ko, createdAt: '2026-01-01', file: 'audio.mp3' }];
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(saved));
  const scripture = Array(3).fill('John 3:16, 18-20 (요한복음 3:16, 18-20); Romans 8:28 (로마서 8:28)').join('; ');
  assert.ok(scripture.length > 100);
  assert.equal((await post('/admin/sermons/existing/edit', { title: 'Saved', date: '2026-01-02', service: 'Friday Service 금요예배', speakerEn: list[1].en, speakerKo: list[1].ko, scripture })).status, 302);
  saved[0] = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8'))[0];
  assert.equal(saved[0].scripture, scripture);
  assert.equal((await post(`/admin/pastors/${list[1].id}/delete`, {})).status, 302);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8')), saved);
  assert.match(await (await fetch(`${base}/sermons/existing`, { headers: { cookie } })).text(), /Grace &lt;Kim&gt;/);
  assert.equal((await post('/admin/pastors/john-yoon/delete', {})).status, 302);
  assert.doesNotMatch(await admin(), /Pastor John Yoon/);
  assert.equal((await post('/admin/pastors/john-yoon/delete', {})).status, 404);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'pastors.json'), 'utf8')).entries, []);
});

test('admin dashboard links to separate content management pages', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  for (const route of ['/admin/sermons', '/admin/columns', '/admin/gallery']) {
    assert.equal((await fetch(base + route, { redirect: 'manual' })).status, 302);
  }
  const cookie = await login(base);
  const dashboard = await (await fetch(`${base}/admin`, { headers: { cookie } })).text();
  for (const route of ['/admin/sermons', '/admin/columns', '/admin/gallery']) {
    assert.ok(dashboard.includes(`href="${route}"`));
  }
  assert.doesNotMatch(dashboard, /id="sermon-upload-form"|href="\/admin\/columns\/new"/);
  const sermons = await (await fetch(`${base}/admin/sermons`, { headers: { cookie } })).text();
  assert.match(sermons, /id="sermon-upload-form"/);
  assert.match(sermons, /href="\/admin"/);
  const columns = await (await fetch(`${base}/admin/columns`, { headers: { cookie } })).text();
  assert.match(columns, /href="\/admin\/columns\/new"/);
  assert.match(columns, /href="\/admin\/columns\/comments"/);
  assert.doesNotMatch(columns, /id="sermon-upload-form"/);
});

test('multiple bilingual Scripture passages link each split range without accepting conflicts', () => {
  const links = scriptureLanguageLinks('John 3:16, 18-20 (요한복음 3:16, 18-20); Romans 8:28 (로마서 8:28)');
  assert.equal((links.match(/<a /g) || []).length, 6);
  assert.match(links, /\/kjv\/b\/john\/c\/3\/v\/18-20/);
  assert.match(links, /\/krv\/b\/romans\/c\/8\/v\/28/);
  assert.match(links, /John 3:16/);
  assert.match(links, /Romans 8:28/);
  assert.equal(scriptureLanguageLinks('John 3:16 (요한복음 3:17); Romans 8:28'), '');
});

test('pastors publish bilingual columns with escaped text, an image, video, and delete controls', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const admin = await (await fetch(`${base}/admin`, { headers: { cookie } })).text();
  const token = admin.match(/name="_csrf" value="([^"]+)"/)[1];

  const png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#223b55' },
  }).png().toBuffer();
  const body = new FormData();
  body.set('_csrf', token);
  body.set('titleEn', 'Lorem <Ipsum>');
  body.set('titleKo', '아보트 공부');
  body.set('excerptEn', 'A short <preview>');
  body.set('excerptKo', '짧은 미리보기');
  body.set('bodyEn', 'English & <Korean>\nsecond line.\r\n\r\nEnglish paragraph two.');
  body.set('bodyKo', '첫 번째 한국어 문단입니다.\n\n두 번째 한국어 문단입니다.');
  body.set('videoUrl', 'https://www.youtube.com/watch?v=example');
  body.set('date', '2026-11-22');
  body.set('image', new Blob([png], { type: 'image/png' }), 'column.png');

  const published = await fetch(`${base}/admin/columns`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, origin: base },
    body,
  });
  assert.equal(published.status, 302);
  assert.equal(published.headers.get('location'), '/columns');

  const textOnly = new FormData();
  textOnly.set('_csrf', token);
  textOnly.set('titleEn', 'A text-only article');
  textOnly.set('excerptEn', 'A preview without an image.');
  assert.equal((await fetch(`${base}/admin/columns`, {
    method: 'POST', redirect: 'manual', headers: { cookie, origin: base }, body: textOnly,
  })).status, 302);

  const list = await (await fetch(`${base}/columns`)).text();
  assert.match(list, /Lorem &lt;Ipsum&gt;/);
  assert.match(list, /아보트 공부/);
  assert.match(list, /A short &lt;preview&gt;/);
  assert.match(list, /columns\/lorem-ipsum/);
  const cards = [...list.matchAll(/<article class="column-card"[\s\S]*?<\/article>/g)].map((match) => match[0]);
  assert.equal(cards.length, 2);
  const imageCard = cards.find((card) => card.includes('/columns/lorem-ipsum'));
  const textCard = cards.find((card) => card.includes('/columns/a-text-only-article'));
  for (const card of [imageCard, textCard]) {
    assert.ok(card);
    assert.equal((card.match(/<a /g) || []).length, 1);
    assert.match(card, /<a class="column-card-link(?: has-image)?" href="\/columns\/[^"]+" aria-labelledby="[^"]+">[\s\S]*<h2[^>]*>[\s\S]*<\/h2>[\s\S]*<\/a>/);
    assert.doesNotMatch(card, /<button|Read article|기사 읽기/);
  }
  assert.match(imageCard, /class="column-card-link has-image"[\s\S]*<img[^>]+alt=""/);
  assert.match(imageCard, /aria-labelledby="column-title-[^"]+ column-title-ko-[^"]+"/);
  assert.match(textCard, /class="column-card-link"[\s\S]*A preview without an image\.[\s\S]*<\/a>/);
  assert.doesNotMatch(textCard, /class="column-card-image"/);

  const article = await (await fetch(`${base}/columns/lorem-ipsum`)).text();
  assert.match(article, /Lorem &lt;Ipsum&gt;/);
  assert.match(article, /<p>English &amp; &lt;Korean&gt;<br>second line\.<\/p><p>English paragraph two\.<\/p>/);
  assert.doesNotMatch(article, /&amp;amp;|&amp;lt;Korean/);
  assert.match(article, /첫 번째 한국어 문단입니다/);
  assert.doesNotMatch(article, /Lorem <Ipsum>/);
  assert.match(article, /href="https:\/\/www\.youtube\.com\/watch\?v=example"/);
  assert.match(article, /class="column-back" href="\/columns"/);
  assert.match(article, /<h1>Lorem &lt;Ipsum&gt;<\/h1>/);
  assert.match(article, /<time datetime="2026-11-22">/);
  assert.match(article, /class="column-feature"[\s\S]*<img[^>]*alt="Lorem &lt;Ipsum&gt;"/);
  assert.match(article, /class="column-video-link" href="https:\/\/www\.youtube\.com\/watch\?v=example" target="_blank" rel="noopener noreferrer"/);
  const textArticle = await (await fetch(`${base}/columns/a-text-only-article`)).text();
  assert.doesNotMatch(textArticle, /class="column-feature"|class="column-video-link"|<time /);

  const source = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(source, /\.column-card::before/);
  assert.match(source, /\.column-card-link:focus-visible\s*\{[^}]*outline:/);
  assert.match(source, /\.column-card-link\.has-image\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(120px, 25%\)/);
  assert.match(source, /@media \(max-width: 560px\)/);
  assert.match(source, /\.column-card-link\.has-image \{ grid-template-columns: minmax\(0, 1fr\) minmax\(84px, 28%\)/);
  assert.match(source, /\.column-card-image\s*\{[^}]*order:\s*2/);
  assert.match(source, /\.columns-page \.page-head, \.column-card, \.column-article, \.column-feature, \.column-video-link,[\s\S]*?border-radius: var\(--radius\)/);
  assert.match(source, /\.column-reading\s*\{[^}]*max-width:\s*47rem/s);
  assert.match(source, /\.column-language p\s*\{[^}]*overflow-wrap:\s*anywhere/s);

  const columns = JSON.parse(await fs.readFile(path.join(dataDir, 'columns.json'), 'utf8'));
  const deleteResponse = await fetch(`${base}/admin/columns/${columns[0].id}/delete`, {
    method: 'POST',
    redirect: 'manual',
    headers: { ...FORM(base), cookie },
    body: new URLSearchParams({ _csrf: token }),
  });
  assert.equal(deleteResponse.status, 302);
});

test('visual article editing preserves links and safely publishes inline images', async (t) => {
  const { base, dataDir, uploadDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const token = await csrfToken(base, cookie);
  const editor = await fetch(`${base}/admin/columns/new`, { headers: { cookie } });
  assert.equal(editor.status, 200);
  const editorHtml = await editor.text();
  assert.match(editorHtml, /data-column-surface[\s\S]*data-insert-image[\s\S]*data-insert-link|data-column-surface[\s\S]*data-insert-link[\s\S]*data-insert-image/);
  assert.match(editorHtml, /data-pastor-select[\s\S]*Pastor John Yoon[\s\S]*윤태선 목사/);
  assert.equal((editorHtml.match(/data-format="(?:bold|italic|underline)"/g) || []).length, 6);
  assert.equal((await fetch(`${base}/admin/columns/new`, { redirect: 'manual' })).status, 302);

  const imageId = 'c65c7e29-b623-40cf-9c2c-6e59f214057a';
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#223b55' } }).png().toBuffer();
  const makeForm = (overrides = {}) => {
    const data = new FormData();
    const values = {
      _csrf: token, titleEn: 'An article', titleKo: '기사', excerptEn: '', excerptKo: '',
      speakerEn: 'Pastor John Yoon', speakerKo: '윤태선 목사',
      bodyEnDoc: JSON.stringify([{ type: 'block', children: [
        { type: 'text', text: 'Before & <after> ' },
        { type: 'bold', children: [{ type: 'text', text: 'Bold & ' }, { type: 'italic', children: [{ type: 'text', text: '<italic>' }] }] },
        { type: 'underline', children: [{ type: 'text', text: 'Underlined' }] },
        { type: 'link', href: 'https://example.com/watch?a=1&b=2', children: [{ type: 'text', text: 'Watch' }] },
        { type: 'image', file: `new:${imageId}`, alt: 'A church photo' },
        { type: 'text', text: ' Then more text.' },
      ] }]),
      bodyKoDoc: JSON.stringify([{ type: 'block', children: [{ type: 'text', text: '한국어 기사' }] }]),
      date: '2026-11-22', videoUrl: '', ...overrides,
    };
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  };
  const post = (url, body, headers = {}) => fetch(base + url, {
    method: 'POST', redirect: 'manual', headers: { cookie, origin: base, 'x-csrf-token': token, ...headers }, body,
  });
  const forbidden = makeForm();
  forbidden.set('inlineImages', new Blob([image], { type: 'image/png' }), `${imageId}.png`);
  assert.equal((await post('/admin/columns/rich', forbidden, { 'x-csrf-token': 'invalid' })).status, 403);
  assert.equal((await post('/admin/columns/rich', makeForm(), { origin: 'https://other.example' })).status, 403);
  const missing = await post('/admin/columns/rich', makeForm());
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /image is missing/);
  const badLink = makeForm({ bodyEnDoc: JSON.stringify([{ type: 'link', href: 'javascript:alert(1)', children: [] }]) });
  assert.equal((await post('/admin/columns/rich', badLink)).status, 400);
  const badFormatting = makeForm({ bodyEnDoc: JSON.stringify([{ type: 'bold', children: [{ type: 'image', file: `new:${imageId}`, alt: '' }] }]) });
  assert.equal((await post('/admin/columns/rich', badFormatting)).status, 400);

  const create = makeForm();
  create.set('inlineImages', new Blob([image], { type: 'image/png' }), `${imageId}.png`);
  create.set('image', new Blob([image], { type: 'image/png' }), 'cover.png');
  const created = await post('/admin/columns/rich', create);
  assert.equal(created.status, 200);
  const location = (await created.json()).location;
  assert.equal(location, '/columns/an-article');
  let saved = JSON.parse(await fs.readFile(path.join(dataDir, 'columns.json'), 'utf8'))[0];
  assert.equal(saved.inlineImages.length, 1);
  const inlineImage = saved.inlineImages[0];
  const cover = saved.image;
  const publicPage = await (await fetch(base + location)).text();
  assert.match(publicPage, /<a href="https:\/\/example\.com\/watch\?a=1&amp;b=2"/);
  assert.match(publicPage, /<img src="\/columns\/images\/[^"]+" data-column-image="[^"]+" alt="A church photo"/);
  assert.match(publicPage, /Then more text\./);
  assert.match(publicPage, /<strong>Bold &amp; <em>&lt;italic&gt;<\/em><\/strong><u>Underlined<\/u>/);
  assert.doesNotMatch(publicPage, /class="column-byline"><img/);
  assert.equal((await fetch(`${base}/columns/images/${inlineImage}`)).status, 200);

  const editPage = await (await fetch(`${base}/admin/columns/${saved.id}/edit`, { headers: { cookie } })).text();
  const revision = editPage.match(/name="revision" value="([^"]+)"/)[1];
  assert.match(editPage, /data-column-image="/);
  assert.match(editPage, /<strong>Bold &amp; <em>&lt;italic&gt;<\/em><\/strong><u>Underlined<\/u>/);
  const editedDoc = JSON.stringify([{ type: 'block', children: [
    { type: 'text', text: 'Updated text' }, { type: 'image', file: inlineImage, alt: 'Updated photo' },
  ] }]);
  const edited = await post(`/admin/columns/${saved.id}/edit`, makeForm({ revision, titleEn: 'Renamed article', bodyEnDoc: editedDoc }));
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).location, location);
  const stale = await post(`/admin/columns/${saved.id}/edit`, makeForm({ revision, bodyEnDoc: editedDoc }));
  assert.equal(stale.status, 409);
  saved = JSON.parse(await fs.readFile(path.join(dataDir, 'columns.json'), 'utf8'))[0];
  assert.equal(saved.titleEn, 'Renamed article');
  assert.equal(saved.speakerKo, '윤태선 목사');
  assert.equal(saved.image, cover);
  assert.deepEqual(saved.inlineImages, [inlineImage]);
  assert.match(await (await fetch(base + location)).text(), /Updated text/);
  assert.equal((await fetch(`${base}/columns/images/${cover}`)).status, 200);

  const removed = await fetch(`${base}/admin/columns/${saved.id}/delete`, {
    method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie }, body: new URLSearchParams({ _csrf: token }),
  });
  assert.equal(removed.status, 302);
  assert.equal((await fetch(`${base}/columns/images/${inlineImage}`)).status, 404);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'columns')), []);
});

test('article language links and previews follow the shared language and author', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  await fs.mkdir(dataDir, { recursive: true });
  const column = {
    id: 'article1', slug: 'rest', titleEn: 'A place of rest', titleKo: '쉼의 자리',
    bodyEn: 'English body', bodyKo: '한국어 본문', speakerEn: 'Pastor John Yoon',
    speakerKo: '윤태선 목사', date: '2026-11-22', createdAt: '2026-11-22T00:00:00Z',
  };
  await fs.writeFile(path.join(dataDir, 'columns.json'), JSON.stringify([column]));
  const en = await (await fetch(`${base}/columns/rest?lang=en`)).text();
  const ko = await (await fetch(`${base}/columns/rest?lang=ko`)).text();
  assert.match(en, /<h1>A place of rest<\/h1>/);
  assert.match(en, /English body/);
  assert.doesNotMatch(en, /한국어 본문/);
  assert.match(ko, /<h1 lang="ko">쉼의 자리<\/h1>/);
  assert.match(ko, /한국어 본문/);
  assert.doesNotMatch(ko, /English body/);
  assert.match(ko, /윤태선 목사/);
  assert.match(ko, /property="og:url" content="https:\/\/immanuelchurchofamerica.org\/columns\/rest\?lang=ko"/);
  assert.match(ko, /property="og:image" content="[^"]+\/columns\/rest\/preview\.png\?lang=ko&amp;v=[a-f0-9]+"/);
  assert.match(ko, /property="og:image:alt" content="쉼의 자리 · 윤태선 목사 · /);
  const articleActions = en.match(/<nav class="column-footer"[\s\S]*?<\/nav>/)[0];
  assert.equal((articleActions.match(/class="btn btn-ghost column-action/g) || []).length, 3);
  assert.match(articleActions, /column-action-all[^>]*href="\/columns"/);
  assert.match(articleActions, /column-action-share share-link[^>]*href="\/columns\/rest" data-share-title="A place of rest"/);
  assert.match(articleActions, /column-action-copy copy-link[^>]*href="\/columns\/rest"/);
  assert.match(en, /<script src="\/scripts\/sermon-sharing\.js" defer><\/script>/);
  assert.match(ko, /data-share-title="쉼의 자리"/);
  assert.match(ko, /href="\?lang=en"/);
  const fallback = await (await fetch(`${base}/columns/rest`)).text();
  assert.match(fallback, /English body/);
  assert.match(fallback, /한국어 본문/);
  const preview = await fetch(`${base}/columns/rest/preview.png?lang=ko`);
  assert.equal(preview.status, 200);
  assert.deepEqual({ width: (await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).width, type: preview.headers.get('content-type') },
    { width: 1200, type: 'image/png' });
  const oldEtag = preview.headers.get('etag');
  column.speakerKo = '다른 목사';
  await fs.writeFile(path.join(dataDir, 'columns.json'), JSON.stringify([column]));
  const changed = await fetch(`${base}/columns/rest/preview.png?lang=ko`);
  assert.notEqual(changed.headers.get('etag'), oldEtag);
  assert.equal((await fetch(`${base}/columns/missing/preview.png`)).status, 404);
});

test('article language preference preserves explicit links', async () => {
  const source = await fs.readFile(new URL('../public/scripts/column-language.js', import.meta.url), 'utf8');
  const execute = (href, languages, language = '') => {
    let destination = '';
    runInNewContext(source, {
      URL, navigator: { languages, language },
      window: { location: { href, replace: (value) => { destination = value; } } },
    });
    return destination;
  };
  assert.equal(execute('https://example.com/columns/rest', ['fr', 'ko-KR']), 'https://example.com/columns/rest?lang=ko');
  assert.equal(execute('https://example.com/columns/rest', ['fr']), 'https://example.com/columns/rest?lang=en');
  assert.equal(execute('https://example.com/columns/rest', [], 'ko-KR'), 'https://example.com/columns/rest?lang=ko');
  assert.equal(execute('https://example.com/columns/rest?lang=en', ['ko']), '');
});

for (const viewport of ['desktop', 'mobile']) {
  test(`article formatting controls preserve selections and serialize on ${viewport}`, async () => {
    const source = await fs.readFile(new URL('../public/scripts/admin-column-editor.js', import.meta.url), 'utf8');
    const handlers = new Map();
    const commands = [];
    const fields = new Map();
    const text = { nodeType: 3, data: 'Word' };
    const underline = { nodeType: 1, tagName: 'U', childNodes: [text] };
    const italic = { nodeType: 1, tagName: 'I', childNodes: [underline] };
    const bold = { nodeType: 1, tagName: 'B', childNodes: [italic] };
    const range = { startContainer: text, endContainer: text, cloneRange() { return this; } };
    const selection = { rangeCount: 1, anchorNode: text, focusNode: text, getRangeAt: () => range, removeAllRanges() {}, addRange() {} };
    const button = (format) => ({ dataset: { format }, addEventListener: (name, fn) => handlers.set(`${format}:${name}`, fn) });
    const buttons = ['bold', 'italic', 'underline'].map(button);
    const status = { textContent: '' };
    const submit = {};
    function section(language, children) {
      const surface = { childNodes: children, hidden: true, contains: () => true, focus() {}, addEventListener() {}, closest: () => wrapper };
      const wrapper = {
        dataset: { columnLanguage: language },
        querySelector: (selector) => ({
          '[data-column-surface]': surface, '[data-column-fallback]': {}, '.column-editor-tools': {},
          '[data-insert-link]': { addEventListener() {} }, '[data-insert-image]': { addEventListener() {} },
        })[selector],
        querySelectorAll: () => language === 'en' ? buttons : [],
      };
      return wrapper;
    }
    const sections = [section('en', [bold]), section('ko', [])];
    const form = {
      action: '/save', querySelector: (selector) => selector === '[data-column-status]' ? status : submit,
      querySelectorAll: () => sections,
      addEventListener: (name, fn) => handlers.set(`form:${name}`, fn),
    };
    const document = {
      querySelector: () => form, addEventListener: (name, fn) => handlers.set(`document:${name}`, fn),
      execCommand: (command) => { commands.push(command); return true; },
    };
    const context = {
      document, window: { getSelection: () => selection, addEventListener() {} }, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      FormData: class { set(key, value) { fields.set(key, value); } get() { return 'token'; } },
      fetch: async () => ({ ok: false, headers: { get: () => 'application/json' }, json: async () => ({ error: 'Test failure' }) }),
      Map, Set,
    };
    runInNewContext(source, context);
    handlers.get('document:selectionchange')();
    for (const format of ['bold', 'italic', 'underline']) {
      let prevented = false;
      handlers.get(`${format}:mousedown`)({ preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
      handlers.get(`${format}:click`)();
    }
    assert.deepEqual(commands, ['bold', 'italic', 'underline']);
    await handlers.get('form:submit')({ preventDefault() {} });
    assert.deepEqual(JSON.parse(fields.get('bodyEnDoc')), [{ type: 'bold', children: [{ type: 'italic', children: [{ type: 'underline', children: [{ type: 'text', text: 'Word' }] }] }] }]);
  });
}

test('article likes and comments require verification and admin moderation', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'columns.json'), JSON.stringify([{
    id: 'article1', slug: 'rest', titleEn: 'Rest', bodyEn: 'Text', createdAt: '2026-11-22',
  }]));
  const response = await fetch(`${base}/columns/rest?lang=en`);
  const reader = response.headers.get('set-cookie').split(';')[0];
  const page = await response.text();
  const token = page.match(/name="_reader" value="([^"]+)"/)[1];
  assert.ok(page.indexOf('class="column-footer"') < page.indexOf('id="article-engagement"'));
  assert.match(page, /class="column-response-link" href="#article-comments"/);
  assert.match(page, /<details class="column-response">[\s\S]*name="name"[\s\S]*name="email"[\s\S]*name="comment"/);
  assert.ok(page.indexOf('class="column-reactions"') < page.indexOf('class="column-response"'));
  assert.ok(page.indexOf('class="column-response"') < page.indexOf('No comments yet.'));
  const post = (url, values, headers = {}) => fetch(base + url, {
    method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie: reader, ...headers },
    body: new URLSearchParams({ _reader: token, lang: 'en', ...values }),
  });
  assert.equal((await post('/columns/rest/like', {}, { origin: 'https://other.example' })).status, 403);
  assert.equal((await post('/columns/rest/like', { _reader: 'bad' })).status, 403);
  assert.equal((await post('/columns/rest/like', {})).status, 302);
  assert.equal((await post('/columns/rest/like', {})).status, 302);
  let html = await (await fetch(`${base}/columns/rest?lang=en`, { headers: { cookie: reader } })).text();
  assert.match(html, /disabled>[\s\S]*Liked[\s\S]*좋아요 수">1/);
  assert.equal((await post('/columns/rest/comments', { name: 'Reader', email: 'bad', comment: 'Hello' })).status, 400);
  assert.equal((await post('/columns/rest/comments', { name: '<Reader>', email: 'private@example.com', comment: '<script>hello</script>' })).status, 302);
  html = await (await fetch(`${base}/columns/rest?lang=en`, { headers: { cookie: reader } })).text();
  assert.doesNotMatch(html, /private@example\.com|&lt;script&gt;hello/);
  const adminCookie = await login(base);
  const adminToken = await csrfToken(base, adminCookie);
  for (const route of ['/admin', '/admin/columns']) {
    const dashboard = await (await fetch(base + route, { headers: { cookie: adminCookie } })).text();
    assert.match(dashboard, /1 comment is awaiting review/);
    assert.match(dashboard, /href="\/admin\/columns\/comments"/);
  }
  assert.doesNotMatch(html, /comment is awaiting review/);
  assert.equal((await fetch(`${base}/admin/columns/comments`, { redirect: 'manual' })).status, 302);
  const moderation = await (await fetch(`${base}/admin/columns/comments`, { headers: { cookie: adminCookie } })).text();
  assert.match(moderation, /private@example\.com/);
  assert.match(moderation, /&lt;script&gt;hello&lt;\/script&gt;/);
  const action = moderation.match(/action="([^"]+\/approve)"/)[1];
  const approve = (csrf, origin = base) => fetch(base + action, {
    method: 'POST', redirect: 'manual', headers: { ...FORM(base), origin, cookie: adminCookie }, body: new URLSearchParams({ _csrf: csrf }),
  });
  assert.equal((await approve('bad')).status, 403);
  assert.equal((await approve(adminToken, 'https://other.example')).status, 403);
  assert.equal((await approve(adminToken)).status, 302);
  for (const route of ['/admin', '/admin/columns']) {
    const dashboard = await (await fetch(base + route, { headers: { cookie: adminCookie } })).text();
    assert.doesNotMatch(dashboard, /comment is awaiting review/);
  }
  html = await (await fetch(`${base}/columns/rest?lang=en`, { headers: { cookie: reader } })).text();
  assert.match(html, /<ol class="column-comments">/);
  assert.ok(html.indexOf('class="column-response"') < html.indexOf('<ol class="column-comments">'));
  assert.match(html, /&lt;Reader&gt;/);
  assert.match(html, /class="column-comment-byline"><strong>&lt;Reader&gt;<\/strong><time datetime="\d{4}-\d{2}-\d{2}">/);
  assert.match(html, /&lt;script&gt;hello&lt;\/script&gt;/);
  assert.doesNotMatch(html, /private@example\.com|<script>hello|data-format=/);
  assert.equal((await post('/columns/rest/comments', { name: 'Another reader', comment: 'A second comment' })).status, 302);
  assert.equal((await post('/columns/rest/comments', { name: 'Third reader', comment: 'A third comment' })).status, 302);
  const pending = await (await fetch(`${base}/admin`, { headers: { cookie: adminCookie } })).text();
  assert.match(pending, /2 comments are awaiting review/);
  const review = await (await fetch(`${base}/admin/columns/comments`, { headers: { cookie: adminCookie } })).text();
  for (const [, deleteAction] of review.matchAll(/action="([^"]+\/delete)"/g)) {
    assert.equal((await fetch(base + deleteAction, {
      method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie: adminCookie },
      body: new URLSearchParams({ _csrf: adminToken }),
    })).status, 302);
  }
  assert.doesNotMatch(await (await fetch(`${base}/admin`, { headers: { cookie: adminCookie } })).text(), /awaiting review/);
});

test('reader forms remain valid across application restarts', async (t) => {
  const { base, dataDir, uploadDir, close } = await boot();
  t.after(close);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'columns.json'), JSON.stringify([{
    id: 'article1', slug: 'rest', titleEn: 'Rest', bodyEn: 'Text', createdAt: '2026-11-22',
  }]));
  const response = await fetch(`${base}/columns/rest?lang=en`);
  const reader = response.headers.get('set-cookie').split(';')[0];
  const token = (await response.text()).match(/name="_reader" value="([^"]+)"/)[1];
  const reopened = createApp({ dataDir, uploadDir, password: PASSWORD }).listen(0);
  try {
    const nextBase = `http://localhost:${reopened.address().port}`;
    const post = (route, values) => fetch(nextBase + route, {
      method: 'POST', redirect: 'manual', headers: { ...FORM(nextBase), cookie: reader },
      body: new URLSearchParams({ _reader: token, lang: 'en', ...values }),
    });
    assert.equal((await post('/columns/rest/like', {})).status, 302);
    assert.equal((await post('/columns/rest/comments', { name: 'Reader', comment: 'Still here' })).status, 302);
    assert.equal((await post('/columns/rest/comments', { _reader: 'bad', name: 'Reader', comment: 'Invalid' })).status, 403);
  } finally {
    const done = new Promise((resolve) => reopened.close(resolve));
    reopened.closeAllConnections();
    await done;
  }
});

test('article storage failures return an error response', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'columns.json'), '{');
  for (const route of ['/columns', '/columns/rest', '/columns/images/missing.webp']) {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 500);
    assert.match(await response.text(), /Something went wrong/);
  }
  await fs.writeFile(path.join(dataDir, 'columns.json'), JSON.stringify([{
    id: 'article1', slug: 'rest', titleEn: 'Rest', bodyEn: 'Text', createdAt: '2026-11-22',
  }]));
  await fs.writeFile(path.join(dataDir, 'column-engagement.json'), '{');
  assert.equal((await fetch(`${base}/columns/rest`, { signal: AbortSignal.timeout(2000) })).status, 500);
});

for (const viewport of ['desktop', 'mobile']) {
  test(`comment submission keeps the ${viewport} page in place and preserves input on failure`, async () => {
    const source = await fs.readFile(new URL('../public/scripts/column-comment.js', import.meta.url), 'utf8');
    const status = { textContent: '' };
    const button = { disabled: false };
    let submit;
    let resets = 0;
    let response = { ok: true, redirected: true, url: 'https://example.com/columns/rest?lang=en&status=submitted#article-engagement' };
    const form = {
      action: 'https://example.com/columns/rest/comments',
      querySelector: (selector) => selector === '[data-comment-status]' ? status : button,
      addEventListener: (_name, handler) => { submit = handler; },
      reset: () => { resets++; },
    };
    const window = { location: { origin: 'https://example.com', href: 'https://example.com/columns/rest?lang=en' } };
    runInNewContext(source, {
      document: { querySelector: () => form }, window, URL, URLSearchParams,
      FormData: class { *[Symbol.iterator]() { yield ['comment', 'Hello']; } },
      fetch: async () => response,
    });
    let prevented = false;
    await submit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(window.location.href, 'https://example.com/columns/rest?lang=en');
    assert.match(status.textContent, /comment will appear after review/);
    assert.equal(resets, 1);
    assert.equal(button.disabled, false);
    response = { ok: false, status: 429, redirected: false, url: 'https://example.com/columns/rest/comments' };
    await submit({ preventDefault() {} });
    assert.match(status.textContent, /Too many requests/);
    assert.equal(resets, 1);
    assert.equal(button.disabled, false);
    response = { ok: true, redirected: false, url: 'https://example.com/columns/rest/comments' };
    await submit({ preventDefault() {} });
    assert.match(status.textContent, /Could not submit/);
    assert.equal(resets, 1);
  });
}
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

async function uploadGallery(base, cookie, token, files) {
  const body = new FormData();
  for (const file of files) {
    body.append('photos', new Blob([file.data], { type: file.type ?? 'image/png' }), file.name ?? 'photo.png');
  }
  return fetch(`${base}/admin/gallery/uploads`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, origin: base, 'x-csrf-token': token, accept: 'application/json' }, body,
  });
}

async function publishGallery(base, cookie, token, photos) {
  return fetch(`${base}/admin/gallery/publish`, {
    method: 'POST', redirect: 'manual',
    headers: { ...FORM(base), cookie, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ _csrf: token, photos }),
  });
}

async function galleryOrder(base, cookie) {
  const response = await fetch(`${base}/admin/gallery/reorder`, { headers: { cookie } });
  const html = await response.text();
  return {
    response, html,
    revision: html.match(/name="revision" value="([^"]+)"/)?.[1],
    ids: [...html.matchAll(/data-order-id="([^"]+)"/g)].map((match) => match[1]),
  };
}

async function saveGalleryOrder(base, cookie, token, revision, ids, origin = base) {
  return fetch(`${base}/admin/gallery/order`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, origin, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ _csrf: token, revision, ids }),
  });
}

function galleryRecords(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `photo-${index + 1}`, file: `photo-${index + 1}.webp`, thumbnail: `photo-${index + 1}-thumb.webp`,
    state: 'published', captionEn: `Photo ${index + 1}`, captionKo: '교회 사진', width: 20, height: 10,
    publishedAt: new Date(Date.UTC(2026, 10, 14, 0, 0, index)).toISOString(),
  }));
}

test('admins reorder all published photos while preserving metadata, drafts, pagination, and stable links', async (t) => {
  const { base, close, dataDir } = await boot();
  t.after(close);
  const cookie = await login(base);
  const token = await csrfToken(base, cookie);
  const original = galleryRecords(27);
  const draft = { ...original[0], id: 'private-draft', state: 'draft', sessionId: 'other-session', expiresAt: Date.now() + 3600000 };
  await fs.writeFile(path.join(dataDir, 'gallery.json'), JSON.stringify([...original, draft]));
  const editor = await galleryOrder(base, cookie);
  assert.equal(editor.response.status, 200);
  assert.equal(editor.response.headers.get('cache-control'), 'no-store');
  assert.equal(editor.ids.length, 27);
  assert.equal(editor.ids[0], original[26].id);
  assert.doesNotMatch(editor.html, /data-order-id="private-draft"|name="captionEn"/);
  assert.match(editor.html, /data-order-drag/);
  assert.match(editor.html, /data-order-position/);
  assert.equal((await fetch(`${base}/admin/gallery/reorder`, { redirect: 'manual' })).status, 302);
  const desired = original.map((photo) => photo.id);
  assert.equal((await saveGalleryOrder(base, '', token, editor.revision, desired)).status, 302);
  assert.equal((await saveGalleryOrder(base, cookie, 'bad', editor.revision, desired)).status, 403);
  assert.equal((await saveGalleryOrder(base, cookie, token, editor.revision, desired, 'https://example.invalid')).status, 403);
  for (const invalid of [desired.slice(1), [...desired, 'unknown'], [desired[0], ...desired.slice(0, -1)], [...desired.slice(0, -1), draft.id]]) {
    assert.equal((await saveGalleryOrder(base, cookie, token, editor.revision, invalid)).status, 400);
  }
  assert.equal((await saveGalleryOrder(base, cookie, token, editor.revision, desired)).status, 200);
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'gallery.json')));
  assert.deepEqual(saved, [...original.map((photo, index) => ({ ...photo, order: index })), draft]);
  const publicHtml = await (await fetch(`${base}/gallery`)).text();
  const firstPageIds = [...publicHtml.matchAll(/data-photo-id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(firstPageIds, desired.slice(0, 24));
  const link = await (await fetch(`${base}/gallery/${original[26].id}`)).text();
  assert.match(link, /data-page="2"/);
  assert.match(link, /data-open-photo="photo-27"/);
  assert.equal((await saveGalleryOrder(base, cookie, token, editor.revision, editor.ids)).status, 409);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'gallery.json'))), saved);
});

for (const viewport of ['desktop', 'mobile']) {
  test(`sermon selectors add staggered passages and select pastors on ${viewport}`, async () => {
    const script = await fs.readFile(new URL('../public/scripts/admin.js', import.meta.url), 'utf8');
    const counts = JSON.parse(await fs.readFile(new URL('../public/bible-verses.json', import.meta.url), 'utf8'));
    if (viewport === 'mobile') {
      const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
      assert.match(css, /\.scripture-range\s*\{[^}]*minmax\(min\(100%, 8rem\), 1fr\)/);
    }
    const element = (initial = {}) => ({
      value: '', dataset: {}, events: {}, textContent: '', ...initial,
      addEventListener(name, fn) { this.events[name] = fn; },
      fire(name) { this.events[name]?.({ target: this }); },
    });
    const select = (initial = {}) => {
      const control = element({
        options: [], disabled: false,
        replaceChildren() { this.options = []; this.value = ''; },
        add(option) { this.options.push(option); if (this.options.length === 1) this.value = option.value; },
        ...initial,
      });
      Object.defineProperty(control, 'selectedOptions', { get() { return this.options.filter((option) => option.value === this.value); } });
      return control;
    };
    const book = select({ options: [
      { value: '42', dataset: { en: 'John', ko: '요한복음' } },
      { value: '44', dataset: { en: 'Romans', ko: '로마서' } },
    ] });
    const chapter = select(), start = select(), end = select();
    const verses = element(), reference = element({ maxLength: 1000 }), status = element();
    const addRange = element(), addPassage = element();
    const fields = { '[data-book]': book, '[data-chapter]': chapter, '[data-start]': start, '[data-end]': end,
      '[data-verses]': verses, '[name="scripture"]': reference, '[data-scripture-status]': status,
      '[data-add-range]': addRange, '[data-add-passage]': addPassage };
    const en = element(), ko = element();
    const pastor = select({ form: { elements: { speakerEn: en, speakerKo: ko } },
      options: [{ value: 'john', dataset: { en: 'Pastor John Yoon', ko: '윤태선 목사' } }] });
    runInNewContext(script, {
      document: {
        querySelectorAll: (selector) => selector === '[data-scripture-entry]' ? [{ querySelector: (key) => fields[key] }]
          : selector === '[data-pastor-select]' ? [pastor] : [],
        addEventListener() {},
      },
      fetch: async () => ({ ok: true, json: async () => counts }),
      Option: function Option(text, value) { this.text = text; this.value = value; },
    });
    await new Promise((resolve) => setImmediate(resolve));
    pastor.value = 'john'; pastor.fire('change');
    assert.equal(en.value, 'Pastor John Yoon'); assert.equal(ko.value, '윤태선 목사');
    en.value = 'Edited'; en.fire('input'); assert.equal(pastor.value, '');
    book.value = '42'; book.fire('change');
    chapter.value = '3'; chapter.fire('change');
    start.value = '16'; start.fire('change'); end.value = '18'; addRange.fire('click');
    start.value = '21'; start.fire('change'); addRange.fire('click');
    assert.equal(verses.value, '16-18, 21');
    addPassage.fire('click');
    assert.equal(reference.value, 'John 3:16-18, 21 (요한복음 3:16-18, 21)');
    book.value = '44'; book.fire('change'); chapter.value = '8'; chapter.fire('change');
    verses.value = '99'; addPassage.fire('click');
    assert.match(status.textContent, /valid verses/);
    verses.value = '28'; addPassage.fire('click');
    assert.equal(reference.value, 'John 3:16-18, 21 (요한복음 3:16-18, 21); Romans 8:28 (로마서 8:28)');
  });
}

test('gallery ordering detects concurrent changes and new batches prepend without losing the saved order', async (t) => {
  const { base, close, dataDir } = await boot();
  t.after(close);
  const cookie = await login(base);
  const token = await csrfToken(base, cookie);
  await fs.writeFile(path.join(dataDir, 'gallery.json'), JSON.stringify(galleryRecords(3)));
  const editor = await galleryOrder(base, cookie);
  const responses = await Promise.all([
    saveGalleryOrder(base, cookie, token, editor.revision, ['photo-2', 'photo-1', 'photo-3']),
    saveGalleryOrder(base, cookie, token, editor.revision, ['photo-1', 'photo-3', 'photo-2']),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const current = await galleryOrder(base, cookie);
  const edit = await fetch(`${base}/admin/gallery/photo-1/edit`, {
    method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie },
    body: new URLSearchParams({ _csrf: token, captionEn: 'Edited during reordering', captionKo: '수정된 설명' }),
  });
  assert.equal(edit.status, 302);
  assert.equal((await saveGalleryOrder(base, cookie, token, current.revision, current.ids)).status, 409);
  const beforeBatch = await galleryOrder(base, cookie);
  const data = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#223b55' } }).png().toBuffer();
  const uploaded = await uploadGallery(base, cookie, token, [{ data }, { data }]);
  const newPhotos = (await uploaded.json()).photos;
  assert.equal((await galleryOrder(base, cookie)).revision, beforeBatch.revision, 'private uploads do not conflict');
  assert.equal((await publishGallery(base, cookie, token, newPhotos.map((photo) => ({ id: photo.id })))).status, 200);
  assert.equal((await saveGalleryOrder(base, cookie, token, beforeBatch.revision, beforeBatch.ids)).status, 409);
  const afterBatch = await galleryOrder(base, cookie);
  assert.deepEqual(afterBatch.ids, [...newPhotos.map((photo) => photo.id), ...beforeBatch.ids]);
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'gallery.json')));
  assert.equal(saved.find((photo) => photo.id === 'photo-1').captionEn, 'Edited during reordering');
});

async function galleryViewerHarness({ fetchPage, hash = '', openPhotoId = '' } = {}) {
  const source = await fs.readFile(new URL('../public/scripts/gallery.js', import.meta.url), 'utf8');
  const viewerEvents = new Map();
  const image = { removeAttribute(name) { delete this[name]; } };
  const previous = { events: new Map(), addEventListener(name, fn) { this.events.set(name, fn); } };
  const next = { events: new Map(), addEventListener(name, fn) { this.events.set(name, fn); } };
  const status = {};
  let shownCaption;
  const makeLink = (id) => {
    const figure = {
      id: `gallery-photo-${id}`,
      scrollIntoView(options) { this.scrolled = options.block; },
      querySelector() { return { cloneNode() { return { id }; } }; },
    };
    return {
      href: `/gallery/${id}`, dataset: { photoId: String(id), galleryImage: `/gallery/photos/${id}/image.webp` }, events: new Map(),
      addEventListener(name, fn) { this.events.set(name, fn); },
      querySelector() { return { alt: `Photo ${id}` }; },
      closest() { return figure; },
      focus() { this.focused = true; },
    };
  };
  const pageLinks = new Map([[1, [makeLink(1), makeLink(2)]], [2, [makeLink(3), makeLink(4)]], [3, [makeLink(5)]]]);
  const selectors = {
    img: image, '[data-gallery-previous]': previous, '[data-gallery-next]': next,
    '[data-gallery-viewer-status]': status,
    '.gallery-viewer-caption': { replaceChildren(caption) { shownCaption = caption; } },
  };
  const viewer = {
    open: false, dataset: { page: '1', pages: '3', openPhoto: openPhotoId },
    showModal() { this.open = true; },
    close() { this.open = false; viewerEvents.get('close')(); },
    addEventListener(name, fn) { viewerEvents.set(name, fn); },
    querySelector(selector) { return selectors[selector]; },
    getBoundingClientRect() { return { left: 100, right: 500, top: 100, bottom: 500 }; },
  };
  const requests = [];
  const windowEvents = new Map();
  const locations = [];
  const history = [];
  runInNewContext(source, {
    document: { querySelector() { return viewer; }, querySelectorAll() { return pageLinks.get(1); } },
    window: {
      location: { hash, assign(url) { locations.push(url); } },
      history: { replaceState(_state, _title, url) { history.push(url); } },
      addEventListener(name, fn) { windowEvents.set(name, fn); },
    },
    AbortController,
    fetch: async (url, options) => {
      requests.push(url);
      return fetchPage ? fetchPage(url, options) : { ok: true, text: async () => url.slice(-1) };
    },
    DOMParser: class {
      parseFromString(html) {
        return {
          querySelector() { return { dataset: { page: html } }; },
          querySelectorAll() { return pageLinks.get(Number(html)) ?? []; },
        };
      }
    },
  });
  return {
    viewer, image, previous, next, status, requests, viewerEvents, pageLinks, locations, windowEvents, history,
    get caption() { return shownCaption; },
  };
}

test('gallery viewer opens the selected image and captions and closes with Escape', async () => {
  const state = await galleryViewerHarness();
  const { viewer, image, viewerEvents } = state;
  const link = state.pageLinks.get(1)[0];
  let prevented = false;
  const click = { preventDefault() { prevented = true; } };
  link.events.get('click')({ ...click, ctrlKey: true });
  assert.equal(viewer.open, false);
  assert.equal(prevented, false);
  link.events.get('click')(click);
  assert.equal(viewer.open, true);
  assert.equal(image.src, link.dataset.galleryImage);
  assert.equal(image.alt, 'Photo 1');
  assert.equal(state.caption.id, 1);
  assert.equal(prevented, true);
  viewerEvents.get('keydown')({ key: 'Tab' });
  assert.equal(viewer.open, true);
  prevented = false;
  viewerEvents.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(viewer.open, false);
  assert.equal(image.src, undefined);
});

test('gallery viewer arrow buttons and keys cross pages in both directions and stop at gallery boundaries', async () => {
  const state = await galleryViewerHarness();
  const { previous, next, viewerEvents, image } = state;
  state.pageLinks.get(1)[0].events.get('click')({ preventDefault() {} });
  assert.equal(previous.disabled, true);
  await previous.events.get('click')();
  assert.equal(image.alt, 'Photo 1');
  await viewerEvents.get('keydown')({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(image.alt, 'Photo 2');
  await next.events.get('click')();
  assert.equal(image.alt, 'Photo 3');
  assert.equal(state.caption.id, 3);
  assert.match(state.status.textContent, /Page 2\/3/);
  await next.events.get('click')();
  await next.events.get('click')();
  assert.equal(image.alt, 'Photo 5');
  assert.equal(next.disabled, true);
  await next.events.get('click')();
  assert.equal(image.alt, 'Photo 5');
  await viewerEvents.get('keydown')({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(image.alt, 'Photo 4');
  await previous.events.get('click')();
  await previous.events.get('click')();
  assert.equal(image.alt, 'Photo 2');
  assert.deepEqual(state.requests, ['/gallery?page=2', '/gallery?page=3']);
});

test('gallery viewer reports loading errors, allows retry, and ignores pending navigation after closing', async () => {
  let succeed = false;
  const state = await galleryViewerHarness({
    fetchPage: async () => ({ ok: succeed, text: async () => '2' }),
  });
  state.pageLinks.get(1)[1].events.get('click')({ preventDefault() {} });
  await state.next.events.get('click')();
  assert.match(state.status.textContent, /Could not load photos/);
  assert.equal(state.image.alt, 'Photo 2');
  assert.equal(state.next.disabled, false);
  succeed = true;
  await state.next.events.get('click')();
  assert.equal(state.image.alt, 'Photo 3');

  let resolve;
  let signal;
  const pending = await galleryViewerHarness({
    fetchPage: (_url, options) => {
      signal = options.signal;
      return new Promise((done) => { resolve = done; });
    },
  });
  pending.pageLinks.get(1)[1].events.get('click')({ preventDefault() {} });
  const loading = pending.next.events.get('click')();
  assert.equal(pending.next.disabled, true);
  pending.viewer.close();
  assert.equal(signal.aborted, true);
  pending.pageLinks.get(1)[0].events.get('click')({ preventDefault() {} });
  resolve({ ok: true, text: async () => '2' });
  await loading;
  assert.equal(pending.image.alt, 'Photo 1');
  assert.equal(pending.next.disabled, false);
});

test('gallery backdrop closes only for outside clicks and returns to the last viewed photo', async () => {
  const state = await galleryViewerHarness();
  const { viewer, viewerEvents } = state;
  state.pageLinks.get(1)[0].events.get('click')({ preventDefault() {} });
  const inside = { target: viewer, clientX: 200, clientY: 200 };
  const outside = { target: viewer, clientX: 10, clientY: 10 };
  viewerEvents.get('pointerdown')(inside);
  viewerEvents.get('click')(inside);
  assert.equal(viewer.open, true);
  viewerEvents.get('pointerdown')(inside);
  viewerEvents.get('click')(outside);
  assert.equal(viewer.open, true);
  await state.next.events.get('click')();
  viewerEvents.get('pointerdown')(outside);
  viewerEvents.get('click')(outside);
  assert.equal(viewer.open, false);
  const lastPhoto = state.pageLinks.get(1)[1];
  assert.equal(lastPhoto.focused, true);
  assert.equal(lastPhoto.closest().scrolled, 'center');
  assert.deepEqual(state.locations, []);
});

test('closing a viewer on another page returns to that page and restores photo focus from the fragment', async () => {
  const state = await galleryViewerHarness();
  state.pageLinks.get(1)[1].events.get('click')({ preventDefault() {} });
  await state.next.events.get('click')();
  state.viewer.close();
  assert.deepEqual(state.locations, ['/gallery?page=2#gallery-photo-3']);
  const returned = await galleryViewerHarness({ hash: '#gallery-photo-2' });
  returned.windowEvents.get('pageshow')();
  assert.equal(returned.pageLinks.get(1)[1].focused, true);
  assert.equal(returned.pageLinks.get(1)[1].closest().scrolled, 'center');
  assert.equal(returned.viewer.open, false);
});

test('individual photo links open the viewer and browsing updates the shareable URL without reopening on close', async () => {
  const state = await galleryViewerHarness({ openPhotoId: '2' });
  assert.equal(state.viewer.open, true);
  assert.equal(state.image.alt, 'Photo 2');
  assert.equal(state.history.at(-1), '/gallery/2');
  await state.previous.events.get('click')();
  assert.equal(state.image.alt, 'Photo 1');
  assert.equal(state.history.at(-1), '/gallery/1');
  state.viewer.close();
  assert.equal(state.history.at(-1), '/gallery#gallery-photo-1');
});

test('gallery previews stay private, publishes captions, and edits and replaces without losing metadata', async (t) => {
  const { base, close, dataDir, uploadDir } = await boot();
  t.after(close);
  const cookie = await login(base);
  const token = await csrfToken(base, cookie);
  const data = await sharp({ create: { width: 2500, height: 1250, channels: 3, background: '#223b55' } }).png().toBuffer();
  const empty = await (await fetch(`${base}/gallery`)).text();
  assert.match(empty, /No photos have been shared/);
  assert.match(empty, /href="\/gallery"/);
  assert.match(await (await fetch(`${base}/admin`, { headers: { cookie } })).text(), /href="\/admin\/gallery"/);
  const uploaded = await uploadGallery(base, cookie, token, [{ data }, { data }]);
  assert.equal(uploaded.status, 201);
  const { photos: drafts } = await uploaded.json();
  assert.equal(drafts.length, 2);
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'gallery.json')));
  assert.equal(saved[0].width, 2048);
  assert.equal(saved[0].height, 1024);
  assert.ok((await fs.stat(path.join(uploadDir, 'gallery', saved[0].file))).size < data.length);
  assert.equal((await fetch(`${base}${drafts[0].preview}`, { redirect: 'manual' })).status, 302);
  assert.equal((await fetch(`${base}/gallery/photos/${saved[0].id}/${saved[0].file}`)).status, 404);
  assert.equal((await fetch(`${base}/gallery/${saved[0].id}`)).status, 404);
  assert.equal((await fetch(`${base}/uploads/gallery/${saved[0].file}`)).status, 404);
  const preview = await fetch(`${base}${drafts[0].preview}`, { headers: { cookie } });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('cache-control'), 'no-store');
  const previewInfo = await sharp(Buffer.from(await preview.arrayBuffer())).metadata();
  assert.equal(previewInfo.width, 480);
  const admin = await (await fetch(`${base}/admin/gallery`, { headers: { cookie } })).text();
  assert.match(admin, new RegExp(`data-draft-id="${drafts[0].id}"`));
  assert.match(admin, /data-gallery-files[^>]*|multiple data-gallery-files/);
  assert.match(admin, /name="captionEn"/);
  assert.match(admin, /name="captionKo"/);

  assert.equal((await publishGallery(base, cookie, token, [{ id: drafts[0].id, captionEn: 'a'.repeat(1001) }])).status, 400);
  assert.equal((await publishGallery(base, cookie, token, [{ id: drafts[0].id }, { id: drafts[0].id }])).status, 400);
  const details = [
    { id: drafts[0].id, captionEn: 'Church family\n<script>alert(1)</script>', captionKo: '교회 가족\n함께' },
    { id: drafts[1].id },
  ];
  assert.equal((await publishGallery(base, cookie, token, details)).status, 200);
  const gallery = await (await fetch(`${base}/gallery`)).text();
  assert.match(gallery, /Church family\n&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(gallery, /교회 가족\n함께/);
  assert.doesNotMatch(gallery, /<script>alert/);
  assert.match(gallery, /<dialog[^>]*aria-label="Photo viewer/);
  const photoUrl = `${base}/gallery/photos/${saved[0].id}/${saved[0].file}`;
  const full = await fetch(photoUrl);
  assert.equal(full.status, 200);
  assert.match(full.headers.get('content-type'), /image\/webp/);
  assert.equal((await fetch(`${base}${drafts[0].preview}`, { headers: { cookie } })).status, 404);
  assert.equal((await publishGallery(base, cookie, token, details)).status, 400);

  const edit = await fetch(`${base}/admin/gallery/${saved[0].id}/edit`, {
    method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie },
    body: new URLSearchParams({ _csrf: token, captionEn: 'Updated\ncaption', captionKo: '수정된 설명' }),
  });
  assert.equal(edit.status, 302);
  assert.match(await (await fetch(`${base}/gallery`)).text(), /Updated\ncaption/);
  const broken = await uploadGallery(base, cookie, token, [{ data: Buffer.from('not an image') }]);
  assert.equal(broken.status, 400);
  assert.equal((await fetch(photoUrl)).status, 200);
  const replacement = await uploadGallery(base, cookie, token, [{ data }]);
  const draft = (await replacement.json()).photos[0];
  const replace = await fetch(`${base}/admin/gallery/${saved[0].id}/replace`, {
    method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie },
    body: new URLSearchParams({ _csrf: token, stagedPhoto: draft.id }),
  });
  assert.equal(replace.status, 302);
  const after = JSON.parse(await fs.readFile(path.join(dataDir, 'gallery.json')));
  assert.equal(after.length, 2);
  const replaced = after.find((photo) => photo.id === saved[0].id);
  assert.equal(replaced.captionEn, 'Updated\ncaption');
  assert.equal(replaced.captionKo, '수정된 설명');
  assert.equal(replaced.publishedAt, after[1].publishedAt);
  assert.notEqual(replaced.file, saved[0].file);
  assert.equal((await fetch(photoUrl)).status, 404);
  assert.equal((await fetch(`${base}/gallery/photos/${replaced.id}/${replaced.file}`)).status, 200);
  const linked = await (await fetch(`${base}/gallery/${replaced.id}`)).text();
  assert.match(linked, new RegExp(`data-open-photo="${replaced.id}"`));
  assert.match(linked, new RegExp(`data-gallery-image="/gallery/photos/${replaced.id}/${replaced.file}"`));
  await assert.rejects(fs.stat(path.join(uploadDir, 'gallery', saved[0].file)), { code: 'ENOENT' });
  assert.equal((await fs.readdir(path.join(uploadDir, 'gallery-staging'))).length, 0);
  assert.equal((await fs.readdir(path.join(uploadDir, 'gallery'))).length, 4);

  const reopened = createApp({ dataDir, uploadDir, password: PASSWORD }).listen(0);
  t.after(async () => {
    const done = new Promise((resolve) => reopened.close(resolve));
    reopened.closeAllConnections();
    await done;
  });
  const restored = await (await fetch(`http://localhost:${reopened.address().port}/gallery`)).text();
  assert.match(restored, /Updated\ncaption/);
  assert.match(restored, /수정된 설명/);
});

test('gallery accepts HEIC and HEIF photos, compresses them, and rejects invalid or oversized images', async (t) => {
  const { base, close, dataDir, uploadDir } = await boot();
  t.after(close);
  const cookie = await login(base);
  const token = await csrfToken(base, cookie);
  const heic = Buffer.from('AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABw21ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAQACAABFeGlmAAAAABppcmVmAAAAAAAAAA5jZHNjAAIAAQABAAAA5mlwcnAAAADFaXBjbwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAAAYAAAAEAAAAAlpcm90AAAAABBwaXhpAAAAAAMICAgAAABxaHZjQwEDcAAAALAAAAAAAB7wAPz9+PgAAAsDoAABABdAAQwB//8DcAAAAwCwAAADAAADAB5wJKEAAQAjQgEBA3AAAAMAsAAAAwAAAwAeoBQgQcCLDOIe5FlU3AgIGAKiAAEACUQBwGFyyEBTJAAAABlpcG1hAAAAAAAAAAEAAQaBAgOEBYYAAAAsaWxvYwAAAABEAAACAAEAAAABAAACQwAAADwAAgAAAAEAAAH3AAAATAAAAAFtZGF0AAAAAAAAAJgAAAAGRXhpZgAATU0AKgAAAAgAAwEaAAUAAAABAAAAMgEbAAUAAAABAAAAOgEoAAMAAAABAAIAAAAAAAAAAAAZAAAAAQAAABkAAAABAAAAOCgBr6LyRoF8//50Mev6I//5Pz1X/8lh//vu5/Ng90yyZ/og+cI557vn7lrup8IvYV+CtwhJsiuA', 'base64');
  for (const [name, type] of [['photo.HEIC', 'image/heic'], ['photo.heif', 'image/heif'], ['photo.heic', 'application/octet-stream']]) {
    const response = await uploadGallery(base, cookie, token, [{ data: heic, name, type }]);
    assert.equal(response.status, 201, await response.clone().text());
  }
  const rotated = Buffer.from(heic);
  rotated[rotated.indexOf('irot') + 4] = 3;
  assert.equal((await uploadGallery(base, cookie, token, [{ data: rotated, name: 'rotated.heic', type: 'image/heic' }])).status, 201);
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'gallery.json')));
  assert.equal(saved.length, 4);
  for (const [index, photo] of saved.entries()) {
    const output = await fs.readFile(path.join(uploadDir, 'gallery', photo.file));
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, index === 3 ? 16 : 24);
    assert.equal(metadata.height, index === 3 ? 24 : 16);
    assert.ok(output.length < heic.length);
    assert.equal(metadata.exif, undefined);
  }
  const html = await (await fetch(`${base}/admin/gallery`, { headers: { cookie } })).text();
  assert.match(html, /accept="[^"]*\.heic[^"]*\.heif/);
  assert.equal((await publishGallery(base, cookie, token, [{ id: saved[0].id, captionEn: 'Family' }])).status, 200);
  const replacementForm = await (await fetch(`${base}/admin/gallery`, { headers: { cookie } })).text();
  assert.equal((replacementForm.match(/accept="[^"]*\.heic[^"]*\.heif/g) ?? []).length, 2);
  const replace = await fetch(`${base}/admin/gallery/${saved[0].id}/replace`, {
    method: 'POST', redirect: 'manual', headers: { ...FORM(base), cookie },
    body: new URLSearchParams({ _csrf: token, stagedPhoto: saved[1].id }),
  });
  assert.equal(replace.status, 302);
  const replaced = JSON.parse(await fs.readFile(path.join(dataDir, 'gallery.json'))).find((photo) => photo.id === saved[0].id);
  assert.equal(replaced.captionEn, 'Family');
  assert.notEqual(replaced.file, saved[0].file);
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } }).png().toBuffer();
  for (const file of [
    { data: png, name: 'fake.heic', type: 'image/heic' },
    { data: Buffer.from('broken'), name: 'broken.heif', type: 'image/heif' },
    { data: heic.subarray(0, heic.length - 20), name: 'truncated.heic', type: 'image/heic' },
    { data: heic, name: 'photo.heic', type: 'image/png' },
  ]) {
    assert.equal((await uploadGallery(base, cookie, token, [file])).status, 400);
  }
  const oversized = Buffer.from(heic);
  const dimensions = oversized.indexOf('ispe');
  oversized.writeUInt32BE(10_000, dimensions + 8);
  oversized.writeUInt32BE(10_000, dimensions + 12);
  assert.equal((await uploadGallery(base, cookie, token, [{ data: oversized, name: 'large.heic', type: 'image/heic' }])).status, 400);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'gallery-staging')), []);
});

test('gallery enforces exactly 100 uploads and accepts a full captioned batch beyond ordinary form limits', async (t) => {
  const { base, close, dataDir, uploadDir } = await boot();
  t.after(close);
  const cookie = await login(base);
  const token = await csrfToken(base, cookie);
  const data = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#223b55' } }).png().toBuffer();
  const file = { data };
  assert.equal((await uploadGallery(base, cookie, token, Array(101).fill(file))).status, 400);
  assert.equal((await fs.readdir(path.join(uploadDir, 'gallery-staging'))).length, 0);
  const uploaded = await uploadGallery(base, cookie, token, Array(99).fill(file));
  assert.equal(uploaded.status, 201);
  const drafts = (await uploaded.json()).photos;
  const competing = await Promise.all([
    uploadGallery(base, cookie, token, [file]), uploadGallery(base, cookie, token, [file]),
  ]);
  assert.deepEqual(competing.map((response) => response.status).sort(), [201, 400]);
  drafts.push(...(await competing.find((response) => response.status === 201).json()).photos);
  assert.equal(drafts.length, 100);
  assert.equal((await uploadGallery(base, cookie, token, [file])).status, 400);
  const entries = drafts.map((photo) => ({ id: photo.id, captionEn: 'a'.repeat(1000), captionKo: '가'.repeat(1000) }));
  assert.equal((await publishGallery(base, cookie, token, [...entries, { id: '101st' }])).status, 400);
  assert.equal((await publishGallery(base, cookie, token, entries)).status, 200);
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'gallery.json')));
  assert.equal(saved.filter((photo) => photo.state === 'published').length, 100);
  assert.equal(saved[99].captionKo.length, 1000);
  const first = await (await fetch(`${base}/gallery`)).text();
  assert.equal((first.match(/data-gallery-photo/g) || []).length, 24);
  const last = await (await fetch(`${base}/gallery?page=5`)).text();
  assert.equal((last.match(/data-gallery-photo/g) || []).length, 4);
  const linked = await (await fetch(`${base}/gallery/${saved[99].id}?page=1`)).text();
  assert.match(linked, /data-page="5"/);
  assert.match(linked, new RegExp(`data-open-photo="${saved[99].id}"`));
  assert.equal((linked.match(/data-gallery-photo/g) || []).length, 4);
  assert.equal((await fetch(`${base}/gallery/not-found`)).status, 404);
  assert.equal((await uploadGallery(base, cookie, token, [file])).status, 201);
});

test('gallery validates image types, sizes, session ownership, CSRF, origins, and expired-draft cleanup', async (t) => {
  const { base, close, dataDir, uploadDir } = await boot();
  t.after(close);
  const cookie = await login(base);
  const token = await csrfToken(base, cookie);
  const data = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#223b55' } }).png().toBuffer();
  assert.equal((await uploadGallery(base, '', token, [{ data }])).status, 302);
  assert.equal((await uploadGallery(base, cookie, 'bad', [{ data }])).status, 403);
  assert.equal((await uploadGallery(base, cookie, token, [{ data, name: 'bad.svg', type: 'image/svg+xml' }])).status, 400);
  assert.equal((await uploadGallery(base, cookie, token, [{ data, name: 'bad.jpg', type: 'image/jpeg' }])).status, 400);
  assert.equal((await uploadGallery(base, cookie, token, [{ data: Buffer.alloc(20 * 1024 * 1024 + 1) }])).status, 400);
  const tooManyPixels = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: '#223b55' } }).png().toBuffer();
  assert.equal((await uploadGallery(base, cookie, token, [{ data: tooManyPixels }])).status, 400);
  assert.equal((await fs.readdir(path.join(uploadDir, 'gallery-staging'))).length, 0);
  const response = await uploadGallery(base, cookie, token, [{ data }]);
  const draft = (await response.json()).photos[0];
  const secondCookie = await login(base);
  const secondToken = await csrfToken(base, secondCookie);
  assert.equal((await fetch(`${base}${draft.preview}`, { headers: { cookie: secondCookie } })).status, 404);
  assert.equal((await publishGallery(base, secondCookie, secondToken, [{ id: draft.id }])).status, 400);
  assert.equal((await publishGallery(base, cookie, 'bad', [{ id: draft.id }])).status, 403);
  const badOrigin = await fetch(`${base}/admin/gallery/publish`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: 'https://example.invalid' },
    body: JSON.stringify({ _csrf: token, photos: [{ id: draft.id }] }),
  });
  assert.equal(badOrigin.status, 403);
  const malformed = await fetch(`${base}/admin/gallery/publish`, {
    method: 'POST', headers: { ...FORM(base), cookie, 'content-type': 'application/json' }, body: '{',
  });
  assert.equal(malformed.status, 400);
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'gallery.json')));
  saved[0].expiresAt = 0;
  await fs.writeFile(path.join(dataDir, 'gallery.json'), JSON.stringify(saved));
  assert.equal((await fetch(`${base}${draft.preview}`, { headers: { cookie } })).status, 404);
  assert.equal((await publishGallery(base, cookie, token, [{ id: draft.id }])).status, 400);
  const orphan = path.join(uploadDir, 'gallery-staging', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.tmp');
  await fs.writeFile(orphan, 'unfinished upload');
  await fs.utimes(orphan, new Date(0), new Date(0));
  assert.equal((await fetch(`${base}/admin/gallery`, { headers: { cookie } })).status, 200);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'gallery.json'))), []);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'gallery')), []);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'gallery-staging')), []);
});

for (const initialDesktop of [true, false]) {
  test(`welcome actions keep ${initialDesktop ? 'desktop' : 'mobile'} layout and keyboard order aligned`, async () => {
    const source = await fs.readFile(new URL('../public/scripts/welcome-actions.js', import.meta.url), 'utf8');
    const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
    assert.match(css, /grid-template-areas:\s*"about sermons"\s*"gallery articles"\s*"contact contact"/);
    assert.match(css, /@media \(min-width: 681px\)\s*\{[\s\S]*?grid-template-areas:\s*"about about sermons sermons articles articles"\s*"\. gallery gallery contact contact \."/);
    const links = {};
    let order = ['/about', '/sermons', '/gallery', '/columns', '/contact'];
    const document = { activeElement: null };
    for (const href of order) {
      links[href] = {
        get nextElementSibling() { return links[order[order.indexOf(href) + 1]] ?? null; },
        focus() { document.activeElement = this; },
      };
    }
    const actions = {
      querySelector(selector) { return links[selector.match(/href="([^"]+)"/)[1]]; },
      insertBefore(first, second) {
        if (document.activeElement === first) document.activeElement = null;
        const from = order.find((href) => links[href] === first);
        const to = order.find((href) => links[href] === second);
        order = order.filter((href) => href !== from);
        order.splice(order.indexOf(to), 0, from);
      },
    };
    document.querySelector = () => actions;
    let changed;
    const media = { matches: initialDesktop, addEventListener(_type, callback) { changed = callback; } };
    runInNewContext(source, { document, window: { matchMedia: () => media } });
    const desktopOrder = ['/about', '/sermons', '/columns', '/gallery', '/contact'];
    const mobileOrder = ['/about', '/sermons', '/gallery', '/columns', '/contact'];
    assert.deepEqual(order, initialDesktop ? desktopOrder : mobileOrder);
    document.activeElement = links[initialDesktop ? '/gallery' : '/columns'];
    media.matches = !initialDesktop;
    changed();
    assert.deepEqual(order, initialDesktop ? mobileOrder : desktopOrder);
    assert.equal(document.activeElement, links[initialDesktop ? '/gallery' : '/columns']);
  });
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
  assert.match(home, /하나님의 말씀 안에 모인 가족 공동체입니다/);
  const preview = await fetch(`${base}/link-preview.png`);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-type'), /image\/png/);
  assert.equal((await fetch(`${base}/instagram-profile.png`)).status, 200);
  const sermons = await fetch(`${base}/sermons`);
  assert.equal(sermons.status, 200);
  assert.doesNotMatch(await sermons.text(), /href="\/admin(?:\/login)?"/);
  assert.equal((await fetch(`${base}/gallery`)).status, 200);
  assert.match(home, /href="\/gallery"/);
  assert.doesNotMatch(home, /href="\/admin(?:\/login)?"/);
  assert.match(home, /<a class="brand home-link" href="\/"/);
  assert.match(home, /<nav[^>]*>[\s\S]*href="\/contact"[\s\S]*<\/nav>/);
  assert.doesNotMatch(home, /class="scripture-picker"|class="scripture-language-links"/);
  assert.match(home, /class="btn btn-hero btn-mint" href="\/about"/);
  const welcomeActions = home.match(/<div class="actions" data-welcome-actions>([\s\S]*?)<\/div>/)[1];
  assert.deepEqual([...welcomeActions.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), [
    '/about', '/sermons', '/gallery', '/columns', '/contact',
  ]);
  assert.match(welcomeActions, /href="\/columns"><span class="bilingual"><span lang="en">Articles<\/span><span lang="ko">목회 칼럼<\/span>/);
  assert.match(welcomeActions, /href="\/gallery"><span class="bilingual"><span lang="en">Gallery<\/span><span lang="ko">갤러리<\/span>/);
  assert.match(home, /<nav[^>]*>[\s\S]*href="\/about"[\s\S]*<\/nav>/);
  const about = await fetch(`${base}/about`);
  assert.equal(about.status, 200);
  const aboutHtml = await about.text();
  assert.match(aboutHtml, /<meta property="og:url" content="https:\/\/immanuelchurchofamerica\.org\/about">/);
  assert.match(aboutHtml, /<link rel="canonical" href="https:\/\/immanuelchurchofamerica\.org\/about">/);
  assert.match(aboutHtml, /<h1>.*About.*소개.*<\/h1>/s);
  assert.match(aboutHtml, /하나님의 말씀 안에 모인 가족 같은 교회입니다/);
  assert.match(aboutHtml, /있는 모습 그대로 환영합니다/);
  assert.doesNotMatch(aboutHtml, /내 모슴|말씀안에/);
  for (const detail of [
    'We are a family church.', 'Our preaching is biblically sound.',
    'This church expounds Scripture verse by verse in its original-language context, proclaiming the Word of God.', '본 교회는 원어 중심으로 성경을 한 구절씩 차례대로 강해하여 하나님의 말씀을 선포합니다.',
    'late 19th and 20th centuries', 'We affirm the Apostles’ Creed and the Lord’s Prayer.',
    'We observe the Lord’s Supper.', '본 교회는 주의 성찬을 거행합니다.',
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
  assert.match(aboutCss, /@media \(max-width:\s*680px\)\s*\{[\s\S]*?\.about-page \.person-ko\s*\{[^}]*display:\s*block[^}]*margin-left:\s*0/s);
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

test('compact header displays bilingual navigation in three columns with accessible touch targets', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  const html = await (await fetch(`${base}/sermons`)).text();
  const header = html.match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header);
  for (const [href, en, ko] of [
    ['/', 'Welcome', '환영합니다'], ['/about', 'About', '소개'], ['/sermons', 'Sermons', '설교'],
    ['/columns', 'Articles', '목회 칼럼'], ['/gallery', 'Gallery', '갤러리'], ['/contact', 'Contact', '연락처'],
  ]) {
    assert.match(header, new RegExp(`href="${href}"[^>]*><span class="bilingual"><span lang="en">${en}</span><span lang="ko">${ko}</span>`));
  }
  assert.match(header, /href="\/sermons" aria-current="page" class="is-active"/);
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.site-header nav a\s*\{[^}]*border-radius:\s*\.65rem/s);
  assert.match(css, /\.site-header nav a\.is-active::before\s*\{[^}]*border-radius:\s*calc\(\.65rem - var\(--rim\)\)/s);
  assert.match(css, /\.site-header nav a:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--yellow\)/s);
  assert.match(css, /\.site-header nav a\.is-active:focus-visible\s*\{[^}]*outline-color:\s*var\(--navy\)/s);
  assert.match(css, /\.site-header nav a\.is-active\s*\{[^}]*--fill:\s*linear-gradient/s);
  assert.match(css, /\.site-header nav a:hover::after,\s*\.site-header nav a:focus-visible::after\s*\{[^}]*animation:\s*none/s);
  const mobile = css.slice(css.lastIndexOf('@media (max-width: 680px)'), css.lastIndexOf('@media (max-width: 560px)'));
  assert.match(mobile, /\.site-header nav\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(mobile, /\.site-header nav a\s*\{[^}]*min-height:\s*48px/s);
  assert.match(mobile, /\.site-header nav a:last-child:nth-child\(3n \+ 1\)\s*\{[^}]*grid-column:\s*2/s);
  const cookie = await login(base);
  const adminHeader = (await (await fetch(`${base}/sermons`, { headers: { cookie } })).text())
    .match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1];
  assert.match(adminHeader, /href="\/admin"[^>]*><span class="bilingual"><span lang="en">Admin<\/span><span lang="ko">관리자<\/span>/);
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

test('public gallery and contact use rounded surfaces without changing About or gallery admin', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  const gallery = await (await fetch(`${base}/gallery`)).text();
  const contact = await (await fetch(`${base}/contact`)).text();
  const about = await (await fetch(`${base}/about`)).text();
  assert.match(gallery, /<dialog class="gallery-viewer"/);
  assert.match(contact, /<div class="contact-page">/);
  assert.match(about, /<div class="contact-page about-page">/);
  const css = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.contact-page:not\(\.about-page\) \.visit-panel[\s\S]*?border-radius: var\(--radius\)/);
  assert.match(css, /main:has\(> \.gallery-viewer\) \.gallery-photo[\s\S]*?border-radius: var\(--radius\)/);
  assert.match(css, /main:has\(> \.gallery-viewer\) \.gallery-photo::before[\s\S]*?border-radius: calc\(var\(--radius\) - var\(--rim\)\)/);
  assert.match(css, /main:has\(> \.gallery-viewer\) \.gallery-viewer img\s*\{[^}]*border-radius:/s);
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
  assert.equal((await fetch(`${base}/gallery`)).status, 200);
  assert.equal((await fetch(`${base}/uploads/photos/persisted.png`)).status, 404);
});

test('sermon service filters match saved bilingual and legacy labels before pagination', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const services = [
    ['sunday-1', 'Sunday 1st Service 주일 1부 예베'],
    ['sunday-1', '주일 1부 예배'],
    ['sunday-2', 'Sunday 2nd Service // 주일 2부 예배'],
    ['sunday-3', 'Sunday 3rd Service\n주일 3부 예배'],
    ['wednesday', 'Wednesday Service 수요예배'],
    ['friday', 'Friday Service 금요예배'],
    ['friday', ' FRIDAY SERVICE '],
    ['friday', '금요 예배'],
    ['', undefined],
    ['', 'Special Service'],
    ['', 'Sunday 1st Service // 금요예배'],
    ...Array.from({ length: 10 }, () => ['sunday-1', 'Sunday 1st Service']),
  ];
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(services.map(([, service], i) => ({
    id: `filter-${i}`, title: `Message ${i}`, service, file: 'sermon.mp3',
    date: '2026-11-08', createdAt: new Date(Date.UTC(2026, 10, 8, 0, i)).toISOString(),
  }))));
  const ids = (html) => [...html.matchAll(/<article class="sermon" id="sermon-filter-(\d+)">/g)].map((match) => Number(match[1]));
  const all = await (await fetch(`${base}/sermons`)).text();
  assert.equal(ids(all).length, 10);
  assert.ok(all.indexOf('class="sermon-filter"') < all.indexOf('<article class="sermon"'));
  assert.match(all, /href="\/sermons" aria-current="true"/);
  for (const service of ['sunday-1', 'sunday-2', 'sunday-3', 'wednesday', 'friday']) {
    const html = await (await fetch(`${base}/sermons?service=${service}`)).text();
    const expected = services.flatMap(([type], i) => type === service ? [i] : []).reverse();
    assert.deepEqual(ids(html), expected.slice(0, 10));
    assert.ok(html.includes(`href="/sermons?service=${service}" aria-current="true"`));
    assert.match(html, /<summary aria-describedby="service-filter-label">/);
    if (expected.length > 10) {
      assert.match(html, /href="\/sermons\?service=sunday-1&amp;page=2"/);
      const second = await (await fetch(`${base}/sermons?service=${service}&page=2`)).text();
      assert.deepEqual(ids(second), expected.slice(10));
      const clamped = await (await fetch(`${base}/sermons?service=${service}&page=999`)).text();
      assert.deepEqual(ids(clamped), expected.slice(10));
    }
  }
  const allIds = [];
  for (const page of [1, 2, 3]) {
    allIds.push(...ids(await (await fetch(`${base}/sermons?page=${page}`)).text()));
  }
  assert.deepEqual(allIds, services.map((_, i) => i).reverse());
  const single = await (await fetch(`${base}/sermons/filter-0`)).text();
  assert.doesNotMatch(single, /class="sermon-filter"|scripts\/sermon-filter\.js/);
});

test('sermon filters handle empty categories and reject invalid service queries explicitly', async (t) => {
  const { base, close } = await boot();
  t.after(close);
  const empty = await (await fetch(`${base}/sermons?service=friday`)).text();
  assert.match(empty, /No sermons have been shared for this service yet/);
  assert.match(empty, /이 예배의 설교가 아직 게시되지 않았습니다/);
  assert.match(empty, /href="\/sermons"[^>]*><span class="bilingual"><span lang="en">All services/);
  assert.doesNotMatch(empty, /class="pagination"/);
  for (const query of ['service=unknown', 'service=friday&service=wednesday', 'service%5Bx%5D=friday', 'service=%3Cscript%3E']) {
    const response = await fetch(`${base}/sermons?${query}`);
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Please choose a listed service/);
  }
});

test('service dropdown dismisses on Escape, outside clicks, and focus leaving', async () => {
  const script = await fs.readFile(new URL('../public/scripts/sermon-filter.js', import.meta.url), 'utf8');
  const events = {};
  const inside = {};
  let focused = false;
  const picker = {
    open: true,
    contains: (target) => target === inside,
    querySelector: () => ({ focus: () => { focused = true; } }),
    addEventListener: (name, handler) => { events[name] = handler; },
  };
  runInNewContext(script, {
    document: {
      querySelector: () => picker,
      addEventListener: (name, handler) => { events[name] = handler; },
    },
  });
  events.click({ target: inside });
  assert.equal(picker.open, true);
  events.keydown({ key: 'Tab' });
  assert.equal(picker.open, true);
  events.keydown({ key: 'Escape' });
  assert.equal(picker.open, false);
  assert.equal(focused, true);
  picker.open = true;
  events.click({ target: {} });
  assert.equal(picker.open, false);
  picker.open = true;
  events.focusout({ relatedTarget: inside });
  assert.equal(picker.open, true);
  events.focusout({ relatedTarget: {} });
  assert.equal(picker.open, false);
});

test('service dropdown stays open when a mobile Safari option tap clears focus', async () => {
  const script = await fs.readFile(new URL('../public/scripts/sermon-filter.js', import.meta.url), 'utf8');
  const pickerEvents = {};
  const documentEvents = {};
  const option = {};
  const picker = {
    open: true,
    contains: (target) => target === option,
    addEventListener: (name, handler) => { pickerEvents[name] = handler; },
  };
  runInNewContext(script, {
    document: {
      querySelector: () => picker,
      addEventListener: (name, handler) => { documentEvents[name] = handler; },
    },
  });

  // Safari blurs the summary without focusing the tapped link before mouseup/click.
  pickerEvents.focusout({ relatedTarget: null });
  assert.equal(picker.open, true, 'the option must remain visible until its click activates');
  documentEvents.click({ target: option });
  assert.equal(picker.open, true);
  documentEvents.click({ target: {} });
  assert.equal(picker.open, false, 'outside taps still dismiss the menu');
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

test('sermon date URLs validate fields, reject conflicts, and preserve old links', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const csrf = await csrfToken(base, cookie);
  const admin = await (await fetch(`${base}/admin/sermons`, { headers: { cookie } })).text();
  assert.match(admin, /<input[^>]*name="date"[^>]*required/);
  assert.match(admin, /<select[^>]*name="service"[^>]*required/);
  const upload = (date, service) => {
    const body = new FormData();
    for (const [key, value] of Object.entries({ _csrf: csrf, title: 'Sermon', date, service })) body.set(key, value);
    body.set('audio', new Blob(['audio'], { type: 'audio/mpeg' }), 'sermon.mp3');
    return fetch(`${base}/admin/sermons`, { method: 'POST', body, headers: { cookie, origin: base }, redirect: 'manual' });
  };
  for (const [date, service] of [['', 'Friday Service'], ['2026-02-30', 'Friday Service'], ['2026-11-22', '']]) {
    assert.equal((await upload(date, service)).status, 400);
  }
  for (const [date, service, key] of [
    ['2026-11-22', 'Sunday 1st Service 주일 1부 예베', '20261122_1'],
    ['2026-11-22', '주일 2부 예배', '20261122_2'],
    ['2026-11-22', 'Sunday 3rd Service', '20261122_3'],
    ['2026-11-18', 'Wednesday Service 수요예배', '20261118'],
    ['2026-11-20', 'Friday Service 금요예배', '20261120'],
  ]) {
    assert.equal((await upload(date, service)).status, 302);
    assert.equal((await fetch(`${base}/sermons/${key}`)).status, 200);
  }
  const [a, b] = await Promise.all([upload('2026-11-25', 'Wednesday Service'), upload('2026-11-25', 'Wednesday Service')]);
  assert.deepEqual([a.status, b.status].sort(), [302, 409]);
  assert.equal((await upload('2026-11-22', 'Sunday 1st Service')).status, 409);
  const records = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8'));
  const first = records.find((item) => item.slug === '20261122_1');
  const old = await fetch(`${base}/sermons/${first.id}?share=1`, { redirect: 'manual' });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get('location'), '/sermons/20261122_1?share=1');
  const preview = await fetch(`${base}/sermons/${first.id}/preview.png?v=123`, { redirect: 'manual' });
  assert.equal(preview.headers.get('location'), '/sermons/20261122_1/preview.png?v=123');
  const edit = (values) => fetch(`${base}/admin/sermons/${first.id}/edit`, {
    method: 'POST', headers: { ...FORM(base), cookie }, redirect: 'manual',
    body: new URLSearchParams({ _csrf: csrf, title: 'Sermon', date: '2026-11-29', service: 'Sunday 1st Service', ...values }),
  });
  assert.equal((await edit({ date: '' })).status, 400);
  assert.equal((await edit({ service: '' })).status, 400);
  assert.equal((await edit({ date: '2026-11-22', service: 'Sunday 2nd Service' })).status, 409);
  assert.equal((await edit({})).status, 302);
  assert.equal((await fetch(`${base}/sermons/20261122_1`, { redirect: 'manual' })).headers.get('location'), '/sermons/20261129_1');
  assert.equal((await upload('2026-11-22', 'Sunday 1st Service')).status, 409);
  const detail = await (await fetch(`${base}/sermons/20261129_1`, { headers: { cookie } })).text();
  assert.match(detail, /<input[^>]*name="date"[^>]*required/);
  assert.match(detail, /<select[^>]*name="service"[^>]*required/);
  assert.match(detail, /og:url" content="https:\/\/immanuelchurchofamerica.org\/sermons\/20261129_1"/);
  assert.match(detail, /\/sermons\/20261129_1\/preview\.png\?v=/);
});

test('ambiguous and incomplete legacy sermon links never resolve to the wrong record', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify([
    { id: 'legacy-a', title: 'A', date: '2026-11-18', service: 'Wednesday Service' },
    { id: 'legacy-b', title: 'B', date: '2026-11-18', service: 'Wednesday Service' },
    { id: 'legacy-c', title: 'C', date: '2026-11-19', service: '' },
  ]));
  assert.equal((await fetch(`${base}/sermons/20261118`)).status, 404);
  for (const id of ['legacy-a', 'legacy-b', 'legacy-c']) {
    const response = await fetch(`${base}/sermons/${id}`, { redirect: 'manual' });
    assert.equal(response.status, 200);
  }
});

test('sermon fields preserve line breaks and service through upload and editing', async (t) => {
  const { base, dataDir, close } = await boot();
  t.after(close);
  const cookie = await login(base);
  const csrf = await csrfToken(base, cookie);
  const admin = await (await fetch(`${base}/admin/sermons`, { headers: { cookie } })).text();
  assert.match(admin, /<span lang="en">Sermon Overview<\/span><span lang="ko">설교 개요<\/span>[\s\S]*?<textarea name="description"[^>]*aria-label="Sermon Overview · 설교 개요"/);
  for (const name of ['title', 'speakerEn', 'speakerKo', 'scripture', 'description']) {
    assert.match(admin, new RegExp(`<textarea name="${name}"`));
  }
  const services = [
    'Sunday 1st Service 주일 1부 예배', 'Sunday 2nd Service 주일 2부 예배',
    'Sunday 3rd Service 주일 3부 예배',
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
    assert.ok(html.includes(`<h3 lang="ko"><a href="/sermons/20261108">Title &lt;one&gt;\n제목</a></h3>`));
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
    { id: 'english', title: 'Grace', scripture: 'John 3:16', date: '2026-11-08', service: '1st Sunday Service' },
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
    const key = sermon.id === 'english' ? '20261108' : sermon.id;
    assert.ok(head.includes(`<meta property="og:url" content="https://immanuelchurchofamerica.org/sermons/${key}">`));
    assert.ok(head.includes(`<link rel="canonical" href="https://immanuelchurchofamerica.org/sermons/${key}">`));
    const imageUrl = head.match(/<meta property="og:image" content="([^"]+)">/)[1];
    assert.match(imageUrl, new RegExp(`^https://immanuelchurchofamerica.org/sermons/${key}/preview\\.png\\?v=[a-f\\d]{20}$`));
    assert.ok(head.includes(`<meta name="twitter:image" content="${imageUrl}">`));
    assert.ok(head.includes(`<meta property="og:image:alt" content="${escapeAttribute([sermon.title, displayReference, sermon.date, sermon.service].filter(Boolean).join(' · '))}">`));
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
  const beforeDateChange = await (await fetch(`${base}/sermons/english`)).text();
  const previousDateImage = Buffer.from(await (await fetch(`${base}/sermons/english/preview.png`)).arrayBuffer());
  sermons[0].date = '2026-11-15';
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(sermons));
  const datePage = await (await fetch(`${base}/sermons/english`)).text();
  assert.notEqual(datePage.match(/property="og:image" content="([^"]+)"/)[1], beforeDateChange.match(/property="og:image" content="([^"]+)"/)[1]);
  assert.notDeepEqual(Buffer.from(await (await fetch(`${base}/sermons/english/preview.png`)).arrayBuffer()), previousDateImage);
  await fs.writeFile(path.join(dataDir, 'sermons.json'), JSON.stringify(sermons.slice(1)));
  assert.equal((await fetch(`${base}/sermons/english/preview.png`)).status, 404);
});

test('preview pixels contain title, reference, and service independently within the original artwork', async () => {
  const render = createSermonPreviewRenderer();
  const original = { title: 'Grace', scripture: 'John 3:16', date: '2026-11-08', service: '1st Sunday Service', description: 'Not in the image' };
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
  const newDate = await render({ ...original, date: '2026-11-15' });
  const newService = await render({ ...original, service: 'Evening Service' });
  const noService = await render({ ...original, service: '' });
  assert.notDeepEqual(await pixels(first, 228, 155), await pixels(newTitle, 228, 155));
  assert.deepEqual(await pixels(first, 410, 80), await pixels(newTitle, 410, 80));
  assert.notDeepEqual(await pixels(first, 410, 80), await pixels(newReference, 410, 80));
  assert.deepEqual(await pixels(first, 228, 155), await pixels(newReference, 228, 155));
  assert.notDeepEqual(await pixels(first, 490, 60), await pixels(newDate, 490, 60));
  assert.deepEqual(await pixels(first, 228, 155), await pixels(newDate, 228, 155));
  assert.notDeepEqual(await pixels(first, 553, 65), await pixels(newService, 553, 65));
  assert.notDeepEqual(await pixels(first, 553, 65), await pixels(noService, 553, 65));
  assert.deepEqual(await pixels(first, 228, 155), await pixels(newService, 228, 155));
  assert.deepEqual(await pixels(first, 410, 80), await pixels(newService, 410, 80));
  assert.deepEqual(await pixels(first, 490, 60), await pixels(noService, 490, 60));
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
  const admin = await (await fetch(`${base}/admin/sermons`, { headers: { cookie } })).text();
  assert.match(admin, /<textarea name="description" rows="27" maxlength="10000"/);

  const upload = new FormData();
  for (const [name, value] of Object.entries({
    title: 'Long overview', speakerEn: '', speakerKo: '', service: 'Wednesday Service 수요예배', date: '2026-11-18', scripture: '', description: overview,
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
      _csrf: csrf, title: created.title, speakerEn: '', speakerKo: '', service: 'Wednesday Service 수요예배', date: '2026-11-18',
      scripture: '', description: editedOverview,
    }),
  });
  assert.equal(edit.status, 302);
  const [updated] = JSON.parse(await fs.readFile(path.join(dataDir, 'sermons.json'), 'utf8'));
  assert.equal(updated.description, overview);
  const sermonPage = await (await fetch(`${base}/sermons/${created.id}`, { headers: { cookie } })).text();
  assert.match(sermonPage, /<textarea name="description" rows="27" maxlength="10000"/);
  const styles = await fs.readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.admin-grid \.form textarea\[name="description"\]\s*\{[^}]*height:\s*54rem/);
  assert.match(styles, /\.sermon-edit textarea\[name="description"\]\s*\{[^}]*height:\s*46\.875rem/);
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
  assert.match(adminPage, /href="\/admin\/gallery"/);
  assert.equal((await fetch(`${base}/gallery`)).status, 200);
  assert.equal((await fetch(`${base}/admin/photos`, {
    method: 'POST', headers: { cookie, origin: base }, redirect: 'manual',
  })).status, 404);

  const s = new FormData();
  s.set('_csrf', csrf);
  s.set('title', '<b>Grace</b>'); s.set('speaker', 'Pastor');
  s.set('service', 'Sunday 1st Service 주일 1부 예베');
  s.set('date', '2026-11-22');
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
  assert.match(sermons, /href="\/sermons\/20261122_1"/);
  assert.equal((await fetch(`${base}/sermons/${sid}`)).status, 200);
  const src = sermons.match(/src="(\/uploads\/audio\/[^"]+)"/)[1];
  assert.equal((await fetch(base + src)).status, 200);
  assert.doesNotMatch(sermons, /data-audio-upload/);
  const replacementControls = (await fetch(`${base}/sermons`, { headers: { cookie } })).text();
  assert.match(await replacementControls, /<script src="\/scripts\/admin\.js" defer><\/script>/);
  assert.match(await replacementControls, new RegExp(`action="/admin/sermons/${sid}/audio"`));
  assert.match(await replacementControls, /Replace this sermon’s audio\?/);

  assert.doesNotMatch(sermons, /\/edit/);
  const sedit = (fields) => fetch(`${base}/admin/sermons/${sid}/edit`, { method: 'POST', body: new URLSearchParams({ _csrf: csrf, date: '2001-02-03', service: 'Friday Service 금요예배', ...fields }), headers: { cookie, origin: base }, redirect: 'manual' });
  assert.equal((await sedit({ title: 'Renamed <b>', speaker: 'Pastor Kim', date: '2001-02-03' })).status, 302);
  const renamed = await (await fetch(`${base}/sermons`, { headers: { cookie } })).text();
  assert.match(renamed, /Renamed &lt;b&gt;/);
  assert.match(renamed, /Pastor Kim/);
  assert.equal((await sedit({ title: '은혜', scripture: '요한복음 3:16' })).status, 302);
  const koreanSermon = await (await fetch(`${base}/sermons`)).text();
  assert.ok(koreanSermon.includes(`<h3 lang="ko"><a href="/sermons/20010203">은혜</a></h3>`));
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
  assert.equal(replaced.headers.get('location'), '/sermons/20010203');
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
  const page = await (await fetch(`${base}/admin/sermons`, { headers: { cookie } })).text();
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
  otherPublish.set('date', '2026-11-18');
  otherPublish.set('service', 'Wednesday Service 수요예배');
  const otherResult = await fetch(`${base}/admin/sermons`, {
    method: 'POST', body: otherPublish, headers: { cookie: otherCookie, origin: base }, redirect: 'manual',
  });
  assert.equal(otherResult.status, 400);
  assert.deepEqual(await fs.readdir(path.join(uploadDir, 'staging')), [uploadId]);

  const publish = new FormData();
  publish.set('_csrf', csrf);
  publish.set('stagedAudio', uploadId);
  publish.set('title', 'Song of Songs');
  publish.set('date', '2026-11-18');
  publish.set('service', 'Wednesday Service 수요예배');
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
