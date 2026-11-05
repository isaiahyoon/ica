import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as auth from './lib/auth.js';
import { createStore } from './lib/store.js';
import * as view from './lib/render.js';

const root = path.dirname(fileURLToPath(import.meta.url));

const AUDIO = { exts: ['.mp3', '.m4a', '.aac', '.wav', '.ogg'], max: 200 * 1024 * 1024 };
const IMAGE = { exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif'], max: 15 * 1024 * 1024 };

function uploader(dir, { exts, max }, mimePrefix, files) {
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) =>
        cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: max, files },
    fileFilter: (_req, file, cb) => {
      const ok = exts.includes(path.extname(file.originalname).toLowerCase()) &&
        (file.mimetype.startsWith(mimePrefix) || file.mimetype === 'application/octet-stream');
      cb(ok ? null : new Error('That file type is not supported.'), ok);
    },
  });
}

const clean = (s, n) => String(s ?? '').trim().slice(0, n);
const removeFiles = (dir, names) => Promise.all(names.map((n) => fs.rm(path.join(dir, n), { force: true })));

export function createApp({ dataDir = path.join(root, 'data'), uploadDir = path.join(root, 'uploads'), password }) {
  auth.assertAdminPassword(password);
  const app = express();
  const proxyHops = process.env.TRUST_PROXY_HOPS;
  if (proxyHops !== undefined) {
    const hops = Number(proxyHops);
    if (!Number.isSafeInteger(hops) || hops < 1) {
      throw new Error('TRUST_PROXY_HOPS must be a positive integer.');
    }
    app.set('trust proxy', hops);
  }
  const store = createStore(dataDir);
  const audioDir = path.join(uploadDir, 'audio');
  const photoDir = path.join(uploadDir, 'photos');
  const pub = path.join(root, 'public');
  const loginLimiter = auth.createLoginLimiter();

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    if (process.env.NODE_ENV === 'production') {
      res.set('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '10kb', parameterLimit: 30 }));
  app.use(express.static(pub));
  app.use('/uploads', express.static(uploadDir, { index: false, dotfiles: 'deny' }));

  const page = (req, res, opts) => {
    const admin = auth.isAdmin(req);
    if (admin) res.set('Cache-Control', 'no-store');
    res.send(view.layout({ ...opts, admin }));
  };

  app.get('/', (req, res) => page(req, res, { active: 'home', body: view.homePage() }));

  app.get('/contact', (req, res) => page(req, res, { title: 'Contact', active: 'contact', body: view.contactPage() }));

  const paginate = (items, req, size) => {
    const pages = Math.max(1, Math.ceil(items.length / size));
    const n = Number.parseInt(req.query.page, 10);
    const current = Math.min(pages, Number.isInteger(n) && n > 0 ? n : 1);
    return { items: items.slice((current - 1) * size, current * size), current, pages };
  };

  const SERMONS_PER_PAGE = 10;
  const PHOTOS_PER_PAGE = 20;
  const sortSermons = (list) => [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));

  app.get('/sermons', async (req, res) => {
    const sermons = sortSermons(await store.read('sermons'));
    const admin = auth.isAdmin(req);
    page(req, res, { title: 'Sermons', active: 'sermons', body: view.sermonsPage({ ...(({ items, ...p }) => ({ sermons: items, pager: p }))(paginate(sermons, req, SERMONS_PER_PAGE)), admin, csrfToken: admin ? auth.csrfToken(req) : '' }) });
  });

  app.get('/gallery', async (req, res) => {
    const photos = (await store.read('photos')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const admin = auth.isAdmin(req);
    const paged = paginate(photos, req, PHOTOS_PER_PAGE);
    page(req, res, { title: 'Gallery', active: 'gallery', wide: true, body: view.galleryPage({
      photos: paged.items, allPhotos: photos, startIndex: (paged.current - 1) * PHOTOS_PER_PAGE,
      pager: (({ items, ...p }) => p)(paged), admin, csrfToken: admin ? auth.csrfToken(req) : '',
    }) });
  });

  app.get('/admin/login', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (auth.isAdmin(req)) return res.redirect('/admin');
    page(req, res, { title: 'Admin sign in', active: 'admin', body: view.loginPage({}) });
  });

  app.post('/admin/login', auth.requireSameOrigin, (req, res) => {
    const ip = req.ip;
    const retryAfter = loginLimiter.retryAfter(ip);
    if (retryAfter) {
      res.set({ 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) });
      return res.status(429).send(view.layout({ title: 'Admin sign in', body: view.loginPage({ error: 'Too many attempts. Please wait a few minutes.' }) }));
    }
    if (!auth.checkPassword(req.body.password, password)) {
      loginLimiter.recordFailure(ip);
      res.set('Cache-Control', 'no-store');
      return res.status(401).send(view.layout({ title: 'Admin sign in', body: view.loginPage({ error: 'That password was not correct.' }) }));
    }
    loginLimiter.clear(ip);
    auth.issueSession(res);
    res.redirect('/admin');
  });

  app.post('/admin/logout', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf, (req, res) => {
    auth.clearSession(req, res);
    res.redirect('/');
  });

  const adminView = async (req, res, status = 200, extra = {}) => {
    const [sermons, photos] = await Promise.all([store.read('sermons'), store.read('photos')]);
    res.set('Cache-Control', 'no-store');
    res.status(status).send(view.layout({
      title: 'Admin', active: 'admin', admin: true,
      body: view.adminPage({ sermons, photos, csrfToken: auth.csrfToken(req), ...extra }),
    }));
  };

  app.get('/admin', auth.requireAdmin, (req, res) => adminView(req, res, 200, { notice: req.query.notice }));

  // Wrap multer so upload errors (size, type) render a friendly message.
  const handleUpload = (mw) => (req, res, next) =>
    mw(req, res, (err) => {
      if (!err) return next();
      const text = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Too many files.'
        : err.message;
      adminView(req, res, 400, { error: text }).catch(next);
    });
  const csrfAfterUpload = (dir) => async (req, res, next) => {
    if (auth.verifyCsrf(req, req.body?._csrf)) return next();
    const files = [req.file, ...(req.files ?? [])].filter(Boolean).map((file) => file.filename);
    removeFiles(dir, files)
      .then(() => res.status(403).send('Request could not be verified. Reload the page and try again.'))
      .catch(next);
  };

  app.post('/admin/sermons', auth.requireAdmin,
    auth.requireSameOrigin,
    handleUpload(uploader(audioDir, AUDIO, 'audio/', 1).single('audio')),
    csrfAfterUpload(audioDir),
    async (req, res) => {
      const title = clean(req.body.title, 140);
      if (!req.file || !title) {
        if (req.file) await removeFiles(audioDir, [req.file.filename]);
        return adminView(req, res, 400, { error: 'A title and an audio file are required.' });
      }
      const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date ?? '') ? req.body.date : '';
      await store.update('sermons', (list) => [...list, {
        id: crypto.randomUUID(), title, date,
        speaker: clean(req.body.speaker, 100), scripture: clean(req.body.scripture, 100),
        description: clean(req.body.description, 1000),
        file: req.file.filename, createdAt: new Date().toISOString(),
      }]);
      res.redirect('/admin?notice=' + encodeURIComponent('Sermon uploaded.'));
    });

  app.post('/admin/photos', auth.requireAdmin,
    auth.requireSameOrigin,
    handleUpload(uploader(photoDir, IMAGE, 'image/', 50).array('photos', 50)),
    csrfAfterUpload(photoDir),
    async (req, res) => {
      if (!req.files?.length) return adminView(req, res, 400, { error: 'Please choose at least one photo.' });
      const shared = clean(req.body.caption, 200);
      const each = [].concat(req.body.captions ?? []);
      const now = Date.now();
      await store.update('photos', (list) => [...list, ...req.files.map((f, i) => ({
        id: crypto.randomUUID(), caption: clean(each[i], 200) || shared, file: f.filename,
        createdAt: new Date(now + i).toISOString(),
      }))]);
      res.redirect('/admin?notice=' + encodeURIComponent(`${req.files.length} photo(s) added.`));
    });

  app.post('/admin/sermons/:id/edit', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf, async (req, res) => {
    const title = clean(req.body.title, 140);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date ?? '') ? req.body.date : '';
    let found = false;
    const next = await store.update('sermons', (list) => list.map((s) => {
      if (s.id !== req.params.id || !title) return s;
      found = true;
      return {
        ...s, title, date,
        speaker: clean(req.body.speaker, 100), scripture: clean(req.body.scripture, 100),
        description: clean(req.body.description, 1000),
      };
    }));
    if (!found) return res.status(next.some((s) => s.id === req.params.id) ? 400 : 404).send(view.layout({ title: 'Not found', admin: true, body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }) }));
    // The list sorts by date, so send the admin to the page where the sermon now sits.
    const index = sortSermons(next).findIndex((s) => s.id === req.params.id);
    const pageNo = Math.floor(index / SERMONS_PER_PAGE) + 1;
    res.redirect(`/sermons${pageNo > 1 ? `?page=${pageNo}` : ''}#sermon-${req.params.id}`);
  });

  app.post('/admin/photos/:id/edit', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf, async (req, res) => {
    const caption = clean(req.body.caption, 200);
    let found = false;
    await store.update('photos', (list) => list.map((p) => {
      if (p.id !== req.params.id) return p;
      found = true;
      return { ...p, caption };
    }));
    if (!found) return res.status(404).send(view.layout({ title: 'Not found', admin: true, body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }) }));
    res.redirect('/gallery');
  });

  const remove = (name, dir, back) => async (req, res) => {
    let gone = [];
    await store.update(name, (list) => {
      gone = list.filter((x) => x.id === req.params.id).map((x) => x.file);
      return list.filter((x) => x.id !== req.params.id);
    });
    await removeFiles(dir, gone);
    res.redirect(back);
  };
  app.post('/admin/sermons/:id/delete', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf, remove('sermons', audioDir, '/sermons'));
  app.post('/admin/photos/:id/delete', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf, remove('photos', photoDir, '/gallery'));

  app.use((req, res) => res.status(404).send(view.layout({
    title: 'Not found', admin: auth.isAdmin(req),
    body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }),
  })));

  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).send(view.layout({
      title: 'Error', admin: auth.isAdmin(req),
      body: view.messagePage({ title: 'Something went wrong', text: 'Please try again in a moment.' }),
    }));
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { password, generated } = auth.resolveAdminPassword();
  await fs.mkdir(path.join(root, 'uploads/audio'), { recursive: true });
  await fs.mkdir(path.join(root, 'uploads/photos'), { recursive: true });
  const port = Number(process.env.PORT) || 8100;
  createApp({ password }).listen(port, () => {
    console.log(`ICA running at http://localhost:${port}`);
    if (generated) console.log(`Admin password (this run only; set ADMIN_PASSWORD to choose your own): ${password}`);
  });
}
