import crypto from 'node:crypto';
import * as auth from './auth.js';
import * as view from './render.js';

const COOKIE = process.env.NODE_ENV === 'production' ? '__Host-ica_reader' : 'ica_reader';
const wrap = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

export function mountColumnEngagement({ app, store, renderPage }) {
  let secretPromise;
  const readerSecret = () => {
    if (!secretPromise) {
      secretPromise = store.update('column-reader-secret', (records) => {
        if (!Array.isArray(records) || records.length > 1 ||
            (records.length && !/^[a-f0-9]{64}$/.test(records[0]?.secret))) {
          throw new Error('Article reader verification secret is invalid.');
        }
        return records.length ? records : [{ secret: crypto.randomBytes(32).toString('hex') }];
      }).then((records) => Buffer.from(records[0].secret, 'hex')).catch((error) => {
        secretPromise = undefined;
        throw error;
      });
    }
    return secretPromise;
  };
  const attempts = new Map();
  const sign = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('hex');
  const likeId = (id, reader) => crypto.createHash('sha256').update(`${id}:${reader}`).digest('hex');
  const cookie = (req) => {
    const part = (req.get('cookie') || '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`));
    const value = part?.slice(COOKIE.length + 1);
    return /^[a-f0-9]{64}$/.test(value || '') ? value : '';
  };
  const checkToken = (secret, reader, token) => {
    if (!reader || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
    return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(sign(secret, `csrf:${reader}`), 'hex'));
  };
  const rateLimit = (req, res, next) => {
    const key = String(req.ip).slice(0, 128);
    const now = Date.now();
    const recent = (attempts.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
    if (recent.length >= 30) return res.status(429).send('Too many requests. Please try again later. · 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    if (!attempts.has(key) && attempts.size >= 10000) attempts.delete(attempts.keys().next().value);
    attempts.set(key, [...recent, now]);
    next();
  };
  const check = (req, res, next) => {
    readerSecret().then((secret) => {
      if (checkToken(secret, cookie(req), req.body?._reader)) return next();
      res.status(403).send('Request could not be verified. Reload the page and try again. · 요청을 확인할 수 없습니다. 페이지를 새로고침해 주세요.');
    }).catch(next);
  };
  const destination = (column, language, status) => `/columns/${encodeURIComponent(column.slug)}?${new URLSearchParams({ ...(language === 'ko' || language === 'en' ? { lang: language } : {}), status })}#article-engagement`;

  const stateFor = (records, id) => {
    let record = records.find((item) => item.id === id);
    if (!record) { record = { id, likes: [], comments: [] }; records.push(record); }
    return record;
  };

  async function get(column, req, res) {
    let reader = cookie(req);
    if (!reader) {
      reader = crypto.randomBytes(32).toString('hex');
      res.cookie(COOKIE, reader, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
    }
    res.set('Cache-Control', 'private, no-store');
    const record = (await store.read('column-engagement')).find((item) => item.id === column.id);
    return {
      token: sign(await readerSecret(), `csrf:${reader}`),
      liked: record?.likes.includes(likeId(column.id, reader)) || false,
      likes: record?.likes.length || 0,
      comments: (record?.comments || []).filter((comment) => comment.approved),
      status: typeof req.query.status === 'string' ? req.query.status : '',
    };
  }

  const requireColumn = async (slug) => (await store.read('columns')).find((column) => column.slug === slug);
  app.post('/columns/:slug/like', auth.requireSameOrigin, rateLimit, check, wrap(async (req, res) => {
    const column = await requireColumn(req.params.slug);
    if (!column) return res.status(404).send('Article not found.');
    const identity = likeId(column.id, cookie(req));
    let full = false;
    await store.update('column-engagement', (records) => {
      const record = stateFor(records, column.id);
      if (!record.likes.includes(identity)) {
        if (record.likes.length >= 100000) full = true;
        else record.likes.push(identity);
      }
      return records;
    });
    if (full) return res.status(503).send('Likes are temporarily unavailable. · 좋아요를 잠시 사용할 수 없습니다.');
    res.redirect(destination(column, req.body.lang, 'liked'));
  }));
  app.post('/columns/:slug/comments', auth.requireSameOrigin, rateLimit, check, wrap(async (req, res) => {
    const column = await requireColumn(req.params.slug);
    if (!column) return res.status(404).send('Article not found.');
    const { name, email = '', comment } = req.body;
    if (typeof name !== 'string' || typeof email !== 'string' || typeof comment !== 'string' ||
        !name.trim() || name.length > 100 || email.length > 254 || !comment.trim() || comment.length > 3000 ||
        /[\x00-\x1f\x7f]/.test(name) || /[\x00-\x1f\x7f]/.test(email) ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(comment) ||
        (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
      return res.status(400).send('Check the name, email, and comment and try again. · 이름, 이메일과 댓글을 확인해 주세요.');
    }
    let full = false;
    await store.update('column-engagement', (records) => {
      const record = stateFor(records, column.id);
      if (record.comments.length >= 5000) full = true;
      else record.comments.push({ id: crypto.randomUUID(), name: name.trim(), email: email.trim(), text: comment.trim(), approved: false, createdAt: new Date().toISOString() });
      return records;
    });
    if (full) return res.status(503).send('Comments are temporarily unavailable. · 댓글을 잠시 사용할 수 없습니다.');
    res.redirect(destination(column, req.body.lang, 'submitted'));
  }));

  app.get('/admin/columns/comments', auth.requireAdmin, wrap(async (req, res) => {
    const columns = await store.read('columns');
    const records = await store.read('column-engagement');
    const comments = records.flatMap((record) => {
      const column = columns.find((item) => item.id === record.id);
      return column ? record.comments.map((comment) => ({ ...comment, column })) : [];
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.set('Cache-Control', 'no-store');
    res.send(renderPage(req, { title: 'Article comments', active: 'admin', admin: true, body: view.columnCommentsAdminPage({ comments, csrfToken: auth.csrfToken(req) }) }));
  }));
  app.post('/admin/columns/comments/:columnId/:commentId/:action', auth.requireAdmin, auth.requireSameOrigin, auth.requireCsrf, wrap(async (req, res) => {
    if (!['approve', 'delete'].includes(req.params.action)) return res.status(404).send('Not found.');
    let found = false;
    await store.update('column-engagement', (records) => {
      const record = records.find((item) => item.id === req.params.columnId);
      const comment = record?.comments.find((item) => item.id === req.params.commentId);
      if (comment) {
        found = true;
        if (req.params.action === 'approve') comment.approved = true;
        else record.comments = record.comments.filter((item) => item.id !== comment.id);
      }
      return records;
    });
    if (!found) return res.status(404).send('Comment not found.');
    res.redirect('/admin/columns/comments');
  }));
  return { get };
}
