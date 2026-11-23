import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import * as auth from './auth.js';
import * as view from './render.js';

const COLUMNS_PER_PAGE = 10;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);

function slugify(value) {
  const base = String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'column';
}

export function mountColumns({ app, store, uploadDir, page, renderPage }) {
  const dir = path.join(uploadDir, 'columns');
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => fs.mkdir(dir, { recursive: true }).then(() => cb(null, dir), cb),
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ok = ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(path.extname(file.originalname).toLowerCase()) &&
        ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.mimetype);
      cb(ok ? null : new Error('That image type is not supported.'), ok);
    },
  });

  const removeImage = (name) => name ? fs.rm(path.join(dir, name), { force: true }) : Promise.resolve();

  const paginate = (items, req) => {
    const pages = Math.max(1, Math.ceil(items.length / COLUMNS_PER_PAGE));
    const parsed = Number.parseInt(req.query.page, 10);
    const current = Math.min(pages, Number.isInteger(parsed) && parsed > 0 ? parsed : 1);
    return { items: items.slice((current - 1) * COLUMNS_PER_PAGE, current * COLUMNS_PER_PAGE), pager: { current, pages } };
  };

  app.get('/columns', async (req, res) => {
    const columns = [...await store.read('columns')].sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
    const { items, pager } = paginate(columns, req);
    page(req, res, {
      title: 'Pastoral Columns',
      active: 'columns',
      body: view.columnsPage({ columns: items, pager, admin: auth.isAdmin(req), csrfToken: auth.isAdmin(req) ? auth.csrfToken(req) : '' }),
    });
  });

  app.get('/columns/:slug', async (req, res) => {
    const columns = await store.read('columns');
    const column = columns.find((item) => item.slug === req.params.slug);
    if (!column) {
      return res.status(404).send(renderPage(req, {
        title: 'Not found', admin: auth.isAdmin(req), path: req.path,
        body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }),
      }));
    }
    page(req, res, {
      title: column.titleEn || column.titleKo,
      active: 'columns',
      description: column.excerptEn || column.excerptKo || 'Read a pastoral column. 목회 칼럼을 읽어 보세요.',
      previewImage: column.image ? `https://immanuelchurchofamerica.org/columns/images/${encodeURIComponent(column.image)}` : undefined,
      body: view.columnPage({
        column,
        admin: auth.isAdmin(req),
        csrfToken: auth.isAdmin(req) ? auth.csrfToken(req) : '',
      }),
    });
  });

  app.get('/columns/images/:filename', async (req, res) => {
    const columns = await store.read('columns');
    const column = columns.find((item) => item.image === req.params.filename);
    if (!column) return res.status(404).type('text').send('Image not found.');
    res.type(path.extname(req.params.filename).slice(1)).sendFile(path.join(dir, req.params.filename));
  });

  app.post('/admin/columns', auth.requireAdmin, auth.requireSameOrigin,
    upload.single('image'),
    async (req, res, next) => {
      if (!auth.verifyCsrf(req, req.body?._csrf)) {
        if (req.file) await fs.rm(path.join(dir, req.file.filename), { force: true });
        return res.status(403).send('Request could not be verified. Reload the page and try again.');
      }
      try {
        const titleEn = clean(req.body.titleEn, 180);
        const titleKo = clean(req.body.titleKo, 180);
        if (!titleEn && !titleKo) {
          if (req.file) await fs.rm(path.join(dir, req.file.filename), { force: true });
          return res.status(400).send(renderPage(req, {
            title: 'Error', admin: true,
            body: view.messagePage({ title: 'A title is required.', text: 'Please enter the title in English or Korean.' }),
          }));
        }

        let image = '';
        if (req.file) {
          const source = path.join(dir, req.file.filename);
          const target = path.join(dir, `${path.parse(req.file.filename).name}.webp`);
          await sharp(source).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(target);
          await fs.rm(source, { force: true });
          image = path.basename(target);
        }

        const baseSlug = slugify(titleEn || titleKo);
        await store.update('columns', (columns) => {
          let slug = baseSlug;
          let suffix = 2;
          while (columns.some((column) => column.slug === slug)) slug = `${baseSlug}-${suffix++}`;
          columns.push({
            id: crypto.randomUUID(),
            slug,
            titleEn,
            titleKo,
            excerptEn: clean(req.body.excerptEn, 500),
            excerptKo: clean(req.body.excerptKo, 500),
            bodyEn: clean(req.body.bodyEn, 50000),
            bodyKo: clean(req.body.bodyKo, 50000),
            videoUrl: clean(req.body.videoUrl, 1000),
            date: /^\d{4}-\d{2}-\d{2}$/.test(req.body.date ?? '') ? req.body.date : '',
            image,
            createdAt: new Date().toISOString(),
          });
          return columns;
        });
        res.redirect('/columns');
      } catch (error) {
        if (req.file) await fs.rm(path.join(dir, req.file.filename), { force: true }).catch(() => {});
        next(error);
      }
    });

  app.post('/admin/columns/:id/delete', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf, async (req, res) => {
    let image = '';
    await store.update('columns', (columns) => {
      const column = columns.find((item) => item.id === req.params.id);
      if (column) image = column.image;
      return columns.filter((item) => item.id !== req.params.id);
    });
    await removeImage(image);
    res.redirect('/columns');
  });
}
