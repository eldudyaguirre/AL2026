const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query(`
      SELECT
        numfaccom AS numero,
        ruccedpro AS rucCed,
        LENGTH(ruccedpro) AS rucLongitud,
        tpidprov AS tipoProveedor,
        numautori AS autorizacion,
        feccompra AS fecha
      FROM compras
      WHERE feccompra >= $1::date
        AND feccompra <= $2::date
      ORDER BY feccompra DESC, numfaccom DESC
      LIMIT 5
    `, [inicio, fin]);

    return res.json({
      diagnostico: 'ruc_compras',
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      filas: result.rows.length,
      total: result.rows.length,
      compras: result.rows.map(r => ({
        ...r,
        rucCed: r.rucCed || '-',
        proveedor: `TIPO: ${r.tipoProveedor || '-'} | LONGITUD RUC: ${r.rucLongitud ?? 0}`,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error consultando compras.',
      detail: error.message,
      tiempoMs: Date.now() - inicioConsulta,
    });
  } finally {
    if (client) {
      try {
        await client.end();
      } catch (error) {
        console.error('[COMPRAS] Error cerrando cliente:', error.message);
      }
    }
  }
}

module.exports = { compras };
