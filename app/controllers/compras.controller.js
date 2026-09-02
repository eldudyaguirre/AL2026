const pool = require('../database/postgres');

async function ejecutarConsulta(text, values, timeout = 5000) {
  const client = await pool.connect();

  try {
    return await client.query({
      text,
      values,
      query_timeout: timeout,
      statement_timeout: timeout,
    });
  } finally {
    client.release();
  }
}

async function compras(req, res) {
  const inicioConsulta = Date.now();
  let etapa = 'inicio';

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

    console.log(`[COMPRAS] Inicio consulta ${inicio} a ${fin}`);

    // Primera prueba: solamente campos básicos de la tabla.
    etapa = 'SELECT compras básicos';
    const resultBasicos = await ejecutarConsulta(
      `SELECT numfaccom AS numero,
              ruccedpro AS "rucCed",
              feccompra AS fecha,
              numautori AS autorizacion
       FROM compras
       WHERE feccompra BETWEEN $1::date AND $2::date`,
      [inicio, fin]
    );
    console.log(`[COMPRAS] básicos: ${resultBasicos.rows.length} registros`);

    // Segunda prueba: solamente los campos numéricos.
    etapa = 'SELECT compras numéricos';
    const resultNumericos = await ejecutarConsulta(
      `SELECT numfaccom AS numero,
              totsiniva AS "subtotalSinIva",
              totconiva AS "subtotalConIva",
              totcompra AS total
       FROM compras
       WHERE feccompra BETWEEN $1::date AND $2::date`,
      [inicio, fin]
    );
    console.log(`[COMPRAS] numéricos: ${resultNumericos.rows.length} registros`);

    // Tercera prueba: comprasnv.
    etapa = 'SELECT comprasnv';
    const resultComprasNv = await ejecutarConsulta(
      `SELECT numfaccom AS numero,
              ruccedpro AS "rucCed",
              feccompra AS fecha,
              numautori AS autorizacion,
              totsiniva AS "subtotalSinIva",
              totconiva AS "subtotalConIva",
              totcompra AS total,
              'comprasnv' AS origen
       FROM comprasnv
       WHERE feccompra BETWEEN $1::date AND $2::date`,
      [inicio, fin]
    );
    console.log(`[COMPRAS] comprasnv: ${resultComprasNv.rows.length} registros`);

    // Unimos los resultados de compras por número de factura.
    etapa = 'UNIR compras';
    const numericos = new Map(
      resultNumericos.rows.map(r => [String(r.numero), r])
    );

    const compras = resultBasicos.rows.map(r => {
      const valores = numericos.get(String(r.numero)) || {};
      return {
        ...r,
        subtotalSinIva: valores.subtotalSinIva ?? null,
        subtotalConIva: valores.subtotalConIva ?? null,
        total: valores.total ?? null,
        origen: 'compras',
      };
    });

    // Proveedores se consulta únicamente después de comprobar las tablas de compras.
    etapa = 'SELECT proveedores';
    const resultProveedores = await ejecutarConsulta(
      `SELECT ruccedpro, nomprovee FROM proveedores`,
      [],
      5000
    );
    console.log(`[COMPRAS] proveedores: ${resultProveedores.rows.length} registros`);

    const proveedores = new Map(
      resultProveedores.rows.map(p => [String(p.ruccedpro), p.nomprovee])
    );

    const filas = [...compras, ...resultComprasNv.rows].map(fila => ({
      ...fila,
      proveedor: proveedores.get(String(fila.rucCed)) || 'PROVEEDOR NO REGISTRADO',
    }));

    filas.sort((a, b) => {
      const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
      if (fechaB !== fechaA) return fechaB - fechaA;
      return String(b.numero || '').localeCompare(String(a.numero || ''));
    });

    const tiempoMs = Date.now() - inicioConsulta;
    console.log(`[COMPRAS] Consulta completada: ${filas.length} registros en ${tiempoMs} ms`);

    return res.json({ inicio, fin, total: filas.length, compras: filas });
  } catch (error) {
    const tiempoMs = Date.now() - inicioConsulta;
    console.error(`[COMPRAS] Error en ${etapa} después de ${tiempoMs} ms:`, error.message);
    console.error('[COMPRAS] Pool:', {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    });

    return res.status(500).json({
      error: 'No se pudieron consultar las compras.',
      detail: error.message,
      etapa,
      tiempoMs,
    });
  }
}

module.exports = { compras };
