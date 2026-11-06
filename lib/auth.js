import crypto from 'node:crypto';

const COOKIE = process.env.NODE_ENV === 'production' ? '__Host-ica_admin' : 'ica_admin';
const MAX_AGE_MS = 1000 * 60 * 60 * 8;
const PENDING_AGE_MS = 1000 * 60 * 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 8;
const MAX_TRACKED_IPS = 10_000;

function getSessionSecret(env = process.env) {
  const configured = env.ADMIN_SESSION_SECRET;
  if (configured !== undefined) {
    if (Buffer.byteLength(configured) < 32) {
      throw new Error('ADMIN_SESSION_SECRET must be at least 32 bytes.');
    }
    return Buffer.from(configured);
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('ADMIN_SESSION_SECRET must be configured in production.');
  }
  return crypto.randomBytes(32);
}

const secret = getSessionSecret();
const sessions = new Map();

export function resolveAdminPassword(env = process.env) {
  if (env.ADMIN_PASSWORD) {
    assertAdminPassword(env.ADMIN_PASSWORD);
    return { password: env.ADMIN_PASSWORD, generated: false };
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('ADMIN_PASSWORD must be configured in production.');
  }
  return { password: crypto.randomBytes(32).toString('base64url'), generated: true };
}

export function assertAdminPassword(password) {
  if (typeof password !== 'string' || password.trim().length < 16) {
    throw new Error('Admin password must contain at least 16 non-whitespace characters.');
  }
  if (Buffer.byteLength(password) > 1024) {
    throw new Error('Admin password must not exceed 1024 bytes.');
  }
}

function sign(value) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPassword(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string' ||
      input.length > 1024 || !expected) return false;
  return safeEqual(input, expected);
}

function readCookie(header = '') {
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== COOKIE) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

function sessionParts(raw) {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]{43}$/.test(parts[0]) ||
      !/^\d{13}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return null;
  return parts;
}

function validSession(raw) {
  const parts = sessionParts(raw);
  if (!parts) return null;
  const [id, expiry, mac] = parts;
  if (!safeEqual(mac, sign(`${id}.${expiry}`))) return null;
  const expiresAt = Number(expiry);
  const record = sessions.get(id);
  if (expiresAt <= Date.now() || record?.expiresAt !== expiresAt) {
    sessions.delete(id);
    return null;
  }
  return { id, ...record };
}

function expireSessions(now = Date.now()) {
  for (const [id, record] of sessions) {
    if (record.expiresAt <= now) sessions.delete(id);
  }
}

// A "pending" session only proves the password step; it unlocks the code or setup page, never the admin area.
export function issueSession(res, { adminId, owner = false, stage = 'full', pendingSecret } = {}) {
  const now = Date.now();
  expireSessions(now);
  const id = crypto.randomBytes(32).toString('base64url');
  const age = stage === 'full' ? MAX_AGE_MS : PENDING_AGE_MS;
  const expiresAt = now + age;
  sessions.set(id, { expiresAt, adminId, owner, stage, pendingSecret });
  const expiry = String(expiresAt);
  const value = `${id}.${expiry}.${sign(`${id}.${expiry}`)}`;
  res.cookie(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: age,
    expires: new Date(expiresAt),
  });
}

export function sessionInfo(req) {
  return validSession(readCookie(req.headers.cookie));
}

export function dropSession(req) {
  const parts = sessionParts(readCookie(req.headers.cookie));
  if (parts) sessions.delete(parts[0]);
}

export function setPendingSecret(req, pendingSecret) {
  const info = sessionInfo(req);
  if (info) sessions.get(info.id).pendingSecret = pendingSecret;
}

export function revokeAdminSessions(adminId) {
  for (const [id, record] of sessions) {
    if (record.adminId === adminId) sessions.delete(id);
  }
}

export function clearSession(req, res) {
  const raw = readCookie(req.headers.cookie);
  const parts = sessionParts(raw);
  if (parts) sessions.delete(parts[0]);
  res.clearCookie(COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

export function isAdmin(req) {
  return sessionInfo(req)?.stage === 'full';
}

export function isOwner(req) {
  const info = sessionInfo(req);
  return info?.stage === 'full' && info.owner;
}

export function requireOwner(req, res, next) {
  if (isOwner(req)) return next();
  res.status(403).send('Only the owner can do that.');
}

export function csrfToken(req) {
  const raw = readCookie(req.headers.cookie);
  return validSession(raw) ? sign(`csrf:${raw}`) : '';
}

export function verifyCsrf(req, token) {
  const expected = csrfToken(req);
  return typeof token === 'string' && expected !== '' && safeEqual(token, expected);
}

export function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.redirect('/admin/login');
}

export function requireSameOrigin(req, res, next) {
  const origin = req.get('origin') ?? req.get('referer');
  const host = req.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host === host) return next();
    } catch {
      // Reject malformed origin and referer values.
    }
  }
  res.status(403).send('Request could not be verified.');
}

export function requireCsrf(req, res, next) {
  if (verifyCsrf(req, req.body?._csrf)) return next();
  res.status(403).send('Request could not be verified. Reload the page and try again.');
}

export function createLoginLimiter() {
  const attempts = new Map();

  function keyFor(ip) {
    return String(ip ?? 'unknown').slice(0, 128);
  }

  function recentFailures(key, now) {
    const recent = (attempts.get(key) ?? []).filter((time) => now - time < LOGIN_WINDOW_MS);
    if (recent.length) attempts.set(key, recent);
    else attempts.delete(key);
    return recent;
  }

  function reserveIp(key) {
    if (attempts.has(key) || attempts.size < MAX_TRACKED_IPS) return;
    attempts.delete(attempts.keys().next().value);
  }

  return {
    retryAfter(ip) {
      const failures = recentFailures(keyFor(ip), Date.now());
      if (failures.length < LOGIN_LIMIT) return 0;
      return Math.max(1, Math.ceil((failures[0] + LOGIN_WINDOW_MS - Date.now()) / 1000));
    },
    recordFailure(ip) {
      const key = keyFor(ip);
      const recent = recentFailures(key, Date.now());
      reserveIp(key);
      attempts.set(key, [...recent, Date.now()]);
    },
    clear(ip) {
      attempts.delete(keyFor(ip));
    },
  };
}
