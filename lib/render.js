import { scriptureLanguageLinks } from './scripture-links.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const SITE_ORIGIN = 'https://immanuelchurchofamerica.org';
const PREVIEW_IMAGE = `${SITE_ORIGIN}/link-preview.png`;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const bi = (en, ko) => `<span class="bilingual"><span lang="en">${esc(en)}</span><span lang="ko">${esc(ko)}</span></span>`;
const koreanLang = (text) => /[\uAC00-\uD7AF]/u.test(text) ? ' lang="ko"' : '';

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
  { href: '/contact', label: ['Contact', '연락처'], key: 'contact' },
];

export function layout({ title, active, admin, body, wide = false, path = '/' }) {
  const koreanTitle = {
    About: '소개',
    Sermons: '설교',
    Contact: '연락처',
    'Admin sign in': '관리자 로그인',
    Admin: '관리자',
    'Not found': '페이지를 찾을 수 없습니다',
    Error: '오류',
  };
  const full = title
    ? `${title}${koreanTitle[title] ? ` · ${koreanTitle[title]}` : ''} · Immanuel Church of America · 미주 임마누엘 교회`
    : 'Immanuel Church of America · 미주 임마누엘 교회';
  const description = 'A welcoming church family. Listen to sermons and connect with us on Instagram. 따뜻한 환대가 있는 교회 공동체입니다. 설교를 듣고 인스타그램에서 교회 소식을 만나 보세요.';
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
<meta property="og:image" content="${PREVIEW_IMAGE}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="An open Bible in golden light before blue stained glass · 성경 위로 비치는 금빛과 푸른 스테인드글라스">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(full)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${PREVIEW_IMAGE}">
<link rel="canonical" href="${esc(canonicalUrl)}">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400&family=Noto+Sans+KR:wght@400&family=Noto+Serif+KR:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
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
  <p class="lede">${bi('A family gathered around the Word of God. Come as you are — you are welcome here.', '하나님의 말씀안에 모인 가족 공동체입니다. 있는 모습 그대로 오세요. 따뜻하게 환영합니다.')}</p>
  <div class="actions">
    <a class="btn btn-hero btn-mint" href="/about">${bi('About our church', '교회 소개')}</a>
    <a class="btn btn-hero btn-lavender" href="/sermons">${bi('Listen to a sermon', '설교 듣기')}</a>
    <a class="btn btn-hero btn-yellow" href="/contact">${bi('Contact', '연락처')}</a>
  </div>
  <blockquote class="hero-verse">${bi('“Immanuel, which being interpreted is, God with us.”', '“이를 번역한즉 하나님이 우리와 함께 계시다 함이라”')}<cite>Matthew 1:23 · 마태복음 1:23</cite></blockquote>
</section>

<section class="cornerstone">
  <p class="eyebrow">${bi('The cornerstone', '모퉁잇돌')}</p>
  <blockquote>${bi('“Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.”', '“예수께서 가라사대 내가 곧 길이요 진리요 생명이니 나로 말미암지 않고는 아버지께로 올 자가 없느니라”')}<cite>John 14:6 · KJV · 요한복음 14:6 · 개역한글</cite></blockquote>
</section>`;
}

export function aboutPage() {
  return `
<div class="contact-page about-page">
<section class="page-head"><p class="eyebrow">${bi('Our church', '우리 교회')}</p><h1>${bi('About', '소개')}</h1><p class="lede">${bi('A family church gathered around the Word of God.', '하나님의 말씀안에 모인 가족 같은 교회입니다.')}</p></section>
<div class="contact-grid">
<section class="panel about-intro">
  <h2>${bi('A family church', '가족 같은 교회')}</h2>
  <p>${bi('We are a family church. Come as you are — you are welcome here.', '본 교회는 한 가족 같습니다. 내 모슴 그대로 환영합니다.')}</p>
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
</section>
<section class="panel">
  <h2>${bi('What we affirm', '우리가 고백하는 신앙')}</h2>
  <p>${bi('We affirm the Apostles’ Creed and the Lord’s Prayer.', '본 교회는 사도신경과 주기도문을 고백합니다.')}</p>
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
  const href = (n) => `${base}?page=${n}`;
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
  return languageLinks
    ? `<details class="scripture-picker"><summary class="scripture"${koreanLang(scripture)}>${esc(scripture)}</summary>${languageLinks}</details>`
    : `<p class="scripture"${koreanLang(scripture)}>${esc(scripture)}</p>`;
}

