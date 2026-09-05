const express = require('express');
const controller = require('../controllers/compras.controller');
const comprasDiccionarioController = require('../controllers/compras-diccionario-test');
const comprasJsonController = require('../controllers/compras-json-test');
const comprasDosConsultasController = require('../controllers/compras-dos-consultas-test');
const comprasPingController = require('../controllers/compras-ping-test');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/compras', requireSession, controller.compras);
router.get('/compras-diccionario-test', requireSession, comprasDiccionarioController.comprasDiccionarioTest);
router.get('/compras-conexion-test', requireSession, comprasDiccionarioController.comprasConexionTest);
router.get('/compras-json-test', requireSession, comprasJsonController.comprasJsonTest);
router.get('/compras-dos-consultas-test', requireSession, comprasDosConsultasController.comprasDosConsultasTest);
router.get('/compras-ping-test', requireSession, comprasPingController.comprasPingTest);
router.get('/proveedores-test', requireSession, controller.proveedoresTest);
router.get('/conexion-test', requireSession, controller.conexionTest);
router.get('/proveedores-ruc-test', requireSession, controller.proveedoresRucTest);
router.get('/proveedores-ruc-sin-order-test', requireSession, controller.proveedoresRucSinOrderTest);
router.get('/proveedores-ruc-cast-test', requireSession, controller.proveedoresRucCastTest);
router.get('/proveedores-ruc-fijo-test', requireSession, controller.proveedoresRucFijoTest);
router.get('/proveedores-nomprovee-test', requireSession, controller.proveedoresNomproveeTest);
router.get('/proveedores-nomprovee-cast-test', requireSession, controller.proveedoresNomproveeCastTest);
router.get('/proveedores-nomprovee-dedicado-test', requireSession, controller.proveedoresNomproveeDedicadoTest);
router.get('/proveedores-join-dedicado-test', requireSession, controller.proveedoresJoinDedicadoTest);
router.get('/proveedores-join-nom-length-dedicado-test', requireSession, controller.proveedoresJoinNomLengthDedicadoTest);
router.get('/proveedores-join-concat-dedicado-test', requireSession, controller.proveedoresJoinConcatDedicadoTest);
router.get('/proveedores-join-varchar-dedicado-test', requireSession, controller.proveedoresJoinVarcharDedicadoTest);
router.get('/proveedores-join-array-dedicado-test', requireSession, controller.proveedoresJoinArrayDedicadoTest);
router.get('/proveedores-join-bytes-dedicado-test', requireSession, controller.proveedoresJoinBytesDedicadoTest);
router.get('/proveedores-ruc-lista-dedicado-test', requireSession, controller.proveedoresJoinArrayDedicadoTest2);
router.get('/pool-status-test', requireSession, controller.poolStatusTest);
router.get('/pool-select-test', requireSession, controller.poolSelectTest);

module.exports = router;
