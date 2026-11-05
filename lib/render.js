const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const NAV = [
  { href: '/', label: 'Welcome', key: 'home' },
  { href: '/sermons', label: 'Sermons', key: 'sermons' },
  { href: '/gallery', label: 'Gallery', key: 'gallery' },
];

export function layout({ title, active, admin, body, wide = false }) {
  const full = title ? `${title} · Immanuel Church of America` : 'Immanuel Church of America · 미주임마누엘교회';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="Immanuel Church of America — a welcoming church family. Listen to sermons and see life together.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Gelasio:ital,wght@0,400;0,600;0,700;1,400&family=Noto+Serif+KR:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="Immanuel Church of America, home">
    <span class="brand-mark" aria-hidden="true">✝</span>
    <span class="brand-text"><strong>Immanuel</strong><small>Church of America</small></span>
  </a>
  <nav aria-label="Main">
    ${NAV.map((n) => `<a href="${n.href}"${n.key === active ? ' aria-current="page" class="is-active"' : ''}>${n.label}</a>`).join('')}
    ${admin ? `<a href="/admin"${active === 'admin' ? ' aria-current="page" class="is-active"' : ''}>Admin</a>` : ''}
  </nav>
</header>
<main id="main"${wide ? ' class="wide"' : ''}>
${body}
</main>
<footer class="site-footer">
  <p class="ko">미주임마누엘교회</p>
  <p>Immanuel Church of America</p>
  <p class="verse">“God with us.” <span>— Matthew 1:23</span></p>
  <p class="small">${admin ? '<a href="/admin">Admin</a>' : '<a href="/admin/login">Admin sign in</a>'}</p>
</footer>
</body>
</html>`;
}

export function homePage() {
  return `
<section class="hero">
  <p class="eyebrow">미주임마누엘교회</p>
  <h1>Immanuel Church of America</h1>
  <p class="lede">A family gathered around the Word of God. Come as you are — you are welcome here.</p>
  <div class="actions">
    <a class="btn btn-primary" href="/sermons">Listen to a sermon</a>
    <a class="btn btn-ghost" href="/gallery">See our life together</a>
  </div>
  <blockquote class="hero-verse">“Immanuel, which being interpreted is, God with us.”<cite>Matthew 1:23</cite></blockquote>
</section>

<section class="section">
  <h2>Welcome home</h2>
  <div class="cards">
    <article class="card card-blue"><h3>Worship</h3><p>Service times and location will be shared here soon.</p></article>
    <article class="card card-lavender"><h3>Sermons</h3><p>Listen to the Word again, wherever you are.</p><a href="/sermons">Browse sermons →</a></article>
    <article class="card card-pink"><h3>Gallery</h3><p>Moments of fellowship, worship, and joy.</p><a href="/gallery">View photos →</a></article>
    <article class="card card-yellow"><h3>Connect</h3><p>Contact details and ways to join our family are coming soon.</p></article>
  </div>
</section>`;
}

export function sermonsPage({ sermons, admin }) {
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
      ${admin ? deleteForm('/admin/sermons/' + s.id + '/delete', 'sermon') : ''}
    </article>`).join('')
    : '<p class="empty">No sermons have been shared yet. Please check back soon.</p>';
  return `
<section class="page-head"><p class="eyebrow">The Word</p><h1>Sermons</h1><p class="lede">Listen to messages from our church family.</p></section>
<section class="stack">${list}</section>`;
}

export function galleryPage({ photos, admin }) {
  const grid = photos.length
    ? `<ul class="gallery">${photos.map((p) => `
    <li>
      <a href="/uploads/photos/${encodeURIComponent(p.file)}" target="_blank" rel="noopener">
        <img src="/uploads/photos/${encodeURIComponent(p.file)}" alt="${esc(p.caption || 'Church photo')}" loading="lazy">
      </a>
      ${p.caption ? `<p>${esc(p.caption)}</p>` : ''}
      ${admin ? deleteForm('/admin/photos/' + p.id + '/delete', 'photo') : ''}
    </li>`).join('')}</ul>`
    : '<p class="empty">No photos yet. Please check back soon.</p>';
  return `
<section class="page-head"><p class="eyebrow">Together</p><h1>Gallery</h1><p class="lede">Glimpses of worship, fellowship, and joy.</p></section>
${grid}`;
}

function deleteForm(action, noun) {
  return `<form method="post" action="${action}" onsubmit="return confirm('Remove this ${noun}?')"><button class="btn-link danger" type="submit">Remove</button></form>`;
}

export function loginPage({ error }) {
  return `
<section class="narrow panel">
  <h1>Admin sign in</h1>
  ${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
  <form method="post" action="/admin/login" class="form">
    <label>Password<input type="password" name="password" required autofocus autocomplete="current-password"></label>
    <button class="btn btn-primary" type="submit">Sign in</button>
  </form>
</section>`;
}

export function adminPage({ sermons, photos, notice, error }) {
  const today = new Date().toISOString().slice(0, 10);
  return `
<section class="page-head"><p class="eyebrow">Admin</p><h1>Manage content</h1>
  <form method="post" action="/admin/logout"><button class="btn-link" type="submit">Sign out</button></form>
</section>
${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
<div class="admin-grid">
  <section class="panel">
    <h2>Upload a sermon</h2>
    <form method="post" action="/admin/sermons" enctype="multipart/form-data" class="form">
      <label>Title<input name="title" required maxlength="140"></label>
      <label>Speaker<input name="speaker" maxlength="100"></label>
      <label>Date<input type="date" name="date" value="${today}"></label>
      <label>Scripture<input name="scripture" maxlength="100" placeholder="e.g. John 3:16"></label>
      <label>Description<textarea name="description" rows="3" maxlength="1000"></textarea></label>
      <label>Audio file <small>(MP3, M4A, WAV, OGG · up to 200 MB)</small><input type="file" name="audio" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac" required></label>
      <button class="btn btn-primary" type="submit">Upload sermon</button>
    </form>
    <p class="count">${sermons.length} sermon${sermons.length === 1 ? '' : 's'} published · <a href="/sermons">view</a></p>
  </section>
  <section class="panel">
    <h2>Add photos</h2>
    <form method="post" action="/admin/photos" enctype="multipart/form-data" class="form">
      <label>Photos <small>(JPG, PNG, WebP, GIF · up to 15 MB each, 20 at once)</small><input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/gif" multiple required></label>
      <label>Caption <small>(optional, applied to all)</small><input name="caption" maxlength="200"></label>
      <button class="btn btn-primary" type="submit">Upload photos</button>
    </form>
    <p class="count">${photos.length} photo${photos.length === 1 ? '' : 's'} in gallery · <a href="/gallery">view</a></p>
  </section>
</div>`;
}

export function messagePage({ title, text }) {
  return `<section class="narrow panel"><h1>${esc(title)}</h1><p>${esc(text)}</p><p><a class="btn btn-primary" href="/">Return home</a></p></section>`;
}

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
