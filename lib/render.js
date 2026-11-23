import { BOOKS, formatScriptureReference, scriptureLanguageLinks } from './scripture-links.js';
import { SERMON_SERVICE_FILTERS, sermonSpeakers, splitBilingual } from './sermon-metadata.js';
import { columnHasContent, parseColumnDocument, renderColumnDocument } from './column-content.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const SITE_ORIGIN = 'https://immanuelchurchofamerica.org';
const PREVIEW_IMAGE = `${SITE_ORIGIN}/link-preview.png`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const bi = (en, ko) => `<span class="bilingual"><span lang="en">${esc(en)}</span><span lang="ko">${esc(ko)}</span></span>`;
const koreanLang = (text) => /[\uAC00-\uD7AF]/u.test(text) ? ' lang="ko"' : '';
const SERMON_SERVICES = [
  'Sunday 1st Service 주일 1부 예배',
  'Sunday 2nd Service 주일 2부 예배',
  'Sunday 3rd Service 주일 3부 예배',
  'Wednesday Service 수요예배',
  'Friday Service 금요예배',
];

function serviceField(service = '') {
  const option = (value, label = value) => `<option value="${esc(value).replace(/\r/g, '&#13;').replace(/\n/g, '&#10;')}"${value === service ? ' selected' : ''}>${esc(label)}</option>`;
  const previous = service && !SERMON_SERVICES.includes(service) ? option(service) : '';
  return `<label>${bi('Service', '예배')}<select name="service" required aria-label="Service · 예배">${option('', 'Choose a service · 예배를 선택해 주세요')}${previous}${SERMON_SERVICES.map((value) => option(value)).join('')}</select></label>`;
}

function speakerFields(sermon = {}, pastors = [], { author = false } = {}) {
  const { en, ko } = sermonSpeakers(sermon);
  return `<label>${bi('Choose a pastor', '목사 선택')}<select data-pastor-select aria-label="Choose a pastor · 목사 선택">
    <option value="">${esc('Choose or enter a speaker · 설교자를 선택하거나 입력하세요')}</option>
    ${pastors.map((p) => `<option value="${esc(p.id)}" data-en="${esc(p.en)}" data-ko="${esc(p.ko)}"${p.en === en && p.ko === ko ? ' selected' : ''}>${esc(p.en)} · ${esc(p.ko)}</option>`).join('')}
  </select></label>
          <label>${bi(author ? 'Author (English)' : 'Speaker (English)', author ? '작성자 (영어)' : '설교자 (영어)')}<textarea name="speakerEn" rows="2" maxlength="100" aria-label="${author ? 'Author in English · 작성자 (영어)' : 'Speaker in English · 설교자 (영어)'}">${esc(en)}</textarea></label>
          <label>${bi(author ? 'Author (Korean)' : 'Speaker (Korean)', author ? '작성자 (한국어)' : '설교자 (한국어)')}<textarea name="speakerKo" rows="2" maxlength="100" aria-label="${author ? 'Author in Korean · 작성자 (한국어)' : 'Speaker in Korean · 설교자 (한국어)'}">${esc(ko)}</textarea></label>`;
}

function scriptureField(value = '') {
  return `<div class="scripture-entry" data-scripture-entry>
    <label>${bi('Scripture', '성경 본문')}<textarea name="scripture" rows="2" maxlength="1000" placeholder="e.g. John 3:16 · 예: 요한복음 3:16" aria-label="Scripture · 성경 본문">${esc(formatScriptureReference(value))}</textarea></label>
    <details><summary>${bi('Choose Scripture', '성경 본문 선택')}</summary>
      <div class="scripture-builder">
        <label>${bi('Book', '성경')}<select data-book aria-label="Book · 성경"><option value="">Choose a book · 성경 선택</option>${BOOKS.map(([en, ko], i) => `<option value="${i}" data-en="${esc(en)}" data-ko="${esc(ko)}">${esc(en)} · ${esc(ko)}</option>`).join('')}</select></label>
        <label>${bi('Chapter', '장')}<select data-chapter aria-label="Chapter · 장" disabled></select></label>
        <div class="scripture-range">
          <label>${bi('First verse', '시작 절')}<select data-start aria-label="First verse · 시작 절" disabled></select></label>
          <label>${bi('Last verse', '마지막 절')}<select data-end aria-label="Last verse · 마지막 절" disabled></select></label>
        </div>
        <button class="btn btn-ghost" type="button" data-add-range>${bi('Add verse or range', '절 또는 범위 추가')}</button>
        <label>${bi('Verses (comma separated)', '절 (쉼표로 구분)')}<input data-verses placeholder="16-18, 21" aria-label="Verses · 절"></label>
        <button class="btn btn-ghost" type="button" data-add-passage>${bi('Add passage', '본문 추가')}</button>
        <p data-scripture-status role="status" aria-live="polite"></p>
      </div>
    </details>
  </div>`;
}

function sermonMetadata(sermon) {
  const speaker = sermonSpeakers(sermon);
  const service = splitBilingual(sermon.service);
  const lines = [['en', 'en-US'], ['ko', 'ko-KR']].map(([language, locale]) => {
    const parts = [speaker[language], service[language], sermon.date && formatDate(sermon.date, locale)].filter(Boolean);
    return parts.length ? `<span class="sermon-meta-line" lang="${language}">${parts.map((part) => `<span>${esc(part)}</span>`).join(' · ')}</span>` : '';
  });
  return `<p class="meta">${lines.join('')}</p>`;
}

const MESSAGE_TRANSLATIONS = new Map([
  ['Too many attempts. Please wait a few minutes.', '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'],
  ['That password was not correct.', '비밀번호가 올바르지 않습니다.'],
  ['That file is too large.', '파일 크기가 너무 큽니다.'],
  ['Too many files.', '파일이 너무 많습니다.'],
  ['That file type is not supported.', '지원하지 않는 파일 형식입니다.'],
  ['A title and an audio file are required.', '제목과 오디오 파일을 입력해 주세요.'],
  ['Sermon uploaded.', '설교가 업로드되었습니다.'],
  ['That code was not correct. Please try again.', '코드가 올바르지 않습니다. 다시 시도해 주세요.'],
  ['Your passwords did not match.', '비밀번호가 서로 일치하지 않습니다.'],
  ['Please choose a password with at least 16 characters.', '비밀번호는 16자 이상으로 정해 주세요.'],
  ['Please choose a different password.', '다른 비밀번호를 정해 주세요.'],
  ['Please enter a name.', '이름을 입력해 주세요.'],
  ['You signed in with a recovery code.', '복구 코드로 로그인하셨습니다.'],
  ['Admin removed.', '관리자가 삭제되었습니다.'],
]);

function messageMarkup(message) {
  if (typeof message !== 'string') return bi(message.en, message.ko);
  const korean = MESSAGE_TRANSLATIONS.get(message);
  return korean ? bi(message, korean) : esc(message);
}

const NAV = [
  { href: '/', label: ['Welcome', '환영합니다'], key: 'home' },
  { href: '/about', label: ['About', '소개'], key: 'about' },
  { href: '/sermons', label: ['Sermons', '설교'], key: 'sermons' },
  { href: '/columns', label: ['Articles', '목회 칼럼'], key: 'columns' },
  { href: '/gallery', label: ['Gallery', '갤러리'], key: 'gallery' },
  { href: '/contact', label: ['Contact', '연락처'], key: 'contact' },
];

