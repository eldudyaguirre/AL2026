const express = require('express');
const controller = require('../controllers/compras.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/compras', requireSession, controller.compras);
router.get('/proveedores-test', requireSession, controller.proveedoresTest);
router.get('/conexion-test', requireSession, controller.conexionTest);
router.get('/proveedores-ruc-test', requireSession, controller.proveedoresRucTest);
router.get('/pool-status-test', requireSession, controller.poolStatusTest);
router.get('/pool-select-test', requireSession, controller.poolSelectTest);

module.exports = router;
