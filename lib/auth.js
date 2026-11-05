import crypto from 'node:crypto';

const COOKIE = 'ica_admin';
const MAX_AGE_MS = 1000 * 60 * 60 * 8;

// Signing key is per-process: restarting the server signs everyone out.
const secret = crypto.randomBytes(32);

export function resolveAdminPassword(env = process.env) {
  if (env.ADMIN_PASSWORD) return { password: env.ADMIN_PASSWORD, generated: false };
  return { password: crypto.randomBytes(9).toString('base64url'), generated: true };
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
  return safeEqual(input ?? '', expected);
}

export function issueSession(res) {
  const expires = Date.now() + MAX_AGE_MS;
  const value = `${expires}.${sign(String(expires))}`;
  res.cookie(COOKIE, value, { httpOnly: true, sameSite: 'strict', maxAge: MAX_AGE_MS });
}

export function clearSession(res) {
  res.clearCookie(COOKIE);
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((p) => p.trim().split('=')).filter((p) => p.length === 2),
  );
}

export function isAdmin(req) {
  const raw = parseCookies(req.headers.cookie)[COOKIE];
  if (!raw) return false;
  const [expires, mac] = raw.split('.');
  if (!expires || !mac || !safeEqual(mac, sign(expires))) return false;
  return Number(expires) > Date.now();
}

export function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.redirect('/admin/login');
}

// Simple in-memory throttle for login attempts.
const attempts = new Map();
export function loginThrottled(ip) {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(ip, recent);
  return recent.length >= 8;
}
export function recordFailedLogin(ip) {
  attempts.set(ip, [...(attempts.get(ip) ?? []), Date.now()]);
}
