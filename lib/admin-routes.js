import QRCode from 'qrcode';
import * as auth from './auth.js';
import * as totp from './totp.js';
import * as view from './render.js';
import { assertAdminPassword } from './auth.js';

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Sign-in is two steps: password, then an authenticator (or recovery) code. A new admin sets up the authenticator first.
export function mountAdminAuth({ app, admins, loginLimiter, adminView, ownerPassword }) {
  const accountLimiter = auth.createLoginLimiter();
  const send = (res, status, title, body) => {
    res.set('Cache-Control', 'no-store');
    res.status(status).send(view.layout({ title, body }));
  };
  const pendingStage = (req, stage) => {
    const info = auth.sessionInfo(req);
    return info?.stage === stage ? info : null;
  };
  const tooMany = (res, retryAfter, body) => {
    res.set('Retry-After', String(retryAfter));
    send(res, 429, 'Admin sign in', body({ error: 'Too many attempts. Please wait a few minutes.' }));
  };

  app.post('/admin/login', auth.requireSameOrigin, wrap(async (req, res) => {
    const retryAfter = loginLimiter.retryAfter(req.ip);
    if (retryAfter) return tooMany(res, retryAfter, view.loginPage);
    const admin = await admins.findByPassword(req.body.password);
    if (!admin) {
      loginLimiter.recordFailure(req.ip);
      return send(res, 401, 'Admin sign in', view.loginPage({ error: 'That password was not correct.' }));
    }
    auth.dropSession(req);
    auth.issueSession(res, { adminId: admin.id, owner: Boolean(admin.owner), stage: admin.totpSecret ? 'code' : 'setup' });
    res.set('Cache-Control', 'no-store');
    res.redirect(admin.totpSecret ? '/admin/verify' : '/admin/setup');
  }));

  app.get('/admin/verify', (req, res) => {
    if (!pendingStage(req, 'code')) return res.redirect('/admin/login');
    send(res, 200, 'Enter your code', view.verifyPage({ csrfToken: auth.csrfToken(req) }));
  });

  app.post('/admin/verify', auth.requireSameOrigin, auth.requireCsrf, wrap(async (req, res) => {
    const info = pendingStage(req, 'code');
    if (!info) return res.redirect('/admin/login');
    const page = (error) => view.verifyPage({ error, csrfToken: auth.csrfToken(req) });
    const retryAfter = Math.max(loginLimiter.retryAfter(req.ip), accountLimiter.retryAfter(info.adminId));
    if (retryAfter) return tooMany(res, retryAfter, page);
    const result = await admins.verifySecondStep(info.adminId, req.body.code);
    if (!result) {
      loginLimiter.recordFailure(req.ip);
      accountLimiter.recordFailure(info.adminId);
      return send(res, 401, 'Enter your code', page('That code was not correct. Please try again.'));
    }
    loginLimiter.clear(req.ip);
    accountLimiter.clear(info.adminId);
    auth.dropSession(req);
    auth.issueSession(res, { adminId: info.adminId, owner: info.owner });
    res.set('Cache-Control', 'no-store');
    res.redirect(result.recovery ? '/admin?notice=' + encodeURIComponent('You signed in with a recovery code.') : '/admin');
  }));

  const setupPage = async (req, res, status, error) => {
    const info = pendingStage(req, 'setup');
    let secret = info.pendingSecret;
    if (!secret) {
      secret = totp.generateSecret();
      auth.setPendingSecret(req, secret);
    }
    const admin = await admins.get(info.adminId);
    const qrSvg = await QRCode.toString(totp.otpauthUri(secret, admin.name), { type: 'svg', margin: 0 });
    send(res, status, 'Set up your sign-in', view.setupPage({
      error, secret, qrSvg, csrfToken: auth.csrfToken(req), needsPassword: admin.mustChangePassword,
    }));
  };

  app.get('/admin/setup', wrap(async (req, res) => {
    if (!pendingStage(req, 'setup')) return res.redirect('/admin/login');
    await setupPage(req, res, 200);
  }));

  app.post('/admin/setup', auth.requireSameOrigin, auth.requireCsrf, wrap(async (req, res) => {
    const info = pendingStage(req, 'setup');
    if (!info?.pendingSecret) return res.redirect('/admin/login');
    const admin = await admins.get(info.adminId);
    if (!admin) return res.redirect('/admin/login');
    const retryAfter = Math.max(loginLimiter.retryAfter(req.ip), accountLimiter.retryAfter(info.adminId));
    if (retryAfter) return tooMany(res, retryAfter, (opts) => view.loginPage(opts));
    const fail = async (message) => {
      loginLimiter.recordFailure(req.ip);
      accountLimiter.recordFailure(info.adminId);
      await setupPage(req, res, 400, message);
    };

    let newPassword;
    if (admin.mustChangePassword) {
      newPassword = req.body.newPassword;
      if (newPassword !== req.body.confirmPassword) return fail('Your passwords did not match.');
      try { assertAdminPassword(newPassword); } catch { return fail('Please choose a password with at least 16 characters.'); }
      if (newPassword === ownerPassword || await admins.passwordInUse(newPassword, admin.id)) {
        return fail('Please choose a different password.');
      }
    }
    const codes = await admins.enroll(info.adminId, { secret: info.pendingSecret, code: String(req.body.code ?? '').trim(), newPassword });
    if (!codes) return fail('That code was not correct. Please try again.');

    loginLimiter.clear(req.ip);
    accountLimiter.clear(info.adminId);
    auth.dropSession(req);
    auth.issueSession(res, { adminId: info.adminId, owner: info.owner });
    send(res, 200, 'Save your recovery codes', view.recoveryPage({ codes }));
  }));

  const ownerOnly = [auth.requireAdmin, auth.requireOwner, auth.requireSameOrigin, auth.requireCsrf];

  app.post('/admin/admins', ...ownerOnly, wrap(async (req, res) => {
    const name = String(req.body.name ?? '').trim().slice(0, 60);
    if (!name) return adminView(req, res, 400, { error: 'Please enter a name.' });
    const { code } = await admins.create(name);
    await adminView(req, res, 200, { invite: { name, code } });
  }));

  app.post('/admin/admins/:id/reset', ...ownerOnly, wrap(async (req, res) => {
    const result = await admins.reset(req.params.id);
    if (!result) return res.redirect('/admin');
    auth.revokeAdminSessions(req.params.id);
    await adminView(req, res, 200, { invite: { name: result.admin.name, code: result.code } });
  }));

  app.post('/admin/admins/:id/remove', ...ownerOnly, wrap(async (req, res) => {
    if (await admins.remove(req.params.id)) auth.revokeAdminSessions(req.params.id);
    res.redirect('/admin?notice=' + encodeURIComponent('Admin removed.'));
  }));
}
