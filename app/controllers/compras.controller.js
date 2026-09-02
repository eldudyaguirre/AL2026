const pool = require('../database/postgres');

async function ejecutarConsulta(text, timeoutMs = 10000) {
  const client = await pool.connect();

  try {
    // El timeout se aplica en PostgreSQL, evitando depender del timeout de lectura
    // del cliente de node-postgres.
    await client.query(`SET statement_timeout = '${timeoutMs}ms'`);
    return await client.query(text);
  } catch (error) {
    // Si una consulta falla o expira, no devolvemos esa conexión al pool.
    client.release(error);
    throw error;
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

    // Las fechas ya fueron validadas con expresión regular, por lo que pueden
    // incorporarse como literales DATE. Esto elimina cualquier problema con
    // parámetros preparados en esta consulta.
    const rango = `feccompra >= DATE '${inicio}' AND feccompra <= DATE '${fin}'`;

    etapa = 'SELECT compras básicos';
    const inicioBasicos = Date.now();
    const resultBasicos = await ejecutarConsulta(
      `SELECT numfaccom AS numero,
              ruccedpro AS "rucCed",
              feccompra AS fecha,
              numautori AS autorizacion
       FROM compras
       WHERE ${rango}`
    );
    console.log(`[COMPRAS] básicos: ${resultBasicos.rows.length} registros en ${Date.now() - inicioBasicos} ms`);

    etapa = 'SELECT compras numéricos';
    const inicioNumericos = Date.now();
    const resultNumericos = await ejecutarConsulta(
      `SELECT numfaccom AS numero,
              totsiniva AS "subtotalSinIva",
              totconiva AS "subtotalConIva",
              totcompra AS total
       FROM compras
       WHERE ${rango}`
    );
    console.log(`[COMPRAS] numéricos: ${resultNumericos.rows.length} registros en ${Date.now() - inicioNumericos} ms`);

    etapa = 'SELECT comprasnv';
    const inicioComprasNv = Date.now();
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
       WHERE ${rango}`
    );
    console.log(`[COMPRAS] comprasnv: ${resultComprasNv.rows.length} registros en ${Date.now() - inicioComprasNv} ms`);

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

    etapa = 'SELECT proveedores';
    const inicioProveedores = Date.now();
    const resultProveedores = await ejecutarConsulta(
      `SELECT ruccedpro, nomprovee FROM proveedores`
    );
    console.log(`[COMPRAS] proveedores: ${resultProveedores.rows.length} registros en ${Date.now() - inicioProveedores} ms`);

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
