(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const pesos = [];

  const fecha = $('#fechaPesaje');
  const cliente = $('#clientePesaje');
  const granja = $('#granjaPesaje');
  const galpon = $('#galponPesaje');
  const lote = $('#lotePesaje');
  const nota = $('#notaGuiaPesaje');
  const observacion = $('#observacionPesaje');
  const pesoInput = $('#pesoAve');
  const listaPesos = $('#listaPesos');
  const historial = $('#historialPesajes');

  const fmt = (valor, decimales = 2) =>
    Number(valor || 0).toLocaleString('es-EC', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales
    });

  function hoyLocal() {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function actualizarResumen() {
    const total = pesos.reduce((suma, peso) => suma + peso, 0);
    const promedio = pesos.length ? total / pesos.length : 0;

    $('#cantidadAves').textContent = pesos.length;
    $('#pesoTotal').textContent = fmt(total) + ' kg';
    $('#pesoPromedio').textContent = fmt(promedio) + ' kg';
  }

  function renderPesos() {
    if (!pesos.length) {
      listaPesos.innerHTML = '<div class="empty-note">No hay pesos registrados.</div>';
      actualizarResumen();
      return;
    }

    listaPesos.innerHTML = pesos.map((peso, index) => `
      <div class="weight-row">
        <strong>${index + 1}</strong>
        <span>${fmt(peso)}</span>
        <span class="unit">kg</span>
      </div>
    `).join('');

    actualizarResumen();
  }

  function agregarPeso() {
    const valor = Number(pesoInput.value);
    if (!Number.isFinite(valor) || valor <= 0) {
      alert('Ingrese un peso válido mayor que cero.');
      pesoInput.focus();
      return;
    }

    pesos.push(Number(valor.toFixed(2)));
    pesoInput.value = '';
    pesoInput.focus();
    renderPesos();
  }

  function limpiar() {
    pesos.length = 0;
    fecha.value = hoyLocal();
    cliente.value = '';
    granja.value = '';
    galpon.value = '';
    lote.value = '';
    nota.value = '';
    observacion.value = '';
    pesoInput.value = '';
    renderPesos();
  }

  async function cargarClientes() {
    const response = await fetch('/api/pesajes-avicolas/clientes');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los clientes.');

    cliente.innerHTML = '<option value="">Seleccione cliente...</option>' +
      data.clientes.map(item =>
        `<option value="${escapeHtml(item.ruccedcli)}">${escapeHtml(item.nombre)} — ${escapeHtml(item.ruccedcli)}</option>`
      ).join('');
  }

  async function cargarGranjas() {
    const response = await fetch('/api/pesajes-avicolas/granjas');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las granjas.');

    granja.innerHTML = '<option value="">Seleccione granja...</option>' +
      data.granjas.map(item =>
        `<option value="${escapeHtml(item.codproy)}">${escapeHtml(item.proyecto)} — ${escapeHtml(item.codproy)}</option>`
      ).join('');
  }

  async function cargarHistorial() {
    const response = await fetch('/api/pesajes-avicolas');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el historial.');

    if (!data.pesajes.length) {
      historial.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;padding:25px">No hay pesajes registrados.</td></tr>';
      return;
    }

    historial.innerHTML = data.pesajes.map(item => `
      <tr>
        <td>${formatearFecha(item.fecha)}</td>
        <td>${escapeHtml(item.cliente)}</td>
        <td>${escapeHtml(item.granja)}</td>
        <td>${escapeHtml([item.galpon, item.lote].filter(Boolean).join(' / ') || '—')}</td>
        <td>${item.cantidad_aves}</td>
        <td>${fmt(item.peso_total)} kg</td>
        <td>${fmt(item.peso_promedio)} kg</td>
        <td><span class="status ${item.estado === 'PROCESADO' ? 'status-pro' : 'status-ing'}">${escapeHtml(item.estado)}</span></td>
      </tr>
    `).join('');
  }

  async function guardar() {
    if (!cliente.value) return alert('Seleccione un cliente.');
    if (!granja.value) return alert('Seleccione una granja.');
    if (!pesos.length) return alert('Debe ingresar al menos un peso.');

    const boton = $('#btnGuardarPesaje');
    boton.disabled = true;
    boton.innerHTML = '<i class="fi fi-rr-refresh"></i> Guardando...';

    try {
      const response = await fetch('/api/pesajes-avicolas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: fecha.value,
          ruccedcli: cliente.value,
          codproy: granja.value,
          galpon: galpon.value,
          lote: lote.value,
          nota_guia: nota.value,
          observacion: observacion.value,
          pesos
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el pesaje.');

      alert('Pesaje guardado correctamente.');
      limpiar();
      await cargarHistorial();
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      boton.disabled = false;
      boton.innerHTML = '<i class="fi fi-rr-check"></i> Procesar y guardar';
    }
  }

  function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[caracter]));
  }

  function formatearFecha(valor) {
    if (!valor) return '';
    const texto = String(valor).slice(0, 10);
    const [y, m, d] = texto.split('-');
    return y && m && d ? `${d}/${m}/${y}` : texto;
  }

  async function iniciar() {
    fecha.value = hoyLocal();
    renderPesos();

    try {
      await Promise.all([cargarClientes(), cargarGranjas(), cargarHistorial()]);
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  $('#btnAgregarPeso').addEventListener('click', agregarPeso);
  pesoInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      agregarPeso();
    }
  });
  $('#btnLimpiarPesaje').addEventListener('click', limpiar);
  $('#btnGuardarPesaje').addEventListener('click', guardar);
  $('#btnNuevoPesaje').addEventListener('click', limpiar);

  iniciar();
})();
