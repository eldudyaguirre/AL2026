const express = require('express');
const authRoutes = require('./app/routes/auth.routes');
const systemRoutes = require('./app/routes/system.routes');
const comprasRoutes = require('./app/routes/compras.routes');
const systemController = require('./app/controllers/system.controller');
const pool = require('./app/database/postgres');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

// Páginas principales. Se mantienen las rutas antiguas para no romper enlaces.
app.get('/', (_req, res) => res.redirect('/html/login.html'));
app.get('/login.html', (_req, res) => res.redirect('/html/login.html'));
app.get('/frmmenprinci.html', (_req, res) => res.redirect('/html/frmmenprinci.html'));

// API.
app.use('/api', authRoutes);
app.use('/api', systemRoutes);
app.use('/api', comprasRoutes);

// Compatibilidad: /health continúa disponible en la raíz.
app.get('/health', systemController.health);

// Archivos estáticos del frontend.
app.use(express.static('public'));

app.listen(port, '0.0.0.0', () => {
  console.log(`AL2026 API listening on port ${port}`);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
