const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const bi = (en, ko) => `<span class="bilingual"><span lang="en">${esc(en)}</span><span lang="ko">${esc(ko)}</span></span>`;

const MESSAGE_TRANSLATIONS = new Map([
  ['Too many attempts. Please wait a few minutes.', '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'],
  ['That password was not correct.', '비밀번호가 올바르지 않습니다.'],
  ['That file is too large.', '파일 크기가 너무 큽니다.'],
  ['Too many files.', '파일이 너무 많습니다.'],
  ['That file type is not supported.', '지원하지 않는 파일 형식입니다.'],
  ['A title and an audio file are required.', '제목과 오디오 파일을 입력해 주세요.'],
  ['Please choose at least one photo.', '사진을 하나 이상 선택해 주세요.'],
  ['Sermon uploaded.', '설교가 업로드되었습니다.'],
]);

function messageMarkup(message) {
  if (typeof message !== 'string') return bi(message.en, message.ko);
  const photoUpload = message.match(/^(\d+) photo\(s\) added\.$/);
  const korean = MESSAGE_TRANSLATIONS.get(message) ??
    (photoUpload ? `사진 ${photoUpload[1]}장이 추가되었습니다.` : null);
  return korean ? bi(message, korean) : esc(message);
}

const NAV = [
  { href: '/', label: ['Welcome', '환영합니다'], key: 'home' },
  { href: '/sermons', label: ['Sermons', '설교'], key: 'sermons' },
  { href: '/gallery', label: ['Gallery', '사진 갤러리'], key: 'gallery' },
  { href: '/contact', label: ['Contact', '연락처'], key: 'contact' },
];

