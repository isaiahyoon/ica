import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import * as auth from './auth.js';
import * as view from './render.js';

const MAX_PHOTOS = 100;
const PHOTOS_PER_PAGE = 24;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_AGE = 60 * 60 * 1000;
const TYPES = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'], ['.webp', 'image/webp'],
  ['.heic', 'image/heic'], ['.heif', 'image/heif'],
]);

class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function captions(body) {
  const result = {};
  for (const name of ['captionEn', 'captionKo']) {
    const value = body[name] ?? '';
    if (typeof value !== 'string' || value.length > 1000) {
      throw new InputError('Captions must be text of at most 1,000 characters. · 설명은 1,000자 이하로 입력해 주세요.');
    }
    result[name] = value.trim();
  }
  return result;
}

export function mountGallery({ app, store, uploadDir, page, renderPage }) {
  const dir = path.join(uploadDir, 'gallery');
  const tempDir = path.join(uploadDir, 'gallery-staging');
  const run = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch((error) => {
    if (error instanceof InputError) {
      if (req.accepts(['html', 'json']) === 'json') {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(error.status).send(renderPage(req, {
        title: 'Error', admin: auth.isAdmin(req),
        body: view.messagePage({ title: 'Something went wrong', text: error.message }),
      }));
    }
    next(error);
  });
  const remove = (photos) => Promise.all(photos.flatMap((photo) => [photo.file, photo.thumbnail])
    .map((name) => fs.rm(path.join(dir, name), { force: true })));
  const ownedDraft = (photo, req) => photo?.state === 'draft' &&
    photo.sessionId === auth.sessionInfo(req)?.id && photo.expiresAt > Date.now();
  const published = (photos) => photos.filter((photo) => photo.state === 'published')
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
      b.publishedAt.localeCompare(a.publishedAt));
  const orderRevision = (photos) => crypto.createHash('sha256').update(JSON.stringify(photos)).digest('hex');
  const paginated = (photos, req, value = Number.parseInt(req.query.page, 10)) => {
    const pages = Math.max(1, Math.ceil(photos.length / PHOTOS_PER_PAGE));
    const current = Math.min(pages, Number.isInteger(value) && value > 0 ? value : 1);
    return { photos: photos.slice((current - 1) * PHOTOS_PER_PAGE, current * PHOTOS_PER_PAGE), pager: { current, pages } };
  };

  async function cleanup() {
    let expired = [];
    const remaining = await store.update('gallery', (photos) => {
      expired = photos.filter((photo) => photo.state === 'draft' && photo.expiresAt <= Date.now());
      return photos.filter((photo) => !expired.includes(photo));
    });
    await remove(expired);
    const referenced = new Set(remaining.flatMap((photo) => [photo.file, photo.thumbnail]));
    for (const folder of [tempDir, dir]) {
      let files;
      try {
        files = await fs.readdir(folder);
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      for (const name of files) {
        if (folder === dir && referenced.has(name)) continue;
        if (!/^[a-f0-9-]+(?:-thumb)?\.(?:webp|tmp)$/.test(name)) continue;
        const filename = path.join(folder, name);
        try {
          const stat = await fs.stat(filename);
          if (stat.mtimeMs <= Date.now() - MAX_AGE) await fs.rm(filename, { force: true });
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
    }
  }
  const timer = setInterval(() => cleanup().catch((error) => console.error(error)), 60 * 1000);
  timer.unref();
  cleanup().catch((error) => console.error(error));

  app.get('/gallery', run(async (req, res) => {
    page(req, res, {
      title: 'Gallery', active: 'gallery',
      body: view.galleryPage({ ...paginated(published(await store.read('gallery')), req), admin: auth.isAdmin(req) }),
    });
  }));

  app.get('/gallery/photos/:id/:filename', run(async (req, res) => {
    const photo = (await store.read('gallery')).find((item) => item.id === req.params.id && item.state === 'published');
    if (!photo || ![photo.file, photo.thumbnail].includes(req.params.filename)) {
      throw new InputError('Photo not found. · 사진을 찾을 수 없습니다.', 404);
    }
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path.join(dir, req.params.filename));
  }));

  app.get('/gallery/:id', run(async (req, res) => {
    const photos = published(await store.read('gallery'));
    const index = photos.findIndex((photo) => photo.id === req.params.id);
    if (index < 0) throw new InputError('Photo not found. · 사진을 찾을 수 없습니다.', 404);
    page(req, res, {
      title: 'Gallery', active: 'gallery',
      body: view.galleryPage({
        ...paginated(photos, req, Math.floor(index / PHOTOS_PER_PAGE) + 1),
        admin: auth.isAdmin(req), openPhotoId: req.params.id,
      }),
    });
  }));

  app.get('/admin/gallery', auth.requireAdmin, run(async (req, res) => {
    await cleanup();
    const photos = await store.read('gallery');
    res.set('Cache-Control', 'no-store');
    res.send(renderPage(req, {
      title: 'Gallery', active: 'admin', admin: true,
      body: view.adminGalleryPage({
        ...paginated(published(photos), req),
        drafts: photos.filter((photo) => ownedDraft(photo, req)),
        csrfToken: auth.csrfToken(req), notice: req.query.notice,
      }),
    }));
  }));

  app.get('/admin/gallery/reorder', auth.requireAdmin, run(async (req, res) => {
    const photos = published(await store.read('gallery'));
    res.set('Cache-Control', 'no-store');
    res.send(renderPage(req, {
      title: 'Gallery', active: 'admin', admin: true, wide: true,
      body: view.galleryOrderPage({ photos, revision: orderRevision(photos), csrfToken: auth.csrfToken(req) }),
    }));
  }));

  app.post('/admin/gallery/order', auth.requireAdmin, auth.requireSameOrigin,
    express.json({ limit: '512kb' }), auth.requireCsrf, run(async (req, res) => {
      const { ids, revision } = req.body;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') ||
          new Set(ids).size !== ids.length || typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) {
        throw new InputError('Submit each published photo exactly once. · 게시된 사진을 각각 한 번씩 선택해 주세요.');
      }
      await store.update('gallery', (photos) => {
        const current = published(photos);
        if (orderRevision(current) !== revision) {
          throw new InputError('The gallery changed while you were arranging photos. Reload the latest gallery before saving. · 사진을 정렬하는 동안 갤러리가 변경되었습니다. 최신 갤러리를 다시 불러온 후 저장해 주세요.', 409);
        }
        const positions = new Map(ids.map((id, index) => [id, index]));
        if (current.length !== ids.length || current.some((photo) => !positions.has(photo.id))) {
          throw new InputError('Submit each published photo exactly once. · 게시된 사진을 각각 한 번씩 선택해 주세요.');
        }
        return photos.map((photo) => photo.state === 'published' ? { ...photo, order: positions.get(photo.id) } : photo);
      });
      res.json({ location: '/admin/gallery?notice=ordered' });
    }));

  app.get('/admin/gallery/uploads/:id/preview', auth.requireAdmin, run(async (req, res) => {
    const photo = (await store.read('gallery')).find((item) => item.id === req.params.id);
    if (!ownedDraft(photo, req)) throw new InputError('Upload expired or not found. · 업로드가 만료되었거나 없습니다.', 404);
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(dir, photo.thumbnail));
  }));

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => fs.mkdir(tempDir, { recursive: true }).then(() => cb(null, tempDir), cb),
      filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.tmp`),
    }),
    limits: { fileSize: MAX_BYTES, files: MAX_PHOTOS, fields: 0 },
    fileFilter: (_req, file, cb) => {
      const type = TYPES.get(path.extname(file.originalname).toLowerCase());
      const heif = type === 'image/heic' || type === 'image/heif';
      const valid = type && (type === file.mimetype ||
        (heif && ['image/heic', 'image/heif', 'application/octet-stream'].includes(file.mimetype)));
      cb(valid ? null : new InputError('Choose JPEG, PNG, WebP, HEIC, or HEIF photos. · JPEG, PNG, WebP, HEIC 또는 HEIF 사진을 선택해 주세요.'), Boolean(valid));
    },
  }).array('photos', MAX_PHOTOS);

  async function processPhoto(file) {
    let image;
    let metadata;
    let full;
    const heif = ['.heic', '.heif'].includes(path.extname(file.originalname).toLowerCase());
    try {
      image = sharp(file.path, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
      metadata = await image.metadata();
      const expectedFormat = heif ? 'heif' : file.mimetype === 'image/jpeg' ? 'jpeg' : file.mimetype.slice(6);
      if (metadata.format !== expectedFormat || (metadata.pages ?? 1) !== 1) {
        throw new InputError('Only still JPEG, PNG, WebP, HEIC, or HEIF photos are supported. · 정지 JPEG, PNG, WebP, HEIC 또는 HEIF 사진만 지원합니다.');
      }
      if (heif) {
        if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) {
          throw new InputError('That photo is invalid, damaged, or exceeds 40 megapixels. · 사진이 손상되었거나 올바르지 않거나 4천만 화소를 초과합니다.');
        }
      } else {
        full = await image.rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
      }
    } catch (error) {
      if (error instanceof InputError) throw error;
      if (/Input|unsupported|corrupt|invalid|bad|premature|image|pixel|decode|header|read error/i.test(error.message)) {
        throw new InputError('That photo is invalid, damaged, or exceeds 40 megapixels. · 사진이 손상되었거나 올바르지 않거나 4천만 화소를 초과합니다.');
      }
      throw error;
    }
    if (heif) {
      full = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./gallery-heif-worker.js', import.meta.url), {
          workerData: { path: file.path, maxPixels: MAX_PIXELS },
        });
        let received = false;
        worker.once('message', (result) => {
          received = true;
          if (result.invalid) {
            reject(new InputError('That HEIC or HEIF photo could not be decoded. · HEIC 또는 HEIF 사진을 읽을 수 없습니다.'));
          } else {
            resolve({ data: Buffer.from(result.data), info: result.info });
          }
        });
        worker.once('error', reject);
        worker.once('exit', (code) => {
          if (!received) reject(new Error(`HEIF decoder stopped unexpectedly (exit ${code}).`));
        });
      });
    }
    const id = crypto.randomUUID();
    const photo = {
      id, file: `${id}.webp`, thumbnail: `${id}-thumb.webp`,
      width: full.info.width, height: full.info.height,
      captionEn: '', captionKo: '', state: 'draft',
    };
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, photo.file), full.data);
      await sharp(full.data).resize(480, 480, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 }).toFile(path.join(dir, photo.thumbnail));
      return photo;
    } catch (error) {
      await remove([photo]);
      throw error;
    }
  }

  app.post('/admin/gallery/uploads', auth.requireAdmin, auth.requireSameOrigin,
    (req, res, next) => {
      if (!auth.verifyCsrf(req, req.get('x-csrf-token'))) {
        return res.status(403).json({ error: 'Request could not be verified. · 요청을 확인할 수 없습니다.' });
      }
      next();
    },
    (req, res, next) => upload(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError || error instanceof InputError) {
        const message = error.code === 'LIMIT_FILE_SIZE'
          ? 'Each photo must be at most 20 MB. · 사진당 최대 20MB입니다.'
          : error instanceof InputError ? error.message : 'Upload at most 100 photos, with no extra fields. · 추가 입력란 없이 사진을 최대 100장 업로드해 주세요.';
        return res.status(400).json({ error: message });
      }
      next(error);
    }),
    run(async (req, res) => {
      const files = req.files ?? [];
      const processed = [];
      try {
        if (!files.length) throw new InputError('Choose at least one photo. · 사진을 한 장 이상 선택해 주세요.');
        for (const file of files) processed.push(await processPhoto(file));
        const sessionId = auth.sessionInfo(req)?.id;
        if (!sessionId) throw new InputError('Sign in again. · 다시 로그인해 주세요.', 403);
        await store.update('gallery', (photos) => {
          if (photos.filter((photo) => ownedDraft(photo, req)).length + processed.length > MAX_PHOTOS) {
            throw new InputError('Publish your current batch before uploading more than 100 photos. · 100장을 초과하기 전에 현재 사진들을 게시해 주세요.');
          }
          return [...photos, ...processed.map((photo) => ({
            ...photo, sessionId, expiresAt: Date.now() + MAX_AGE,
          }))];
        });
      } catch (error) {
        await remove(processed);
        throw error;
      } finally {
        await Promise.all(files.map((file) => fs.rm(file.path, { force: true })));
      }
      res.status(201).json({ photos: processed.map((photo) => ({
        id: photo.id, preview: `/admin/gallery/uploads/${photo.id}/preview`,
      })) });
    }));

  app.post('/admin/gallery/publish', auth.requireAdmin, auth.requireSameOrigin,
    express.json({ limit: '512kb' }), auth.requireCsrf, run(async (req, res) => {
      const entries = req.body.photos;
      if (!Array.isArray(entries) || !entries.length || entries.length > MAX_PHOTOS ||
          entries.some((entry) => !entry || typeof entry.id !== 'string') ||
          new Set(entries.map((entry) => entry.id)).size !== entries.length) {
        throw new InputError('Choose 1–100 distinct uploaded photos. · 서로 다른 업로드 사진을 1~100장 선택해 주세요.');
      }
      const details = new Map(entries.map((entry) => [entry.id, captions(entry)]));
      await store.update('gallery', (photos) => {
        if (entries.some((entry) => !ownedDraft(photos.find((photo) => photo.id === entry.id), req))) {
          throw new InputError('An upload expired or is unavailable. Reload and upload it again. · 업로드가 만료되었거나 없습니다. 새로고침 후 다시 업로드해 주세요.');
        }
        const publishedAt = new Date().toISOString();
        const next = photos.map((photo) => {
          if (!details.has(photo.id)) return photo;
          const { sessionId, expiresAt, ...saved } = photo;
          return { ...saved, ...details.get(photo.id), state: 'published', publishedAt };
        });
        const ordered = [
          ...next.filter((photo) => details.has(photo.id)),
          ...published(photos),
        ];
        const positions = new Map(ordered.map((photo, index) => [photo.id, index]));
        return next.map((photo) => photo.state === 'published' ? { ...photo, order: positions.get(photo.id) } : photo);
      });
      res.json({ location: '/admin/gallery?notice=published' });
    }));

  app.post('/admin/gallery/:id/edit', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf,
    run(async (req, res) => {
      const details = captions(req.body);
      await store.update('gallery', (photos) => {
        if (!photos.some((photo) => photo.id === req.params.id && photo.state === 'published')) {
          throw new InputError('Photo not found. · 사진을 찾을 수 없습니다.', 404);
        }
        return photos.map((photo) => photo.id === req.params.id ? { ...photo, ...details } : photo);
      });
      res.redirect('/admin/gallery?notice=saved');
    }));

  app.post('/admin/gallery/:id/replace', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf,
    run(async (req, res) => {
      let previous;
      await store.update('gallery', (photos) => {
        previous = photos.find((photo) => photo.id === req.params.id && photo.state === 'published');
        const draft = photos.find((photo) => photo.id === req.body.stagedPhoto);
        if (!previous) throw new InputError('Photo not found. · 사진을 찾을 수 없습니다.', 404);
        if (!ownedDraft(draft, req)) throw new InputError('Upload expired or not found. · 업로드가 만료되었거나 없습니다.');
        return photos.filter((photo) => photo.id !== draft.id).map((photo) => photo.id === previous.id ? {
          ...photo, file: draft.file, thumbnail: draft.thumbnail, width: draft.width, height: draft.height,
        } : photo);
      });
      await remove([previous]);
      res.redirect('/admin/gallery?notice=replaced');
    }));

  app.use('/admin/gallery', (error, _req, res, next) => {
    if (error.type === 'entity.too.large' || error.type === 'entity.parse.failed') {
      return res.status(error.status).json({ error: 'Invalid or oversized request. · 요청이 올바르지 않거나 너무 큽니다.' });
    }
    next(error);
  });
}
