const express = require('express');
const controller = require('../controllers/compras.controller');
const { requireSession } = require('../auth/session');

const router = express.Router();

router.get('/compras', requireSession, controller.compras);
router.get('/compras-test', requireSession, controller.comprasTest);

module.exports = router;
