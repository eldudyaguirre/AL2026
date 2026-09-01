const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const sessions = new Map();

function createPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    });
  }

  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 10000,
  });
}

const pool = createPool();
app.use(express.json());

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)al2026_session=([^;]+)/);
  return match ? sessions.get(match[1]) : null;
}

// Rutas principales y compatibilidad con las rutas anteriores.
app.get('/', (_req, res) => res.redirect('/html/login.html'));
app.get('/login.html', (_req, res) => res.redirect('/html/login.html'));
app.get('/frmmenprinci.html', (_req, res) => res.redirect('/html/frmmenprinci.html'));

app.post('/api/login', async (req, res) => {
  const usuario = String(req.body?.usuario || '').trim();
  const clave = String(req.body?.clave || '');

  if (!usuario || !clave) {
    return res.status(400).json({ error: 'Ingrese usuario y contraseña.' });
  }

  try {
    const result = await pool.query(
      `SELECT usrname, nomusuari, s0100
       FROM seguridad
       WHERE usrname = $1 AND conusuari = $2
       LIMIT 1`,
      [usuario, clave]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
      usuario: user.usrname,
      nombre: user.nomusuari,
      s0100: user.s0100,
      createdAt: Date.now(),
    });

    res.setHeader('Set-Cookie', `al2026_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`);
    res.json({ ok: true, usuario: user.usrname, nombre: user.nomusuari });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'No fue posible validar el usuario.' });
  }
});

app.get('/api/session', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, usuario: session.usuario, nombre: session.nombre, s0100: session.s0100 });
});

app.post('/api/logout', (req, res) => {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)al2026_session=([^;]+)/);
  if (match) sessions.delete(match[1]);
  res.setHeader('Set-Cookie', 'al2026_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/db', async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'No autenticado.' });
  try {
    const result = await pool.query('SELECT version(), current_database(), current_user, now() AS server_time');
    const row = result.rows[0];
    res.json({ connected: true, database: row.current_database, user: row.current_user, serverTime: row.server_time, version: row.version });
  } catch (error) {
    console.error('Database connection error:', error.message);
    res.status(500).json({ connected: false, error: error.message });
  }
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ api: 'ok', database: 'ok' });
  } catch (_) {
    res.status(503).json({ api: 'ok', database: 'error' });
  }
});

app.use(express.static('public'));

app.listen(port, '0.0.0.0', () => console.log(`AL2026 API listening on port ${port}`));

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
