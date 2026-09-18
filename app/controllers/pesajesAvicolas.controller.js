const pool = require('../database/postgres');

const RUC_CANDIDATOS = ['ruccedcli', 'ruc', 'rucced', 'ruc_ced', 'identificacion', 'cedula'];
const NOMBRE_CANDIDATOS = ['nomclient', 'nomcli', 'nombres', 'nombre', 'razonsocial', 'razon_social'];

function ident(valor) {
  return '"' + String(valor).replace(/"/g, '""') + '"';
}

async function metadatosClientes(client) {
  const tablas = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND lower(table_name) = 'clientes'
    ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END
    LIMIT 1
  `);
  if (!tablas.rows.length) throw new Error('No existe la tabla clientes.');

  const { table_schema: esquema, table_name: tabla } = tablas.rows[0];
  const columnas = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [esquema, tabla]);

  const disponibles = columnas.rows.map(r => r.column_name);
  const buscar = candidatos =>
    disponibles.find(col => candidatos.includes(col.toLowerCase()));

  const colRuc = buscar(RUC_CANDIDATOS);
  const colNombre = buscar(NOMBRE_CANDIDATOS);

  if (!colRuc || !colNombre) {
    throw new Error('No se encontraron RUC/cédula y nombre en clientes.');
  }

  return { esquema, tabla, colRuc, colNombre };
}

async function clientes(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const meta = await metadatosClientes(client);
    const q = String(req.query.q || '').trim();

    const valores = [];
    let where = '';
    if (q) {
      valores.push('%' + q + '%');
      where = `WHERE CAST(${ident(meta.colRuc)} AS text) ILIKE $1
                 OR CAST(${ident(meta.colNombre)} AS text) ILIKE $1`;
    }

    const result = await client.query(`
      SELECT
        CAST(${ident(meta.colRuc)} AS text) AS "ruccedcli",
        CAST(${ident(meta.colNombre)} AS text) AS "nombre"
      FROM ${ident(meta.esquema)}.${ident(meta.tabla)}
      ${where}
      ORDER BY ${ident(meta.colNombre)} ASC NULLS LAST
      LIMIT 1000
    `, valores);

    res.json({ clientes: result.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error clientes:', error);
    res.status(500).json({ error: 'Error consultando clientes.', detail: error.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

async function granjas(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query(`
      SELECT codproy, proyecto
      FROM proyectos
      WHERE UPPER(TRIM(tiparea)) = 'AVICOLA'
        AND activo = TRUE
      ORDER BY proyecto
    `);

    res.json({ granjas: result.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error granjas:', error);
    res.status(500).json({ error: 'Error consultando granjas.', detail: error.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

async function listar(req, res) {
  let client;
  try {
    client = pool.createDedicatedClient();
    await client.connect();

    const result = await client.query(`
      SELECT
        p.id,
        p.fecha,
        p.ruccedcli,
        COALESCE(c.nombre, p.ruccedcli) AS cliente,
        p.codproy,
        COALESCE(pr.proyecto, p.codproy) AS granja,
        p.galpon,
        p.lote,
        p.nota_guia,
        p.observacion,
        p.cantidad_aves,
        p.peso_total,
        p.peso_promedio,
        p.estado,
        p.creadopor,
        p.fechacreacion
      FROM pesajes_avicolas p
      LEFT JOIN proyectos pr ON pr.codproy = p.codproy
      LEFT JOIN LATERAL (
        SELECT CAST(c0.ruccedcli AS text) AS ruc, CAST(c0.nomclient AS text) AS nombre
        FROM clientes c0
        WHERE CAST(c0.ruccedcli AS text) = CAST(p.ruccedcli AS text)
        LIMIT 1
      ) c ON TRUE
      ORDER BY p.fecha DESC, p.id DESC
      LIMIT 200
    `);

    res.json({ pesajes: result.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error historial:', error);
    res.status(500).json({ error: 'Error consultando pesajes.', detail: error.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

async function guardar(req, res) {
  const datos = req.body || {};
  const fecha = String(datos.fecha || '').trim();
  const ruccedcli = String(datos.ruccedcli || '').trim();
  const codproy = String(datos.codproy || '').trim();
  const galpon = String(datos.galpon || '').trim();
  const lote = String(datos.lote || '').trim();
  const nota_guia = String(datos.nota_guia || '').trim();
  const observacion = String(datos.observacion || '').trim();
  const pesos = Array.isArray(datos.pesos) ? datos.pesos : [];

  if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria.' });
  if (!ruccedcli) return res.status(400).json({ error: 'Seleccione un cliente.' });
  if (!codproy) return res.status(400).json({ error: 'Seleccione una granja.' });
  if (!pesos.length) return res.status(400).json({ error: 'Debe ingresar al menos un peso.' });

  const pesosNumericos = pesos.map(Number);
  if (pesosNumericos.some(peso => !Number.isFinite(peso) || peso <= 0)) {
    return res.status(400).json({ error: 'Todos los pesos deben ser mayores que cero.' });
  }

  const pesoTotal = pesosNumericos.reduce((suma, peso) => suma + peso, 0);
  const cantidadAves = pesosNumericos.length;
  const pesoPromedio = pesoTotal / cantidadAves;

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const cabecera = await client.query(`
      INSERT INTO pesajes_avicolas (
        fecha, ruccedcli, codproy, galpon, lote,
        nota_guia, observacion, cantidad_aves,
        peso_total, peso_promedio, estado, creadopor
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INGRESADO',$11)
      RETURNING id, fecha, cantidad_aves, peso_total, peso_promedio, estado
    `, [
      fecha, ruccedcli, codproy, galpon || null, lote || null,
      nota_guia || null, observacion || null, cantidadAves,
      pesoTotal.toFixed(2), pesoPromedio.toFixed(2),
      req.session?.usuario || null
    ]);

    const pesajeId = cabecera.rows[0].id;

    for (let i = 0; i < pesosNumericos.length; i++) {
      await client.query(`
        INSERT INTO pesajes_avicolas_detalle (pesaje_id, numero_ave, peso)
        VALUES ($1, $2, $3)
      `, [pesajeId, i + 1, pesosNumericos[i].toFixed(2)]);
    }

    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Pesaje guardado correctamente.', pesaje: cabecera.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[PESAJE AVI] Error guardando:', error);
    res.status(500).json({ error: 'No se pudo guardar el pesaje.', detail: error.message });
  } finally {
    if (client) client.release();
  }
}

async function detalle(req, res) {
  let client;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID de pesaje inválido.' });

    client = await pool.connect();

    const cabecera = await client.query(`
      SELECT
        p.*,
        COALESCE(pr.proyecto, p.codproy) AS granja
      FROM pesajes_avicolas p
      LEFT JOIN proyectos pr ON pr.codproy = p.codproy
      WHERE p.id = $1
    `, [id]);

    if (!cabecera.rows.length) return res.status(404).json({ error: 'Pesaje no encontrado.' });

    const detalle = await client.query(`
      SELECT numero_ave, peso
      FROM pesajes_avicolas_detalle
      WHERE pesaje_id = $1
      ORDER BY numero_ave
    `, [id]);

    res.json({ pesaje: cabecera.rows[0], pesos: detalle.rows });
  } catch (error) {
    console.error('[PESAJE AVI] Error detalle:', error);
    res.status(500).json({ error: 'Error consultando el pesaje.', detail: error.message });
  } finally {
    if (client) client.release();
  }
}

module.exports = { clientes, granjas, listar, guardar, detalle };
