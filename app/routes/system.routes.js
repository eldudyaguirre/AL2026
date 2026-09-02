const express = require('express');
const controller = require('../controllers/system.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/db', requireSession, controller.database);
router.get('/health', controller.health);
router.get('/pool-status', controller.poolStatus);
router.get('/db-compras-test', requireSession, controller.comprasDiagnostico);

module.exports = router;
