const pool = require('../database/postgres');

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let client;

  try {
    const inicio = req.query.inicio || '2026-08-31';
    const fin = req.query.fin || '2026-09-02';

    client = pool.createDedicatedClient();
    await client.connect();

    // Diagnóstico: contar registros sin seleccionar ningún campo de las compras.
    // Así comprobamos el TOTAL real del rango sin involucrar numautori,
    // proveedores ni el mapeo de columnas del listado.
    const comprasResult = await client.query(`
      SELECT COUNT(*)::integer AS total
      FROM compras
      WHERE feccompra >= $1::date
        AND feccompra <= $2::date
    `, [inicio, fin]);

    const comprasNvResult = await client.query(`
      SELECT COUNT(*)::integer AS total
      FROM comprasnv
      WHERE feccompra >= $1::date
        AND feccompra <= $2::date
    `, [inicio, fin]);

    const totalCompras = comprasResult.rows[0].total;
    const totalComprasNv = comprasNvResult.rows[0].total;
    const total = totalCompras + totalComprasNv;

    return res.json({
      diagnostico: 'compras_total',
      inicio,
      fin,
      tiempoMs: Date.now() - inicioConsulta,
      totalCompras,
      totalComprasNv,
      total,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error consultando total de compras.',
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
