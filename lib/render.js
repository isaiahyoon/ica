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
  <p class="eyebrow" lang="ko">미주 임마누엘 교회</p>
  <h1>${bi('Immanuel Church of America', '미주 임마누엘 교회')}</h1>
  <p class="lede">${bi('A family gathered around the Word of God. Come as you are — you are welcome here.', '하나님의 말씀 안에 모인 가족 공동체입니다. 있는 모습 그대로 오세요. 따뜻하게 환영합니다.')}</p>
  <div class="actions">
    <a class="btn btn-hero btn-lavender" href="/sermons">${bi('Listen to a sermon', '설교 듣기')}</a>
    <a class="btn btn-hero btn-pink" href="/gallery">${bi('See our life together', '우리의 공동체 모습 보기')}</a>
    <a class="btn btn-hero btn-yellow" href="/contact">${bi('Contact', '연락처')}</a>
  </div>
  <blockquote class="hero-verse">${bi('“Immanuel, which being interpreted is, God with us.”', '“이를 번역한즉 하나님이 우리와 함께 계시다 함이라”')}<cite>Matthew 1:23 · 마태복음 1:23</cite></blockquote>
</section>

<section class="cornerstone">
  <p class="eyebrow">${bi('The cornerstone', '모퉁잇돌')}</p>
  <blockquote>${bi('“Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.”', '“예수께서 가라사대 내가 곧 길이요 진리요 생명이니 나로 말미암지 않고는 아버지께로 올 자가 없느니라”')}<cite>John 14:6 · KJV · 요한복음 14:6 · 개역한글</cite></blockquote>
</section>`;
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

export function sermonsPage({ sermons, pager, admin, csrfToken }) {
  const list = sermons.length
    ? sermons.map((s) => `
    <article class="sermon" id="sermon-${esc(s.id)}">
      <div class="sermon-head">
        <h3>${esc(s.title)}</h3>
        <p class="meta">${[s.speaker, s.date && formatDate(s.date)].filter(Boolean).map(esc).join(' · ')}</p>
      </div>
      ${s.scripture ? `<p class="scripture">${esc(s.scripture)}</p>` : ''}
      ${s.description ? `<p>${esc(s.description)}</p>` : ''}
      <audio controls preload="none" src="/uploads/audio/${encodeURIComponent(s.file)}"></audio>
      <p><a class="share-link" href="/sermons${pager.current > 1 ? `?page=${pager.current}` : ''}#sermon-${esc(s.id)}" data-copied="Link copied · 링크 복사됨">${bi('Share link', '공유 링크')}</a></p>
      ${admin ? deleteForm('/admin/sermons/' + s.id + '/delete', 'sermon', csrfToken) : ''}
    </article>`).join('')
    : `<p class="empty">${bi('No sermons have been shared yet. Please check back soon.', '아직 나눈 설교가 없습니다. 조금 뒤에 다시 확인해 주세요.')}</p>`;
  return `
<section class="page-head"><p class="eyebrow">${bi('The Word', '말씀')}</p><h1>${bi('Sermons', '설교')}</h1><p class="lede">${bi('Listen to messages from our church family.', '교회 공동체가 나눈 말씀을 들어 보세요.')}</p></section>
<section class="stack">${list}</section>
${pagination(pager, '/sermons')}
<script>
document.addEventListener('click', async (e) => {
  const a = e.target.closest('.share-link');
  if (!a || !navigator.clipboard) return;
  e.preventDefault();
  const url = new URL(a.getAttribute('href'), location.origin).href;
  try { await navigator.clipboard.writeText(url); } catch { location.href = a.href; return; }
  const old = a.innerHTML;
  a.textContent = a.dataset.copied;
  setTimeout(() => { a.innerHTML = old; }, 2000);
});
</script>`;
}

export function galleryPage({ photos, pager, admin, csrfToken }) {
  const grid = photos.length
    ? `<ul class="gallery">${photos.map((p) => `
    <li>
      <a href="/uploads/photos/${encodeURIComponent(p.file)}" target="_blank" rel="noopener">
        <img src="/uploads/photos/${encodeURIComponent(p.file)}" alt="${esc(p.caption || 'Church photo · 교회 사진')}" loading="lazy">
      </a>
      ${p.caption ? `<p>${esc(p.caption)}</p>` : ''}
      ${admin ? `<form method="post" action="/admin/photos/${p.id}/edit" class="form"><input type="hidden" name="_csrf" value="${esc(csrfToken)}"><input name="caption" value="${esc(p.caption || '')}" maxlength="200" aria-label="Caption · 설명"><button class="btn btn-ghost" type="submit">${bi('Save caption', '설명 저장')}</button></form>` : ''}
      ${admin ? deleteForm('/admin/photos/' + p.id + '/delete', 'photo', csrfToken) : ''}
    </li>`).join('')}</ul>`
    : `<p class="empty">${bi('No photos yet. Please check back soon.', '아직 사진이 없습니다. 조금 뒤에 다시 확인해 주세요.')}</p>`;
  return `
