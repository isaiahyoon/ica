import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { checkPassword } from './auth.js';
import { verifyCode } from './totp.js';

const scrypt = promisify(crypto.scrypt);
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_COUNT = 8;
const OWNER_ID = 'owner';

const pick = (length) => Array.from({ length }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const normalizeRecovery = (input) => String(input).replace(/[\s-]/g, '').toUpperCase();
const hashRecovery = (code) => crypto.createHash('sha256').update(normalizeRecovery(code)).digest('hex');

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `${salt.toString('base64url')}.${hash.toString('base64url')}`;
}

async function passwordMatches(password, stored) {
  const [salt, hash] = String(stored ?? '').split('.');
  if (!salt || !hash || typeof password !== 'string' || password.length > 1024) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Temporary sign-in code handed to a new admin: 16 characters in four groups.
export const temporaryCode = () => [pick(4), pick(4), pick(4), pick(4)].join('-');

export function createAdmins(store, ownerPassword) {
  const read = () => store.read('admins');
  const publicView = (a) => ({ id: a.id, name: a.name, owner: Boolean(a.owner), enrolled: Boolean(a.totpSecret) });

  async function ensureOwner() {
    const existing = (await read()).find((a) => a.id === OWNER_ID);
    if (existing) return existing;
    const owner = { id: OWNER_ID, name: 'Owner', owner: true, createdAt: new Date().toISOString() };
    await store.update('admins', (all) => (all.some((a) => a.id === OWNER_ID) ? all : [...all, owner]));
    return (await read()).find((a) => a.id === OWNER_ID);
  }

  async function findByPassword(password) {
    if (typeof password !== 'string') return null;
    let found = checkPassword(password, ownerPassword) ? await ensureOwner() : null;
    for (const admin of await read()) {
      if (admin.owner || !admin.passwordHash) continue;
      if (await passwordMatches(password, admin.passwordHash)) found ??= admin;
    }
    return found;
  }

  async function passwordInUse(password, exceptId) {
    const admin = await findByPassword(password);
    return Boolean(admin && admin.id !== exceptId);
  }

  async function create(name) {
    const code = temporaryCode();
    const admin = {
      id: crypto.randomUUID(), name, passwordHash: await hashPassword(code),
      mustChangePassword: true, createdAt: new Date().toISOString(),
    };
    await store.update('admins', (all) => [...all, admin]);
    return { admin: publicView(admin), code };
  }

  // Clears a person's sign-in so they can set up again with a new temporary code.
  async function reset(id) {
    const code = temporaryCode();
    const passwordHash = await hashPassword(code);
    let target = null;
    await store.update('admins', (all) => all.map((a) => {
      if (a.id !== id || a.owner) return a;
      target = a;
      return { ...a, passwordHash, mustChangePassword: true, totpSecret: undefined, lastStep: undefined, recovery: undefined };
    }));
    return target ? { admin: publicView(target), code } : null;
  }

  async function remove(id) {
    let removed = false;
    await store.update('admins', (all) => {
      const next = all.filter((a) => a.owner || a.id !== id);
      removed = next.length !== all.length;
      return next;
    });
    return removed;
  }

  async function list() {
    return (await read()).map(publicView);
  }

  async function get(id) {
    const admin = (await read()).find((a) => a.id === id);
    return admin ? { ...publicView(admin), mustChangePassword: Boolean(admin.mustChangePassword) } : null;
  }

  // Saves the authenticator secret after the person proves their app works.
  async function enroll(id, { secret, code, newPassword }) {
    const step = verifyCode(secret, code);
    if (step === null) return null;
    const recoveryCodes = Array.from({ length: RECOVERY_COUNT }, () => `${pick(5)}-${pick(5)}`);
    const passwordHash = newPassword ? await hashPassword(newPassword) : undefined;
    let done = false;
    await store.update('admins', (all) => all.map((a) => {
      if (a.id !== id || a.totpSecret) return a;
      done = true;
      return {
        ...a, totpSecret: secret, lastStep: step, recovery: recoveryCodes.map(hashRecovery),
        ...(passwordHash ? { passwordHash, mustChangePassword: false } : {}),
      };
    }));
    return done ? recoveryCodes : null;
  }

  // Accepts an authenticator code (once per time step) or an unused recovery code.
  async function verifySecondStep(id, input) {
    const text = String(input ?? '').replace(/\s/g, '');
    let result = null;
    await store.update('admins', (all) => all.map((a) => {
      if (a.id !== id || !a.totpSecret) return a;
      const step = verifyCode(a.totpSecret, text);
      if (step !== null && step > (a.lastStep ?? 0)) {
        result = { recovery: false };
        return { ...a, lastStep: step };
      }
      const hash = hashRecovery(text);
      if (!/^\d{6}$/.test(text) && (a.recovery ?? []).includes(hash)) {
        const recovery = a.recovery.filter((h) => h !== hash);
        result = { recovery: true, remaining: recovery.length };
        return { ...a, recovery };
      }
      return a;
    }));
    return result;
  }

  return { ensureOwner, findByPassword, passwordInUse, create, reset, remove, list, get, enroll, verifySecondStep };
}
