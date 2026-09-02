const pool = require('../database/postgres');

async function consultar(text, values = []) {
  const client = await pool.connect();

  try {
    await client.query("SET statement_timeout = '8000ms'");
    const result = await client.query({
      text,
      values,
      query_timeout: 9000,
    });

    // Esta ruta ha mostrado problemas al reutilizar conexiones del pool.
    // Descartamos la conexión después de cada consulta para evitar reutilizar
    // una conexión que haya quedado en un estado inconsistente.
    client.release(new Error('Descartar conexión después de consulta de compras'));
    return result;
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

    // Consultamos de forma secuencial y con una conexión nueva por consulta.
    // Las pruebas anteriores demostraron que cada consulta individual funciona;
    // el problema aparece al reutilizar conexiones del pool o ejecutarlas juntas.
    const basicos = await consultar(
      `SELECT numfaccom AS numero,
              ruccedpro AS "rucCed",
              feccompra AS fecha,
              numautori AS autorizacion
       FROM compras
       WHERE ${rango}`
    );

    const importes = await consultar(
      `SELECT numfaccom AS numero,
              totsiniva AS "subtotalSinIva",
              totconiva AS "subtotalConIva",
              totcompra AS total
       FROM compras
       WHERE ${rango}`
    );

    const proveedores = await consultar(
      `SELECT ruccedpro, nomprovee FROM proveedores`
    );

    const importesMap = new Map(
      importes.rows.map(r => [String(r.numero), r])
    );

    const proveedoresMap = new Map(
      proveedores.rows.map(p => [String(p.ruccedpro), p.nomprovee])
    );

    const comprasRows = basicos.rows.map(r => {
      const valores = importesMap.get(String(r.numero)) || {};

      return {
        numero: r.numero,
        rucCed: r.rucCed,
        proveedor: proveedoresMap.get(String(r.rucCed)) || 'PROVEEDOR NO REGISTRADO',
        fecha: r.fecha,
        autorizacion: r.autorizacion,
        subtotalSinIva: valores.subtotalSinIva ?? null,
        subtotalConIva: valores.subtotalConIva ?? null,
        total: valores.total ?? null,
        origen: 'compras',
      };
    });

    const comprasNv = await consultar(
      `SELECT numfaccom AS numero,
              ruccedpro AS "rucCed",
              feccompra AS fecha,
              numautori AS autorizacion,
              totsiniva AS "subtotalSinIva",
              totconiva AS "subtotalConIva",
              totcompra AS total
       FROM comprasnv
       WHERE ${rango}`
    );

    const comprasNvRows = comprasNv.rows.map(r => ({
      ...r,
      proveedor: proveedoresMap.get(String(r.rucCed)) || 'PROVEEDOR NO REGISTRADO',
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

    return res.json({
      inicio,
      fin,
      total: filas.length,
      compras: filas,
    });
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