<section class="page-head"><p class="eyebrow">${bi('Together', '함께')}</p><h1>${bi('Gallery', '사진 갤러리')}</h1><p class="lede">${bi('Glimpses of worship, fellowship, and joy.', '예배와 교제, 기쁨의 순간을 만나 보세요.')}</p></section>
${grid}
${photos.length ? `<dialog class="lightbox" aria-label="Photo viewer · 사진 보기">
  <button type="button" class="lightbox-close" aria-label="Close · 닫기">×</button>
  <button type="button" class="lightbox-nav prev" aria-label="Previous photo · 이전 사진">‹</button>
  <figure><img alt=""><figcaption></figcaption></figure>
  <button type="button" class="lightbox-nav next" aria-label="Next photo · 다음 사진">›</button>
</dialog>
<script>
(() => {
  const dlg = document.querySelector('.lightbox');
  const img = dlg.querySelector('img');
  const cap = dlg.querySelector('figcaption');
  const links = [...document.querySelectorAll('.gallery li > a')];
  let i = 0;
  const show = (n) => {
    i = (n + links.length) % links.length;
    const a = links[i].querySelector('img');
    img.src = links[i].href;
    img.alt = a.alt;
    cap.textContent = links[i].closest('li').querySelector('p')?.textContent || '';
    dlg.querySelectorAll('.lightbox-nav').forEach((b) => { b.hidden = links.length < 2; });
  };
  links.forEach((a, n) => a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || !dlg.showModal) return;
    e.preventDefault();
    show(n);
    dlg.showModal();
  }));
  dlg.querySelector('.lightbox-close').addEventListener('click', () => dlg.close());
  dlg.querySelector('.prev').addEventListener('click', () => show(i - 1));
  dlg.querySelector('.next').addEventListener('click', () => show(i + 1));
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.tagName === 'FIGURE') dlg.close(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'ArrowRight') show(i + 1);
  });
  dlg.addEventListener('close', () => { img.removeAttribute('src'); });
})();
</script>` : ''}
${pagination(pager, '/gallery')}`;
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
      <label>${bi('Photos', '사진')} <small>(JPG, PNG, WebP, GIF · up to 15 MB each, 50 at once · 파일당 최대 15MB, 한 번에 50개)</small><input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/gif" multiple required aria-label="Photos · 사진"></label>
      <label>${bi('Caption', '설명')} <small>(optional, default for all · 선택 사항, 모든 사진의 기본값)</small><input name="caption" maxlength="200" aria-label="Caption · 설명"></label>
      <div id="photo-captions" class="photo-upload-list" role="list" aria-label="Photo captions and previews · 사진 설명 및 미리보기" hidden></div>
      <button class="btn btn-primary" type="submit">${bi('Upload photos', '사진 업로드')}</button>
    </form>
    <script>
    (() => {
      const input = document.querySelector('input[name=photos]');
      const box = document.getElementById('photo-captions');
      let previewUrls = [];
      input.addEventListener('change', () => {
        previewUrls.forEach((url) => URL.revokeObjectURL(url));
        previewUrls = [];
        box.replaceChildren();
        box.hidden = input.files.length === 0;
        for (const file of input.files) {
          const row = document.createElement('div');
          row.className = 'photo-upload-item';
          row.setAttribute('role', 'listitem');
          const figure = document.createElement('figure');
          const img = document.createElement('img');
          const url = URL.createObjectURL(file);
          previewUrls.push(url);
          img.src = url;
          img.alt = 'Preview of ' + file.name;
          const filename = document.createElement('figcaption');
          filename.textContent = file.name;
          figure.append(img, filename);
          const label = document.createElement('label');
          label.append('Caption · 설명');
          const field = document.createElement('input');
          field.name = 'captions'; field.maxLength = 200; field.placeholder = 'Caption (optional) · 설명 (선택)';
          field.setAttribute('aria-label', 'Caption for ' + file.name);
          label.append(field);
          row.append(figure, label);
          box.append(row);
        }
      });
      window.addEventListener('pagehide', () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), { once: true });
    })();
    </script>
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
