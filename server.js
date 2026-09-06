const express = require('express');
const authRoutes = require('./app/routes/auth.routes');
const systemRoutes = require('./app/routes/system.routes');
const comprasRoutes = require('./app/routes/compras.routes');
const ventasRoutes = require('./app/routes/ventas.routes');
const cuePagarRoutes = require('./app/routes/cuepagar.routes');
const cueCobrarRoutes = require('./app/routes/cuecobrar.routes');
const systemController = require('./app/controllers/system.controller');
const pool = require('./app/database/postgres');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

app.get('/', (_req, res) => res.redirect('/html/login.html'));
app.get('/login.html', (_req, res) => res.redirect('/html/login.html'));
app.get('/frmmenprinci.html', (_req, res) => res.redirect('/html/frmmenprinci.html'));
app.get('/FrmCueCobrar.html', (_req, res) => res.redirect('/html/FrmCueCobrar.html'));

app.use('/api', authRoutes);
app.use('/api', systemRoutes);
app.use('/api', comprasRoutes);
app.use('/api', ventasRoutes);
app.use('/api', cuePagarRoutes);
app.use('/api', cueCobrarRoutes);

app.get('/health', systemController.health);

app.use(express.static('public'));

app.listen(port, '0.0.0.0', () => {
  console.log(`AL2026 API listening on port ${port}`);
});

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