export function layout({ title, active, admin, body, wide = false }) {
  const koreanTitle = {
    Sermons: '설교',
    Gallery: '사진 갤러리',
    Contact: '연락처',
    'Admin sign in': '관리자 로그인',
    Admin: '관리자',
    'Not found': '페이지를 찾을 수 없습니다',
    Error: '오류',
  };
  const full = title
    ? `${title}${koreanTitle[title] ? ` · ${koreanTitle[title]}` : ''} · Immanuel Church of America · 미주 임마누엘 교회`
    : 'Immanuel Church of America · 미주 임마누엘 교회';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#183f70">
<title>${esc(full)}</title>
<meta name="description" content="A welcoming church family. Listen to sermons and see life together. 따뜻한 환대가 있는 교회 공동체입니다. 설교를 듣고 함께하는 모습을 만나 보세요.">
<link rel="icon" href="/favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400&family=Noto+Sans+KR:wght@400&family=Noto+Serif+KR:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<a class="skip" href="#main">${bi('Skip to content', '본문으로 건너뛰기')}</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="Immanuel Church of America, 미주 임마누엘 교회">
    <img class="brand-mark" src="/favicon.png" alt="" aria-hidden="true">
    <span class="brand-text"><strong>Immanuel</strong><small>${bi('Church of America', '미주 임마누엘 교회')}</small></span>
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
  <p class="ko">미주 임마누엘 교회</p>
  <p>${bi('Immanuel Church of America', '미주 임마누엘 교회')}</p>
  <p class="verse">${bi('“God with us.”', '“하나님이 우리와 함께 계시다 함이라')} <span class="reference">— Matthew 1:23 · 마태복음 1:23</span></p>
</footer>
</body>
</html>`;
}

export function homePage() {
  return `
<section class="hero">
  <p class="eyebrow" lang="ko">미주 임마누엘 교회</p>
  <h1>${bi('Immanuel Church of America', '미주 임마누엘 교회')}</h1>
  <p class="lede">${bi('A family gathered around the Word of God. Come as you are — you are welcome here.', '하나님의 말씀 안에 모인 가족 공동체입니다. 있는 모습 그대로 오세요. 따뜻하게 환영합니다.')}</p>
  <div class="actions">
    <a class="btn btn-primary" href="/sermons">${bi('Listen to a sermon', '설교 듣기')}</a>
    <a class="btn btn-ghost" href="/gallery">${bi('See our life together', '우리의 공동체 모습 보기')}</a>
  </div>
  <blockquote class="hero-verse">${bi('“Immanuel, which being interpreted is, God with us.”', '“이를 번역한즉 하나님이 우리와 함께 계시다 함이라”')}<cite>Matthew 1:23 · 마태복음 1:23</cite></blockquote>
</section>

<section class="cornerstone">
  <p class="eyebrow">${bi('The cornerstone', '모퉁잇돌')}</p>
  <blockquote>${bi('“Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.”', '“예수께서 가라사대 내가 곧 길이요 진리요 생명이니 나로 말미암지 않고는 아버지께로 올 자가 없느니라”')}<cite>John 14:6 · KJV · 요한복음 14:6 · 개역한글</cite></blockquote>
</section>

<section class="section">
  <h2>${bi('Welcome home', '환영합니다')}</h2>
  <div class="cards">
    <article class="card card-blue"><h3>${bi('Worship', '예배')}</h3><p>${bi('Service times and location will be shared here soon.', '예배 시간과 장소 안내를 곧 전해 드리겠습니다.')}</p></article>
    <article class="card card-lavender"><h3>${bi('Sermons', '설교')}</h3><p>${bi('Listen to the Word again, wherever you are.', '어디서든 말씀을 다시 들으실 수 있습니다.')}</p><a href="/sermons">${bi('Browse sermons →', '설교 살펴보기 →')}</a></article>
    <article class="card card-pink"><h3>${bi('Gallery', '사진 갤러리')}</h3><p>${bi('Moments of fellowship, worship, and joy.', '교제와 예배, 기쁨의 순간을 담았습니다.')}</p><a href="/gallery">${bi('View photos →', '사진 보기 →')}</a></article>
    <article class="card card-yellow"><h3>${bi('Connect', '함께하기')}</h3><p>${bi('Contact details and ways to join our family are coming soon.', '연락처와 공동체에 함께하는 방법을 곧 안내해 드리겠습니다.')}</p><a href="/contact">${bi('Contact us →', '연락하기 →')}</a></article>
  </div>
</section>`;
}

export function sermonsPage({ sermons, admin, csrfToken }) {
  const list = sermons.length
    ? sermons.map((s) => `
    <article class="sermon">
      <div class="sermon-head">
        <h3>${esc(s.title)}</h3>
        <p class="meta">${[s.speaker, s.date && formatDate(s.date)].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
      ${s.scripture ? `<p class="scripture">${esc(s.scripture)}</p>` : ''}
      ${s.description ? `<p>${esc(s.description)}</p>` : ''}
      <audio controls preload="none" src="/uploads/audio/${encodeURIComponent(s.file)}"></audio>
      ${admin ? deleteForm('/admin/sermons/' + s.id + '/delete', 'sermon', csrfToken) : ''}
    </article>`).join('')
    : `<p class="empty">${bi('No sermons have been shared yet. Please check back soon.', '아직 나눈 설교가 없습니다. 조금 뒤에 다시 확인해 주세요.')}</p>`;
  return `
<section class="page-head"><p class="eyebrow">${bi('The Word', '말씀')}</p><h1>${bi('Sermons', '설교')}</h1><p class="lede">${bi('Listen to messages from our church family.', '교회 공동체가 나눈 말씀을 들어 보세요.')}</p></section>
<section class="stack">${list}</section>`;
}

export function galleryPage({ photos, admin, csrfToken }) {
  const grid = photos.length
    ? `<ul class="gallery">${photos.map((p) => `
    <li>
      <a href="/uploads/photos/${encodeURIComponent(p.file)}" target="_blank" rel="noopener">
        <img src="/uploads/photos/${encodeURIComponent(p.file)}" alt="${esc(p.caption || 'Church photo · 교회 사진')}" loading="lazy">
      </a>
      ${p.caption ? `<p>${esc(p.caption)}</p>` : ''}
      ${admin ? deleteForm('/admin/photos/' + p.id + '/delete', 'photo', csrfToken) : ''}
    </li>`).join('')}</ul>`
    : `<p class="empty">${bi('No photos yet. Please check back soon.', '아직 사진이 없습니다. 조금 뒤에 다시 확인해 주세요.')}</p>`;
  return `
<section class="page-head"><p class="eyebrow">${bi('Together', '함께')}</p><h1>${bi('Gallery', '사진 갤러리')}</h1><p class="lede">${bi('Glimpses of worship, fellowship, and joy.', '예배와 교제, 기쁨의 순간을 만나 보세요.')}</p></section>
${grid}`;
}

export function contactPage() {
  return `
<section class="page-head"><p class="eyebrow">${bi('Connect', '함께하기')}</p><h1>${bi('Contact', '연락처')}</h1><p class="lede">${bi('We would love to hear from you.', '여러분의 이야기를 기다립니다.')}</p></section>
<section class="panel">
  <h2>${bi('Contact details', '연락처 정보')}</h2>
  <p>${bi('Our address, phone, and email will be shared here soon.', '주소와 전화번호, 이메일을 곧 안내해 드리겠습니다.')}</p>
</section>`;
}

function deleteForm(action, noun, csrfToken) {
  return `<form method="post" action="${action}" onsubmit="return confirm('${noun === 'sermon' ? 'Remove this sermon? 삭제하시겠습니까?' : 'Remove this photo? 삭제하시겠습니까?'}')"><input type="hidden" name="_csrf" value="${esc(csrfToken)}"><button class="btn-link danger" type="submit">${bi('Remove', '삭제')}</button></form>`;
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

export function adminPage({ sermons, photos, csrfToken, notice, error }) {
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
    <form method="post" action="/admin/sermons" enctype="multipart/form-data" class="form">
      <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
      <label>${bi('Title', '제목')}<input name="title" required maxlength="140" aria-label="Title · 제목"></label>
      <label>${bi('Speaker', '설교자')}<input name="speaker" maxlength="100" aria-label="Speaker · 설교자"></label>
      <label>${bi('Date', '날짜')}<input type="date" name="date" value="${today}" aria-label="Date · 날짜"></label>
      <label>${bi('Scripture', '성경 본문')}<input name="scripture" maxlength="100" placeholder="e.g. John 3:16 · 예: 요한복음 3:16" aria-label="Scripture · 성경 본문"></label>
      <label>${bi('Description', '설명')}<textarea name="description" rows="3" maxlength="1000" aria-label="Description · 설명"></textarea></label>
      <label>${bi('Audio file', '오디오 파일')} <small>(MP3, M4A, WAV, OGG · up to 200 MB · 최대 200MB)</small><input type="file" name="audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac" required aria-label="Audio file · 오디오 파일"></label>
      <button class="btn btn-primary" type="submit">${bi('Upload sermon', '설교 업로드')}</button>
    </form>
    <p class="count">${sermons.length} ${bi(sermons.length === 1 ? 'sermon published' : 'sermons published', `설교 ${sermons.length}개 게시됨`)} · <a href="/sermons">${bi('View', '보기')}</a></p>
  </section>
  <section class="panel">
    <h2>${bi('Add photos', '사진 추가')}</h2>
    <form method="post" action="/admin/photos" enctype="multipart/form-data" class="form">
      <input type="hidden" name="_csrf" value="${esc(csrfToken)}">
      <label>${bi('Photos', '사진')} <small>(JPG, PNG, WebP, GIF · up to 15 MB each, 20 at once · 파일당 최대 15MB, 한 번에 20개)</small><input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/gif" multiple required aria-label="Photos · 사진"></label>
      <label>${bi('Caption', '설명')} <small>(optional, applied to all · 선택 사항, 모든 사진에 적용)</small><input name="caption" maxlength="200" aria-label="Caption · 설명"></label>
      <button class="btn btn-primary" type="submit">${bi('Upload photos', '사진 업로드')}</button>
    </form>
    <p class="count">${photos.length} ${bi(photos.length === 1 ? 'photo in gallery' : 'photos in gallery', `갤러리에 사진 ${photos.length}개`)} · <a href="/gallery">${bi('View', '보기')}</a></p>
  </section>
</div>`;
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
