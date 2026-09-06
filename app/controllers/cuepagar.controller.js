const pool = require('../database/postgres');

async function cuePagar(req, res) {
  const inicioConsulta = Date.now();
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();
    await client.query('SET statement_timeout = 30000');

    const sql = `
      SELECT
        p.ruccedpro AS "rucCedPro",
        p.nomprovee AS "nomProvee",
        cp."FecInicio" AS "fecInicio",
        cp."FecVencim" AS "fecVencim",
        cp."RefCuePag" AS "refCuePag",
        COALESCE(cp."ValPagPar", 0)::text AS "valPagPar"
      FROM proveedores p
      LEFT JOIN "CuentaPagar" cp
        ON cp."RucCedPro" = p.ruccedpro
       AND cp."EstPagCue" = 'PENDIENTE'
      WHERE p.salcuenta > 0
      ORDER BY p.nomprovee, cp."FecInicio", cp."RefCuePag"
    `;

    const result = await client.query(sql);
    const grupos = [];
    let actual = null;

    for (const row of result.rows) {
      if (!actual || actual.rucCedPro !== row.rucCedPro) {
        actual = {
          rucCedPro: row.rucCedPro,
          nomProvee: row.nomProvee || '',
          detalles: [],
          saldoTotal: 0
        };
        grupos.push(actual);
      }

      if (row.fecInicio !== null || row.fecVencim !== null || row.refCuePag !== null || row.valPagPar !== null) {
        const valor = Number(row.valPagPar) || 0;
        actual.detalles.push({
          fecInicio: row.fecInicio,
          fecVencim: row.fecVencim,
          refCuePag: row.refCuePag,
          valPagPar: row.valPagPar
        });
        actual.saldoTotal += valor;
      }
    }

    const totalGeneral = grupos.reduce((suma, proveedor) => suma + proveedor.saldoTotal, 0);

    return res.json({
      tiempoMs: Date.now() - inicioConsulta,
      totalProveedores: grupos.length,
      totalRegistros: grupos.reduce((suma, proveedor) => suma + proveedor.detalles.length, 0),
      totalGeneral,
      proveedores: grupos
    });
  } catch (error) {
    console.error('[CUEPAGAR] Error consultando cuentas por pagar:', error);
    return res.status(500).json({
      error: 'Error consultando cuentas por pagar.',
      detail: error.message,
      codigo: error.code,
      tiempoMs: Date.now() - inicioConsulta
    });
  } finally {
    if (client) {
      try { await client.end(); } catch (error) { console.error('[CUEPAGAR] Error cerrando cliente:', error.message); }
    }
  }
}

module.exports = { cuePagar };
