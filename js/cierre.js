/* ========================================
   PEDIDOS CRUZ - Reportes: Cierre de mes
   Consulta de ingresos del mes (no cierra nada)
   ======================================== */

const CM_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CM_ESTADOS = [
    ['pendiente', 'Pendiente', '#F59E0B'], ['procesando', 'Procesando', '#3B82F6'], ['enviado', 'Enviado', '#6366F1'],
    ['entregado', 'Entregado', '#10B981'], ['cancelado', 'Cancelado', '#EF4444'],
];

function cmEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const cmMoney = n => '$' + Math.round(parseFloat(n || 0)).toLocaleString('es-CO');
const cmPct = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 : 0;

/** Página Reportes con pestañas: Cierre de mes | General */
async function renderReportes() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="cr-tabs">
            <button class="cr-tab active" data-tab="cierre"><i class="fas fa-calendar-check"></i> Cierre de mes</button>
            <button class="cr-tab" data-tab="inventario"><i class="fas fa-boxes-stacked"></i> Inventario</button>
            <button class="cr-tab" data-tab="general"><i class="fas fa-chart-line"></i> General</button>
        </div>
        <div id="rep-body"></div>`;
    container.querySelector('.cr-tabs').onclick = e => {
        const b = e.target.closest('.cr-tab'); if (!b) return;
        container.querySelectorAll('.cr-tab').forEach(x => x.classList.toggle('active', x === b));
        const body = document.getElementById('rep-body');
        body.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></div>';
        if (b.dataset.tab === 'cierre') renderCierreMes(body);
        else if (b.dataset.tab === 'inventario') renderInventario(body);
        else renderReportesGeneral(body);
    };
    renderCierreMes(document.getElementById('rep-body'));
}

async function renderCierreMes(root) {
    const hoy = new Date();
    const st = {
        anio: hoy.getFullYear(), mes: hoy.getMonth() + 1,
        estados: new Set(['pendiente', 'procesando', 'enviado', 'entregado']),
        forma: '', vendedor: '', ruta: '',
        excluidos: new Set(),
        data: null, charts: [],
    };

    root.innerHTML = `
        <div class="cm-bar fade-in">
            <div class="cm-periodo">
                <button class="btn btn-ghost btn-icon" id="cm-prev" title="Mes anterior"><i class="fas fa-chevron-left"></i></button>
                <div class="cm-periodo-sel">
                    <select id="cm-mes">${CM_MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
                    <select id="cm-anio">${Array.from({ length: 6 }, (_, i) => hoy.getFullYear() - i).map(y => `<option>${y}</option>`).join('')}</select>
                </div>
                <button class="btn btn-ghost btn-icon" id="cm-next" title="Mes siguiente"><i class="fas fa-chevron-right"></i></button>
                <span id="cm-curso"></span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" id="cm-csv"><i class="fas fa-file-excel"></i> Exportar Excel</button>
                <button class="btn btn-primary btn-sm" id="cm-print"><i class="fas fa-print"></i> Imprimir cierre</button>
            </div>
        </div>
        <div class="cm-filtros">
            <div class="cm-filtro-grupo">
                <span class="cm-filtro-label">Incluir estados</span>
                <div class="cm-estados" id="cm-estados">
                    ${CM_ESTADOS.map(([v, l, c]) => `<button class="cm-estado ${st.estados.has(v) ? 'on' : ''}" data-v="${v}" style="--c:${c}"><i class="fas fa-check"></i>${l}</button>`).join('')}
                </div>
            </div>
            <div class="cm-filtro-grupo">
                <span class="cm-filtro-label">Filtrar</span>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <select class="filter-select" id="cm-forma"><option value="">Contado y crédito</option><option value="contado">Solo contado</option><option value="credito">Solo crédito</option></select>
                    <select class="filter-select" id="cm-vendedor"><option value="">Todos los vendedores</option></select>
                    <select class="filter-select" id="cm-ruta"><option value="">Todas las rutas</option></select>
                </div>
            </div>
        </div>
        <div id="cm-content"></div>`;

    const $ = id => document.getElementById(id);
    const sincPeriodo = () => { $('cm-mes').value = st.mes; $('cm-anio').value = st.anio; };
    sincPeriodo();

    async function cargar() {
        $('cm-content').innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></div>';
        const d = await api(`/reportes/cierre?anio=${st.anio}&mes=${st.mes}`);
        if (!$('cm-content')) return; // el usuario cambió de pestaña mientras cargaba
        if (!d || d.error) {
            $('cm-content').innerHTML = `<div class="empty-state"><i class="fas fa-circle-exclamation"></i><h3>No se pudo cargar</h3><p>${cmEsc(d?.mensaje || '')}</p></div>`;
            return;
        }
        st.data = d;
        st.excluidos = new Set();
        $('cm-curso').innerHTML = d.periodo.en_curso ? '<span class="cm-curso"><i class="fas fa-circle"></i> Mes en curso</span>' : '';

        // Opciones de vendedor y ruta según los pedidos del mes
        const vend = new Map(), rut = new Map();
        d.pedidos.forEach(p => { if (p.id_vendedor) vend.set(String(p.id_vendedor), p.vendedor); if (p.id_ruta) rut.set(String(p.id_ruta), p.ruta); });
        $('cm-vendedor').innerHTML = '<option value="">Todos los vendedores</option>' + [...vend].sort((a, b) => (a[1] || '').localeCompare(b[1] || '')).map(([k, v]) => `<option value="${k}">${cmEsc(v)}</option>`).join('');
        $('cm-ruta').innerHTML = '<option value="">Todas las rutas</option>' + [...rut].sort((a, b) => (a[1] || '').localeCompare(b[1] || '')).map(([k, v]) => `<option value="${k}">${cmEsc(v)}</option>`).join('');
        if (vend.has(st.vendedor)) $('cm-vendedor').value = st.vendedor; else st.vendedor = '';
        if (rut.has(st.ruta)) $('cm-ruta').value = st.ruta; else st.ruta = '';

        pintar();
    }

    /** Pedidos visibles con los filtros (antes de las exclusiones manuales) */
    function visibles() {
        return (st.data?.pedidos || []).filter(p =>
            st.estados.has(p.estado) &&
            (!st.forma || (p.forma_pago || 'contado') === st.forma) &&
            (!st.vendedor || String(p.id_vendedor) === st.vendedor) &&
            (!st.ruta || String(p.id_ruta) === st.ruta));
    }

    function calcular() {
        const vis = visibles();
        const inc = vis.filter(p => !st.excluidos.has(p.id_pedido));
        const sum = (l, k) => l.reduce((s, x) => s + parseFloat(x[k] || 0), 0);
        const contado = inc.filter(p => (p.forma_pago || 'contado') === 'contado');
        const credito = inc.filter(p => p.forma_pago === 'credito');
        const ids = new Set(inc.map(p => p.id_pedido));

        const agrupar = (keyFn, nameFn) => {
            const m = new Map();
            inc.forEach(p => {
                const k = keyFn(p);
                const g = m.get(k) || { nombre: nameFn(p), pedidos: 0, total: 0 };
                g.pedidos++; g.total += parseFloat(p.total);
                m.set(k, g);
            });
            return [...m.values()].sort((a, b) => b.total - a.total);
        };

        // Productos de los pedidos incluidos
        const prods = new Map();
        (st.data?.lineas || []).forEach(l => {
            if (!ids.has(l.id_pedido)) return;
            const g = prods.get(l.id_producto) || { nombre: l.nombre || 'Producto', codigo: l.codigo, unidades: 0, total: 0 };
            g.unidades += parseFloat(l.unidades || 0); g.total += parseFloat(l.subtotal || 0);
            prods.set(l.id_producto, g);
        });

        // Ventas por día
        const dias = new Date(st.anio, st.mes, 0).getDate();
        const porDia = Array(dias).fill(0);
        inc.forEach(p => { porDia[new Date(p.fecha_pedido.replace(' ', 'T')).getDate() - 1] += parseFloat(p.total); });

        const pagos = st.data?.pagos_mes || [];
        const abonos = sum(pagos, 'valor');
        const total = sum(inc, 'total');

        return {
            vis, inc, total, n: inc.length,
            ticket: inc.length ? total / inc.length : 0,
            contado: sum(contado, 'total'), nContado: contado.length,
            credito: sum(credito, 'total'), nCredito: credito.length,
            creditoAbonado: sum(credito, 'abonado'),
            abonos, nAbonos: pagos.length,
            recaudo: sum(contado, 'total') + abonos,
            descuentos: sum(inc, 'descuento'),
            porVendedor: agrupar(p => p.id_vendedor || 0, p => p.vendedor || 'Sin vendedor'),
            porRuta: agrupar(p => p.id_ruta || 0, p => p.ruta || 'Sin ruta'),
            porEstado: CM_ESTADOS.map(([v, l, c]) => ({ v, l, c, n: vis.filter(p => p.estado === v && !st.excluidos.has(p.id_pedido)).length, total: sum(vis.filter(p => p.estado === v && !st.excluidos.has(p.id_pedido)), 'total') })),
            productos: [...prods.values()].sort((a, b) => b.total - a.total),
            porDia, dias,
            facturados: inc.filter(p => p.factura).length,
            cancelados: (st.data?.pedidos || []).filter(p => p.estado === 'cancelado'),
        };
    }

    function pintar() {
        if (!$('cm-content')) return;
        st.charts.forEach(c => c.destroy()); st.charts = [];
        const c = calcular();
        const cmp = st.data.comparativo;
        const delta = (a, b) => {
            if (!b) return '<span class="cm-delta">sin datos previos</span>';
            const p = Math.round((a - b) / b * 1000) / 10;
            return `<span class="cm-delta ${p >= 0 ? 'up' : 'down'}"><i class="fas fa-arrow-${p >= 0 ? 'up' : 'down'}"></i> ${Math.abs(p)}%</span>`;
        };
        const nombreMes = m => { const [y, mm] = m.split('-'); return CM_MESES[parseInt(mm) - 1].slice(0, 3) + ' ' + y; };
        const credito = st.data.modulos.credito;

        $('cm-content').innerHTML = `
            <div class="cm-hero fade-in">
                <div>
                    <div class="cm-hero-label">VENTAS · ${CM_MESES[st.mes - 1].toUpperCase()} ${st.anio}</div>
                    <div class="cm-hero-total">${cmMoney(c.total)}</div>
                    <div class="cm-hero-sub">${c.n} pedido${c.n === 1 ? '' : 's'} incluido${c.n === 1 ? '' : 's'}${c.vis.length - c.n ? ` · ${c.vis.length - c.n} excluido${c.vis.length - c.n === 1 ? '' : 's'} manualmente` : ''}</div>
                </div>
                <div class="cm-hero-cmp">
                    <div><span>vs ${nombreMes(cmp.mes_anterior.mes)}</span><strong>${cmMoney(cmp.mes_anterior.ventas)}</strong>${delta(c.total, cmp.mes_anterior.ventas)}</div>
                    <div><span>vs ${nombreMes(cmp.anio_anterior.mes)}</span><strong>${cmMoney(cmp.anio_anterior.ventas)}</strong>${delta(c.total, cmp.anio_anterior.ventas)}</div>
                </div>
            </div>

            <div class="stats-grid fade-in">
                <div class="stat-card blue"><div class="stat-icon blue"><i class="fas fa-receipt"></i></div>
                    <div class="stat-info"><h4>Ticket promedio</h4><div class="stat-value">${cmMoney(c.ticket)}</div><div class="cr-stat-sub">${c.n} pedidos</div></div></div>
                ${credito ? `
                <div class="stat-card green"><div class="stat-icon green"><i class="fas fa-money-bill-wave"></i></div>
                    <div class="stat-info"><h4>Contado</h4><div class="stat-value">${cmMoney(c.contado)}</div><div class="cr-stat-sub">${c.nContado} pedidos · ${cmPct(c.contado, c.total)}%</div></div></div>
                <div class="stat-card orange"><div class="stat-icon orange"><i class="fas fa-handshake"></i></div>
                    <div class="stat-info"><h4>Crédito</h4><div class="stat-value">${cmMoney(c.credito)}</div><div class="cr-stat-sub">${c.nCredito} pedidos · por cobrar ${cmMoney(c.credito - c.creditoAbonado)}</div></div></div>
                <div class="stat-card purple" title="Contado del mes + abonos recibidos en el mes (de cualquier crédito)"><div class="stat-icon purple"><i class="fas fa-sack-dollar"></i></div>
                    <div class="stat-info"><h4>Recaudo del mes</h4><div class="stat-value">${cmMoney(c.recaudo)}</div><div class="cr-stat-sub">Contado + ${cmMoney(c.abonos)} en abonos</div></div></div>`
                : `
                <div class="stat-card green"><div class="stat-icon green"><i class="fas fa-box"></i></div>
                    <div class="stat-info"><h4>Productos distintos</h4><div class="stat-value">${c.productos.length}</div></div></div>`}
            </div>

            <div class="cm-grid-2 fade-in">
                <div class="card">
                    <div class="card-header"><h3><i class="fas fa-chart-column" style="color:var(--primary);margin-right:8px"></i>Ventas por día</h3></div>
                    <div class="card-body"><div class="chart-container" style="height:240px"><canvas id="cm-chart-dias"></canvas></div></div>
                </div>
                <div class="card">
                    <div class="card-header"><h3><i class="fas fa-layer-group" style="color:var(--warning);margin-right:8px"></i>Por estado</h3></div>
                    <div class="card-body" style="padding-top:8px">
                        ${c.porEstado.filter(e => st.estados.has(e.v)).map(e => `
                            <div class="cm-bar-row">
                                <div class="cm-bar-head"><span><i class="fas fa-circle" style="color:${e.c};font-size:8px;margin-right:6px"></i>${e.l} <small>(${e.n})</small></span><strong>${cmMoney(e.total)}</strong></div>
                                <div class="cm-bar-track"><div style="width:${cmPct(e.total, c.total)}%;background:${e.c}"></div></div>
                            </div>`).join('') || '<p style="color:var(--text-muted)">Sin estados seleccionados</p>'}
                        ${c.cancelados.length ? `<div class="cm-nota"><i class="fas fa-ban"></i> ${c.cancelados.length} pedido${c.cancelados.length === 1 ? '' : 's'} cancelado${c.cancelados.length === 1 ? '' : 's'} por ${cmMoney(c.cancelados.reduce((s, p) => s + parseFloat(p.total), 0))}${st.estados.has('cancelado') ? ' (incluidos)' : ' (no incluidos)'}</div>` : ''}
                        ${c.facturados ? `<div class="cm-nota"><i class="fas fa-file-invoice-dollar"></i> ${c.facturados} con factura electrónica</div>` : ''}
                    </div>
                </div>
            </div>

            <div class="cm-grid-3 fade-in">
                ${cmRanking('Por vendedor', 'fa-user-tie', 'var(--info)', c.porVendedor, c.total, x => `${x.pedidos} ped.`)}
                ${cmRanking('Por ruta', 'fa-route', 'var(--success)', c.porRuta, c.total, x => `${x.pedidos} ped.`)}
                ${cmRanking('Top productos', 'fa-trophy', 'var(--warning)', c.productos.slice(0, 10), c.total, x => `${formatNumber(x.unidades)} uds`)}
            </div>

            <div class="card fade-in">
                <div class="card-header">
                    <h3><i class="fas fa-list-check" style="color:var(--primary);margin-right:8px"></i>Pedidos del mes</h3>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                        <span style="font-size:13px;color:var(--text-muted)">${c.n} de ${c.vis.length} incluidos</span>
                        ${st.excluidos.size ? `<button class="btn btn-ghost btn-sm" id="cm-reset"><i class="fas fa-rotate-left"></i> Incluir todos</button>` : ''}
                    </div>
                </div>
                <div class="cm-hint"><i class="fas fa-hand-pointer"></i> Desmarca un pedido para sacarlo del cierre; los totales se recalculan al instante. No se modifica nada.</div>
                <div class="table-wrapper">
                    <table class="data-table cm-tabla">
                        <thead><tr>
                            <th style="width:36px"><input type="checkbox" id="cm-all" ${st.excluidos.size === 0 ? 'checked' : ''}></th>
                            <th># Pedido</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Ruta</th>${credito ? '<th>Pago</th>' : ''}<th>Estado</th><th style="text-align:right">Total</th>
                        </tr></thead>
                        <tbody>
                            ${c.vis.length ? c.vis.map(p => {
                                const off = st.excluidos.has(p.id_pedido);
                                return `
                                <tr class="${off ? 'cm-off' : ''}">
                                    <td><input type="checkbox" class="cm-chk" data-id="${p.id_pedido}" ${off ? '' : 'checked'}></td>
                                    <td><a class="fe-link" onclick="viewPedido(${p.id_pedido})">${cmEsc(p.numero_pedido)}</a>${p.factura ? `<div class="cm-fe"><i class="fas fa-file-invoice-dollar"></i> ${cmEsc(p.factura)}</div>` : ''}</td>
                                    <td style="white-space:nowrap">${formatDateShort(p.fecha_pedido)}</td>
                                    <td><div style="font-weight:600">${cmEsc(p.cliente_razon || p.cliente_nombre)}</div>${p.cliente_razon ? `<div style="font-size:12px;color:var(--text-muted)">${cmEsc(p.cliente_nombre)}</div>` : ''}</td>
                                    <td style="font-size:13px">${cmEsc(p.vendedor || '-')}</td>
                                    <td>${p.ruta ? `<span class="cm-ruta" style="background:${p.ruta_color}22;color:${p.ruta_color}">${cmEsc(p.ruta)}</span>` : '-'}</td>
                                    ${credito ? `<td>${p.forma_pago === 'credito' ? `<span class="cr-chip"><i class="fas fa-handshake"></i>Crédito</span>` : '<span style="font-size:12px;color:var(--text-muted)">Contado</span>'}</td>` : ''}
                                    <td><span class="badge-status badge-${p.estado}">${p.estado}</span></td>
                                    <td style="text-align:right;font-weight:700">${cmMoney(p.total)}</td>
                                </tr>`;
                            }).join('') : `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-inbox"></i><h3>Sin pedidos</h3><p>No hay pedidos con estos filtros en ${CM_MESES[st.mes - 1]} ${st.anio}.</p></div></td></tr>`}
                        </tbody>
                        ${c.vis.length ? `<tfoot><tr class="cr-tfoot"><td colspan="${credito ? 8 : 7}" style="text-align:right">TOTAL INCLUIDO (${c.n} pedidos)</td><td style="text-align:right;font-size:16px">${cmMoney(c.total)}</td></tr></tfoot>` : ''}
                    </table>
                </div>
            </div>`;

        // Eventos de la tabla
        $('cm-content').querySelectorAll('.cm-chk').forEach(ch => ch.onchange = () => {
            const id = parseInt(ch.dataset.id);
            ch.checked ? st.excluidos.delete(id) : st.excluidos.add(id);
            const y = window.scrollY; pintar(); window.scrollTo(0, y);
        });
        const all = $('cm-all');
        if (all) all.onchange = () => {
            st.excluidos = all.checked ? new Set() : new Set(c.vis.map(p => p.id_pedido));
            const y = window.scrollY; pintar(); window.scrollTo(0, y);
        };
        const reset = $('cm-reset');
        if (reset) reset.onclick = () => { st.excluidos = new Set(); pintar(); };

        // Gráfica por día
        const hoyD = new Date();
        const enCurso = st.data.periodo.en_curso;
        st.charts.push(new Chart($('cm-chart-dias'), {
            type: 'bar',
            data: {
                labels: c.porDia.map((_, i) => i + 1),
                datasets: [{
                    data: c.porDia,
                    backgroundColor: c.porDia.map((v, i) => enCurso && i + 1 > hoyD.getDate() ? 'rgba(148,163,184,.15)' : (v > 0 ? 'rgba(99,102,241,.85)' : 'rgba(99,102,241,.15)')),
                    borderRadius: 4, borderSkipped: false,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => `${i[0].label} de ${CM_MESES[st.mes - 1]}`, label: x => cmMoney(x.parsed.y) } } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: { callback: v => '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v) } },
                    x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0 } },
                },
            },
        }));
    }

    // ---------- Filtros ----------
    const irMes = delta => {
        const d = new Date(st.anio, st.mes - 1 + delta, 1);
        st.anio = d.getFullYear(); st.mes = d.getMonth() + 1;
        if (![...$('cm-anio').options].some(o => +o.value === st.anio)) $('cm-anio').insertAdjacentHTML('beforeend', `<option>${st.anio}</option>`);
        sincPeriodo(); cargar();
    };
    $('cm-prev').onclick = () => irMes(-1);
    $('cm-next').onclick = () => irMes(1);
    $('cm-mes').onchange = () => { st.mes = +$('cm-mes').value; cargar(); };
    $('cm-anio').onchange = () => { st.anio = +$('cm-anio').value; cargar(); };
    $('cm-estados').onclick = e => {
        const b = e.target.closest('.cm-estado'); if (!b) return;
        st.estados.has(b.dataset.v) ? st.estados.delete(b.dataset.v) : st.estados.add(b.dataset.v);
        b.classList.toggle('on');
        if (st.data) pintar();
    };
    $('cm-forma').onchange = () => { st.forma = $('cm-forma').value; pintar(); };
    $('cm-vendedor').onchange = () => { st.vendedor = $('cm-vendedor').value; pintar(); };
    $('cm-ruta').onchange = () => { st.ruta = $('cm-ruta').value; pintar(); };

    // ---------- Exportar / imprimir ----------
    $('cm-csv').onclick = () => {
        if (!st.data) return;
        const c = calcular();
        const filas = [['Pedido', 'Fecha', 'Cliente', 'Razon social', 'Vendedor', 'Ruta', 'Forma pago', 'Estado', 'Factura', 'Subtotal', 'Descuento', 'Total', 'Abonado']];
        c.inc.forEach(p => filas.push([p.numero_pedido, p.fecha_pedido, p.cliente_nombre, p.cliente_razon || '', p.vendedor || '', p.ruta || '',
            p.forma_pago || 'contado', p.estado, p.factura || '', p.subtotal, p.descuento, p.total, p.abonado]));
        filas.push([]); filas.push(['', '', '', '', '', '', '', '', 'TOTAL', '', '', c.total.toFixed(2)]);
        const csv = '﻿' + filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `cierre_${st.anio}-${String(st.mes).padStart(2, '0')}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    $('cm-print').onclick = () => {
        if (!st.data) return;
        const c = calcular();
        const credito = st.data.modulos.credito;
        const tabla = (titulo, lista, extra) => `
            <h3 style="margin:18px 0 6px;font-size:13px">${titulo}</h3>
            <table><thead><tr><th>Nombre</th><th style="text-align:right">${extra}</th><th style="text-align:right">Total</th><th style="text-align:right">%</th></tr></thead>
            <tbody>${lista.map(x => `<tr><td>${cmEsc(x.nombre)}</td><td style="text-align:right">${x.pedidos ?? formatNumber(x.unidades)}</td><td style="text-align:right">${cmMoney(x.total)}</td><td style="text-align:right">${cmPct(x.total, c.total)}%</td></tr>`).join('')}</tbody></table>`;
        const filtros = [
            'Estados: ' + CM_ESTADOS.filter(e => st.estados.has(e[0])).map(e => e[1]).join(', '),
            st.forma ? 'Pago: ' + st.forma : '', st.vendedor ? 'Vendedor: ' + $('cm-vendedor').selectedOptions[0].text : '',
            st.ruta ? 'Ruta: ' + $('cm-ruta').selectedOptions[0].text : '', st.excluidos.size ? `${st.excluidos.size} pedidos excluidos manualmente` : '',
        ].filter(Boolean).join(' · ');

        printHTML(`
            <h1>Cierre de mes — ${CM_MESES[st.mes - 1]} ${st.anio}</h1>
            <p style="color:#666;margin-bottom:14px">Generado: ${new Date().toLocaleString('es-CO')}${st.data.periodo.en_curso ? ' · <b>Mes en curso (parcial)</b>' : ''}<br>${cmEsc(filtros)}</p>
            <table style="margin-bottom:8px"><tbody>
                <tr><td><b>Ventas del mes</b></td><td style="text-align:right;font-size:18px"><b>${cmMoney(c.total)}</b></td></tr>
                <tr><td>Pedidos incluidos</td><td style="text-align:right">${c.n}</td></tr>
                <tr><td>Ticket promedio</td><td style="text-align:right">${cmMoney(c.ticket)}</td></tr>
                ${c.descuentos > 0 ? `<tr><td>Descuentos otorgados</td><td style="text-align:right">${cmMoney(c.descuentos)}</td></tr>` : ''}
                ${credito ? `
                <tr><td>Ventas de contado (${c.nContado})</td><td style="text-align:right">${cmMoney(c.contado)}</td></tr>
                <tr><td>Ventas a crédito (${c.nCredito})</td><td style="text-align:right">${cmMoney(c.credito)}</td></tr>
                <tr><td>Abonos recibidos en el mes (${c.nAbonos})</td><td style="text-align:right">${cmMoney(c.abonos)}</td></tr>
                <tr><td><b>Recaudo del mes</b> (contado + abonos)</td><td style="text-align:right"><b>${cmMoney(c.recaudo)}</b></td></tr>
                <tr><td>Crédito del mes por cobrar</td><td style="text-align:right">${cmMoney(c.credito - c.creditoAbonado)}</td></tr>` : ''}
                <tr><td>Mes anterior (${st.data.comparativo.mes_anterior.mes})</td><td style="text-align:right">${cmMoney(st.data.comparativo.mes_anterior.ventas)}</td></tr>
            </tbody></table>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                <div>${tabla('Por vendedor', c.porVendedor, 'Pedidos')}</div>
                <div>${tabla('Por ruta', c.porRuta, 'Pedidos')}</div>
            </div>
            ${tabla('Top 15 productos', c.productos.slice(0, 15), 'Unidades')}
            <h3 style="margin:18px 0 6px;font-size:13px;page-break-before:always">Listado de pedidos (${c.n})</h3>
            <table><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th>${credito ? '<th>Pago</th>' : ''}<th>Estado</th><th style="text-align:right">Total</th></tr></thead>
            <tbody>${c.inc.map(p => `<tr><td>${cmEsc(p.numero_pedido)}</td><td>${formatDateShort(p.fecha_pedido)}</td><td>${cmEsc(p.cliente_razon || p.cliente_nombre)}</td><td>${cmEsc(p.vendedor || '')}</td>${credito ? `<td>${p.forma_pago === 'credito' ? 'Crédito' : 'Contado'}</td>` : ''}<td>${p.estado}</td><td style="text-align:right">${cmMoney(p.total)}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="${credito ? 6 : 5}" style="text-align:right;font-weight:700;padding-top:12px">TOTAL</td><td style="text-align:right;font-weight:700;font-size:16px">${cmMoney(c.total)}</td></tr></tfoot></table>`);
    };

    cargar();
}

function cmRanking(titulo, icon, color, lista, total, sub) {
    return `
        <div class="card">
            <div class="card-header"><h3><i class="fas ${icon}" style="color:${color};margin-right:8px"></i>${titulo}</h3></div>
            <div class="card-body" style="padding-top:8px">
                ${lista.length ? lista.map(x => `
                    <div class="cm-bar-row">
                        <div class="cm-bar-head"><span>${cmEsc(x.nombre)} <small>${sub(x)}</small></span><strong>${cmMoney(x.total)}</strong></div>
                        <div class="cm-bar-track"><div style="width:${cmPct(x.total, total)}%;background:${color}"></div></div>
                    </div>`).join('') : '<p style="color:var(--text-muted);font-size:13px">Sin datos</p>'}
            </div>
        </div>`;
}
