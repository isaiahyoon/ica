import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as auth from './lib/auth.js';
import { createStore } from './lib/store.js';
import { createAdmins } from './lib/admins.js';
import { mountAdminAuth } from './lib/admin-routes.js';
import * as view from './lib/render.js';
import { formatScriptureReference } from './lib/scripture-links.js';
import { splitBilingual } from './lib/sermon-metadata.js';
import { createSermonPreviewRenderer, sermonPreviewVersion } from './lib/sermon-preview.js';

const root = path.dirname(fileURLToPath(import.meta.url));

const AUDIO = { exts: ['.mp3', '.m4a', '.aac', '.wav', '.ogg'], max: 200 * 1024 * 1024 };

function uploader(dir, { exts, max }, mimePrefix, files) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) =>
        fs.mkdir(dir, { recursive: true }).then(() => cb(null, dir), cb),
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
const speakerFields = (body) => {
  const { en, ko } = body.speakerEn !== undefined || body.speakerKo !== undefined
    ? { en: clean(body.speakerEn, 100), ko: clean(body.speakerKo, 100) }
    : splitBilingual(clean(body.speaker, 100));
  return { speaker: [en, ko].filter(Boolean).join('\n'), speakerEn: en, speakerKo: ko };
};
const removeFiles = (dir, names) => Promise.all(names.map((n) => fs.rm(path.join(dir, n), { force: true })));