export function sermonsPage({ sermons, pager, admin, csrfToken, single = false }) {
  const list = sermons.length
    ? sermons.map((s) => `
    <article class="sermon" id="sermon-${esc(s.id)}">
      <div class="sermon-head">
        <h3${koreanLang(s.title)}>${esc(s.title)}</h3>
        <p class="meta">${[s.speaker, s.date && formatDate(s.date)].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
      ${sermonScripture(s.scripture)}
      ${s.description ? `<p>${esc(s.description)}</p>` : ''}
      <audio controls preload="none" src="/uploads/audio/${encodeURIComponent(s.file)}"></audio>
      <div class="sermon-actions">
        <a class="btn btn-ghost sermon-action share-link" href="/sermons/${encodeURIComponent(s.id)}" data-share-title="${esc(s.title)}" data-copied="Link copied · 링크 복사됨">${bi('Share sermon', '설교 공유')}</a>
        <a class="btn btn-ghost sermon-action copy-link" href="/sermons/${encodeURIComponent(s.id)}" data-copied="Link copied · 링크 복사됨">${bi('Copy link', '링크 복사')}</a>
      </div>
      ${admin ? `<details class="sermon-edit"><summary>${bi('Edit details', '정보 수정')}</summary>
        <form method="post" action="/admin/sermons/${esc(s.id)}/edit" class="form">
          <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
          <label>${bi('Title', '제목')}<input name="title" required maxlength="140" value="${esc(s.title)}" aria-label="Title · 제목"></label>
          <label>${bi('Speaker', '설교자')}<input name="speaker" maxlength="100" value="${esc(s.speaker)}" aria-label="Speaker · 설교자"></label>
          <label>${bi('Date', '날짜')}<input type="date" name="date" value="${esc(s.date)}" aria-label="Date · 날짜"></label>
          <label>${bi('Scripture', '성경 본문')}<input name="scripture" maxlength="100" value="${esc(s.scripture)}" aria-label="Scripture · 성경 본문"></label>
          <label>${bi('Description', '설명')}<textarea name="description" rows="3" maxlength="1000" aria-label="Description · 설명">${esc(s.description)}</textarea></label>
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
    : `<p class="empty">${bi('No sermons have been shared yet. Please check back soon.', '아직 나눈 설교가 없습니다. 조금 뒤에 다시 확인해 주세요.')}</p>`;
  return `
<section class="page-head"><p class="eyebrow">${bi('The Word', '말씀')}</p><h1>${bi('Sermons', '설교')}</h1><p class="lede">${bi('Listen to messages from our church family.', '교회 공동체가 나눈 말씀을 들어 보세요.')}</p></section>
${single ? `<p><a class="btn btn-ghost sermon-back" href="/sermons">${bi('All sermons', '모든 설교')}</a></p>` : ''}
<section class="stack">${list}</section>
${single ? '' : pagination(pager, '/sermons')}
${admin ? '<script src="/scripts/admin.js" defer></script>' : ''}
<script src="/scripts/sermon-sharing.js" defer></script>`;
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

export function adminPage({ sermons, csrfToken, notice, error, admins, invite }) {
  const today = new Date().toISOString().slice(0, 10);
  return `
<section class="page-head"><p class="eyebrow">${bi('Admin', '관리자')}</p><h1>${bi('Manage content', '콘텐츠 관리')}</h1>
  <form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${esc(csrfToken)}"><button class="btn-link" type="submit">${bi('Sign out', '로그아웃')}</button></form>
</section>
<p class="meta">${bi('For bilingual posts, include both English and Korean in titles and descriptions.', '두 언어로 게시하려면 제목과 설명에 영어와 한국어를 함께 입력해 주세요.')}</p>
${notice ? `<p class="notice" role="status">${messageMarkup(notice)}</p>` : ''}
${error ? `<p class="alert" role="alert">${messageMarkup(error)}</p>` : ''}
<div class="admin-grid">
  <section class="panel">
    <h2>${bi('Upload a sermon', '설교 업로드')}</h2>
    <form id="sermon-upload-form" method="post" action="/admin/sermons" enctype="multipart/form-data" class="form" data-audio-upload data-upload-url="/admin/sermons/audio">
      <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
      <input type="hidden" name="stagedAudio">
      <label>${bi('Title', '제목')}<input name="title" required maxlength="140" aria-label="Title · 제목"></label>
      <label>${bi('Speaker', '설교자')}<input name="speaker" maxlength="100" aria-label="Speaker · 설교자"></label>
      <label>${bi('Date', '날짜')}<input type="date" name="date" value="${today}" aria-label="Date · 날짜"></label>
      <label>${bi('Scripture', '성경 본문')}<input name="scripture" maxlength="100" placeholder="e.g. John 3:16 · 예: 요한복음 3:16" aria-label="Scripture · 성경 본문"></label>
      <label>${bi('Description', '설명')}<textarea name="description" rows="3" maxlength="1000" aria-label="Description · 설명"></textarea></label>
      <label>${bi('Audio file', '오디오 파일')} <small>(MP3, M4A, WAV, OGG · up to 200 MB · 최대 200MB)</small><input type="file" name="audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac" required aria-label="Audio file · 오디오 파일"></label>
      <progress data-audio-progress id="sermon-upload-progress" max="100" hidden aria-label="Audio upload progress · 오디오 업로드 진행 상태"></progress>
      <p data-audio-status id="sermon-upload-status" role="status" aria-live="polite"></p>
      <button data-audio-submit id="sermon-upload-submit" class="btn btn-primary" type="submit">${bi('Upload sermon', '설교 업로드')}</button>
    </form>
    <p class="count">${sermons.length} ${bi(sermons.length === 1 ? 'sermon published' : 'sermons published', `설교 ${sermons.length}개 게시됨`)} · <a href="/sermons">${bi('View', '보기')}</a></p>
  </section>
  ${admins ? adminsPanel({ admins, invite, csrfToken }) : ''}
</div>
<script src="/scripts/admin.js" defer></script>`;
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

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return `${d.toLocaleDateString('en-US', options)} · ${d.toLocaleDateString('ko-KR', options)}`;
}