export function layout({
  title, active, admin, body, wide = false, path = '/',
  analytics,
  description = 'A welcoming church family. Listen to sermons and connect with us on Instagram. 따뜻한 환대가 있는 교회 공동체입니다. 설교를 듣고 인스타그램에서 교회 소식을 만나 보세요.',
  previewImage = PREVIEW_IMAGE,
  previewImageAlt = 'An open Bible in golden light before blue stained glass · 성경 위로 비치는 금빛과 푸른 스테인드글라스',
}) {
  const koreanTitle = {
    About: '소개',
    Sermons: '설교',
    Gallery: '갤러리',
    Contact: '연락처',
    'Admin sign in': '관리자 로그인',
    Admin: '관리자',
    'Not found': '페이지를 찾을 수 없습니다',
    Error: '오류',
  };
  const full = title
    ? `${title}${koreanTitle[title] ? ` · ${koreanTitle[title]}` : ''} · Immanuel Church of America · 미주 임마누엘 교회`
    : 'Immanuel Church of America · 미주 임마누엘 교회';
  const canonicalUrl = new URL(path, SITE_ORIGIN).href;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#183f70">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(previewImage)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(previewImageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(full)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(previewImage)}">
<meta name="twitter:image:alt" content="${esc(previewImageAlt)}">
<link rel="canonical" href="${esc(canonicalUrl)}">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400&family=Noto+Sans+KR:wght@400&family=Noto+Serif+KR:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
${analytics ? `<script defer src="${esc(analytics.scriptUrl)}" data-website-id="${esc(analytics.websiteId)}"></script>` : ''}
</head>
<body>
<a class="skip" href="#main">${bi('Skip to content', '본문으로 건너뛰기')}</a>
<header class="site-header">
  <a class="brand home-link" href="/" aria-label="Immanuel Church of America, 미주 임마누엘 교회">
    <img class="brand-mark" src="/favicon.png" alt="" aria-hidden="true">
    <span class="brand-text"><strong>Immanuel</strong><small>${bi('Church of America', '미주 임마누엘 교회')}</small><small class="brand-since">${bi('Since 1994', '1994년부터')}</small></span>
  </a>
  <nav aria-label="Main navigation · 주 메뉴">
    ${NAV.map((n) => `<a href="${n.href}"${n.key === active ? ' aria-current="page" class="is-active"' : ''}>${bi(...n.label)}</a>`).join('')}
    ${admin ? `<a href="/admin"${active === 'admin' ? ' aria-current="page" class="is-active"' : ''}>${bi('Admin', '관리자')}</a>` : ''}
  </nav>
</header>
<main id="main"${wide ? ' class="wide"' : ''}>
${body}
</main>
<footer class="site-footer">
  <p>${bi('Immanuel Church of America', '미주 임마누엘 교회')}</p>
  <p class="verse">${bi('“God with us.”', '“하나님이 우리와 함께 계시다 함이라”')} <span class="reference">— Matthew 1:23 · 마태복음 1:23</span></p>
</footer>
</body>
</html>`;
}

export function homePage() {
  return `
<section class="hero">
  <h1>${bi('Immanuel Church of America', '미주 임마누엘 교회')}</h1>
  <p class="lede">${bi('A family gathered around the Word of God. Come as you are — you are welcome here.', '하나님의 말씀 안에 모인 가족 공동체입니다. 있는 모습 그대로 오세요. 따뜻하게 환영합니다.')}</p>
  <div class="actions" data-welcome-actions>
    <a class="btn btn-hero btn-mint" href="/about">${bi('About our church', '교회 소개')}</a>
    <a class="btn btn-hero btn-lavender" href="/sermons">${bi('Listen to a sermon', '설교 듣기')}</a>
    <a class="btn btn-hero btn-ghost" href="/gallery">${bi('Gallery', '갤러리')}</a>
    <a class="btn btn-hero btn-rose" href="/columns">${bi('Articles', '목회 칼럼')}</a>
    <a class="btn btn-hero btn-yellow" href="/contact">${bi('Contact', '연락처')}</a>
  </div>
  <blockquote class="hero-verse">${bi('“Immanuel, which being interpreted is, God with us.”', '“이를 번역한즉 하나님이 우리와 함께 계시다 함이라”')}<cite>Matthew 1:23 · 마태복음 1:23</cite></blockquote>
</section>

<section class="cornerstone">
  <p class="eyebrow">${bi('The cornerstone', '모퉁잇돌')}</p>
  <blockquote>${bi('“Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.”', '“예수께서 가라사대 내가 곧 길이요 진리요 생명이니 나로 말미암지 않고는 아버지께로 올 자가 없느니라”')}<cite>John 14:6 · KJV · 요한복음 14:6 · 개역한글</cite></blockquote>
</section>
<script src="/scripts/welcome-actions.js" defer></script>`;
}

export function aboutPage() {
  return `
<div class="contact-page about-page">
<section class="page-head"><p class="eyebrow">${bi('Our church', '우리 교회')}</p><h1>${bi('About', '소개')}</h1><p class="lede">${bi('A family church gathered around the Word of God.', '하나님의 말씀 안에 모인 가족 같은 교회입니다.')}</p></section>
<div class="contact-grid">
<section class="panel about-intro">
  <h2>${bi('A family church', '가족 같은 교회')}</h2>
  <p>${bi('We are a family church. Come as you are — you are welcome here.', '본 교회는 한 가족 같습니다. 있는 모습 그대로 환영합니다.')}</p>
</section>
<section class="panel" id="services">
  <h2>${bi('Service Times', '예배 시간')}</h2>
  <ul>
    <li>${bi('Sunday: 9:00 am, 11:00 am, and 2:00 pm', '주일: 오전 9시, 오전 11시, 오후 2시')}</li>
    <li>${bi('Wednesday: 7:30 pm', '수요일: 오후 7시 30분')}</li>
    <li>${bi('Friday: 7:30 pm', '금요일: 오후 7시 30분')}</li>
  </ul>
  <p>${bi('Lunch is provided after the 11:00 am Sunday service.', '주일 오전 11시 예배 후 점심 식사를 제공합니다.')}</p>
  <p>${bi('Preaching is in Korean; English interpretation is available on request.', '설교는 한국어로 진행되며, 요청하시면 영어 통역을 제공합니다.')}</p>
</section>
<section class="panel">
  <h2>${bi('Worship', '예배 음악')}</h2>
  <p>${bi('Our musical worship is classical in style. We draw from the Korean hymnal, which consists mostly of hymns written by American Christians in the late 19th and 20th centuries, combined with Korean hymns.', '우리의 찬양은 전통적인 스타일입니다. 주로 19세기 후반과 20세기에 미국 그리스도인들이 지은 찬송가를 번역한 것과 한국 찬송가를 겸하여 사용합니다.')}</p>
  <p>${bi('These hymns have simple, emotionally expressive melodies and memorable choruses, designed for large groups to sing together and be built up in faith.', '이 찬송가들은 단순하면서도 감정이 풍부한 선율과 기억하기 쉬운 후렴을 지니고 있어, 많은 사람이 함께 부르며 믿음 안에서 은혜가 되도록 만들어졌습니다.')}</p>
</section>
<section class="panel">
  <h2>${bi('Preaching', '설교')}</h2>
  <p>${bi('Our preaching is biblically sound.', '본 교회 설교는 성경에 충실합니다.')}</p>
  <p>${bi('This church expounds Scripture verse by verse in its original-language context, proclaiming the Word of God.', '본 교회는 원어 중심으로 성경을 한 구절씩 차례대로 강해하여 하나님의 말씀을 선포합니다.')}</p>
</section>
<section class="panel">
  <h2>${bi('What we affirm', '우리가 고백하는 신앙')}</h2>
  <p>${bi('We affirm the Apostles’ Creed and the Lord’s Prayer.', '본 교회는 사도신경과 주기도문을 고백합니다.')}</p>
  <p>${bi('We observe the Lord’s Supper.', '본 교회는 주의 성찬을 거행합니다.')}</p>
</section>
<section class="panel leadership">
  <h2>${bi('Leadership', '교회 리더십')}</h2>
  <p>${bi('Our church is organized with a senior pastor and a body of elders.', '본 교회는 담임목사님, 장로님들과 함께 당회를 구성하고 있습니다.')}</p>
  <h3>${bi('Senior Pastor', '담임목사')}</h3>
  <ul class="people">
      <li><span class="person-name">John Yoon<span class="person-ko" lang="ko">(윤태선)</span></span> <a href="tel:+13237319191">323-731-9191</a></li>
  </ul>
  <h3>${bi('Elders', '장로')}</h3>
  <ul class="people">
      <li><span class="person-name">Joshua Won<span class="person-ko" lang="ko">(원 여호수아)</span></span> <a href="tel:+12132105582">213-210-5582</a></li>
      <li><span class="person-name">Kyu Ho Yeo<span class="person-ko" lang="ko">(여규호)</span></span> <a href="tel:+12135037883">213-503-7883</a></li>
      <li><span class="person-name">Hyi Shik Lee<span class="person-ko" lang="ko">(이희식)</span></span> <a href="tel:+12132486700">213-248-6700</a></li>
  </ul>
</section>
<section class="panel ministry-team">
  <h2>${bi('Ministry Team', '사역팀')}</h2>
  <ul class="people">
      <li><span class="person-name">Eun Young Won<span class="person-ko" lang="ko">(원은영)</span></span><span class="person-role">${bi('Missionary', '전도사')}</span></li>
      <li><span class="person-name">Myung Jun Park<span class="person-ko" lang="ko">(박명준)</span></span><span class="person-role">${bi('Conductor · Deacon', '지휘자 · 집사')}</span></li>
      <li><span class="person-name">Bok Hee Jung<span class="person-ko" lang="ko">(정복희)</span></span><span class="person-role">${bi('Accompanist · Senior Deaconess', '반주자 · 권사')}</span></li>
      <li><span class="person-name">Mark Iverson</span><span class="person-role">${bi('Administrative Assistant', '행정간사')}</span></li>
      <li><span class="person-name">Isaiah Yoon<span class="person-ko" lang="ko">(윤이사야)</span></span><span class="person-role">${bi('Webmaster · A/V Technician · Social Media Manager', '웹사이트 관리자 · 음향/영상 담당 · 소셜 미디어 관리자')}</span></li>
  </ul>
</section>
</div>
</div>`;
}

function pagination({ current, pages }, base) {
  if (pages < 2) return '';
  const href = (n) => esc(`${base}${base.includes('?') ? '&' : '?'}page=${n}`);
  const arrow = (n, symbol, en, ko, cls) => n < 1 || n > pages
    ? `<span class="page-step ${cls} is-disabled" aria-hidden="true">${symbol}</span>`
    : `<a class="page-step ${cls}" href="${href(n)}" rel="${cls}" aria-label="${esc(`${en} · ${ko}`)}">${symbol}</a>`;
  const shown = [...new Set([1, pages, current - 1, current, current + 1])]
    .filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const items = shown.map((n, i) => {
    const gap = i > 0 && n - shown[i - 1] > 1 ? '<span class="page-gap" aria-hidden="true">…</span>' : '';
    return `${gap}${n === current
      ? `<span class="page-num is-current" aria-current="page">${n}</span>`
      : `<a class="page-num" href="${href(n)}" aria-label="${esc(`Page ${n} · ${n}쪽`)}">${n}</a>`}`;
  }).join('');
  return `<nav class="pagination" aria-label="Pages · 페이지">
    ${arrow(current - 1, '‹', 'Previous page', '이전 쪽', 'prev')}
    <div class="page-nums">${items}</div>
    ${arrow(current + 1, '›', 'Next page', '다음 쪽', 'next')}
  </nav>
  <p class="page-status">${bi(`Page ${current} of ${pages}`, `${pages}쪽 중 ${current}쪽`)}</p>`;
}

function sermonScripture(scripture) {
  if (!scripture) return '';
  const languageLinks = scriptureLanguageLinks(scripture);
  const display = formatScriptureReference(scripture);
  return languageLinks
    ? `<details class="scripture-picker"><summary class="scripture"${koreanLang(display)}>${esc(display)}</summary>${languageLinks}</details>`
    : `<p class="scripture"${koreanLang(display)}>${esc(display)}</p>`;
}

function sermonFilter(service) {
  const options = [{ id: '', en: 'All services', ko: '모든 예배' }, ...SERMON_SERVICE_FILTERS];
  const selected = options.find(({ id }) => id === service);
  return `<div class="sermon-filter">
  <p id="service-filter-label">${bi('Filter by service', '예배별 설교')}</p>
  <details class="service-picker">
    <summary aria-describedby="service-filter-label">${bi(selected.en, selected.ko)}</summary>
    <ul class="service-options" aria-label="Worship services · 예배">
      ${options.map(({ id, en, ko }) => `<li><a href="/sermons${id ? `?service=${id}` : ''}"${id === service ? ' aria-current="true"' : ''}>${bi(en, ko)}</a></li>`).join('')}
    </ul>
  </details>
</div>`;
}

export function sermonsPage({ sermons, pager, admin, csrfToken, pastors = [], single = false, service = '' }) {
  const list = sermons.length
    ? sermons.map((s) => `
    <article class="sermon" id="sermon-${esc(s.id)}">
      <div class="sermon-head">
        <h3${koreanLang(s.title)}><a href="/sermons/${encodeURIComponent(s.urlKey || s.id)}">${esc(s.title)}</a></h3>
        ${sermonMetadata(s)}
      </div>
      ${sermonScripture(s.scripture)}
      ${s.description ? `<details class="sermon-description"><summary>${bi('Sermon Overview', '설교 개요')}</summary><p>${esc(s.description)}</p></details>` : ''}
      <audio controls preload="none" src="/uploads/audio/${encodeURIComponent(s.file)}"></audio>
      <div class="sermon-actions">
        <a class="btn btn-ghost sermon-action share-link" href="/sermons/${encodeURIComponent(s.urlKey || s.id)}" data-share-title="${esc(s.title)}" data-copied="Link copied · 링크 복사됨">${bi('Share sermon', '설교 공유')}</a>
        <a class="btn btn-ghost sermon-action copy-link" href="/sermons/${encodeURIComponent(s.urlKey || s.id)}" data-copied="Link copied · 링크 복사됨">${bi('Copy link', '링크 복사')}</a>
      </div>
      ${admin ? `<details class="sermon-edit"><summary>${bi('Edit details', '정보 수정')}</summary>
        <form method="post" action="/admin/sermons/${esc(s.id)}/edit" class="form">
          <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
          <label>${bi('Title', '제목')}<textarea name="title" rows="2" required maxlength="140" aria-label="Title · 제목">${esc(s.title)}</textarea></label>
          ${speakerFields(s, pastors)}
          ${serviceField(s.service)}
          <label>${bi('Date', '날짜')}<input type="date" name="date" value="${esc(s.date)}" required aria-label="Date · 날짜"></label>
          ${scriptureField(s.scripture)}
          <label>${bi('Sermon Overview', '설교 개요')}<textarea name="description" rows="27" maxlength="10000" aria-label="Sermon Overview · 설교 개요">${esc(s.description)}</textarea></label>
          <button class="btn btn-ghost" type="submit">${bi('Save changes', '변경 저장')}</button>
        </form></details>` : ''}
      ${admin ? `<details class="sermon-edit"><summary>${bi('Replace audio', '오디오 교체')}</summary>
        <form method="post" action="/admin/sermons/${esc(s.id)}/audio" class="form" data-audio-upload data-upload-url="/admin/sermons/audio" data-confirm="Replace this sermon’s audio? The current audio will be removed. · 이 설교의 오디오를 교체할까요? 현재 오디오는 삭제됩니다.">
          <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
          <input type="hidden" name="stagedAudio">
          <label>${bi('New audio file', '새 오디오 파일')} <small>(MP3, M4A, WAV, OGG · up to 200 MB · 최대 200MB)</small><input type="file" name="audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac" required aria-label="New audio file · 새 오디오 파일"></label>
          <progress data-audio-progress max="100" hidden aria-label="Audio upload progress · 오디오 업로드 진행 상태"></progress>
          <p data-audio-status role="status" aria-live="polite"></p>
          <button data-audio-submit class="btn btn-primary" type="submit">${bi('Replace audio', '오디오 교체')}</button>
        </form></details>` : ''}
      ${admin ? deleteForm('/admin/sermons/' + s.id + '/delete', csrfToken) : ''}
    </article>`).join('')
    : `<p class="empty">${service
      ? bi('No sermons have been shared for this service yet.', '이 예배의 설교가 아직 게시되지 않았습니다.')
      : bi('No sermons have been shared yet. Please check back soon.', '아직 나눈 설교가 없습니다. 조금 뒤에 다시 확인해 주세요.')}</p>`;
  return `
<section class="page-head"><p class="eyebrow">${bi('The Word', '말씀')}</p><h1>${bi('Sermons', '설교')}</h1><p class="lede">${bi('Listen to messages from our church family.', '교회 공동체가 나눈 말씀을 들어 보세요.')}</p></section>
${single ? `<p><a class="btn btn-ghost sermon-back" href="/sermons">${bi('All sermons', '모든 설교')}</a></p>` : sermonFilter(service)}
<section class="stack">${list}</section>
${single ? '' : pagination(pager, `/sermons${service ? `?service=${service}` : ''}`)}
${single ? '' : '<script src="/scripts/sermon-filter.js" defer></script>'}
${admin ? '<script src="/scripts/admin.js" defer></script>' : ''}
<script src="/scripts/sermon-sharing.js" defer></script>`;
}

function safeArticleUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function articleBody(en, ko, enDoc, koDoc, language = '') {
  const paragraphs = (text) => text.replace(/\r\n?/g, '\n').split(/\n{2,}/)
    .map((part) => `<p>${esc(part).replace(/\n/g, '<br>')}</p>`).join('');
  const content = (text, doc) => doc ? `<div class="column-rich">${renderColumnDocument(parseColumnDocument(JSON.stringify(doc)).nodes, esc)}</div>` : paragraphs(text);
  const blocks = [
    (!language || language === 'en') && (en || columnHasContent(enDoc)) ? `<section class="column-language" lang="en"><h2>${bi('English', '영어')}</h2>${content(en, enDoc)}</section>` : '',
    (!language || language === 'ko') && (ko || columnHasContent(koDoc)) ? `<section class="column-language" lang="ko"><h2>${bi('Korean', '한국어')}</h2>${content(ko, koDoc)}</section>` : '',
  ];
  return blocks.filter(Boolean).join('');
}

export function columnsPage({ columns, pager, admin = false, csrfToken = '' }) {
  return `
<div class="columns-page">
<section class="page-head"><h1>${bi('Pastoral Columns', '목회 칼럼')}</h1><p class="lede">${bi('Articles for faith and life.', '신앙과 삶을 위한 목회 글을 읽어 보세요.')}</p></section>
<section class="column-list">
${columns.length ? columns.map((column) => `
  <article class="column-card" id="column-${esc(column.id)}">
    <a class="column-card-link${column.image ? ' has-image' : ''}" href="/columns/${encodeURIComponent(column.slug)}" aria-labelledby="column-title-${esc(column.id)}${column.titleKo && column.titleEn ? ` column-title-ko-${esc(column.id)}` : ''}">
      ${column.image ? `<div class="column-card-image"><img src="/columns/images/${encodeURIComponent(column.image)}" alt="" loading="lazy"></div>` : ''}
      <div class="column-card-copy">
        <p class="column-date">${esc([column.speakerEn, column.speakerKo, column.date && formatDate(column.date, 'ko-KR')].filter(Boolean).join(' · '))}</p>
        <h2 id="column-title-${esc(column.id)}"${koreanLang(column.titleEn || column.titleKo)}>${esc(column.titleEn || column.titleKo)}</h2>
        ${column.titleKo && column.titleEn ? `<p class="column-title-ko" id="column-title-ko-${esc(column.id)}" lang="ko">${esc(column.titleKo)}</p>` : ''}
        ${column.excerptEn ? `<p lang="en">${esc(column.excerptEn)}</p>` : ''}
        ${column.excerptKo ? `<p lang="ko">${esc(column.excerptKo)}</p>` : ''}
      </div>
    </a>
  </article>`).join('') : `<p class="empty">${bi('No pastoral columns have been published yet.', '아직 게시된 목회 칼럼이 없습니다.')}</p>`}
</section>
${pagination(pager, '/columns')}
</div>
${admin ? `<script src="/scripts/admin.js" defer></script>` : ''}`;
}

export function columnPage({ column, language = '', admin = false, csrfToken = '', engagement }) {
  const videoUrl = safeArticleUrl(column.videoUrl);
  const hasEn = Boolean(column.titleEn || column.bodyEn || columnHasContent(column.bodyEnDoc));
  const hasKo = Boolean(column.titleKo || column.bodyKo || columnHasContent(column.bodyKoDoc));
  const selected = language && ((language === 'en' && hasEn) || (language === 'ko' && hasKo))
    ? language : hasEn && hasKo ? '' : hasEn ? 'en' : 'ko';
  const title = selected === 'ko' ? column.titleKo || column.titleEn : column.titleEn || column.titleKo;
  const author = selected === 'ko' ? column.speakerKo || column.speakerEn : column.speakerEn || column.speakerKo;
  return `
<div class="columns-page">
  <article class="column-article">
    <div class="column-reading">
      <a class="column-back" href="/columns">${bi('← All articles', '← 모든 칼럼')}</a>
      ${hasEn && hasKo ? `<nav class="column-languages" aria-label="Article language · 기사 언어" data-column-languages><a href="?lang=en"${selected === 'en' ? ' aria-current="page"' : ''}>English</a><a href="?lang=ko" lang="ko"${selected === 'ko' ? ' aria-current="page"' : ''}>한국어</a></nav>` : ''}
      <header class="column-article-header">
        <h1${koreanLang(title)}>${esc(title)}</h1>
        ${!selected && column.titleKo && column.titleEn ? `<p class="column-title-ko" lang="ko">${esc(column.titleKo)}</p>` : ''}
        ${author || column.date ? `<div class="column-byline">
          ${author ? `<p class="column-author">${esc(author)}</p>` : ''}
          ${column.date ? `<p class="column-meta"><time datetime="${esc(column.date)}">${esc(formatDate(column.date, 'en-US'))} · ${esc(formatDate(column.date, 'ko-KR'))}</time></p>` : ''}
        </div>` : ''}
      </header>
      ${column.image ? `<figure class="column-feature"><img src="/columns/images/${encodeURIComponent(column.image)}" alt="${esc(column.titleEn || column.titleKo)}"></figure>` : ''}
      ${articleBody(column.bodyEn, column.bodyKo, column.bodyEnDoc, column.bodyKoDoc, selected)}
      ${videoUrl ? `<section class="column-video"><h2>${bi('Related video', '관련 영상')}</h2><a class="column-video-link" href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer"><span class="column-video-icon" aria-hidden="true">▶</span>${bi('Watch video', '영상 보기')}</a></section>` : ''}
      ${admin ? `<details class="column-admin"><summary>${bi('Manage article', '기사 관리')}</summary><p><a class="btn btn-ghost" href="/admin/columns/${encodeURIComponent(column.id)}/edit">${bi('Edit article', '기사 수정')}</a></p><form method="post" action="/admin/columns/${esc(column.id)}/delete" data-confirm="Delete this pastoral column? · 이 목회 칼럼을 삭제할까요?"><input type="hidden" name="_csrf" value="${esc(csrfToken)}"><button class="btn-link danger" type="submit">${bi('Delete article', '기사 삭제')}</button></form></details>` : ''}
      <nav class="column-footer" aria-label="Article actions · 칼럼 메뉴">
        <a class="btn btn-ghost column-action column-action-all" href="/columns"><svg class="column-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5c3.1-.9 6.1-.5 8.5 1.2v13c-2.4-1.7-5.4-2.1-8.5-1.2Zm17 0c-3.1-.9-6.1-.5-8.5 1.2v13c2.4-1.7 5.4-2.1 8.5-1.2Z"/><path d="M6.5 9c1.4-.2 2.7 0 3.8.6m7.2-.6c-1.4-.2-2.7 0-3.8.6"/></svg>${bi('All articles', '모든 칼럼')}</a>
        <a class="btn btn-ghost column-action column-action-share share-link" href="/columns/${encodeURIComponent(column.slug)}" data-share-title="${esc(title)}" data-copied="Link copied · 링크 복사됨"><svg class="column-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2 4.8 13.5C.7 9.6 3.3 4 7.7 4.4c1.8.2 3.3 1.2 4.3 2.6 1-1.4 2.5-2.4 4.3-2.6 4.4-.4 7 5.2 2.9 9.1Z"/></svg>${bi('Share article', '칼럼 공유')}</a>
        <a class="btn btn-ghost column-action column-action-copy copy-link" href="/columns/${encodeURIComponent(column.slug)}" data-copied="Link copied · 링크 복사됨"><svg class="column-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8.5h11.5v13H8z"/><path d="M15.5 8.5V3H4v13h4"/><path d="m11 14 2 2 4-4"/></svg>${bi('Copy link', '링크 복사')}</a>
      </nav>
      ${engagement ? columnEngagement(column, engagement, selected) : ''}
    </div>
  </article>
</div>
${hasEn && hasKo ? '<script src="/scripts/column-language.js" defer></script>' : ''}
<script src="/scripts/sermon-sharing.js" defer></script>
${engagement ? '<script src="/scripts/column-comment.js" defer></script>' : ''}
${admin ? '<script src="/scripts/admin.js" defer></script>' : ''}`;
}

function columnEngagement(column, engagement, language) {
  const action = `/columns/${encodeURIComponent(column.slug)}`;
  const hidden = `<input type="hidden" name="_reader" value="${esc(engagement.token)}"><input type="hidden" name="lang" value="${esc(language)}">`;
  return `<section class="column-engagement" id="article-engagement">
    <div class="column-reactions">
      <form class="column-like-form" method="post" action="${action}/like">${hidden}<button class="column-like" type="submit"${engagement.liked ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5 4.7 13.6C.5 9.5 3.2 3.8 7.7 4.2 9.5 4.3 11 5.3 12 6.7c1-1.4 2.5-2.4 4.3-2.5 4.5-.4 7.2 5.3 3 9.4Z"/></svg>${engagement.liked ? bi('Liked', '좋아요 완료') : bi('Like', '좋아요')} <span aria-label="Likes · 좋아요 수">${engagement.likes}</span></button><span data-like-status role="status" aria-live="polite"></span></form>
      <a class="column-response-link" href="#article-comments"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5c0 4-3.6 7-8 7-1.1 0-2.2-.2-3.2-.6L5 20l.7-3.6C4.6 15.1 4 13.4 4 11.5c0-4 3.6-7 8-7s8 3 8 7Z"/></svg>${bi('Comments', '댓글')} <span>${engagement.comments.length}</span></a>
    </div>
    ${engagement.status === 'submitted' ? `<p role="status">${bi('Thank you. Your comment will appear after review.', '감사합니다. 댓글은 검토 후 게시됩니다.')}</p>` : ''}
    <div id="article-comments">
    <h2>${bi('Comments', '댓글')} <span class="column-comment-count">${engagement.comments.length}</span></h2>
    <details class="column-response">
    <summary>${bi('Write a comment', '댓글 작성')}</summary>
    <form class="form column-comment-form" method="post" action="${action}/comments">
      ${hidden}
      <label>${bi('Name', '이름')}<input name="name" maxlength="100" required autocomplete="name"></label>
      <label>${bi('Email (optional, not published)', '이메일 (선택, 공개되지 않음)')}<input name="email" type="email" maxlength="254" autocomplete="email"></label>
      <label>${bi('Comment', '댓글')}<textarea name="comment" maxlength="3000" rows="5" required></textarea></label>
      <p>${bi('Comments are reviewed before appearing.', '댓글은 검토 후 게시됩니다.')}</p>
      <button class="btn btn-primary" type="submit">${bi('Submit comment', '댓글 보내기')}</button>
      <p data-comment-status role="status" aria-live="polite"></p>
    </form>
    </details>
    ${engagement.comments.length ? `<ol class="column-comments">${engagement.comments.map((comment) => {
      const date = typeof comment.createdAt === 'string' ? comment.createdAt.slice(0, 10) : '';
      return `<li><div class="column-comment-byline"><strong>${esc(comment.name)}</strong>${/^\d{4}-\d{2}-\d{2}$/.test(date) ? `<time datetime="${esc(date)}">${esc(formatDate(date, 'en-US'))} · ${esc(formatDate(date, 'ko-KR'))}</time>` : ''}</div><p>${esc(comment.text).replace(/\r\n?|\n/g, '<br>')}</p></li>`;
    }).join('')}</ol>` : `<p>${bi('No comments yet.', '아직 댓글이 없습니다.')}</p>`}
    </div>
  </section>`;
}

export function columnCommentsAdminPage({ comments, csrfToken }) {
  return `<section class="panel"><h1>${bi('Article comments', '기사 댓글')}</h1>
    <p><a href="/admin">${bi('Back to admin', '관리자로 돌아가기')}</a></p>
    ${comments.length ? comments.map((comment) => `<article class="admin-column-comment">
      <h2><a href="/columns/${encodeURIComponent(comment.column.slug)}">${esc(comment.column.titleEn || comment.column.titleKo)}</a></h2>
      <p><strong>${esc(comment.name)}</strong>${comment.email ? ` · ${esc(comment.email)}` : ''} · ${comment.approved ? bi('Published', '게시됨') : bi('Awaiting review', '검토 대기')}</p>
      <p>${esc(comment.text).replace(/\r\n?|\n/g, '<br>')}</p>
      ${['approve', 'delete'].filter((action) => action !== 'approve' || !comment.approved).map((action) => `<form method="post" action="/admin/columns/comments/${encodeURIComponent(comment.column.id)}/${encodeURIComponent(comment.id)}/${action}"><input type="hidden" name="_csrf" value="${esc(csrfToken)}"><button class="btn ${action === 'approve' ? 'btn-primary' : 'btn-ghost'}" type="submit">${action === 'approve' ? bi('Approve', '승인') : bi('Delete', '삭제')}</button></form>`).join('')}
    </article>`).join('') : `<p>${bi('No comments to review.', '검토할 댓글이 없습니다.')}</p>`}
  </section>`;
}

export function contactPage() {
  return `
<div class="contact-page">
<section class="page-head"><p class="eyebrow">${bi('Connect', '함께하기')}</p><h1>${bi('Contact', '연락처')}</h1><p class="lede">${bi('We would love to hear from you.', '여러분의 이야기를 기다립니다.')}</p></section>
<div class="contact-grid">
<div class="panel visit-panel">
<section class="contact-section">
  <h2>${bi('Visit us', '오시는 길')}</h2>
  <address class="contact-address">
    <a href="https://www.google.com/maps/place/Immanuel+Church+of+America+%2F+%EB%AF%B8%EC%A3%BC%EC%9E%84%EB%A7%88%EB%88%84%EC%97%98%EA%B5%90%ED%9A%8C/@34.0397122,-118.3242422,17z/data=!3m1!4b1!4m6!3m5!1s0x80c2b867941260c9:0xc64dfc88582a36a6!8m2!3d34.0397078!4d-118.3216673!16s%2Fg%2F1262s7wvv?entry=ttu&amp;g_ep=EgoyMDI2MTEwMi4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noopener noreferrer">
      3406 W Washington Blvd 2F<br>Los Angeles, CA 90018
    </a>
  </address>
  <p><a class="btn btn-primary" href="/about#services">${bi('Worship service times', '예배 시간 안내')}</a></p>
</section>
<div class="contact-section contact-map">
  <figure class="visit-map">
    <svg viewBox="0 0 760 440" role="img" aria-labelledby="visit-map-title visit-map-desc">
      <title id="visit-map-title">Church location and parking · 교회 위치와 주차장</title>
      <desc id="visit-map-desc">North is up. The church is on the south side of Washington Boulevard, just west of 4th Avenue, between Crenshaw Boulevard and Arlington Avenue. The parking lot is directly behind the south side of the building. I-10 is farther south. 북쪽은 위입니다. 교회는 Crenshaw Boulevard와 Arlington Avenue 사이, Washington Boulevard 남쪽의 4th Avenue 바로 서쪽에 있습니다. 주차장은 건물 남쪽 바로 뒤편에 있으며, I-10은 더 남쪽에 있습니다.</desc>
      <g class="map-compass">
        <path d="M60 38 L50 60 L70 60 Z"/>
        <path class="map-road-line" d="M60 60 V87"/>
        <text x="60" y="111" text-anchor="middle" lang="en">N</text>
        <text x="60" y="136" text-anchor="middle" lang="ko">북</text>
      </g>
      <g class="map-roads">
        <path d="M215 40 L120 410 M460 40 V410 M650 40 V410 M40 190 H720"/>
      </g>
      <g class="map-road-line">
        <path d="M215 40 L120 410 M460 40 V410 M650 40 V410 M40 190 H720"/>
      </g>
      <g class="map-label">
        <text transform="translate(170 110) rotate(-75)" text-anchor="middle"><tspan lang="en">Crenshaw Blvd.</tspan><tspan x="0" dy="23" lang="ko">크렌쇼 블러바드</tspan></text>
        <text x="485" y="92"><tspan lang="en">4th Avenue</tspan><tspan x="485" dy="23" lang="ko">4번가</tspan></text>
        <text x="675" y="92" text-anchor="middle"><tspan lang="en">Arlington</tspan><tspan x="675" dy="23" lang="ko">알링턴</tspan></text>
        <text x="370" y="146" text-anchor="middle"><tspan lang="en">Washington Blvd.</tspan><tspan x="370" dy="23" lang="ko">워싱턴 블러바드</tspan></text>
      </g>
      <rect class="map-building" x="240" y="207" width="200" height="76"/>
      <path class="map-cross" d="M260 221 V246 M251 230 H269"/>
      <text class="map-church-label" x="350" y="234" text-anchor="middle"><tspan lang="en">Immanuel Church</tspan><tspan x="350" dy="28" lang="ko">미주임마누엘교회</tspan></text>
      <rect class="map-parking" x="240" y="288" width="200" height="55"/>
      <text class="map-label" x="340" y="310" text-anchor="middle"><tspan lang="en">Parking · South side</tspan><tspan x="340" dy="23" lang="ko">주차장 · 건물 남쪽</tspan></text>
      <path class="map-freeway" d="M40 385 L55 369 V377 H705 V369 L720 385 L705 401 V393 H55 V401 Z"/>
      <text class="map-freeway-label" x="380" y="391" text-anchor="middle" lang="en">I-10</text>
      <text class="map-label" x="45" y="431" lang="en">← I-405</text>
      <text class="map-label" x="715" y="431" text-anchor="end" lang="en">I-110 →</text>
    </svg>
  </figure>
  <p class="visit-parking-note">${bi('The parking lot is directly behind the south side of the building.', '주차장은 건물 남쪽 바로 뒤편에 있습니다.')}</p>
</div>
<section class="contact-section">
  <h2>${bi('A few helpful details', '방문 안내')}</h2>
  <p>${bi('Our church is ADA accessible, with an elevator available to take you to the second floor.', '교회는 ADA 기준에 따라 장애인 접근이 가능하며, 엘리베이터로 2층까지 이동하실 수 있습니다.')}</p>
  <p>${bi('All are welcome.', '모든 분을 환영합니다.')}</p>
</section>
<section class="contact-section">
  <h2>${bi('Stay connected', '교회 소식')}</h2>
  <p>${bi('Follow us on Instagram', '인스타그램에서 교회 소식을 만나 보세요')}</p>
  <p><a href="https://www.instagram.com/immanuelchurchofamerica/" target="_blank" rel="noopener noreferrer">@immanuelchurchofamerica</a></p>
</section>
</div>
</div>
<section class="contact-scripture cornerstone" aria-label="Scripture · 성경 말씀">
  <figure class="scripture-logo"><span lang="en">The Glass of the Word</span><span class="logo-glimmer"><img src="/favicon.png" alt="Immanuel Church of America logo" width="84" height="84"></span><span lang="ko">말씀의 거울</span></figure>
  <blockquote>
    ${bi('For now we see through a glass, darkly; but then face to face: now I know in part; but then shall I know even as also I am known.', '지금은 거울에 비친 모습을 보듯 희미하지만, 그때에는 얼굴과 얼굴을 마주하여 볼 것입니다. 지금은 부분적으로 알지만, 그때에는 내가 알려진 것처럼 온전히 알게 될 것입니다.')}<cite>${bi('1 Corinthians 13:12', '고린도전서 13:12')}</cite>
  </blockquote>
</section>`;
}

function deleteForm(action, csrfToken) {
  return `<form method="post" action="${action}" data-confirm="Remove this sermon? 삭제하시겠습니까?"><input type="hidden" name="_csrf" value="${esc(csrfToken)}"><button class="btn-link danger" type="submit">${bi('Remove', '삭제')}</button></form>`;
}

export function loginPage({ error }) {
  return `
<section class="narrow panel">
  <h1>${bi('Admin sign in', '관리자 로그인')}</h1>
  ${error ? `<p class="alert" role="alert">${messageMarkup(error)}</p>` : ''}
  <form method="post" action="/admin/login" class="form">
    <label>${bi('Password', '비밀번호')}<input type="password" name="password" required autofocus autocomplete="current-password" aria-label="Password · 비밀번호"></label>
    <button class="btn btn-primary" type="submit">${bi('Sign in', '로그인')}</button>
  </form>
</section>`;
}

export function verifyPage({ error, csrfToken }) {
  return `
<section class="narrow panel">
  <h1>${bi('Enter your code', '코드 입력')}</h1>
  ${error ? `<p class="alert" role="alert">${messageMarkup(error)}</p>` : ''}
  <p>${bi('Open your authenticator app on your phone and type the 6-digit number it shows for Immanuel Church. The number changes every 30 seconds.', '휴대폰의 인증 앱을 열고 임마누엘 교회에 표시된 6자리 숫자를 입력해 주세요. 숫자는 30초마다 바뀝니다.')}</p>
  <form method="post" action="/admin/verify" class="form">
    <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
    <label>${bi('6-digit code', '6자리 코드')}<input name="code" required autofocus inputmode="numeric" autocomplete="one-time-code" maxlength="32" aria-label="6-digit code · 6자리 코드"></label>
    <button class="btn btn-primary" type="submit">${bi('Continue', '계속')}</button>
  </form>
  <p class="meta">${bi('Lost your phone? Type one of your saved recovery codes here instead.', '휴대폰을 분실하셨나요? 저장해 둔 복구 코드 중 하나를 대신 입력하세요.')}</p>
</section>`;
}

export function setupPage({ error, csrfToken, secret, qrSvg, needsPassword }) {
  const spaced = secret.match(/.{1,4}/g).join(' ');
  return `
<section class="narrow panel">
  <h1>${bi('Set up your sign-in', '로그인 설정')}</h1>
  ${error ? `<p class="alert" role="alert">${messageMarkup(error)}</p>` : ''}
  <p>${bi('This takes about two minutes and only needs to be done once.', '약 2분이 걸리며 한 번만 하면 됩니다.')}</p>
  <h2>${bi('Step 1', '1단계')}</h2>
  <p>${bi('On your phone, install a free app called Google Authenticator or Microsoft Authenticator.', '휴대폰에 Google Authenticator 또는 Microsoft Authenticator 무료 앱을 설치해 주세요.')}</p>
  <h2>${bi('Step 2', '2단계')}</h2>
  <p>${bi('In the app, tap the plus (+) button and choose “Scan a QR code.” Point your phone at this square picture.', '앱에서 더하기(+) 버튼을 누르고 “QR 코드 스캔”을 선택한 뒤, 이 네모난 그림에 휴대폰을 비춰 주세요.')}</p>
  <div class="qr" role="img" aria-label="QR code · QR 코드">${qrSvg}</div>
  <p class="meta">${bi('Cannot scan? In the app choose “Enter a setup key” and type:', '스캔이 안 되면 앱에서 “설정 키 입력”을 선택하고 다음을 입력하세요:')} <code>${esc(spaced)}</code></p>
  <form method="post" action="/admin/setup" class="form">
    <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
    <h2>${bi('Step 3', '3단계')}</h2>
    <label>${bi('Type the 6-digit number the app shows', '앱에 표시된 6자리 숫자를 입력하세요')}<input name="code" required inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" aria-label="6-digit code · 6자리 코드"></label>
    ${needsPassword ? `
    <h2>${bi('Step 4', '4단계')}</h2>
    <p>${bi('Choose your own password. Use at least 16 characters; a short sentence is easy to remember.', '나만의 비밀번호를 정해 주세요. 16자 이상이어야 하며, 짧은 문장이면 기억하기 쉽습니다.')}</p>
    <label>${bi('New password', '새 비밀번호')}<input type="password" name="newPassword" required minlength="16" autocomplete="new-password" aria-label="New password · 새 비밀번호"></label>
    <label>${bi('New password again', '새 비밀번호 확인')}<input type="password" name="confirmPassword" required minlength="16" autocomplete="new-password" aria-label="New password again · 새 비밀번호 확인"></label>` : ''}
    <button class="btn btn-primary" type="submit">${bi('Finish setup', '설정 완료')}</button>
  </form>
</section>`;
}

export function recoveryPage({ codes }) {
  return `
<section class="narrow panel">
  <h1>${bi('Save your recovery codes', '복구 코드를 저장하세요')}</h1>
  <p>${bi('If you ever lose your phone, you can sign in with one of these codes instead of the app. Each code works once. Write them down or print this page and keep it somewhere safe. They will not be shown again.', '휴대폰을 분실하면 앱 대신 이 코드 중 하나로 로그인할 수 있습니다. 각 코드는 한 번만 사용할 수 있습니다. 적어 두거나 이 페이지를 인쇄하여 안전한 곳에 보관하세요. 다시 표시되지 않습니다.')}</p>
  <ul class="codes">${codes.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul>
  <p><a class="btn btn-primary" href="/admin">${bi('I have saved them — continue', '저장했습니다 — 계속')}</a></p>
</section>`;
}

function adminsPanel({ admins, invite, csrfToken }) {
  const post = (action, label, confirmText, extra = '') => `<form method="post" action="${action}" data-confirm="${esc(confirmText)}"><input type="hidden" name="_csrf" value="${esc(csrfToken)}"><button class="btn-link${extra}" type="submit">${label}</button></form>`;
  return `
  <section class="panel">
    <h2>${bi('Admins', '관리자')}</h2>
    ${invite ? `<p class="notice" role="status">${bi(`Give ${invite.name} this temporary code. It is shown only once. They sign in at /admin/login with it and then set up their own password.`, `${invite.name}님에게 이 임시 코드를 전달하세요. 한 번만 표시됩니다. /admin/login에서 이 코드로 로그인한 후 직접 비밀번호를 설정합니다.`)}<br><code>${esc(invite.code)}</code></p>` : ''}
    <ul class="admin-list">${admins.map((a) => `
      <li><strong>${esc(a.name)}</strong> — ${a.enrolled ? bi('Ready', '설정 완료') : bi('Waiting for setup', '설정 대기 중')}
        ${a.owner ? `<span class="meta">${bi('Owner', '소유자')}</span>` : `
        ${post(`/admin/admins/${esc(a.id)}/reset`, bi('Reset sign-in', '로그인 초기화'), 'Reset sign-in? They will get a new temporary code. 로그인을 초기화하시겠습니까?')}
        ${post(`/admin/admins/${esc(a.id)}/remove`, bi('Remove', '삭제'), 'Remove this admin? 이 관리자를 삭제하시겠습니까?', ' danger')}`}
      </li>`).join('')}
    </ul>
    <form method="post" action="/admin/admins" class="form">
      <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
      <label>${bi('Add an admin (their name)', '관리자 추가 (이름)')}<input name="name" required maxlength="60" aria-label="Name · 이름"></label>
      <button class="btn btn-ghost" type="submit">${bi('Add admin', '관리자 추가')}</button>
    </form>
  </section>`;
}

function columnEditorLanguage(language, text, doc) {
  const isEnglish = language === 'en';
  const name = isEnglish ? 'bodyEn' : 'bodyKo';
  const label = isEnglish ? bi('Article (English)', '기사 (영어)') : bi('Article (Korean)', '기사 (한국어)');
  const initial = doc
    ? renderColumnDocument(parseColumnDocument(JSON.stringify(doc)).nodes, esc)
    : String(text ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
      .map((part) => `<div>${esc(part).replace(/\n/g, '<br>') || '<br>'}</div>`).join('');
  return `<section class="column-editor-language" data-column-language="${language}">
    <h2 id="column-editor-label-${language}">${label}</h2>
    <div class="column-editor-surface" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="column-editor-label-${language}" lang="${language}" data-column-surface hidden>${initial}</div>
    <textarea rows="10" readonly aria-label="${isEnglish ? 'Article in English · 기사 (영어)' : 'Article in Korean · 기사 (한국어)'}" data-column-fallback>${esc(text)}</textarea>
    <div class="column-editor-tools" hidden>
      <div class="column-formatting" role="group" aria-label="Text formatting · 글 서식">
        <button class="btn btn-ghost" type="button" data-format="bold" aria-label="Bold · 굵게"><strong aria-hidden="true">B</strong></button>
        <button class="btn btn-ghost" type="button" data-format="italic" aria-label="Italic · 기울임"><em aria-hidden="true">I</em></button>
        <button class="btn btn-ghost" type="button" data-format="underline" aria-label="Underline · 밑줄"><u aria-hidden="true">U</u></button>
      </div>
      <details>
        <summary>${bi('Insert link', '링크 삽입')}</summary>
        <label>${bi('Link address', '링크 주소')}<input type="url" maxlength="2000" data-link-url placeholder="https://" aria-label="Link address · 링크 주소"></label>
        <label>${bi('Link text (or select text first)', '링크 글 (또는 먼저 글을 선택하세요)')}<input maxlength="500" data-link-text aria-label="Link text · 링크 글"></label>
        <button class="btn btn-ghost" type="button" data-insert-link>${bi('Insert link', '링크 삽입')}</button>
      </details>
      <details>
        <summary>${bi('Insert image', '이미지 삽입')}</summary>
        <label>${bi('Image file', '이미지 파일')}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" data-inline-file aria-label="Image file · 이미지 파일"></label>
        <label>${bi('Describe the image for accessibility', '접근성을 위한 이미지 설명')}<input maxlength="300" data-inline-alt aria-label="Image description · 이미지 설명"></label>
        <button class="btn btn-ghost" type="button" data-insert-image>${bi('Insert image', '이미지 삽입')}</button>
      </details>
    </div>
  </section>`;
}

export function columnEditorPage({ column = {}, csrfToken, revision = '', pastors = [] }) {
  const editing = Boolean(column.id);
  const author = editing ? column : { speakerEn: 'Pastor John Yoon', speakerKo: '윤태선 목사' };
  const action = editing ? `/admin/columns/${encodeURIComponent(column.id)}/edit` : '/admin/columns/rich';
  return `<section class="page-head"><h1>${editing ? bi('Edit article', '기사 수정') : bi('New article', '새 기사')}</h1></section>
<section class="panel column-editor-panel">
  <p>${bi('Place the cursor in the article to insert an image or link. You can edit English and Korean separately.', '기사에서 커서를 놓은 위치에 이미지나 링크를 삽입할 수 있습니다. 영어와 한국어를 따로 수정할 수 있습니다.')}</p>
  <noscript><p class="alert">${bi('Enable JavaScript to use the visual article editor.', '시각적 기사 편집기를 사용하려면 자바스크립트를 활성화해 주세요.')}</p></noscript>
  <form method="post" action="${action}" enctype="multipart/form-data" class="form" data-column-editor>
    <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
    ${editing ? `<input type="hidden" name="revision" value="${esc(revision)}">` : ''}
    <label>${bi('Title (English)', '제목 (영어)')}<input name="titleEn" maxlength="180" value="${esc(column.titleEn)}" aria-label="Title in English · 제목 (영어)"></label>
    <label>${bi('Title (Korean)', '제목 (한국어)')}<input name="titleKo" maxlength="180" value="${esc(column.titleKo)}" aria-label="Title in Korean · 제목 (한국어)"></label>
    ${speakerFields(author, pastors, { author: true })}
    <label>${bi('Preview (English)', '미리보기 (영어)')}<textarea name="excerptEn" rows="3" maxlength="500" aria-label="Preview in English · 미리보기 (영어)">${esc(column.excerptEn)}</textarea></label>
    <label>${bi('Preview (Korean)', '미리보기 (한국어)')}<textarea name="excerptKo" rows="3" maxlength="500" aria-label="Preview in Korean · 미리보기 (한국어)">${esc(column.excerptKo)}</textarea></label>
    ${columnEditorLanguage('en', column.bodyEn, column.bodyEnDoc)}
    ${columnEditorLanguage('ko', column.bodyKo, column.bodyKoDoc)}
    <label>${bi('Related video URL (optional)', '관련 영상 주소 (선택)')}<input type="url" name="videoUrl" maxlength="1000" value="${esc(column.videoUrl)}" placeholder="https://" aria-label="Related video URL · 관련 영상 주소"></label>
    <label>${bi(editing ? 'Replace cover image (optional)' : 'Cover image (optional)', editing ? '대표 이미지 교체 (선택)' : '대표 이미지 (선택)')}<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" aria-label="Cover image · 대표 이미지"></label>
    ${column.image ? `<p>${bi('Current cover image', '현재 대표 이미지')}</p><img class="column-editor-cover" src="/columns/images/${encodeURIComponent(column.image)}" alt="${esc(column.titleEn || column.titleKo)}"><label class="column-remove-cover"><input type="checkbox" name="removeImage" value="1">${bi('Remove cover image', '대표 이미지 삭제')}</label>` : ''}
    <label>${bi('Publish date', '게시 날짜')}<input type="date" name="date" value="${esc(editing ? column.date : new Date().toISOString().slice(0, 10))}" aria-label="Publish date · 게시 날짜"></label>
    <p data-column-status role="status" aria-live="polite"></p>
    <button class="btn btn-primary" type="submit" data-column-submit disabled>${editing ? bi('Save changes', '변경 저장') : bi('Publish article', '기사 게시')}</button>
    <a class="btn btn-ghost" href="${editing ? `/columns/${encodeURIComponent(column.slug)}` : '/admin'}">${bi('Cancel', '취소')}</a>
  </form>
</section>
<script src="/scripts/admin.js" defer></script>
<script src="/scripts/admin-column-editor.js" defer></script>`;
}

export function adminPage({ sermons, columns = [], section = 'home', csrfToken, notice, error, admins, invite, pastors = [], pendingComments = 0 }) {
  const today = new Date().toISOString().slice(0, 10);
  return `
<section class="page-head"><p class="eyebrow">${bi('Admin', '관리자')}</p><h1>${section === 'sermons' ? bi('Manage sermons', '설교 관리') : section === 'columns' ? bi('Manage articles', '기사 관리') : bi('Manage content', '콘텐츠 관리')}</h1>
  ${section !== 'home' ? `<p><a href="/admin">${bi('← Admin dashboard', '← 관리자 대시보드')}</a></p>` : ''}
  <form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${esc(csrfToken)}"><button class="btn-link" type="submit">${bi('Sign out', '로그아웃')}</button></form>
</section>
${section === 'sermons' ? `<p class="meta">${bi('For bilingual posts, include both English and Korean in titles and sermon overviews.', '두 언어로 게시하려면 제목과 설교 개요에 영어와 한국어를 함께 입력해 주세요.')}</p>` : ''}
${notice ? `<p class="notice" role="status">${messageMarkup(notice)}</p>` : ''}
${error ? `<p class="alert" role="alert">${messageMarkup(error)}</p>` : ''}
${pendingComments ? `<div class="notice" role="status">${bi(`${pendingComments} ${pendingComments === 1 ? 'comment is' : 'comments are'} awaiting review.`, `검토를 기다리는 댓글이 ${pendingComments}개 있습니다.`)} <a class="btn btn-ghost" href="/admin/columns/comments">${bi('Review comments', '댓글 검토')}</a></div>` : ''}
<div class="admin-grid">
  ${section === 'home' ? `
  <section class="panel">
    <h2>${bi('Sermons', '설교')}</h2>
    <p>${bi('Upload and manage sermons.', '설교를 업로드하고 관리합니다.')}</p>
    <a class="btn btn-primary" href="/admin/sermons">${bi('Manage sermons', '설교 관리')}</a>
  </section>
  <section class="panel">
    <h2>${bi('Gallery', '갤러리')}</h2>
    <p>${bi('Upload and manage photos.', '사진을 업로드하고 관리합니다.')}</p>
    <a class="btn btn-primary" href="/admin/gallery">${bi('Manage gallery', '갤러리 관리')}</a>
  </section>
  <section class="panel">
    <h2>${bi('Articles', '목회 칼럼')}</h2>
    <p>${bi('Write and manage articles and comments.', '기사와 댓글을 작성하고 관리합니다.')}</p>
    <a class="btn btn-primary" href="/admin/columns">${bi('Manage articles', '기사 관리')}</a>
  </section>` : ''}
  ${section === 'columns' ? `
  <section class="panel">
    <h2>${bi('Pastoral columns', '목회 칼럼')}</h2>
    <p>${bi('Publish bilingual articles with images and video links.', '이미지와 영상 링크가 있는 두 언어 기사를 게시합니다.')}</p>
    <a class="btn btn-primary" href="/admin/columns/new">${bi('Write an article', '기사 작성')}</a>
    <a class="btn btn-ghost" href="/admin/columns/comments">${bi('Review article comments', '기사 댓글 검토')}</a>
    <p class="count">${columns.length} ${bi(columns.length === 1 ? 'column published' : 'columns published', `칼럼 ${columns.length}개 게시됨`)} · <a href="/columns">${bi('View', '보기')}</a></p>
  </section>
  ` : ''}
  ${section === 'sermons' ? `
  <section class="panel">
    <h2>${bi('Upload a sermon', '설교 업로드')}</h2>
    <form id="sermon-upload-form" method="post" action="/admin/sermons" enctype="multipart/form-data" class="form" data-audio-upload data-upload-url="/admin/sermons/audio">
      <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
      <input type="hidden" name="stagedAudio">
      <label>${bi('Title', '제목')}<textarea name="title" rows="2" required maxlength="140" aria-label="Title · 제목"></textarea></label>
      ${speakerFields({}, pastors)}
      ${serviceField()}
      <label>${bi('Date', '날짜')}<input type="date" name="date" value="${today}" required aria-label="Date · 날짜"></label>
      ${scriptureField()}
      <label>${bi('Sermon Overview', '설교 개요')}<textarea name="description" rows="27" maxlength="10000" aria-label="Sermon Overview · 설교 개요"></textarea></label>
      <label>${bi('Audio file', '오디오 파일')} <small>(MP3, M4A, WAV, OGG · up to 200 MB · 최대 200MB)</small><input type="file" name="audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac" required aria-label="Audio file · 오디오 파일"></label>
      <progress data-audio-progress id="sermon-upload-progress" max="100" hidden aria-label="Audio upload progress · 오디오 업로드 진행 상태"></progress>
      <p data-audio-status id="sermon-upload-status" role="status" aria-live="polite"></p>
      <button data-audio-submit id="sermon-upload-submit" class="btn btn-primary" type="submit">${bi('Upload sermon', '설교 업로드')}</button>
    </form>
    <p class="count">${sermons.length} ${bi(sermons.length === 1 ? 'sermon published' : 'sermons published', `설교 ${sermons.length}개 게시됨`)} · <a href="/sermons">${bi('View', '보기')}</a></p>
  </section>
  ` : ''}
  ${section === 'home' ? `
  <section class="panel">
    <h2>${bi('Pastors', '목사')}</h2>
    <ul class="admin-list">${pastors.map((p) => `<li>${esc(p.en)} · ${esc(p.ko)}
      <form method="post" action="/admin/pastors/${esc(p.id)}/delete" data-confirm="Remove this pastor from the list? Existing sermons will not change. · 목록에서 이 목사를 삭제하시겠습니까? 기존 설교는 변경되지 않습니다.">
        <input type="hidden" name="_csrf" value="${esc(csrfToken)}"><button class="btn-link danger" type="submit">${bi('Remove', '삭제')}</button>
      </form></li>`).join('')}</ul>
    <form method="post" action="/admin/pastors" class="form">
      <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
      <label>${bi('Name (English)', '이름 (영어)')}<input name="en" maxlength="100" required aria-label="Name in English · 이름 (영어)"></label>
      <label>${bi('Name (Korean)', '이름 (한국어)')}<input name="ko" maxlength="100" required aria-label="Name in Korean · 이름 (한국어)"></label>
      <button class="btn btn-ghost" type="submit">${bi('Add pastor', '목사 추가')}</button>
    </form>
  </section>
  ${admins ? adminsPanel({ admins, invite, csrfToken }) : ''}` : ''}
</div>
<script src="/scripts/admin.js" defer></script>`;
}

function galleryCaption(photo) {
  return `<span class="gallery-caption">${photo.captionEn ? `<span lang="en">${esc(photo.captionEn)}</span>` : ''}${photo.captionKo ? `<span lang="ko">${esc(photo.captionKo)}</span>` : ''}</span>`;
}

function galleryImage(photo, thumbnail = true) {
  return `/gallery/photos/${encodeURIComponent(photo.id)}/${encodeURIComponent(thumbnail ? photo.thumbnail : photo.file)}`;
}

function galleryCaptionFields(photo = {}) {
  return `<label>${bi('Caption (English)', '사진 설명 (영어)')}<textarea name="captionEn" rows="3" maxlength="1000" aria-label="Caption in English · 사진 설명 (영어)">${esc(photo.captionEn)}</textarea></label>
    <label>${bi('Caption (Korean)', '사진 설명 (한국어)')}<textarea name="captionKo" rows="3" maxlength="1000" aria-label="Caption in Korean · 사진 설명 (한국어)">${esc(photo.captionKo)}</textarea></label>`;
}

function galleryDraft(photo = {}) {
  return `<article class="panel gallery-draft" data-draft-id="${esc(photo.id)}">
    <img class="gallery-preview" ${photo.id ? `src="/admin/gallery/uploads/${encodeURIComponent(photo.id)}/preview"` : ''} alt="Uploaded photo · 업로드한 사진">
    <p data-photo-name class="meta"></p>
    ${galleryCaptionFields(photo)}
  </article>`;
}

export function galleryPage({ photos, pager, admin, openPhotoId = '' }) {
  return `<section class="page-head"><h1>${bi('Gallery', '갤러리')}</h1><p class="lede">${bi('Photos from our church family.', '교회 공동체의 사진을 만나 보세요.')}</p></section>
    ${admin ? `<p><a class="btn btn-ghost" href="/admin/gallery">${bi('Manage gallery', '갤러리 관리')}</a></p>` : ''}
    ${photos.length ? `<section class="gallery-grid">${photos.map((photo) => {
      const alt = photo.captionEn || photo.captionKo || 'Church photo · 교회 사진';
      return `<figure class="panel gallery-photo" id="gallery-photo-${esc(photo.id)}">
        <a href="/gallery/${encodeURIComponent(photo.id)}" data-gallery-photo data-photo-id="${esc(photo.id)}" data-gallery-image="${galleryImage(photo, false)}" aria-label="${esc(`View photo · 사진 보기: ${alt}`)}">
          <img src="${galleryImage(photo)}" alt="${esc(alt)}" loading="lazy" decoding="async" width="${photo.width}" height="${photo.height}">
        </a>
        <figcaption>${galleryCaption(photo)}</figcaption>
      </figure>`;
    }).join('')}</section>` : `<p class="empty">${bi('No photos have been shared yet. Please check back soon.', '아직 게시된 사진이 없습니다. 조금 뒤에 다시 확인해 주세요.')}</p>`}
    ${pagination(pager, '/gallery')}
    <dialog class="gallery-viewer" aria-label="Photo viewer · 사진 보기" data-page="${pager.current}" data-pages="${pager.pages}" data-open-photo="${esc(openPhotoId)}">
      <div class="gallery-viewer-controls">
        <button class="btn btn-ghost" type="button" data-gallery-previous>${bi('← Previous photo', '← 이전 사진')}</button>
        <form method="dialog"><button class="btn btn-ghost" autofocus>${bi('Close', '닫기')}</button></form>
        <button class="btn btn-ghost" type="button" data-gallery-next>${bi('Next photo →', '다음 사진 →')}</button>
      </div>
      <p data-gallery-viewer-status role="status" aria-live="polite"></p>
      <img alt=""><div class="gallery-viewer-caption"></div>
    </dialog>
    <script src="/scripts/gallery.js" defer></script>`;
}

export function adminGalleryPage({ photos, drafts, pager, csrfToken, notice }) {
  const messages = {
    published: ['Photos published.', '사진이 게시되었습니다.'],
    saved: ['Captions saved.', '사진 설명이 저장되었습니다.'],
    replaced: ['Photo replaced. Captions preserved.', '사진이 교체되었습니다. 설명은 유지됩니다.'],
    ordered: ['Photo order saved.', '사진 순서가 저장되었습니다.'],
  };
  return `<section class="page-head"><h1>${bi('Manage gallery', '갤러리 관리')}</h1>
    <p><a href="/admin">${bi('Admin panel', '관리자 페이지')}</a> · <a href="/gallery">${bi('View gallery', '갤러리 보기')}</a></p></section>
    ${messages[notice] ? `<p class="notice" role="status">${bi(...messages[notice])}</p>` : ''}
    <noscript><p class="alert">${bi('Enable JavaScript to upload and preview photos. Caption editing works without JavaScript.', '사진 업로드와 미리보기를 위해 자바스크립트를 활성화해 주세요. 설명 수정은 자바스크립트 없이 가능합니다.')}</p></noscript>
    <section class="panel gallery-upload" data-gallery-upload>
      <h2>${bi('Upload photos', '사진 업로드')}</h2>
      <p>${bi('Up to 100 photos per batch. JPEG, PNG, WebP, HEIC, or HEIF; 20 MB and 40 megapixels per photo. Uploads stay private until published and expire after one hour.', '한 번에 최대 100장. JPEG, PNG, WebP, HEIC 또는 HEIF; 사진당 최대 20MB, 4천만 화소. 게시 전에는 비공개이며 업로드 후 한 시간이 지나면 만료됩니다.')}</p>
      <label class="form">${bi('Choose photos', '사진 선택')}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" multiple data-gallery-files aria-label="Choose up to 100 photos · 사진 최대 100장 선택"></label>
      <progress data-gallery-progress max="100" value="0" hidden aria-label="Photo upload progress · 사진 업로드 진행 상태"></progress>
      <p data-gallery-status role="status" aria-live="polite"></p>
      <ul data-gallery-errors class="alert" hidden></ul>
      <form class="form" data-gallery-publish>
        <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
        <div class="gallery-grid" data-gallery-drafts>${drafts.map(galleryDraft).join('')}</div>
        <button class="btn btn-primary" type="submit"${drafts.length ? '' : ' disabled'}>${bi('Publish reviewed photos', '검토한 사진 게시')}</button>
      </form>
      <template data-gallery-template>${galleryDraft()}</template>
    </section>
    <div class="gallery-published-heading">
      <h2>${bi('Published photos', '게시된 사진')}</h2>
      ${photos.length ? `<p><a class="btn btn-ghost" href="/admin/gallery/reorder">${bi('Reorder photos', '사진 순서 변경')}</a></p>` : ''}
    </div>
    ${photos.length ? `<section class="gallery-grid gallery-edit-grid">${photos.map((photo) => `<article class="panel">
      <img class="gallery-preview" src="${galleryImage(photo)}" alt="${esc(photo.captionEn || photo.captionKo || 'Church photo · 교회 사진')}" loading="lazy">
      <form class="form" method="post" action="/admin/gallery/${esc(photo.id)}/edit">
        <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
        ${galleryCaptionFields(photo)}
        <button class="btn btn-primary" type="submit">${bi('Save captions', '설명 저장')}</button>
      </form>
      <details class="gallery-replace"><summary>${bi('Replace photo', '사진 교체')}</summary>
        <form class="form" method="post" action="/admin/gallery/${esc(photo.id)}/replace" data-gallery-replace>
          <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
          <input type="hidden" name="stagedPhoto">
          <label>${bi('Replacement photo', '교체할 사진')}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" required aria-label="Replacement photo · 교체할 사진"></label>
          <img class="gallery-preview" data-replacement-preview hidden alt="Replacement photo preview · 교체할 사진 미리보기">
          <p role="status" aria-live="polite"></p>
          <button class="btn btn-ghost" type="submit" disabled>${bi('Save replacement (keep captions)', '사진 교체 저장 (설명 유지)')}</button>
        </form>
      </details>
    </article>`).join('')}</section>` : `<p class="empty">${bi('No published photos yet.', '아직 게시된 사진이 없습니다.')}</p>`}
    ${pagination(pager, '/admin/gallery')}
    <script src="/scripts/admin-gallery.js" defer></script>`;
}

export function galleryOrderPage({ photos, revision, csrfToken }) {
  return `<section class="page-head"><h1>${bi('Reorder photos', '사진 순서 변경')}</h1>
    <p class="lede">${bi('Drag photos into place, use Earlier or Later, or move directly to a numbered position. Save when the order is ready.', '사진을 끌어서 정렬하거나 앞·뒤 이동 버튼 또는 순서 번호를 사용하세요. 정렬을 마친 후 저장해 주세요.')}</p></section>
    <noscript><p class="alert">${bi('Enable JavaScript to reorder photos.', '사진 순서를 변경하려면 자바스크립트를 활성화해 주세요.')}</p></noscript>
    <form class="gallery-order-form" data-gallery-order>
      <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
      <input type="hidden" name="revision" value="${esc(revision)}">
      <div class="gallery-grid gallery-order-grid" data-order-grid>${photos.map((photo, index) => `<article class="panel gallery-order-card" data-order-id="${esc(photo.id)}">
        <div class="gallery-order-heading">
          <span>${bi('Photo', '사진')} <strong data-order-number>${index + 1}</strong></span>
          <button class="btn btn-ghost" type="button" data-order-drag aria-label="Drag photo ${index + 1} · 사진 ${index + 1} 끌어서 이동">${bi('↕ Drag', '↕ 끌기')}</button>
        </div>
        <img src="${galleryImage(photo)}" alt="${esc(photo.captionEn || photo.captionKo || 'Church photo · 교회 사진')}" loading="lazy" decoding="async">
        <div class="gallery-order-caption">${galleryCaption(photo)}</div>
        <div class="gallery-order-steps">
          <button class="btn btn-ghost" type="button" data-order-earlier${index === 0 ? ' disabled' : ''}>${bi('← Earlier', '← 앞으로')}</button>
          <button class="btn btn-ghost" type="button" data-order-later${index === photos.length - 1 ? ' disabled' : ''}>${bi('Later →', '뒤로 →')}</button>
        </div>
        <div class="gallery-order-position">
          <label>${bi('Move to position', '이동할 순서')}<input type="number" data-order-position value="${index + 1}" min="1" max="${photos.length}" step="1" aria-label="Move photo ${index + 1} to position · 사진 ${index + 1} 이동할 순서"></label>
          <button class="btn btn-ghost" type="button" data-order-move>${bi('Move', '이동')}</button>
        </div>
      </article>`).join('')}</div>
      ${photos.length ? '' : `<p class="empty">${bi('No published photos yet.', '아직 게시된 사진이 없습니다.')}</p>`}
      <section class="panel gallery-order-save">
        <p data-order-status role="status" aria-live="polite">${bi('No changes yet. Save to publish your order.', '아직 변경 사항이 없습니다. 저장하면 순서가 공개됩니다.')}</p>
        <div class="actions">
          <button class="btn btn-primary" type="submit" data-order-save disabled>${bi('Save order', '순서 저장')}</button>
          <a class="btn btn-ghost" href="/admin/gallery" data-order-cancel>${bi('Cancel', '취소')}</a>
          <a class="btn btn-ghost" href="/admin/gallery/reorder" data-order-reload hidden>${bi('Reload latest gallery', '최신 갤러리 다시 불러오기')}</a>
        </div>
      </section>
    </form>
    <script src="/scripts/admin-gallery.js" defer></script>
    <script src="/scripts/gallery-order.js" defer></script>`;
}

export function messagePage({ title, text }) {
  const translations = {
    'Page not found': '페이지를 찾을 수 없습니다',
    'We could not find that page, but you are always welcome here.': '요청하신 페이지를 찾을 수 없습니다. 언제든 이곳에 다시 오세요.',
    'Something went wrong': '문제가 발생했습니다',
    'Please try again in a moment.': '잠시 후 다시 시도해 주세요.',
  };
  return `<section class="narrow panel"><h1>${translations[title] ? bi(title, translations[title]) : esc(title)}</h1><p>${translations[text] ? bi(text, translations[text]) : esc(text)}</p><p><a class="btn btn-primary" href="/">${bi('Return home', '홈으로 돌아가기')}</a></p></section>`;
}

export function formatDate(iso, locale) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString(locale, options);
}
