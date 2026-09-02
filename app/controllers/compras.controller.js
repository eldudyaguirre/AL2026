const pool = require('../database/postgres');

async function consultar(text, values = []) {
  const client = await pool.connect();

  try {
    await client.query("SET statement_timeout = '5000ms'");
    const result = await client.query({
      text,
      values,
      query_timeout: 6000,
    });
    client.release();
    return result.rows;
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

    const rango = `feccompra >= DATE '${inicio}' AND feccompra <= DATE '${fin}'`;

    // Cada campo se consulta por separado porque las pruebas demostraron que
    // PostgreSQL responde bien a cada columna individualmente, pero algunas
    // combinaciones provocan Query read timeout a través de pg/Railway.
    const numeros = await consultar(
      `SELECT numfaccom AS numero FROM compras WHERE ${rango} ORDER BY numfaccom`
    );

    const rucs = await consultar(
      `SELECT numfaccom AS numero, ruccedpro AS "rucCed" FROM compras WHERE ${rango} ORDER BY numfaccom`
    );

    const fechas = await consultar(
      `SELECT numfaccom AS numero, feccompra AS fecha FROM compras WHERE ${rango} ORDER BY numfaccom`
    );

    const autorizaciones = await consultar(
      `SELECT numfaccom AS numero, numautori AS autorizacion FROM compras WHERE ${rango} ORDER BY numfaccom`
    );

    const importes = await consultar(
      `SELECT numfaccom AS numero, totsiniva AS "subtotalSinIva", totconiva AS "subtotalConIva", totcompra AS total FROM compras WHERE ${rango} ORDER BY numfaccom`
    );

    const proveedores = await consultar(
      `SELECT ruccedpro, nomprovee FROM proveedores ORDER BY ruccedpro`
    );

    const comprasNv = await consultar(
      `SELECT numfaccom AS numero,
              ruccedpro AS "rucCed",
              feccompra AS fecha,
              numautori AS autorizacion,
              totsiniva AS "subtotalSinIva",
              totconiva AS "subtotalConIva",
              totcompra AS total
       FROM comprasnv
       WHERE ${rango}
       ORDER BY numfaccom`
    );

    const rucMap = new Map(rucs.map(r => [String(r.numero), r.rucCed]));
    const fechaMap = new Map(fechas.map(r => [String(r.numero), r.fecha]));
    const autorizacionMap = new Map(autorizaciones.map(r => [String(r.numero), r.autorizacion]));
    const importeMap = new Map(importes.map(r => [String(r.numero), r]));
    const proveedorMap = new Map(proveedores.map(p => [String(p.ruccedpro), p.nomprovee]));

    const comprasRows = numeros.map(r => {
      const numero = String(r.numero);
      const rucCed = rucMap.get(numero) ?? null;
      const importe = importeMap.get(numero) || {};

      return {
        numero: r.numero,
        rucCed,
        proveedor: proveedorMap.get(String(rucCed)) || 'PROVEEDOR NO REGISTRADO',
        fecha: fechaMap.get(numero) ?? null,
        autorizacion: autorizacionMap.get(numero) ?? null,
        subtotalSinIva: importe.subtotalSinIva ?? null,
        subtotalConIva: importe.subtotalConIva ?? null,
        total: importe.total ?? null,
        origen: 'compras',
      };
    });

    const comprasNvRows = comprasNv.map(r => ({
      ...r,
      proveedor: proveedorMap.get(String(r.rucCed)) || 'PROVEEDOR NO REGISTRADO',
      origen: 'comprasnv',
    }));

    const filas = [...comprasRows, ...comprasNvRows];

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
