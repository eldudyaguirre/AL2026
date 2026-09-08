function pintarProyectos(proyectos) {
  const contenedor = document.getElementById('proyectos-grid');
  if (!contenedor) return;

  if (!Array.isArray(proyectos) || proyectos.length === 0) {
    contenedor.innerHTML = '<div class="muted proyectos-vacio">No existen proyectos con movimientos en el período seleccionado.</div>';
    return;
  }

  contenedor.innerHTML = proyectos.map((p, i) => {
    const nombre = escapar(p.proyecto || 'SIN PROYECTO');
    const gasto = dinero(p.gasto);
    const movimientos = Number(p.movimientos || 0);
    return `<article class="proyecto-card proyecto-card-${i % 4}">
      <div class="proyecto-icon"><i class="fi fi-rr-briefcase"></i></div>
      <div class="proyecto-info">
        <div class="proyecto-label">Proyecto</div>
        <h3 title="${nombre}">${nombre}</h3>
        <div class="proyecto-gasto">${gasto}</div>
        <div class="proyecto-note">${movimientos.toLocaleString('es-EC')} movimiento(s)</div>
      </div>
    </article>`;
  }).join('');
}

async function cargarGastosPorProyecto() {
  const contenedor = document.getElementById('proyectos-grid');
  const periodo = document.getElementById('proyectos-periodo');
  if (!contenedor) return;

  try {
    const ahora = new Date();
    const inicio = `${ahora.getFullYear()}-01-01`;
    const fin = `${ahora.getFullYear()}-12-31`;
    const r = await fetch(`/api/compras/proyectos?inicio=${inicio}&fin=${fin}&_=${Date.now()}`);
    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) { throw new Error(`HTTP ${r.status}: respuesta no válida`); }
    if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);

    if (periodo) periodo.textContent = `${inicio.slice(0, 4)} · ${data.totalProyectos || 0} proyecto(s)`;
    pintarProyectos(data.proyectos || []);
  } catch (e) {
    console.error('[DASHBOARD] Error cargando gastos por proyecto:', e);
    contenedor.innerHTML = `<div class="muted proyectos-vacio">No se pudo cargar el resumen por proyecto.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', cargarGastosPorProyecto);
