const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);

function createPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
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

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'AL2026 API',
    message: 'API funcionando',
  });
});

app.get('/db', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        version(),
        current_database(),
        current_user,
        now() AS server_time
    `);

    const row = result.rows[0];

    res.json({
      connected: true,
      database: row.current_database,
      user: row.current_user,
      serverTime: row.server_time,
      version: row.version,
    });
  } catch (error) {
    console.error('Database connection error:', error.message);

    res.status(500).json({
      connected: false,
      error: error.message,
    });
  }
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ api: 'ok', database: 'ok' });
  } catch (error) {
    res.status(503).json({ api: 'ok', database: 'error' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`AL2026 API listening on port ${port}`);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