export function createApp({
  dataDir = process.env.ICA_DATA_DIR || path.join(root, 'data'),
  uploadDir = process.env.ICA_UPLOAD_DIR || path.join(root, 'uploads'),
  password,
}) {
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
  const renderSermonPreview = createSermonPreviewRenderer();
  const audioDir = path.join(uploadDir, 'audio');
  const stagingDir = path.join(uploadDir, 'staging');
  const stagedUploads = new Map();
  const stagedUploadMaxAge = 60 * 60 * 1000;
  const pub = path.join(root, 'public');
  const loginLimiter = auth.createLoginLimiter();
  const admins = createAdmins(store, password);

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
  app.use('/uploads/audio', express.static(audioDir, { index: false, dotfiles: 'deny' }));

  const page = (req, res, opts) => {
    const admin = auth.isAdmin(req);
    if (admin) res.set('Cache-Control', 'no-store');
    res.send(view.layout({ ...opts, admin, path: req.path }));
  };

  app.get('/', (req, res) => page(req, res, { active: 'home', body: view.homePage() }));

  app.get('/about', (req, res) => page(req, res, { title: 'About', active: 'about', body: view.aboutPage() }));

  app.get('/contact', (req, res) => page(req, res, { title: 'Contact', active: 'contact', body: view.contactPage() }));

  const paginate = (items, req, size) => {
    const pages = Math.max(1, Math.ceil(items.length / size));
    const n = Number.parseInt(req.query.page, 10);
    const current = Math.min(pages, Number.isInteger(n) && n > 0 ? n : 1);
    return { items: items.slice((current - 1) * size, current * size), current, pages };
  };

  const SERMONS_PER_PAGE = 10;
  const sortSermons = (list) => [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));

  app.get('/sermons', async (req, res) => {
    const sermons = sortSermons(await store.read('sermons'));
    const admin = auth.isAdmin(req);
    page(req, res, { title: 'Sermons', active: 'sermons', body: view.sermonsPage({ ...(({ items, ...p }) => ({ sermons: items, pager: p }))(paginate(sermons, req, SERMONS_PER_PAGE)), admin, csrfToken: admin ? auth.csrfToken(req) : '' }) });
  });

  app.get('/sermons/:id/preview.png', async (req, res, next) => {
    try {
      const sermon = (await store.read('sermons')).find((item) => item.id === req.params.id);
      if (!sermon) return res.status(404).type('text').send('Sermon not found. 설교를 찾을 수 없습니다.');
      res.set({
        'Cache-Control': 'public, max-age=0, must-revalidate',
        ETag: `"${sermonPreviewVersion(sermon)}"`,
      });
      if (req.fresh) return res.status(304).end();
      res.type('png').send(await renderSermonPreview(sermon));
    } catch (error) {
      next(error);
    }
  });

  app.get('/sermons/:id', async (req, res) => {
    const sermon = (await store.read('sermons')).find((item) => item.id === req.params.id);
    if (!sermon) {
      return res.status(404).send(view.layout({
        title: 'Not found', admin: auth.isAdmin(req),
        path: req.path,
        body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }),
      }));
    }
    const admin = auth.isAdmin(req);
    page(req, res, {
      title: sermon.title, active: 'sermons',
      description: sermon.scripture ? formatScriptureReference(sermon.scripture) : 'Listen to this sermon. 설교를 들어 보세요.',
      previewImage: `https://immanuelchurchofamerica.org/sermons/${encodeURIComponent(sermon.id)}/preview.png?v=${sermonPreviewVersion(sermon)}`,
      previewImageAlt: [sermon.title, formatScriptureReference(sermon.scripture), sermon.service].filter(Boolean).join(' · '),
      body: view.sermonsPage({
        sermons: [sermon], pager: { current: 1, pages: 1 }, single: true,
        admin, csrfToken: admin ? auth.csrfToken(req) : '',
      }),
    });
  });

  app.get('/admin/login', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (auth.isAdmin(req)) return res.redirect('/admin');
    page(req, res, { title: 'Admin sign in', active: 'admin', body: view.loginPage({}) });
  });

  app.post('/admin/logout', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf, (req, res) => {
    auth.clearSession(req, res);
    res.redirect('/');
  });

  const adminView = async (req, res, status = 200, extra = {}) => {
    const sermons = await store.read('sermons');
    if (auth.isOwner(req)) extra = { ...extra, admins: await admins.list() };
    res.set('Cache-Control', 'no-store');
    res.status(status).send(view.layout({
      title: 'Admin', active: 'admin', admin: true,
      body: view.adminPage({ sermons, csrfToken: auth.csrfToken(req), ...extra }),
    }));
  };

  mountAdminAuth({ app, admins, loginLimiter, adminView, ownerPassword: password });

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

  const expireStagedUploads = async () => {
    const now = Date.now();
    for (const [filename, staged] of stagedUploads) {
      if (staged.expiresAt <= now) {
        stagedUploads.delete(filename);
        await removeFiles(stagingDir, [filename]);
      }
    }

    let entries;
    try {
      entries = await fs.readdir(stagingDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    const active = new Set(stagedUploads.keys());
    for (const entry of entries) {
      if (!entry.isFile() || active.has(entry.name)) continue;
      const details = await fs.stat(path.join(stagingDir, entry.name));
      if (now - details.mtimeMs >= stagedUploadMaxAge) {
        await removeFiles(stagingDir, [entry.name]);
      }
    }
  };

  app.post('/admin/sermons/audio', auth.requireAdmin, auth.requireSameOrigin,
    (req, res, next) => uploader(stagingDir, AUDIO, 'audio/', 1).single('audio')(req, res, (err) => {
      if (!err) return next();
      const text = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Too many files.'
        : err.message;
      res.status(400).json({ error: text });
    }),
    (req, res, next) => {
      (async () => {
        if (!auth.verifyCsrf(req, req.body?._csrf)) {
          if (req.file) await removeFiles(stagingDir, [req.file.filename]);
          return res.status(403).json({ error: 'Request could not be verified. Reload the page and try again.' });
        }
        if (!req.file) return res.status(400).json({ error: 'Choose an audio file.' });

        await expireStagedUploads();
        const sessionId = auth.sessionInfo(req)?.id;
        for (const [filename, staged] of stagedUploads) {
          if (staged.sessionId === sessionId) {
            stagedUploads.delete(filename);
            await removeFiles(stagingDir, [filename]);
          }
        }
        stagedUploads.set(req.file.filename, {
          sessionId,
          expiresAt: Date.now() + stagedUploadMaxAge,
        });
        res.status(201).json({ uploadId: req.file.filename });
      })().catch(next);
    });

  const stagedCleanup = setInterval(() => {
    expireStagedUploads().catch((err) => console.error(err));
  }, 60 * 1000);
  stagedCleanup.unref();
  expireStagedUploads().catch((err) => console.error(err));

  app.post('/admin/sermons', auth.requireAdmin,
    auth.requireSameOrigin,
    handleUpload(uploader(audioDir, AUDIO, 'audio/', 1).single('audio')),
    csrfAfterUpload(audioDir),
    async (req, res) => {
      const title = clean(req.body.title, 140);
      if (!title) {
        if (req.file) await removeFiles(audioDir, [req.file.filename]);
        return adminView(req, res, 400, { error: 'A title is required.' });
      }
      let filename = req.file?.filename;
      if (!filename && typeof req.body.stagedAudio === 'string') {
        const staged = stagedUploads.get(req.body.stagedAudio);
        const sessionId = auth.sessionInfo(req)?.id;
        if (!staged || staged.sessionId !== sessionId || staged.expiresAt <= Date.now()) {
          if (staged && staged.expiresAt <= Date.now()) {
            stagedUploads.delete(req.body.stagedAudio);
            await removeFiles(stagingDir, [req.body.stagedAudio]);
          }
          return adminView(req, res, 400, { error: 'The audio upload expired. Please select it again.' });
        }
        filename = req.body.stagedAudio;
        await fs.rename(path.join(stagingDir, filename), path.join(audioDir, filename));
        stagedUploads.delete(filename);
      }
      if (!filename) return adminView(req, res, 400, { error: 'An audio file is required.' });
      const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date ?? '') ? req.body.date : '';
      await store.update('sermons', (list) => [...list, {
        id: crypto.randomUUID(), title, date,
        ...speakerFields(req.body), service: clean(req.body.service, 100), scripture: clean(req.body.scripture, 100),
        description: clean(req.body.description, 1000),
        file: filename, createdAt: new Date().toISOString(),
      }]);
      res.redirect('/admin?notice=' + encodeURIComponent('Sermon uploaded.'));
    });

  app.post('/admin/sermons/:id/audio', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf, (req, res, next) => {
    (async () => {
      const current = (await store.read('sermons')).find((s) => s.id === req.params.id);
      if (!current) {
        return res.status(404).send(view.layout({
          title: 'Not found', admin: true, path: req.path,
          body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }),
        }));
      }

      const stagedName = req.body.stagedAudio;
      const staged = typeof stagedName === 'string' ? stagedUploads.get(stagedName) : null;
      const sessionId = auth.sessionInfo(req)?.id;
      if (!staged || staged.sessionId !== sessionId || staged.expiresAt <= Date.now()) {
        if (staged && staged.expiresAt <= Date.now()) {
          stagedUploads.delete(stagedName);
          await removeFiles(stagingDir, [stagedName]);
        }
        return adminView(req, res, 400, { error: 'The audio upload expired. Please select it again.' });
      }

      const filename = stagedName;
      await fs.rename(path.join(stagingDir, filename), path.join(audioDir, filename));
      stagedUploads.delete(filename);
      let found = false;
      try {
        await store.update('sermons', (list) => list.map((sermon) => {
          if (sermon.id !== req.params.id) return sermon;
          found = true;
          return { ...sermon, file: filename };
        }));
      } catch (err) {
        await removeFiles(audioDir, [filename]);
        throw err;
      }
      if (!found) {
        await removeFiles(audioDir, [filename]);
        return res.status(404).send(view.layout({
          title: 'Not found', admin: true, path: req.path,
          body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }),
        }));
      }
      await removeFiles(audioDir, [current.file]);
      res.redirect(`/sermons/${encodeURIComponent(req.params.id)}`);
    })().catch(next);
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
        ...speakerFields(req.body), service: clean(req.body.service, 100), scripture: clean(req.body.scripture, 100),
        description: clean(req.body.description, 1000),
      };
    }));
    if (!found) return res.status(next.some((s) => s.id === req.params.id) ? 400 : 404).send(view.layout({ title: 'Not found', admin: true, body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }) }));
    // The list sorts by date, so send the admin to the page where the sermon now sits.
    const index = sortSermons(next).findIndex((s) => s.id === req.params.id);
    const pageNo = Math.floor(index / SERMONS_PER_PAGE) + 1;
    res.redirect(`/sermons${pageNo > 1 ? `?page=${pageNo}` : ''}#sermon-${req.params.id}`);
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

  app.use((req, res) => res.status(404).send(view.layout({
    title: 'Not found', admin: auth.isAdmin(req),
    path: req.path,
    body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }),
  })));

  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).send(view.layout({
      title: 'Error', admin: auth.isAdmin(req),
      path: req.path,
      body: view.messagePage({ title: 'Something went wrong', text: 'Please try again in a moment.' }),
    }));
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { password, generated } = auth.resolveAdminPassword();
  const dataDir = process.env.ICA_DATA_DIR || path.join(root, 'data');
  const uploadDir = process.env.ICA_UPLOAD_DIR || path.join(root, 'uploads');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(path.join(uploadDir, 'audio'), { recursive: true });
  const port = Number(process.env.PORT) || 8100;
  createApp({ dataDir, uploadDir, password }).listen(port, () => {
    console.log(`ICA running at http://localhost:${port}`);
    if (generated) console.log(`Admin password (this run only; set ADMIN_PASSWORD to choose your own): ${password}`);
  });
}
