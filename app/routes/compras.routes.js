const express = require('express');
const controller = require('../controllers/compras.controller');
const comprasDiccionarioController = require('../controllers/compras-diccionario-test');
const comprasJsonController = require('../controllers/compras-json-test');
const comprasDosConsultasController = require('../controllers/compras-dos-consultas-test');
const comprasPingController = require('../controllers/compras-ping-test');
const comprasLotesController = require('../controllers/compras-lotes-test');
const comprasSinOrderController = require('../controllers/compras-sin-order-test');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/compras', requireSession, controller.compras);
router.get('/compras-diccionario-test', requireSession, comprasDiccionarioController.comprasDiccionarioTest);
router.get('/compras-conexion-test', requireSession, comprasDiccionarioController.comprasConexionTest);
router.get('/compras-json-test', requireSession, comprasJsonController.comprasJsonTest);
router.get('/compras-dos-consultas-test', requireSession, comprasDosConsultasController.comprasDosConsultasTest);
router.get('/compras-ping-test', requireSession, comprasPingController.comprasPingTest);
router.get('/compras-lotes-test', requireSession, comprasLotesController.comprasLotesTest);
router.get('/compras-sin-order-test', requireSession, comprasSinOrderController.comprasSinOrderTest);

module.exports = router;
