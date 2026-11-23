import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import * as auth from './auth.js';
import * as view from './render.js';
import { ColumnInputError, columnHasContent, columnPlainText, mapColumnImages, parseColumnDocument, validColumnUrl } from './column-content.js';
import { columnPreviewVersion, createColumnPreviewRenderer } from './column-preview.js';
import { mountColumnEngagement } from './column-engagement.js';

const COLUMNS_PER_PAGE = 10;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const IMAGE_TYPES = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.webp', 'image/webp'], ['.avif', 'image/avif'],
]);
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';

const clean = (value, limit) => String(value ?? '').trim().slice(0, limit);
const revision = (column) => crypto.createHash('sha256').update(JSON.stringify(column)).digest('hex');
const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

function field(body, name, limit) {
  const value = body[name] ?? '';
  if (typeof value !== 'string' || value.length > limit) {
    throw new ColumnInputError('An article field is invalid or too long. · 기사 입력값이 올바르지 않거나 너무 깁니다.');
  }
  return value.trim();
}

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

export function mountColumns({ app, store, uploadDir, page, renderPage, readPastors }) {
  const dir = path.join(uploadDir, 'columns');
  const renderPreview = createColumnPreviewRenderer();
  const engagement = mountColumnEngagement({ app, store, renderPage });
  const stagingDir = path.join(uploadDir, 'columns-staging');
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
  const imageNames = (column) => [column.image, ...(column.inlineImages ?? [])].filter(Boolean);

  const richUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => fs.mkdir(stagingDir, { recursive: true }).then(() => cb(null, stagingDir), cb),
      filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.tmp`),
    }),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 11, fields: 20, fieldSize: 300_000 },
    fileFilter: (_req, file, cb) => {
      const expected = IMAGE_TYPES.get(path.extname(file.originalname).toLowerCase());
      const valid = expected && expected === file.mimetype;
      cb(valid ? null : new ColumnInputError('Choose a JPEG, PNG, WebP, or AVIF image. · JPEG, PNG, WebP 또는 AVIF 이미지를 선택해 주세요.'), Boolean(valid));
    },
  }).fields([{ name: 'image', maxCount: 1 }, { name: 'inlineImages', maxCount: 10 }]);

  async function saveImage(file, generated) {
    let data;
    try {
      const image = sharp(file.path, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' });
      const metadata = await image.metadata();
      const format = file.mimetype === 'image/jpeg' ? 'jpeg' : file.mimetype === 'image/avif' ? 'heif' : file.mimetype.slice(6);
      if (metadata.format !== format || (metadata.pages ?? 1) !== 1 ||
          !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
          (file.mimetype === 'image/avif' && metadata.compression !== 'av1')) {
        throw new ColumnInputError('Choose a valid still image under 40 megapixels. · 4천만 화소 이하의 올바른 정지 이미지를 선택해 주세요.');
      }
      data = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    } catch (error) {
      if (error instanceof ColumnInputError) throw error;
      if (/Input|unsupported|corrupt|invalid|bad|premature|image|pixel|decode|header|read error/i.test(error.message)) {
        throw new ColumnInputError('That image is invalid, damaged, or too large. · 이미지가 손상되었거나 올바르지 않거나 너무 큽니다.');
      }
      throw error;
    }
    await fs.mkdir(dir, { recursive: true });
    const name = `${crypto.randomUUID()}.webp`;
    generated.push(name);
    await fs.writeFile(path.join(dir, name), data, { flag: 'wx' });
    return name;
  }

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

  app.get('/columns/:slug/preview.png', wrap(async (req, res) => {
    const column = (await store.read('columns')).find((item) => item.slug === req.params.slug);
    if (!column) return res.status(404).type('text').send('Article not found.');
    const language = req.query.lang === 'ko' ? 'ko' : 'en';
    res.set({ 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: `"${columnPreviewVersion(column, language)}"` });
    if (req.fresh) return res.status(304).end();
    res.type('png').send(await renderPreview(column, language));
  }));

  app.get('/columns/:slug', async (req, res) => {
    const columns = await store.read('columns');
    const column = columns.find((item) => item.slug === req.params.slug);
    if (!column) {
      return res.status(404).send(renderPage(req, {
        title: 'Not found', admin: auth.isAdmin(req), path: req.path,
        body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }),
      }));
    }
    const language = req.query.lang === 'ko' || req.query.lang === 'en' ? req.query.lang : '';
    const korean = language === 'ko' && Boolean(column.titleKo || column.bodyKo || columnHasContent(column.bodyKoDoc));
    const previewLanguage = korean ? 'ko' : 'en';
    const title = korean ? column.titleKo || column.titleEn : column.titleEn || column.titleKo;
    const author = korean ? column.speakerKo || column.speakerEn : column.speakerEn || column.speakerKo;
    const date = column.date ? view.formatDate(column.date, korean ? 'ko-KR' : 'en-US') : '';
    const previewImage = `https://immanuelchurchofamerica.org/columns/${encodeURIComponent(column.slug)}/preview.png?lang=${previewLanguage}&v=${columnPreviewVersion(column, previewLanguage)}`;
    page(req, res, {
      title,
      active: 'columns',
      path: `${req.path}${language ? `?lang=${language}` : ''}`,
      description: [author, date, korean ? column.excerptKo : column.excerptEn].filter(Boolean).join(' · ') || 'Read a pastoral column. 목회 칼럼을 읽어 보세요.',
      previewImage,
      previewImageAlt: [title, author, date].filter(Boolean).join(' · '),
      body: view.columnPage({
        column,
        language,
        engagement: await engagement.get(column, req, res),
        admin: auth.isAdmin(req),
        csrfToken: auth.isAdmin(req) ? auth.csrfToken(req) : '',
      }),
    });
  });

  app.get('/columns/images/:filename', async (req, res) => {
    const columns = await store.read('columns');
    const column = columns.find((item) => imageNames(item).includes(req.params.filename));
    if (!column) return res.status(404).type('text').send('Image not found.');
    res.type(path.extname(req.params.filename).slice(1)).sendFile(path.join(dir, req.params.filename));
  });

  app.get('/admin/columns/new', auth.requireAdmin, wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.send(renderPage(req, { title: 'New article', active: 'admin', admin: true, body: view.columnEditorPage({ csrfToken: auth.csrfToken(req), pastors: await readPastors() }) }));
  }));

  app.get('/admin/columns/:id/edit', auth.requireAdmin, wrap(async (req, res) => {
    const column = (await store.read('columns')).find((item) => item.id === req.params.id);
    if (!column) return res.status(404).send(renderPage(req, { title: 'Not found', admin: true, body: view.messagePage({ title: 'Page not found', text: 'We could not find that page, but you are always welcome here.' }) }));
    res.set('Cache-Control', 'no-store');
    res.send(renderPage(req, { title: 'Edit article', active: 'admin', admin: true, body: view.columnEditorPage({ column, csrfToken: auth.csrfToken(req), revision: revision(column), pastors: await readPastors() }) }));
  }));

  const richCsrf = (req, res, next) => auth.verifyCsrf(req, req.get('x-csrf-token'))
    ? next() : res.status(403).json({ error: 'Request could not be verified. Reload the page and try again. · 요청을 확인할 수 없습니다. 페이지를 새로고침한 후 다시 시도해 주세요.' });
  const receiveRich = (req, res, next) => richUpload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError || error instanceof ColumnInputError) {
      return res.status(400).json({ error: error instanceof ColumnInputError ? error.message : 'Too many files or an upload is too large. · 파일이 너무 많거나 업로드 크기가 너무 큽니다.' });
    }
    next(error);
  });

  const saveRich = wrap(async (req, res) => {
    const files = [...(req.files?.image ?? []), ...(req.files?.inlineImages ?? [])];
    const generated = [];
    let saved = false;
    try {
      const current = req.params.id ? (await store.read('columns')).find((item) => item.id === req.params.id) : null;
      if (req.params.id && !current) throw new ColumnInputError('Article not found. · 기사를 찾을 수 없습니다.', 404);
      if (current && field(req.body, 'revision', 64) !== revision(current)) throw new ColumnInputError('This article changed while you were editing. Reload before saving. · 수정하는 동안 기사가 변경되었습니다. 새로고침한 후 저장해 주세요.', 409);
      const titleEn = field(req.body, 'titleEn', 180);
      const titleKo = field(req.body, 'titleKo', 180);
      if (!titleEn && !titleKo) throw new ColumnInputError('Enter an article title. · 기사 제목을 입력해 주세요.');
      const excerptEn = field(req.body, 'excerptEn', 500);
      const excerptKo = field(req.body, 'excerptKo', 500);
      const speakerEn = field(req.body, 'speakerEn', 100);
      const speakerKo = field(req.body, 'speakerKo', 100);
      const date = field(req.body, 'date', 10);
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ColumnInputError('Enter a valid date. · 올바른 날짜를 입력해 주세요.');
      const videoUrl = field(req.body, 'videoUrl', 1000);
      if (videoUrl && !validColumnUrl(videoUrl)) throw new ColumnInputError('Enter a valid video link. · 올바른 영상 링크를 입력해 주세요.');
      const en = parseColumnDocument(req.body.bodyEnDoc);
      const ko = parseColumnDocument(req.body.bodyKoDoc);
      const refs = new Set([...en.images, ...ko.images]);
      if (refs.size > 10) throw new ColumnInputError('An article can contain up to 10 images. · 기사에는 이미지를 최대 10개까지 넣을 수 있습니다.');
      const supplied = new Map();
      for (const file of req.files?.inlineImages ?? []) {
        const match = file.originalname.match(new RegExp(`^(${UUID})\\.(jpg|jpeg|png|webp|avif)$`, 'i'));
        if (!match || supplied.has(`new:${match[1]}`)) throw new ColumnInputError('An image upload is invalid. · 이미지 업로드가 올바르지 않습니다.');
        supplied.set(`new:${match[1]}`, file);
      }
      for (const ref of refs) {
        if (ref.startsWith('new:') ? !supplied.has(ref) : !(current?.inlineImages ?? []).includes(ref)) {
          throw new ColumnInputError('An article image is missing or unavailable. · 기사 이미지가 없거나 사용할 수 없습니다.');
        }
      }
      if ([...supplied.keys()].some((ref) => !refs.has(ref))) throw new ColumnInputError('Remove unused image uploads before saving. · 저장하기 전에 사용하지 않는 이미지 업로드를 제거해 주세요.');
      const replacements = new Map();
      for (const [ref, file] of supplied) replacements.set(ref, await saveImage(file, generated));
      const cover = req.files?.image?.[0];
      if (cover && req.body.removeImage) throw new ColumnInputError('Choose either a replacement or removal for the cover image. · 대표 이미지를 교체하거나 삭제하는 것 중 하나를 선택해 주세요.');
      const image = cover ? await saveImage(cover, generated) : req.body.removeImage ? '' : current?.image ?? '';
      const bodyEnDoc = mapColumnImages(en.nodes, replacements);
      const bodyKoDoc = mapColumnImages(ko.nodes, replacements);
      const values = {
        titleEn, titleKo, excerptEn, excerptKo, speakerEn, speakerKo, date, videoUrl, image,
        bodyEn: columnPlainText(bodyEnDoc), bodyKo: columnPlainText(bodyKoDoc), bodyEnDoc, bodyKoDoc,
        inlineImages: [...refs].map((ref) => replacements.get(ref) ?? ref),
      };
      let result;
      await store.update('columns', (columns) => {
        if (current) {
          const index = columns.findIndex((column) => column.id === current.id);
          if (index < 0) throw new ColumnInputError('Article not found. · 기사를 찾을 수 없습니다.', 404);
          if (revision(columns[index]) !== req.body.revision) throw new ColumnInputError('This article changed while you were editing. Reload before saving. · 수정하는 동안 기사가 변경되었습니다. 새로고침한 후 저장해 주세요.', 409);
          result = { ...columns[index], ...values };
          return columns.map((column, i) => i === index ? result : column);
        }
        const base = slugify(titleEn || titleKo);
        let slug = base;
        let suffix = 2;
        while (columns.some((column) => column.slug === slug)) slug = `${base}-${suffix++}`;
        result = { id: crypto.randomUUID(), slug, ...values, createdAt: new Date().toISOString() };
        return [...columns, result];
      });
      saved = true;
      if (current) {
        const retained = new Set(imageNames(result));
        await Promise.all(imageNames(current).filter((name) => !retained.has(name)).map(removeImage));
      }
      res.json({ location: `/columns/${encodeURIComponent(result.slug)}` });
    } catch (error) {
      if (error instanceof ColumnInputError) return res.status(error.status).json({ error: error.message });
      throw error;
    } finally {
      await Promise.all(files.map((file) => fs.rm(file.path, { force: true })));
      if (!saved) await Promise.all(generated.map(removeImage));
    }
  });

  app.post('/admin/columns/rich', auth.requireAdmin, auth.requireSameOrigin, richCsrf, receiveRich, saveRich);
  app.post('/admin/columns/:id/edit', auth.requireAdmin, auth.requireSameOrigin, richCsrf, receiveRich, saveRich);

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

  app.post('/admin/columns/:id/delete', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf, wrap(async (req, res) => {
    let images = [];
    await store.update('columns', (columns) => {
      const column = columns.find((item) => item.id === req.params.id);
      if (column) images = imageNames(column);
      return columns.filter((item) => item.id !== req.params.id);
    });
    await store.update('column-engagement', (records) => records.filter((record) => record.id !== req.params.id));
    await Promise.all(images.map(removeImage));
    res.redirect('/columns');
  }));
}
