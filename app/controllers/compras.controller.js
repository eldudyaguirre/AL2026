const pool = require('../database/postgres');

async function consultarJson(text, values = []) {
  const client = await pool.connect();

  try {
    await client.query("SET statement_timeout = '15000ms'");
    const result = await client.query({
      text,
      values,
      query_timeout: 16000,
    });
    client.release();
    return result.rows.map(row => row.datos);
  } catch (error) {
    client.release(error);
    throw error;
  }
}

async function compras(req, res) {
  const inicioConsulta = Date.now();

  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const inicio = req.query.inicio || hoy;
    const fin = req.query.fin || hoy;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
      return res.status(400).json({ error: 'Las fechas deben tener formato YYYY-MM-DD.' });
    }

    if (inicio > fin) {
      return res.status(400).json({ error: 'La fecha de inicio no puede ser mayor que la fecha de fin.' });
    }

    const sql = `
      SELECT json_build_object(
        'numero', c.numfaccom,
        'rucCed', c.ruccedpro,
        'proveedor', COALESCE(p.nomprovee, 'PROVEEDOR NO REGISTRADO'),
        'fecha', c.feccompra,
        'autorizacion', c.numautori,
        'subtotalSinIva', c.totsiniva,
        'subtotalConIva', c.totconiva,
        'total', c.totcompra,
        'origen', 'compras'
      ) AS datos
      FROM compras c
      LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra >= $1::date
        AND c.feccompra <= $2::date

      UNION ALL

      SELECT json_build_object(
        'numero', c.numfaccom,
        'rucCed', c.ruccedpro,
        'proveedor', COALESCE(p.nomprovee, 'PROVEEDOR NO REGISTRADO'),
        'fecha', c.feccompra,
        'autorizacion', c.numautori,
        'subtotalSinIva', c.totsiniva,
        'subtotalConIva', c.totconiva,
        'total', c.totcompra,
        'origen', 'comprasnv'
      ) AS datos
      FROM comprasnv c
      LEFT JOIN proveedores p ON p.ruccedpro = c.ruccedpro
      WHERE c.feccompra >= $1::date
        AND c.feccompra <= $2::date
    `;

    const filas = await consultarJson(sql, [inicio, fin]);

    filas.sort((a, b) => {
      const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
      if (fechaB !== fechaA) return fechaB - fechaA;
      return String(b.numero || '').localeCompare(String(a.numero || ''));
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] ${filas.length} registros en ${tiempoMs} ms`);

    return res.json({ inicio, fin, total: filas.length, compras: filas });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] Error después de ${tiempoMs} ms:`, error.message);

    return res.status(500).json({
      error: 'No se pudieron consultar las compras.',
      detail: error.message,
      tiempoMs,
    });
  }
}

module.exports = { compras };
