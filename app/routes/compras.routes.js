const express = require('express');
const controller = require('../controllers/compras.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/compras', requireSession, controller.compras);
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
router.get('/pool-status-test', requireSession, controller.poolStatusTest);
router.get('/pool-select-test', requireSession, controller.poolSelectTest);

module.exports = router;
