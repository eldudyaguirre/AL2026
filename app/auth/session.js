const crypto = require('crypto');

const sessions = new Map();
const COOKIE_NAME = 'al2026_session';
const MAX_AGE = 28800;

function getToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

function getSession(req) {
  const token = getToken(req);
  return token ? sessions.get(token) : null;
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    usuario: user.usrname,
    nombre: user.nomusuari,
    s0100: user.s0100,
    createdAt: Date.now(),
  });
  return token;
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);
}

function clearSession(req, res) {
  const token = getToken(req);
  if (token) sessions.delete(token);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`);
}

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'No autenticado.' });
  req.session = session;
  next();
}

module.exports = {
  getSession,
  createSession,
  setSessionCookie,
  clearSession,
  requireSession,
};
