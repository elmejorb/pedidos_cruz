/* ========================================
   PEDIDOS TÍPICOS - Informes imprimibles
   Cada informe: período/filtros, indicadores, agrupaciones con %, imprimir (PDF) y Excel.
   Datos en InformeController (api). Usa los estilos y ayudas del cierre de mes (cm*).
   ======================================== */

const INF = { listas: null, charts: [] };

const infMoney = n => cmMoney(n);
const infNum = n => Math.round(parseFloat(n || 0)).toLocaleString('es-CO');
const infFecha = s => s ? new Date(String(s).substring(0, 10) + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const infHoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const infISO = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const infSum = (l, k) => l.reduce((s, x) => s + (parseFloat(typeof k === 'function' ? k(x) : x[k]) || 0), 0);
const infCli = x => x.cliente_razon || x.razon_social || x.cliente_nombre || x.nombre || '';
const infDoc = x => x.tipo === 'saldo_anterior' ? (x.documento_ref || x.numero_pedido) + ' (saldo ant.)' : x.numero_pedido;

const INF_PRESETS = [
    ['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mes_ant', 'Mes anterior'],
    ['trimestre', 'Últimos 3 meses'], ['anio', 'Este año'], ['anio_ant', 'Año anterior'], ['custom', 'Personalizado'],
];

function infRango(preset) {
    const h = new Date(); const y = h.getFullYear(), m = h.getMonth();
    switch (preset) {
        case 'hoy': return [infISO(h), infISO(h)];
        case 'semana': { const d = new Date(h); d.setDate(h.getDate() - ((h.getDay() + 6) % 7)); return [infISO(d), infISO(h)]; }
        case 'mes_ant': return [infISO(new Date(y, m - 1, 1)), infISO(new Date(y, m, 0))];
        case 'trimestre': return [infISO(new Date(y, m - 2, 1)), infISO(h)];
        case 'anio': return [infISO(new Date(y, 0, 1)), infISO(h)];
        case 'anio_ant': return [infISO(new Date(y - 1, 0, 1)), infISO(new Date(y - 1, 11, 31))];
        default: return [infISO(new Date(y, m, 1)), infISO(h)];
    }
}

async function infListas() {
    if (!INF.listas) {
        const [u, r, c, p] = await Promise.all([api('/auth/usuarios'), api('/rutas'), api('/categorias'), api('/proveedores')]);
        INF.listas = {
            vendedores: (u?.usuarios || []).filter(x => x.activo !== 0 && x.activo !== false),
            rutas: r?.rutas || [], categorias: c?.categorias || [], proveedores: p?.proveedores || [],
        };
    }
    return INF.listas;
}

/** Tabla reutilizable (pantalla e impresión). cols: [{t, k|f, n (numérica), m (dinero), w}] */
function infTabla(cols, filas, pie = null, opts = {}) {
    const val = (c, x, i) => {
        const v = c.f ? c.f(x, i) : x[c.k];
        if (c.html) return v ?? '';
        if (c.m) return infMoney(v);
        if (c.n) return typeof v === 'number' || /^-?[\d.]+$/.test(String(v ?? '')) ? infNum(v) : (v ?? '');
        return cmEsc(v ?? '');
    };
    if (!filas.length) return `<div class="inf-vacio">${opts.vacio || 'Sin datos en el período'}</div>`;
    return `<div class="table-wrapper"><table class="data-table inf-tabla">
        <thead><tr>${cols.map(c => `<th${c.n || c.m ? ' class="r"' : ''}${c.w ? ` style="width:${c.w}"` : ''}>${c.t}</th>`).join('')}</tr></thead>
        <tbody>${filas.map((x, i) => `<tr${opts.claseFila ? ` class="${opts.claseFila(x) || ''}"` : ''}>${cols.map(c => `<td${c.n || c.m ? ' class="r"' : ''}>${val(c, x, i)}</td>`).join('')}</tr>`).join('')}</tbody>
        ${pie ? `<tfoot><tr>${pie.map((v, i) => `<td${cols[i] && (cols[i].n || cols[i].m) ? ' class="r"' : ''}>${v ?? ''}</td>`).join('')}</tr></tfoot>` : ''}
    </table></div>`;
}

function infCard(titulo, icono, color, cuerpo, extra = '') {
    return `<div class="card inf-card"><div class="card-header"><h3><i class="fas ${icono}" style="color:${color};margin-right:8px"></i>${titulo}</h3>${extra}</div><div class="card-body inf-card-body">${cuerpo}</div></div>`;
}

function infStats(items) {
    return `<div class="stats-grid inf-stats">${items.map(([t, v, sub, color, icono]) => `
        <div class="stat-card ${color}"><div class="stat-icon ${color}"><i class="fas ${icono}"></i></div>
            <div class="stat-info"><h4>${t}</h4><div class="stat-value">${v}</div>${sub ? `<div class="cr-stat-sub">${sub}</div>` : ''}</div></div>`).join('')}</div>`;
}

function infHero(label, total, sub, cmp = []) {
    return `<div class="cm-hero fade-in"><div style="position:relative;z-index:1"><div class="cm-hero-label">${label}</div><div class="cm-hero-total">${total}</div><div class="cm-hero-sub">${sub}</div></div>
        ${cmp.length ? `<div class="cm-hero-cmp">${cmp.map(([t, v, s]) => `<div><span>${t}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`).join('')}</div>` : ''}</div>`;
}

/** Ranking con barras (pantalla) */
function infRanking(titulo, icono, color, lista, total, sub, n = 10) {
    return cmRanking(titulo, icono, color, lista.slice(0, n).map(x => ({ ...x, total: parseFloat(x.total) })), total, sub);
}

/** Variación % con signo y color */
function infVar(actual, anterior) {
    if (!anterior) return actual ? '<span class="inf-up">nuevo</span>' : '-';
    const v = (actual - anterior) / anterior * 100;
    return `<span class="${v >= 0 ? 'inf-up' : 'inf-down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}%</span>`;
}

function infCSV(nombre, filas) {
    const csv = '﻿' + filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nombre + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Estilos extra de la impresión (se añaden al printHTML general) */
const INF_PRINT_CSS = `<style>
    .r{text-align:right} h1{font-size:20px} .ps{color:#666;margin-bottom:14px;font-size:12px}
    h3.pt{margin:18px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.4px}
    .pk{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 6px}
    .pk div{border:1px solid #ddd;border-radius:6px;padding:8px 10px}.pk span{display:block;font-size:10px;color:#777;text-transform:uppercase}
    .pk b{font-size:15px} tfoot td{font-weight:700;border-top:2px solid #333} .inf-up{color:#047857}.inf-down{color:#B91C1C}
    .table-wrapper{overflow:visible} table{page-break-inside:auto} tr{page-break-inside:avoid}
    .venc td{color:#B91C1C} .chip{font-size:10px;border:1px solid #999;border-radius:8px;padding:0 5px}
</style>`;

function infImprimir(def, st, cuerpo) {
    printHTML(`${INF_PRINT_CSS}<h1>${def.titulo}</h1><p class="ps">${infDescFiltros(def, st)}</p>${cuerpo}`);
}

function infKpisPrint(items) {
    return `<div class="pk">${items.map(([t, v]) => `<div><span>${t}</span><b>${v}</b></div>`).join('')}</div>`;
}

function infDescFiltros(def, st) {
    const L = INF.listas || {};
    const nom = (lista, k, id) => (lista || []).find(x => String(x[k]) === String(id))?.nombre;
    const p = [];
    if (def.periodo) p.push(`Período: ${infFecha(st.desde)} al ${infFecha(st.hasta)}`);
    else p.push(`Corte: ${infFecha(infHoy())}`);
    if (st.vendedor) p.push('Vendedor: ' + nom(L.vendedores, 'id_usuario', st.vendedor));
    if (st.ruta) p.push('Ruta: ' + nom(L.rutas, 'id_ruta', st.ruta));
    if (st.proveedor) p.push('Proveedor: ' + nom(L.proveedores, 'id_proveedor', st.proveedor));
    if (st.categoria) p.push('Categoría: ' + nom(L.categorias, 'id_categoria', st.categoria));
    if (st.forma) p.push('Pago: ' + (st.forma === 'credito' ? 'crédito' : 'contado'));
    p.push('Generado: ' + new Date().toLocaleString('es-CO'));
    return cmEsc(p.join(' · '));
}

function infDestruirCharts() {
    INF.charts.forEach(c => { try { c.destroy(); } catch (e) { /* ya no existe */ } });
    INF.charts = [];
}

// ========================================
// MARCO COMÚN: barra de período, filtros, botones y carga
// ========================================
async function infRender(clave, root) {
    const def = INF_DEFS[clave];
    if (!def) { root.innerHTML = '<div class="empty-state"><h3>Informe no encontrado</h3></div>'; return; }
    infDestruirCharts();
    const L = await infListas();
    const [d0, h0] = infRango(def.preset || 'mes');
    const st = { preset: def.preset || 'mes', desde: d0, hasta: h0, vendedor: '', ruta: '', proveedor: '', categoria: '', forma: '', ...(def.estado ? def.estado() : {}) };
    let data = null;

    const sel = (id, label, lista, k) => `<select class="filter-select" id="${id}"><option value="">${label}</option>${lista.map(x => `<option value="${x[k]}">${cmEsc(x.nombre)}</option>`).join('')}</select>`;
    const f = def.filtros || [];
    root.innerHTML = `
        <div class="cm-bar fade-in">
            <div class="inf-periodo">
                ${def.periodo ? `
                    <select class="filter-select" id="inf-preset">${INF_PRESETS.map(([v, l]) => `<option value="${v}" ${v === st.preset ? 'selected' : ''}>${l}</option>`).join('')}</select>
                    <input type="date" class="filter-select" id="inf-desde" value="${st.desde}" title="Desde">
                    <span class="inf-al">al</span>
                    <input type="date" class="filter-select" id="inf-hasta" value="${st.hasta}" title="Hasta">`
                : `<span class="inf-corte"><i class="fas fa-calendar-day"></i> Corte al ${infFecha(infHoy())}</span>`}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" id="inf-csv"><i class="fas fa-file-excel"></i> Exportar Excel</button>
                <button class="btn btn-primary btn-sm" id="inf-print"><i class="fas fa-print"></i> Imprimir / PDF</button>
            </div>
        </div>
        ${f.length || def.controles ? `<div class="cm-filtros">
            <div class="cm-filtro-grupo"><span class="cm-filtro-label">Filtrar</span><div style="display:flex;gap:8px;flex-wrap:wrap">
                ${f.includes('vendedor') ? sel('inf-vendedor', 'Todos los vendedores', L.vendedores, 'id_usuario') : ''}
                ${f.includes('ruta') ? sel('inf-ruta', 'Todas las rutas', L.rutas, 'id_ruta') : ''}
                ${f.includes('forma') ? `<select class="filter-select" id="inf-forma"><option value="">Contado y crédito</option><option value="contado">Solo contado</option><option value="credito">Solo crédito</option></select>` : ''}
                ${f.includes('categoria') ? sel('inf-categoria', 'Todas las categorías', L.categorias, 'id_categoria') : ''}
                ${f.includes('proveedor') ? sel('inf-proveedor', 'Todos los proveedores', L.proveedores, 'id_proveedor') : ''}
                ${def.controles ? def.controles(st, L) : ''}
            </div></div>
        </div>` : ''}
        <div id="inf-content"></div>`;

    const $ = id => document.getElementById(id);
    const content = $('inf-content');

    async function cargar() {
        content.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></div>';
        const url = def.url(st);
        if (!url) { data = null; pintar(); return; }
        const d = await api(url);
        if (!document.body.contains(content)) return; // salió del informe
        if (!d || d.error) { content.innerHTML = `<div class="empty-state"><i class="fas fa-circle-exclamation"></i><h3>No se pudo cargar</h3><p>${cmEsc(d?.mensaje || '')}</p></div>`; data = null; return; }
        data = d;
        pintar();
    }
    function pintar() {
        infDestruirCharts();
        content.innerHTML = def.render(data, st);
        if (def.despues) def.despues(data, st, content, pintar, cargar);
    }

    if (def.periodo) {
        const fijar = () => { st.preset = 'custom'; $('inf-preset').value = 'custom'; };
        $('inf-preset').onchange = () => {
            st.preset = $('inf-preset').value;
            if (st.preset !== 'custom') { [st.desde, st.hasta] = infRango(st.preset); $('inf-desde').value = st.desde; $('inf-hasta').value = st.hasta; cargar(); }
        };
        $('inf-desde').onchange = () => { fijar(); st.desde = $('inf-desde').value; if (st.desde && st.hasta) cargar(); };
        $('inf-hasta').onchange = () => { fijar(); st.hasta = $('inf-hasta').value; if (st.desde && st.hasta) cargar(); };
    }
    [['vendedor', 'inf-vendedor'], ['ruta', 'inf-ruta'], ['forma', 'inf-forma'], ['categoria', 'inf-categoria'], ['proveedor', 'inf-proveedor']].forEach(([k, id]) => {
        if ($(id)) $(id).onchange = () => { st[k] = $(id).value; cargar(); };
    });
    if (def.enlazar) def.enlazar(st, root, cargar, pintar);
    const listo = () => { if (data) return true; toast(def.url(st) ? 'Espera a que cargue el informe' : 'Primero escoge el cliente', 'warning'); return false; };
    $('inf-print').onclick = () => { if (listo()) infImprimir(def, st, def.imprimir(data, st)); };
    $('inf-csv').onclick = () => { if (listo()) infCSV(def.archivo ? def.archivo(st) : clave + '_' + st.desde + '_' + st.hasta, def.excel(data, st)); };
    cargar();
}

const infQS = (st, extra = {}) => {
    const q = new URLSearchParams();
    ['desde', 'hasta'].forEach(k => st[k] && q.set(k, st[k]));
    if (st.vendedor) q.set('id_vendedor', st.vendedor);
    if (st.ruta) q.set('id_ruta', st.ruta);
    if (st.forma) q.set('forma_pago', st.forma);
    if (st.categoria) q.set('id_categoria', st.categoria);
    if (st.proveedor) q.set('id_proveedor', st.proveedor);
    Object.entries(extra).forEach(([k, v]) => q.set(k, v));
    return q.toString();
};

/** Agrupa los productos vendidos por un campo (categoria / proveedor) */
function infAgrupar(lista, campo) {
    const m = new Map();
    lista.forEach(p => {
        const k = p[campo] || '—';
        const g = m.get(k) || { nombre: k, unidades: 0, total: 0, productos: 0 };
        g.unidades += parseFloat(p.unidades || 0); g.total += parseFloat(p.total || 0); g.productos++;
        m.set(k, g);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
}

/** Buckets de edades de cartera */
const INF_EDADES = [['corriente', 'Por vencer'], ['d30', '1 a 30 días'], ['d60', '31 a 60'], ['d90', '61 a 90'], ['d90m', 'Más de 90']];
function infEdad(dias) {
    dias = parseInt(dias);
    if (dias <= 0) return 'corriente';
    if (dias <= 30) return 'd30';
    if (dias <= 60) return 'd60';
    if (dias <= 90) return 'd90';
    return 'd90m';
}
function infEdades(docs, keyFn, nameFn, extraFn = () => ({})) {
    const m = new Map();
    docs.forEach(d => {
        const k = keyFn(d);
        const g = m.get(k) || { nombre: nameFn(d), docs: [], corriente: 0, d30: 0, d60: 0, d90: 0, d90m: 0, total: 0, ...extraFn(d) };
        const s = parseFloat(d.saldo);
        g[infEdad(d.dias_vencido)] += s; g.total += s; g.docs.push(d);
        m.set(k, g);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
}

// ========================================
// DEFINICIÓN DE CADA INFORME
// ========================================
const INF_DEFS = {

    // ---------------------------------------------------------------- Ventas por período
    'ventas': {
        titulo: 'Ventas por período', periodo: true, filtros: ['vendedor', 'ruta', 'forma'],
        url: st => '/informes/ventas?' + infQS(st),
        render(d) {
            const k = d.kpis, cats = infAgrupar(d.por_producto, 'categoria'), provs = infAgrupar(d.por_producto, 'proveedor');
            return `
                ${infHero(`VENTAS · ${infFecha(d.periodo.desde)} al ${infFecha(d.periodo.hasta)}`, infMoney(k.total), `${k.pedidos} pedidos · ${k.clientes} clientes`,
                    [['Período anterior', infMoney(k.anterior), `${infFecha(k.anterior_desde)} – ${infFecha(k.anterior_hasta)}`], ['Variación', infVar(k.total, k.anterior), '']])}
                ${infStats([['Ticket promedio', infMoney(k.ticket), `${k.pedidos} pedidos`, 'blue', 'fa-receipt'],
                    ['Contado', infMoney(k.contado), `${cmPct(k.contado, k.total)}%`, 'green', 'fa-money-bill-wave'],
                    ['Crédito', infMoney(k.credito), `${cmPct(k.credito, k.total)}%`, 'orange', 'fa-handshake'],
                    ['Descuentos', infMoney(k.descuento), 'otorgados', 'purple', 'fa-tag']])}
                ${infCard('Ventas por día', 'fa-chart-column', 'var(--primary)', '<div class="chart-container" style="height:240px"><canvas id="inf-chart"></canvas></div>')}
                <div class="cm-grid-half">
                    ${infRanking('Por vendedor', 'fa-user-tie', 'var(--info)', d.por_vendedor, k.total, x => `${x.pedidos} ped.`)}
                    ${infRanking('Por ruta', 'fa-route', 'var(--success)', d.por_ruta, k.total, x => `${x.pedidos} ped.`)}
                </div>
                <div class="cm-grid-half">
                    ${infRanking('Top 10 clientes', 'fa-star', '#EC4899', d.por_cliente.map(x => ({ ...x, nombre: infCli(x) })), k.total, x => `${x.pedidos} ped.`)}
                    ${infRanking('Top 10 productos', 'fa-trophy', 'var(--warning)', d.por_producto, k.total, x => `${infNum(x.unidades)} uds`)}
                </div>
                <div class="cm-grid-half">
                    ${infRanking('Por categoría', 'fa-tags', '#0EA5E9', cats, k.total, x => `${x.productos} prod.`)}
                    ${infRanking('Por proveedor', 'fa-truck-field', '#8B5CF6', provs, k.total, x => `${x.productos} prod.`)}
                </div>
                ${k.descuento > 0 ? `<div class="cm-nota" style="margin:-8px 0 20px"><i class="fas fa-circle-info"></i> Los valores por producto, categoría y proveedor son antes de los descuentos aplicados al total de los pedidos (${infMoney(k.descuento)}).</div>` : ''}`;
        },
        despues(d) {
            const dias = []; const a = new Date(d.periodo.desde + 'T00:00:00'), b = new Date(d.periodo.hasta + 'T00:00:00');
            const mapa = Object.fromEntries(d.por_dia.map(x => [x.fecha, parseFloat(x.total)]));
            for (let x = new Date(a); x <= b && dias.length < 400; x.setDate(x.getDate() + 1)) dias.push(infISO(x));
            INF.charts.push(new Chart(document.getElementById('inf-chart'), {
                type: 'bar',
                data: { labels: dias.map(x => dias.length > 40 ? x.substring(5) : String(parseInt(x.substring(8)))), datasets: [{ data: dias.map(x => mapa[x] || 0), backgroundColor: 'rgba(99,102,241,.8)', borderRadius: 4 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => infFecha(dias[i[0].dataIndex]), label: c => infMoney(c.raw) } } }, scales: { y: { ticks: { callback: v => '$' + (v >= 1e6 ? (v / 1e6) + 'M' : v >= 1e3 ? (v / 1e3) + 'K' : v) } } } },
            }));
        },
        imprimir(d) {
            const k = d.kpis, T = k.total;
            const pct = x => cmPct(parseFloat(x.total), T) + '%';
            const tabla = (t, l, c2, f2) => `<h3 class="pt">${t}</h3>` + infTabla([{ t: 'Nombre', k: 'nombre' }, { t: c2, f: f2, n: 1 }, { t: 'Total', k: 'total', m: 1 }, { t: '%', f: pct, n: 0 }], l);
            return infKpisPrint([['Ventas', infMoney(T)], ['Pedidos', k.pedidos], ['Clientes', k.clientes], ['Ticket promedio', infMoney(k.ticket)],
                ['Contado', infMoney(k.contado)], ['Crédito', infMoney(k.credito)], ['Descuentos', infMoney(k.descuento)], ['Período anterior', infMoney(k.anterior)]])
                + tabla('Por vendedor', d.por_vendedor, 'Pedidos', x => x.pedidos) + tabla('Por ruta', d.por_ruta, 'Pedidos', x => x.pedidos)
                + tabla('Top 20 clientes', d.por_cliente.slice(0, 20).map(x => ({ ...x, nombre: infCli(x) })), 'Pedidos', x => x.pedidos)
                + tabla('Top 20 productos', d.por_producto.slice(0, 20), 'Unidades', x => x.unidades)
                + tabla('Por categoría', infAgrupar(d.por_producto, 'categoria'), 'Unidades', x => x.unidades)
                + tabla('Por proveedor', infAgrupar(d.por_producto, 'proveedor'), 'Unidades', x => x.unidades)
                + `<h3 class="pt">Ventas por día</h3>` + infTabla([{ t: 'Fecha', f: x => infFecha(x.fecha) }, { t: 'Pedidos', k: 'pedidos', n: 1 }, { t: 'Total', k: 'total', m: 1 }], d.por_dia, ['TOTAL', k.pedidos, infMoney(T)]);
        },
        excel(d) {
            const k = d.kpis; const f = [['VENTAS POR PERÍODO', d.periodo.desde, d.periodo.hasta], [], ['Ventas', k.total], ['Pedidos', k.pedidos], ['Clientes', k.clientes], ['Ticket', Math.round(k.ticket)], ['Contado', k.contado], ['Crédito', k.credito], ['Descuentos', k.descuento], ['Período anterior', k.anterior], []];
            f.push(['POR DÍA'], ['Fecha', 'Pedidos', 'Total'], ...d.por_dia.map(x => [x.fecha, x.pedidos, x.total]), []);
            f.push(['POR VENDEDOR'], ['Vendedor', 'Pedidos', 'Clientes', 'Total'], ...d.por_vendedor.map(x => [x.nombre, x.pedidos, x.clientes, x.total]), []);
            f.push(['POR RUTA'], ['Ruta', 'Pedidos', 'Clientes', 'Total'], ...d.por_ruta.map(x => [x.nombre, x.pedidos, x.clientes, x.total]), []);
            f.push(['POR CLIENTE'], ['Cliente', 'NIT', 'Pedidos', 'Total'], ...d.por_cliente.map(x => [infCli(x), x.nit_cedula, x.pedidos, x.total]), []);
            f.push(['POR PRODUCTO'], ['Código', 'Producto', 'Categoría', 'Proveedor', 'Unidades', 'Total'], ...d.por_producto.map(x => [x.codigo, x.nombre, x.categoria, x.proveedor, x.unidades, x.total]));
            return f;
        },
    },

    // ---------------------------------------------------------------- Ventas por cliente
    'clientes': {
        titulo: 'Ventas por cliente', periodo: true, filtros: ['vendedor', 'ruta'],
        url: st => '/informes/ventas?' + infQS(st, { sin_compras: 1 }),
        render(d) {
            const T = d.kpis.total; let acum = 0;
            const l = d.por_cliente.map(x => { acum += parseFloat(x.total); return { ...x, acum }; });
            const n80 = l.findIndex(x => x.acum >= T * 0.8) + 1;
            return `
                ${infHero('VENTAS POR CLIENTE', infMoney(T), `${l.length} clientes compraron · ${d.sin_compras.length} sin compras en el período`)}
                ${infStats([['Clientes con compras', l.length, `${d.kpis.pedidos} pedidos`, 'blue', 'fa-users'],
                    ['Compra promedio por cliente', infMoney(l.length ? T / l.length : 0), 'en el período', 'green', 'fa-user-check'],
                    ['80% de las ventas', n80 ? `${n80} clientes` : '-', l.length ? `${cmPct(n80, l.length)}% de los clientes` : '', 'purple', 'fa-chart-pie'],
                    ['Sin compras', d.sin_compras.length, 'clientes activos', 'orange', 'fa-user-clock']])}
                ${infCard('Clientes que compraron', 'fa-ranking-star', 'var(--primary)', infTabla([
                    { t: '#', f: (x, i) => i + 1, n: 1, w: '40px' }, { t: 'Cliente', f: x => infCli(x) }, { t: 'Ruta', k: 'ruta' },
                    { t: 'Pedidos', k: 'pedidos', n: 1 }, { t: 'Total', k: 'total', m: 1 }, { t: '%', f: x => cmPct(x.total, T) + '%', n: 1 },
                    { t: '% acum.', f: x => cmPct(x.acum, T) + '%', n: 1 }, { t: 'Ticket', f: x => infMoney(x.total / x.pedidos), n: 1 }, { t: 'Última compra', f: x => infFecha(x.ultima) }],
                    l, ['', `${l.length} clientes`, '', d.kpis.pedidos, infMoney(T), '100%', '', '', '']))}
                ${infCard('Clientes activos sin compras en el período', 'fa-user-clock', 'var(--warning)', infTabla([
                    { t: 'Cliente', f: x => infCli(x) }, { t: 'Teléfono', k: 'telefono' }, { t: 'Ruta', k: 'ruta' }, { t: 'Última compra', f: x => x.ultima ? infFecha(x.ultima) : 'Nunca' }],
                    d.sin_compras, null, { vacio: 'Todos los clientes compraron en el período' }), `<span class="inf-sub">Para hacerles seguimiento</span>`)}`;
        },
        imprimir(d) {
            const T = d.kpis.total; let acum = 0;
            const l = d.por_cliente.map(x => { acum += parseFloat(x.total); return { ...x, acum }; });
            return infKpisPrint([['Ventas', infMoney(T)], ['Clientes con compras', l.length], ['Pedidos', d.kpis.pedidos], ['Sin compras', d.sin_compras.length]])
                + `<h3 class="pt">Clientes que compraron</h3>` + infTabla([{ t: '#', f: (x, i) => i + 1, n: 1 }, { t: 'Cliente', f: x => infCli(x) }, { t: 'NIT', k: 'nit_cedula' }, { t: 'Ruta', k: 'ruta' }, { t: 'Pedidos', k: 'pedidos', n: 1 }, { t: 'Total', k: 'total', m: 1 }, { t: '%', f: x => cmPct(x.total, T) + '%', n: 1 }, { t: '% acum.', f: x => cmPct(x.acum, T) + '%', n: 1 }, { t: 'Última', f: x => infFecha(x.ultima) }], l, ['', 'TOTAL', '', '', d.kpis.pedidos, infMoney(T), '100%', '', ''])
                + `<h3 class="pt">Sin compras en el período (${d.sin_compras.length})</h3>` + infTabla([{ t: 'Cliente', f: x => infCli(x) }, { t: 'Teléfono', k: 'telefono' }, { t: 'Ruta', k: 'ruta' }, { t: 'Última compra', f: x => x.ultima ? infFecha(x.ultima) : 'Nunca' }], d.sin_compras);
        },
        excel(d) {
            return [['VENTAS POR CLIENTE', d.periodo.desde, d.periodo.hasta], [], ['Cliente', 'Negocio', 'NIT', 'Teléfono', 'Ruta', 'Pedidos', 'Total', 'Crédito', 'Última compra'],
                ...d.por_cliente.map(x => [x.nombre, x.razon_social, x.nit_cedula, x.telefono, x.ruta, x.pedidos, x.total, x.credito, String(x.ultima || '').substring(0, 10)]),
                [], ['SIN COMPRAS EN EL PERÍODO'], ['Cliente', 'Negocio', 'Teléfono', 'Ruta', 'Última compra'],
                ...d.sin_compras.map(x => [x.nombre, x.razon_social, x.telefono, x.ruta, String(x.ultima || 'Nunca').substring(0, 10)])];
        },
    },

    // ---------------------------------------------------------------- Ventas por producto / categoría / proveedor
    'productos': {
        titulo: 'Ventas por producto', periodo: true, filtros: ['vendedor', 'ruta'],
        url: st => '/informes/ventas?' + infQS(st),
        estado: () => ({ agrupar: 'producto' }),
        controles: st => `<div class="inf-seg" id="inf-agrupar">${[['producto', 'Producto'], ['categoria', 'Categoría'], ['proveedor', 'Proveedor']].map(([v, l]) => `<button type="button" data-v="${v}" class="${st.agrupar === v ? 'on' : ''}">${l}</button>`).join('')}</div>`,
        enlazar(st, root, cargar, pintar) {
            root.querySelector('#inf-agrupar').onclick = e => {
                const b = e.target.closest('button'); if (!b) return;
                st.agrupar = b.dataset.v;
                root.querySelectorAll('#inf-agrupar button').forEach(x => x.classList.toggle('on', x === b));
                pintar();
            };
        },
        filas(d, st) { return st.agrupar === 'producto' ? d.por_producto : infAgrupar(d.por_producto, st.agrupar); },
        cols(st, T) {
            const base = st.agrupar === 'producto'
                ? [{ t: 'Código', k: 'codigo' }, { t: 'Producto', k: 'nombre' }, { t: 'Categoría', k: 'categoria' }, { t: 'Proveedor', k: 'proveedor' }]
                : [{ t: st.agrupar === 'categoria' ? 'Categoría' : 'Proveedor', k: 'nombre' }, { t: 'Productos', k: 'productos', n: 1 }];
            return [{ t: '#', f: (x, i) => i + 1, n: 1, w: '40px' }, ...base, { t: 'Unidades', k: 'unidades', n: 1 }, { t: 'Total', k: 'total', m: 1 },
                { t: '%', f: x => cmPct(x.total, T) + '%', n: 1 }, { t: 'Precio prom./ud', f: x => infMoney(parseFloat(x.unidades) ? x.total / x.unidades : 0), n: 1 }];
        },
        render(d, st) {
            const T = infSum(d.por_producto, 'total'), l = this.filas(d, st), U = infSum(d.por_producto, 'unidades');
            const pie = st.agrupar === 'producto' ? ['', `${l.length} productos`, '', '', '', infNum(U), infMoney(T), '100%', ''] : ['', `${l.length}`, d.por_producto.length, infNum(U), infMoney(T), '100%', ''];
            return `${infHero('VENTAS POR ' + st.agrupar.toUpperCase(), infMoney(T), `${infNum(U)} unidades · ${d.por_producto.length} productos distintos`)}
                <div class="cm-grid-half">${infRanking('Top 10 por valor', 'fa-trophy', 'var(--warning)', l, T, x => `${infNum(x.unidades)} uds`)}
                ${infRanking('Top 10 por unidades', 'fa-boxes-stacked', '#0EA5E9', [...l].sort((a, b) => b.unidades - a.unidades).map(x => ({ ...x })), T, x => `${infNum(x.unidades)} uds`)}</div>
                ${infCard('Detalle', 'fa-list', 'var(--primary)', infTabla(this.cols(st, T), l, pie))}`;
        },
        imprimir(d, st) {
            const T = infSum(d.por_producto, 'total'), l = this.filas(d, st);
            return infKpisPrint([['Ventas', infMoney(T)], ['Unidades', infNum(infSum(d.por_producto, 'unidades'))], ['Productos', d.por_producto.length], ['Agrupado por', st.agrupar]])
                + infTabla(this.cols(st, T), l);
        },
        excel(d, st) {
            const l = this.filas(d, st);
            return st.agrupar === 'producto'
                ? [['VENTAS POR PRODUCTO', d.periodo.desde, d.periodo.hasta], [], ['Código', 'Producto', 'Categoría', 'Proveedor', 'Unidades', 'Pedidos', 'Total'], ...l.map(x => [x.codigo, x.nombre, x.categoria, x.proveedor, x.unidades, x.pedidos, x.total])]
                : [['VENTAS POR ' + st.agrupar.toUpperCase(), d.periodo.desde, d.periodo.hasta], [], ['Nombre', 'Productos', 'Unidades', 'Total'], ...l.map(x => [x.nombre, x.productos, x.unidades, x.total])];
        },
        archivo: st => `ventas_por_${st.agrupar}_${st.desde}_${st.hasta}`,
    },

    // ---------------------------------------------------------------- Comparativo anual
    'comparativo': {
        titulo: 'Comparativo anual', periodo: false, filtros: ['vendedor', 'ruta'],
        estado: () => { const y = new Date().getFullYear(); return { anios: [y - 1, y], metrica: 'total' }; },
        controles: st => `<div class="inf-seg" id="inf-metrica">${[['total', 'Ventas $'], ['pedidos', 'Pedidos'], ['clientes', 'Clientes']].map(([v, l]) => `<button type="button" data-v="${v}" class="${st.metrica === v ? 'on' : ''}">${l}</button>`).join('')}</div><div class="inf-anios" id="inf-anios"></div>`,
        enlazar(st, root, cargar, pintar) {
            root.querySelector('#inf-metrica').onclick = e => {
                const b = e.target.closest('button'); if (!b) return;
                st.metrica = b.dataset.v; root.querySelectorAll('#inf-metrica button').forEach(x => x.classList.toggle('on', x === b)); pintar();
            };
            root.querySelector('#inf-anios').onchange = () => {
                st.anios = [...root.querySelectorAll('#inf-anios input:checked')].map(x => parseInt(x.value)).sort();
                if (st.anios.length) cargar();
            };
        },
        url: st => '/informes/comparativo?' + infQS({ vendedor: st.vendedor, ruta: st.ruta }, { anios: st.anios.join(',') }),
        tabla(d, st) {
            const anios = d.anios.map(Number);
            const v = (a, m) => parseFloat((d.datos.find(x => +x.anio === a && +x.mes === m) || {})[st.metrica] || 0);
            const filas = CM_MESES.map((nom, i) => ({ nom, vals: anios.map(a => v(a, i + 1)) }));
            const tot = anios.map((_, j) => filas.reduce((s, f) => s + f.vals[j], 0));
            return { anios, filas, tot };
        },
        render(d, st) {
            const anios = d.anios_disponibles;
            setTimeout(() => {
                const box = document.getElementById('inf-anios');
                if (box && !box.childElementCount) box.innerHTML = `<span class="cm-filtro-label" style="align-self:center">Años:</span>` + anios.map(a => `<label class="inf-check"><input type="checkbox" value="${a}" ${st.anios.includes(a) ? 'checked' : ''}> ${a}</label>`).join('');
            });
            const { anios: A, filas, tot } = this.tabla(d, st);
            const fmt = st.metrica === 'total' ? infMoney : infNum;
            const n = A.length;
            const hoy = new Date();
            return `
                ${infHero('COMPARATIVO ' + A.join(' vs '), fmt(tot[n - 1]), `${A[n - 1]}${A[n - 1] === hoy.getFullYear() ? ' (año en curso)' : ''}`, n > 1 ? [[`${A[n - 2]}`, fmt(tot[n - 2]), ''], ['Variación', infVar(tot[n - 1], tot[n - 2]), '']] : [])}
                ${infCard('Mes a mes', 'fa-chart-column', 'var(--primary)', '<div class="chart-container" style="height:280px"><canvas id="inf-chart"></canvas></div>')}
                ${infCard('Tabla comparativa', 'fa-table', 'var(--primary)', this.tablaHTML(d, st))}`;
        },
        tablaHTML(d, st) {
            const { anios: A, filas, tot } = this.tabla(d, st);
            const fmt = st.metrica === 'total' ? infMoney : infNum;
            const n = A.length;
            return `<div class="table-wrapper"><table class="data-table inf-tabla"><thead><tr><th>Mes</th>${A.map(a => `<th class="r">${a}</th>`).join('')}${n > 1 ? `<th class="r">Var. ${A[n - 1]} vs ${A[n - 2]}</th>` : ''}</tr></thead>
                <tbody>${filas.map(f => `<tr><td>${f.nom}</td>${f.vals.map(x => `<td class="r">${x ? fmt(x) : '-'}</td>`).join('')}${n > 1 ? `<td class="r">${f.vals[n - 1] || f.vals[n - 2] ? infVar(f.vals[n - 1], f.vals[n - 2]) : '-'}</td>` : ''}</tr>`).join('')}</tbody>
                <tfoot><tr><td>TOTAL</td>${tot.map(x => `<td class="r">${fmt(x)}</td>`).join('')}${n > 1 ? `<td class="r">${infVar(tot[n - 1], tot[n - 2])}</td>` : ''}</tr></tfoot></table></div>`;
        },
        despues(d, st) {
            const { anios: A, filas } = this.tabla(d, st);
            const colores = ['#CBD5E1', '#A5B4FC', '#8B5CF6', '#6366F1'].slice(-A.length);
            INF.charts.push(new Chart(document.getElementById('inf-chart'), {
                type: 'bar',
                data: { labels: CM_MESES.map(m => m.substring(0, 3)), datasets: A.map((a, j) => ({ label: String(a), data: filas.map(f => f.vals[j]), backgroundColor: colores[j], borderRadius: 4 })) },
                options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${st.metrica === 'total' ? infMoney(c.raw) : infNum(c.raw)}` } } } },
            }));
        },
        imprimir(d, st) { return `<p class="ps">Métrica: ${st.metrica === 'total' ? 'ventas en pesos' : st.metrica}</p>` + this.tablaHTML(d, st); },
        excel(d, st) {
            const { anios: A, filas, tot } = this.tabla(d, st);
            return [['COMPARATIVO ANUAL - ' + st.metrica], [], ['Mes', ...A], ...filas.map(f => [f.nom, ...f.vals]), ['TOTAL', ...tot]];
        },
        archivo: st => `comparativo_${st.anios.join('-')}`,
    },

    // ---------------------------------------------------------------- Cartera por edades
    'cartera': {
        titulo: 'Cartera por edades', periodo: false, filtros: ['vendedor', 'ruta'],
        estado: () => ({ detalle: false }),
        controles: st => `<label class="inf-check"><input type="checkbox" id="inf-detalle" ${st.detalle ? 'checked' : ''}> Ver documentos de cada cliente</label>`,
        enlazar(st, root, cargar, pintar) { root.querySelector('#inf-detalle').onchange = e => { st.detalle = e.target.checked; pintar(); }; },
        url: st => '/informes/cartera-edades?' + infQS({ vendedor: st.vendedor, ruta: st.ruta }),
        grupos(d) { return infEdades(d.documentos, x => x.id_cliente, x => infCli(x), x => ({ telefono: x.cliente_telefono, ruta: x.ruta })); },
        tablaHTML(d, st, imprimir = false) {
            const g = this.grupos(d), T = infSum(d.documentos, 'saldo');
            const tot = k => infSum(g, k);
            return `<div class="table-wrapper"><table class="data-table inf-tabla"><thead><tr><th>Cliente</th>${INF_EDADES.map(([, l]) => `<th class="r">${l}</th>`).join('')}<th class="r">Total</th><th class="r">%</th></tr></thead>
                <tbody>${g.map(c => `<tr class="inf-grupo-fila"><td><b>${cmEsc(c.nombre)}</b><div class="inf-sub">${cmEsc(c.ruta || '')}${c.telefono ? ' · ' + cmEsc(c.telefono) : ''} · ${c.docs.length} doc.</div></td>${INF_EDADES.map(([k]) => `<td class="r${k !== 'corriente' && c[k] ? ' inf-venc' : ''}">${c[k] ? infMoney(c[k]) : '-'}</td>`).join('')}<td class="r"><b>${infMoney(c.total)}</b></td><td class="r">${cmPct(c.total, T)}%</td></tr>
                    ${st.detalle ? c.docs.map(x => `<tr class="inf-doc-fila"><td>${cmEsc(infDoc(x))} · ${infFecha(x.fecha_pedido)} · vence ${infFecha(x.vence)}${parseInt(x.dias_vencido) > 0 ? ` <span class="inf-venc">(${x.dias_vencido} días)</span>` : ''}</td>${INF_EDADES.map(([k]) => `<td class="r">${infEdad(x.dias_vencido) === k ? infMoney(x.saldo) : ''}</td>`).join('')}<td class="r">${infMoney(x.saldo)}</td><td></td></tr>`).join('') : ''}`).join('')}</tbody>
                <tfoot><tr><td>TOTAL (${g.length} clientes)</td>${INF_EDADES.map(([k]) => `<td class="r">${infMoney(tot(k))}</td>`).join('')}<td class="r">${infMoney(T)}</td><td class="r">100%</td></tr></tfoot></table></div>`;
        },
        render(d, st) {
            const g = this.grupos(d), T = infSum(d.documentos, 'saldo');
            const b = Object.fromEntries(INF_EDADES.map(([k]) => [k, infSum(g, k)]));
            const venc = T - b.corriente;
            if (!d.documentos.length) return '<div class="empty-state"><i class="fas fa-face-smile"></i><h3>No hay cartera pendiente</h3></div>';
            return `
                ${infHero('CARTERA POR COBRAR', infMoney(T), `${d.documentos.length} documentos · ${g.length} clientes`, [['Vencida', infMoney(venc), `${cmPct(venc, T)}%`], ['Por vencer', infMoney(b.corriente), `${cmPct(b.corriente, T)}%`]])}
                <div class="inf-edades">${INF_EDADES.map(([k, l], i) => `<div class="inf-edad e${i}"><span>${l}</span><b>${infMoney(b[k])}</b><small>${cmPct(b[k], T)}%</small><div class="inf-edad-bar"><div style="width:${cmPct(b[k], T)}%"></div></div></div>`).join('')}</div>
                ${infCard('Cartera por cliente', 'fa-users', 'var(--primary)', this.tablaHTML(d, st))}`;
        },
        imprimir(d, st) {
            const T = infSum(d.documentos, 'saldo'), g = this.grupos(d);
            return infKpisPrint([['Total cartera', infMoney(T)], ['Por vencer', infMoney(infSum(g, 'corriente'))], ['Vencida', infMoney(T - infSum(g, 'corriente'))], ['Clientes', g.length]]) + this.tablaHTML(d, st, true);
        },
        excel(d) {
            return [['CARTERA POR EDADES', 'Corte', d.corte], [], ['Cliente', 'Teléfono', 'Ruta', 'Vendedor', 'Documento', 'Fecha', 'Vence', 'Días vencido', 'Valor', 'Abonado', 'Saldo', 'Edad'],
                ...d.documentos.map(x => [infCli(x), x.cliente_telefono, x.ruta, x.vendedor, infDoc(x), String(x.fecha_pedido).substring(0, 10), x.vence, x.dias_vencido, x.total, x.pagado, x.saldo, INF_EDADES.find(e => e[0] === infEdad(x.dias_vencido))[1]])];
        },
        archivo: () => 'cartera_edades_' + infHoy(),
    },

    // ---------------------------------------------------------------- Estado de cuenta de un cliente
    'estado-cuenta': {
        titulo: 'Estado de cuenta de cliente', periodo: false, filtros: [],
        estado: () => ({ cliente: null, todos: false }),
        controles: st => `<div class="inf-cli" id="inf-cli"><div class="search-box" style="max-width:none;min-width:280px"><input type="text" id="inf-cli-buscar" placeholder="Buscar cliente por nombre, negocio, NIT o teléfono..." autocomplete="off"><i class="fas fa-search"></i></div><div class="sa-cli-res" id="inf-cli-res"></div></div>
            <label class="inf-check"><input type="checkbox" id="inf-todos"> Incluir documentos ya pagados</label>`,
        async enlazar(st, root, cargar) {
            const r = await api('/clientes');
            const clientes = r?.clientes || [];
            const inp = root.querySelector('#inf-cli-buscar'), res = root.querySelector('#inf-cli-res');
            inp.oninput = () => {
                const t = inp.value.toLowerCase().trim();
                if (t.length < 2) { res.innerHTML = ''; return; }
                const m = clientes.filter(c => [c.nombre, c.razon_social, c.nit_cedula, c.telefono].some(v => String(v || '').toLowerCase().includes(t))).slice(0, 8);
                res.innerHTML = m.length ? m.map(c => `<div class="sa-cli-op" data-id="${c.id_cliente}"><b>${cmEsc(c.razon_social || c.nombre)}</b><small>${c.razon_social ? cmEsc(c.nombre) + ' · ' : ''}${cmEsc(c.nit_cedula || '')}</small></div>`).join('') : '<div class="sa-cli-op vacio">Sin coincidencias</div>';
            };
            res.onclick = e => {
                const o = e.target.closest('.sa-cli-op[data-id]'); if (!o) return;
                const c = clientes.find(x => x.id_cliente === parseInt(o.dataset.id));
                st.cliente = c.id_cliente; inp.value = c.razon_social || c.nombre; res.innerHTML = ''; cargar();
            };
            root.querySelector('#inf-todos').onchange = e => { st.todos = e.target.checked; if (st.cliente) cargar(); };
            setTimeout(() => inp.focus(), 50);
        },
        url: st => st.cliente ? `/informes/estado-cuenta/${st.cliente}?todos=${st.todos ? 1 : 0}` : null,
        archivo: st => 'estado_cuenta_' + (st.cliente || '') + '_' + infHoy(),
        resumen(d) {
            const T = infSum(d.documentos, 'saldo');
            const venc = infSum(d.documentos.filter(x => parseInt(x.dias_vencido) > 0), 'saldo');
            return { T, venc, valor: infSum(d.documentos, 'total'), abonado: infSum(d.documentos, 'pagado') };
        },
        cuerpo(d, imprimir) {
            const c = d.cliente, r = this.resumen(d);
            return `
                <div class="inf-ec-cli">
                    <div><b>${cmEsc(c.razon_social || c.nombre)}</b>${c.razon_social ? `<div>${cmEsc(c.nombre)}</div>` : ''}<div>${c.nit_cedula ? 'NIT/CC ' + cmEsc(c.nit_cedula) : ''}</div></div>
                    <div>${cmEsc(c.direccion || '')}${c.ciudad ? ', ' + cmEsc(c.ciudad) : ''}<div>${cmEsc(c.telefono || '')}</div><div>${c.ruta ? 'Ruta ' + cmEsc(c.ruta) : ''}${c.vendedor ? ' · Vendedor ' + cmEsc(c.vendedor) : ''}</div></div>
                </div>
                ${imprimir ? infKpisPrint([['Saldo total', infMoney(r.T)], ['Vencido', infMoney(r.venc)], ['Documentos', d.documentos.length], ['Corte', infFecha(d.corte)]]) : ''}
                <h3 class="pt">Documentos</h3>
                ${infTabla([{ t: 'Documento', f: x => infDoc(x) }, { t: 'Fecha', f: x => infFecha(x.fecha_pedido) }, { t: 'Vence', f: x => infFecha(x.vence) },
                    { t: 'Días venc.', f: x => parseFloat(x.saldo) > 0 && parseInt(x.dias_vencido) > 0 ? x.dias_vencido : '-', n: 1 },
                    { t: 'Valor', k: 'total', m: 1 }, { t: 'Abonado', k: 'pagado', m: 1 }, { t: 'Saldo', k: 'saldo', m: 1 }],
                    d.documentos, ['TOTAL', '', '', '', infMoney(r.valor), infMoney(r.abonado), infMoney(r.T)], { vacio: 'El cliente no tiene saldo pendiente', claseFila: x => parseFloat(x.saldo) > 0 && parseInt(x.dias_vencido) > 0 ? 'venc' : '' })}
                <h3 class="pt">Abonos recibidos</h3>
                ${infTabla([{ t: 'Fecha', f: x => infFecha(x.fecha) }, { t: 'Documento', f: x => infDoc(x) }, { t: 'Medio', f: x => crMedio(x.medio_pago)[1] + (x.referencia ? ' #' + x.referencia : '') }, { t: 'Recibió', k: 'recibio' }, { t: 'Valor', k: 'valor', m: 1 }],
                    d.pagos, ['TOTAL', '', '', '', infMoney(infSum(d.pagos, 'valor'))], { vacio: 'Sin abonos' })}`;
        },
        render(d) {
            if (!d) return '<div class="empty-state"><i class="fas fa-user-magnifying-glass"></i><h3>Escoge un cliente</h3><p>Busca el cliente arriba para ver su estado de cuenta.</p></div>';
            const r = this.resumen(d);
            return `${infHero('ESTADO DE CUENTA · ' + cmEsc((d.cliente.razon_social || d.cliente.nombre).toUpperCase()), infMoney(r.T), `${d.documentos.length} documento(s) · corte ${infFecha(d.corte)}`,
                [['Vencido', infMoney(r.venc), ''], ['Compras históricas', infMoney(d.historico.total), `${d.historico.pedidos} pedidos`]])}
                <div class="card"><div class="card-body inf-ec">${this.cuerpo(d, false)}</div></div>`;
        },
        imprimir(d) { return d ? this.cuerpo(d, true) : ''; },
        excel(d) {
            if (!d) return [];
            const c = d.cliente;
            return [['ESTADO DE CUENTA', c.razon_social || c.nombre, c.nit_cedula, 'Corte', d.corte], [], ['Documento', 'Fecha', 'Vence', 'Días vencido', 'Valor', 'Abonado', 'Saldo'],
                ...d.documentos.map(x => [infDoc(x), String(x.fecha_pedido).substring(0, 10), x.vence, x.dias_vencido, x.total, x.pagado, x.saldo]),
                [], ['ABONOS'], ['Fecha', 'Documento', 'Medio', 'Referencia', 'Recibió', 'Valor'], ...d.pagos.map(x => [x.fecha, infDoc(x), x.medio_pago, x.referencia, x.recibio, x.valor])];
        },
    },

    // ---------------------------------------------------------------- Recaudo
    'recaudo': {
        titulo: 'Recaudo', periodo: true, filtros: ['ruta'],
        url: st => '/informes/recaudo?' + infQS({ desde: st.desde, hasta: st.hasta, ruta: st.ruta }),
        calc(d) {
            const contado = infSum(d.contado, 'total'), abonos = infSum(d.abonos, 'valor');
            const agrupar = (l, kf, vf) => { const m = new Map(); l.forEach(x => { const k = kf(x); const g = m.get(k) || { nombre: k, total: 0, n: 0 }; g.total += parseFloat(vf(x)); g.n++; m.set(k, g); }); return [...m.values()].sort((a, b) => b.total - a.total); };
            return {
                contado, abonos, total: contado + abonos,
                porMedio: agrupar(d.abonos, x => crMedio(x.medio_pago)[1], x => x.valor),
                porRecibio: agrupar(d.abonos, x => x.recibio || '-', x => x.valor),
                contadoVend: agrupar(d.contado, x => x.vendedor, x => x.total),
                porCliente: agrupar(d.abonos, x => infCli(x), x => x.valor),
            };
        },
        render(d) {
            const c = this.calc(d);
            return `
                ${infHero(`RECAUDO · ${infFecha(d.periodo.desde)} al ${infFecha(d.periodo.hasta)}`, infMoney(c.total), 'Ventas de contado + abonos a créditos', [['Contado', infMoney(c.contado), `${cmPct(c.contado, c.total)}%`], ['Abonos', infMoney(c.abonos), `${d.abonos.length} abonos`]])}
                ${infCard('Recaudo por día', 'fa-chart-column', 'var(--primary)', '<div class="chart-container" style="height:240px"><canvas id="inf-chart"></canvas></div>')}
                <div class="cm-grid-half">
                    ${infRanking('Abonos por medio de pago', 'fa-wallet', 'var(--success)', c.porMedio, c.abonos, x => `${x.n}`)}
                    ${infRanking('Abonos por quién recibió', 'fa-user-check', 'var(--info)', c.porRecibio, c.abonos, x => `${x.n}`)}
                </div>
                <div class="cm-grid-half">
                    ${infRanking('Ventas de contado por vendedor', 'fa-money-bill-wave', 'var(--warning)', c.contadoVend, c.contado, () => '')}
                    ${infRanking('Abonos por cliente', 'fa-users', '#EC4899', c.porCliente, c.abonos, x => `${x.n}`)}
                </div>
                ${infCard('Detalle de abonos', 'fa-receipt', 'var(--primary)', this.detalle(d))}`;
        },
        detalle(d) {
            return infTabla([{ t: 'Fecha', f: x => infFecha(x.fecha) }, { t: 'Recibo', f: x => String(x.id_pago).padStart(6, '0') }, { t: 'Cliente', f: x => infCli(x) }, { t: 'Documento', f: x => infDoc(x) },
                { t: 'Medio', f: x => crMedio(x.medio_pago)[1] + (x.referencia ? ' #' + x.referencia : '') }, { t: 'Recibió', k: 'recibio' }, { t: 'Valor', k: 'valor', m: 1 }],
                d.abonos, ['TOTAL', '', `${d.abonos.length} abonos`, '', '', '', infMoney(infSum(d.abonos, 'valor'))], { vacio: 'Sin abonos en el período' });
        },
        despues(d) {
            const dias = []; const a = new Date(d.periodo.desde + 'T00:00:00'), b = new Date(d.periodo.hasta + 'T00:00:00');
            for (let x = new Date(a); x <= b && dias.length < 400; x.setDate(x.getDate() + 1)) dias.push(infISO(x));
            const con = {}, abo = {};
            d.contado.forEach(x => con[x.fecha] = (con[x.fecha] || 0) + parseFloat(x.total));
            d.abonos.forEach(x => abo[x.fecha] = (abo[x.fecha] || 0) + parseFloat(x.valor));
            INF.charts.push(new Chart(document.getElementById('inf-chart'), {
                type: 'bar',
                data: { labels: dias.map(x => dias.length > 40 ? x.substring(5) : String(parseInt(x.substring(8)))), datasets: [
                    { label: 'Contado', data: dias.map(x => con[x] || 0), backgroundColor: '#F59E0B', borderRadius: 3 },
                    { label: 'Abonos', data: dias.map(x => abo[x] || 0), backgroundColor: '#10B981', borderRadius: 3 }] },
                options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${infMoney(c.raw)}` } } } },
            }));
        },
        imprimir(d) {
            const c = this.calc(d);
            const t = (tit, l, T) => `<h3 class="pt">${tit}</h3>` + infTabla([{ t: 'Nombre', k: 'nombre' }, { t: 'Cant.', k: 'n', n: 1 }, { t: 'Total', k: 'total', m: 1 }, { t: '%', f: x => cmPct(x.total, T) + '%', n: 1 }], l);
            return infKpisPrint([['Recaudo total', infMoney(c.total)], ['Contado', infMoney(c.contado)], ['Abonos', infMoney(c.abonos)], ['Nº abonos', d.abonos.length]])
                + t('Abonos por medio de pago', c.porMedio, c.abonos) + t('Abonos por quién recibió', c.porRecibio, c.abonos) + t('Ventas de contado por vendedor', c.contadoVend, c.contado)
                + `<h3 class="pt">Detalle de abonos</h3>` + this.detalle(d);
        },
        excel(d) {
            const c = this.calc(d);
            return [['RECAUDO', d.periodo.desde, d.periodo.hasta], [], ['Contado', c.contado], ['Abonos', c.abonos], ['Total', c.total], [],
                ['ABONOS'], ['Fecha', 'Recibo', 'Cliente', 'Documento', 'Medio', 'Referencia', 'Recibió', 'Ruta', 'Valor'],
                ...d.abonos.map(x => [x.fecha, x.id_pago, infCli(x), infDoc(x), x.medio_pago, x.referencia, x.recibio, x.ruta, x.valor]),
                [], ['CONTADO POR DÍA Y VENDEDOR'], ['Fecha', 'Vendedor', 'Pedidos', 'Total'], ...d.contado.map(x => [x.fecha, x.vendedor, x.pedidos, x.total])];
        },
    },

    // ---------------------------------------------------------------- Inventario valorizado
    'valorizado': {
        titulo: 'Inventario valorizado', periodo: false, filtros: ['categoria', 'proveedor'],
        estado: () => ({ agrupar: 'categoria' }),
        controles: st => `<div class="inf-seg" id="inf-agrupar">${[['categoria', 'Por categoría'], ['proveedor', 'Por proveedor']].map(([v, l]) => `<button type="button" data-v="${v}" class="${st.agrupar === v ? 'on' : ''}">${l}</button>`).join('')}</div>`,
        enlazar(st, root, cargar, pintar) {
            root.querySelector('#inf-agrupar').onclick = e => {
                const b = e.target.closest('button'); if (!b) return;
                st.agrupar = b.dataset.v; root.querySelectorAll('#inf-agrupar button').forEach(x => x.classList.toggle('on', x === b)); pintar();
            };
        },
        url: st => '/informes/inventario-valorizado?' + infQS({ categoria: st.categoria, proveedor: st.proveedor }),
        archivo: () => 'inventario_valorizado_' + infHoy(),
        calc(d, st) {
            const l = d.productos.map(p => {
                const s = Math.max(0, parseFloat(p.stock) || 0), c = parseFloat(p.precio_costo) || 0, v = parseFloat(p.precio) || 0;
                return { ...p, s, vc: s * c, vv: s * v, margen: v > 0 && c > 0 ? (v - c) / v * 100 : null };
            });
            const m = new Map();
            l.forEach(p => { const k = p[st.agrupar] || '—'; const g = m.get(k) || { nombre: k, productos: 0, unidades: 0, total: 0, vv: 0 }; g.productos++; g.unidades += p.s; g.total += p.vc; g.vv += p.vv; m.set(k, g); });
            return { l, grupos: [...m.values()].sort((a, b) => b.total - a.total), vc: infSum(l, 'vc'), vv: infSum(l, 'vv'), u: infSum(l, 's'),
                sinCosto: l.filter(p => p.s > 0 && !(parseFloat(p.precio_costo) > 0)), negativos: l.filter(p => parseFloat(p.stock) < 0) };
        },
        cols() {
            return [{ t: 'Código', k: 'codigo' }, { t: 'Producto', k: 'nombre' }, { t: 'Categoría', k: 'categoria' }, { t: 'Proveedor', k: 'proveedor' },
                { t: 'Stock', k: 's', n: 1 }, { t: 'Costo', k: 'precio_costo', m: 1 }, { t: 'Valor al costo', k: 'vc', m: 1 }, { t: 'Precio venta', k: 'precio', m: 1 },
                { t: 'Valor venta', k: 'vv', m: 1 }, { t: 'Margen', f: x => x.margen === null ? '-' : x.margen.toFixed(1) + '%', n: 1 }];
        },
        render(d, st) {
            const c = this.calc(d, st);
            const conStock = c.l.filter(p => p.s > 0);
            return `
                ${infHero('INVENTARIO VALORIZADO AL COSTO', infMoney(c.vc), `${conStock.length} productos con existencias · ${infNum(c.u)} unidades`, [['A precio de venta', infMoney(c.vv), ''], ['Utilidad potencial', infMoney(c.vv - c.vc), c.vv ? cmPct(c.vv - c.vc, c.vv) + '%' : '']])}
                ${c.sinCosto.length || c.negativos.length ? `<div class="cr-hint"><i class="fas fa-triangle-exclamation"></i><span>${c.sinCosto.length ? `<b>${c.sinCosto.length} productos con existencias no tienen costo</b> y quedan valorizados en $0 (se llena al registrar compras o en el producto). ` : ''}${c.negativos.length ? `${c.negativos.length} productos tienen stock negativo y se cuentan como 0.` : ''}</span></div>` : ''}
                <div class="cm-grid-half">
                    ${infRanking('Valor al costo ' + (st.agrupar === 'categoria' ? 'por categoría' : 'por proveedor'), 'fa-layer-group', '#0EA5E9', c.grupos, c.vc, x => `${x.productos} prod.`)}
                    ${infRanking('Productos de mayor valor', 'fa-gem', '#8B5CF6', [...conStock].sort((a, b) => b.vc - a.vc).map(x => ({ nombre: x.nombre, total: x.vc, s: x.s })), c.vc, x => `${infNum(x.s)} uds`)}
                </div>
                ${infCard('Detalle por producto', 'fa-list', 'var(--primary)', infTabla(this.cols(), conStock, ['', `${conStock.length} productos`, '', '', infNum(c.u), '', infMoney(c.vc), '', infMoney(c.vv), '']))}`;
        },
        imprimir(d, st) {
            const c = this.calc(d, st);
            const conStock = c.l.filter(p => p.s > 0);
            return infKpisPrint([['Valor al costo', infMoney(c.vc)], ['Valor a precio venta', infMoney(c.vv)], ['Utilidad potencial', infMoney(c.vv - c.vc)], ['Unidades', infNum(c.u)]])
                + `<h3 class="pt">${st.agrupar === 'categoria' ? 'Por categoría' : 'Por proveedor'}</h3>` + infTabla([{ t: 'Nombre', k: 'nombre' }, { t: 'Productos', k: 'productos', n: 1 }, { t: 'Unidades', k: 'unidades', n: 1 }, { t: 'Valor costo', k: 'total', m: 1 }, { t: 'Valor venta', k: 'vv', m: 1 }, { t: '%', f: x => cmPct(x.total, c.vc) + '%', n: 1 }], c.grupos, ['TOTAL', '', infNum(c.u), infMoney(c.vc), infMoney(c.vv), '100%'])
                + `<h3 class="pt">Detalle por producto</h3>` + infTabla(this.cols(), conStock, ['', 'TOTAL', '', '', infNum(c.u), '', infMoney(c.vc), '', infMoney(c.vv), ''])
                + (c.sinCosto.length ? `<p class="ps" style="margin-top:10px">${c.sinCosto.length} productos con existencias sin costo registrado (valorizados en $0).</p>` : '');
        },
        excel(d, st) {
            const c = this.calc(d, st);
            return [['INVENTARIO VALORIZADO', 'Corte', d.corte], [], ['Código', 'Producto', 'Categoría', 'Proveedor', 'Stock', 'Costo', 'Valor costo', 'Precio venta', 'Valor venta', 'Margen %'],
                ...c.l.map(x => [x.codigo, x.nombre, x.categoria, x.proveedor, x.stock, x.precio_costo, Math.round(x.vc), x.precio, Math.round(x.vv), x.margen === null ? '' : x.margen.toFixed(1)])];
        },
    },

    // ---------------------------------------------------------------- Compras por período
    'compras': {
        titulo: 'Compras por período', periodo: true, filtros: ['proveedor'],
        url: st => '/informes/compras?' + infQS({ desde: st.desde, hasta: st.hasta, proveedor: st.proveedor }),
        calc(d) {
            const l = d.compras; const s = k => infSum(l, k);
            const m = new Map();
            l.forEach(x => { const g = m.get(x.id_proveedor) || { nombre: x.proveedor || '-', total: 0, n: 0, saldo: 0 }; g.total += parseFloat(x.total); g.n++; g.saldo += parseFloat(x.saldo); m.set(x.id_proveedor, g); });
            return { total: s('total'), subtotal: s('subtotal'), descuento: s('descuento'), iva: s('iva'), flete: s('flete'), retencion: s('retencion'), neto: s('neto_pagar'), saldo: s('saldo'),
                credito: infSum(l.filter(x => x.forma_pago === 'credito'), 'total'), porProv: [...m.values()].sort((a, b) => b.total - a.total) };
        },
        detalle(d) {
            return infTabla([{ t: 'Fecha', f: x => infFecha(x.fecha) }, { t: 'Compra', k: 'numero' }, { t: 'Factura prov.', k: 'factura_proveedor' }, { t: 'Proveedor', k: 'proveedor' },
                { t: 'Pago', f: x => x.forma_pago === 'credito' ? 'Crédito' : 'Contado' }, { t: 'Subtotal', k: 'subtotal', m: 1 }, { t: 'Desc.', k: 'descuento', m: 1 }, { t: 'IVA', k: 'iva', m: 1 },
                { t: 'Flete', k: 'flete', m: 1 }, { t: 'Total', k: 'total', m: 1 }, { t: 'Retención', k: 'retencion', m: 1 }, { t: 'Saldo', k: 'saldo', m: 1 }],
                d.compras, (() => { const c = this.calc(d); return ['TOTAL', `${d.compras.length}`, '', '', '', infMoney(c.subtotal), infMoney(c.descuento), infMoney(c.iva), infMoney(c.flete), infMoney(c.total), infMoney(c.retencion), infMoney(c.saldo)]; })(), { vacio: 'Sin compras en el período' });
        },
        render(d) {
            const c = this.calc(d);
            return `
                ${infHero(`COMPRAS · ${infFecha(d.periodo.desde)} al ${infFecha(d.periodo.hasta)}`, infMoney(c.total), `${d.compras.length} compras · ${c.porProv.length} proveedores`, [['A crédito', infMoney(c.credito), ''], ['Saldo pendiente', infMoney(c.saldo), '']])}
                ${infStats([['Subtotal', infMoney(c.subtotal), 'antes de IVA', 'blue', 'fa-file-invoice'], ['IVA descontable', infMoney(c.iva), '', 'purple', 'fa-percent'],
                    ['Descuentos + fletes', infMoney(c.descuento) + ' / ' + infMoney(c.flete), '', 'orange', 'fa-truck'], ['Retenciones', infMoney(c.retencion), `Neto a pagar ${infMoney(c.neto)}`, 'green', 'fa-scale-balanced']])}
                <div class="cm-grid-half">
                    ${infRanking('Compras por proveedor', 'fa-truck-field', '#8B5CF6', c.porProv, c.total, x => `${x.n} compras`)}
                    ${infRanking('Productos más comprados', 'fa-boxes-stacked', 'var(--warning)', d.productos, c.total, x => `${infNum(x.unidades)} uds · ${infMoney(x.costo_promedio)}/ud`)}
                </div>
                ${infCard('Detalle de compras', 'fa-cart-flatbed', 'var(--primary)', this.detalle(d))}
                ${infCard('Pagos a proveedores en el período', 'fa-money-check-dollar', 'var(--success)', infTabla([{ t: 'Proveedor', k: 'proveedor' }, { t: 'Comprobantes', k: 'comprobantes', n: 1 }, { t: 'Descuentos', k: 'descuento', m: 1 }, { t: 'Pagado', k: 'valor', m: 1 }], d.pagos, ['TOTAL', '', infMoney(infSum(d.pagos, 'descuento')), infMoney(infSum(d.pagos, 'valor'))], { vacio: 'Sin pagos en el período' }))}`;
        },
        imprimir(d) {
            const c = this.calc(d);
            return infKpisPrint([['Total compras', infMoney(c.total)], ['Subtotal', infMoney(c.subtotal)], ['IVA', infMoney(c.iva)], ['Retenciones', infMoney(c.retencion)], ['Descuentos', infMoney(c.descuento)], ['Fletes', infMoney(c.flete)], ['A crédito', infMoney(c.credito)], ['Saldo pendiente', infMoney(c.saldo)]])
                + `<h3 class="pt">Por proveedor</h3>` + infTabla([{ t: 'Proveedor', k: 'nombre' }, { t: 'Compras', k: 'n', n: 1 }, { t: 'Total', k: 'total', m: 1 }, { t: '%', f: x => cmPct(x.total, c.total) + '%', n: 1 }, { t: 'Saldo', k: 'saldo', m: 1 }], c.porProv)
                + `<h3 class="pt">Detalle de compras</h3>` + this.detalle(d)
                + `<h3 class="pt">Productos comprados</h3>` + infTabla([{ t: 'Código', k: 'codigo' }, { t: 'Producto', k: 'nombre' }, { t: 'Unidades', k: 'unidades', n: 1 }, { t: 'Costo prom./ud', k: 'costo_promedio', m: 1 }, { t: 'Total', k: 'total', m: 1 }], d.productos);
        },
        excel(d) {
            return [['COMPRAS', d.periodo.desde, d.periodo.hasta], [], ['Fecha', 'Compra', 'Factura proveedor', 'Proveedor', 'Pago', 'Subtotal', 'Descuento', 'IVA', 'Flete', 'Total', 'Retención', 'Neto a pagar', 'Saldo'],
                ...d.compras.map(x => [x.fecha, x.numero, x.factura_proveedor, x.proveedor, x.forma_pago, x.subtotal, x.descuento, x.iva, x.flete, x.total, x.retencion, x.neto_pagar, x.saldo]),
                [], ['PRODUCTOS'], ['Código', 'Producto', 'Unidades', 'Costo promedio', 'Total'], ...d.productos.map(x => [x.codigo, x.nombre, x.unidades, Math.round(x.costo_promedio), x.total])];
        },
    },

    // ---------------------------------------------------------------- Cuentas por pagar por edades
    'cxp': {
        titulo: 'Cuentas por pagar por edades', periodo: false, filtros: [],
        url: () => '/informes/cxp-edades',
        archivo: () => 'cuentas_por_pagar_' + infHoy(),
        grupos(d) { return infEdades(d.documentos, x => x.id_proveedor, x => x.proveedor || '-', x => ({ telefono: x.telefono })); },
        tablaHTML(d) {
            const g = this.grupos(d), T = infSum(d.documentos, 'saldo');
            return `<div class="table-wrapper"><table class="data-table inf-tabla"><thead><tr><th>Proveedor</th>${INF_EDADES.map(([, l]) => `<th class="r">${l}</th>`).join('')}<th class="r">Total</th><th class="r">%</th></tr></thead>
                <tbody>${g.map(c => `<tr class="inf-grupo-fila"><td><b>${cmEsc(c.nombre)}</b><div class="inf-sub">${c.docs.length} factura(s)${c.telefono ? ' · ' + cmEsc(c.telefono) : ''}</div></td>${INF_EDADES.map(([k]) => `<td class="r${k !== 'corriente' && c[k] ? ' inf-venc' : ''}">${c[k] ? infMoney(c[k]) : '-'}</td>`).join('')}<td class="r"><b>${infMoney(c.total)}</b></td><td class="r">${cmPct(c.total, T)}%</td></tr>
                ${c.docs.map(x => `<tr class="inf-doc-fila"><td>${cmEsc(x.factura_proveedor || x.numero)} · ${infFecha(x.fecha)} · vence ${infFecha(x.vence)}${parseInt(x.dias_vencido) > 0 ? ` <span class="inf-venc">(${x.dias_vencido} días)</span>` : ''}</td>${INF_EDADES.map(([k]) => `<td class="r">${infEdad(x.dias_vencido) === k ? infMoney(x.saldo) : ''}</td>`).join('')}<td class="r">${infMoney(x.saldo)}</td><td></td></tr>`).join('')}`).join('')}</tbody>
                <tfoot><tr><td>TOTAL</td>${INF_EDADES.map(([k]) => `<td class="r">${infMoney(infSum(g, k))}</td>`).join('')}<td class="r">${infMoney(T)}</td><td class="r">100%</td></tr></tfoot></table></div>`;
        },
        render(d) {
            if (!d.documentos.length) return '<div class="empty-state"><i class="fas fa-face-smile"></i><h3>No hay cuentas por pagar</h3><p>Todas las compras a crédito están pagadas.</p></div>';
            const g = this.grupos(d), T = infSum(d.documentos, 'saldo'), cor = infSum(g, 'corriente');
            return `${infHero('CUENTAS POR PAGAR', infMoney(T), `${d.documentos.length} facturas · ${g.length} proveedores`, [['Vencido', infMoney(T - cor), `${cmPct(T - cor, T)}%`], ['Por vencer', infMoney(cor), '']])}
                <div class="inf-edades">${INF_EDADES.map(([k, l], i) => { const v = infSum(g, k); return `<div class="inf-edad e${i}"><span>${l}</span><b>${infMoney(v)}</b><small>${cmPct(v, T)}%</small><div class="inf-edad-bar"><div style="width:${cmPct(v, T)}%"></div></div></div>`; }).join('')}</div>
                ${infCard('Por proveedor', 'fa-truck-field', '#8B5CF6', this.tablaHTML(d))}`;
        },
        imprimir(d) { const T = infSum(d.documentos, 'saldo'); return infKpisPrint([['Total por pagar', infMoney(T)], ['Vencido', infMoney(T - infSum(this.grupos(d), 'corriente'))], ['Facturas', d.documentos.length], ['Proveedores', this.grupos(d).length]]) + this.tablaHTML(d); },
        excel(d) {
            return [['CUENTAS POR PAGAR', 'Corte', d.corte], [], ['Proveedor', 'Compra', 'Factura proveedor', 'Fecha', 'Vence', 'Días vencido', 'Neto', 'Saldo'],
                ...d.documentos.map(x => [x.proveedor, x.numero, x.factura_proveedor, x.fecha, x.vence, x.dias_vencido, x.neto_pagar, x.saldo])];
        },
    },

    // ---------------------------------------------------------------- Facturación electrónica (para el contador)
    'facturacion': {
        titulo: 'Facturación electrónica', periodo: true, filtros: [],
        url: st => '/informes/facturacion?' + infQS({ desde: st.desde, hasta: st.hasta }),
        iva(d) {
            const m = new Map();
            const add = (l, signo) => l.forEach(x => { const k = parseFloat(x.tarifa) || 0; const g = m.get(k) || { tarifa: k, base_f: 0, iva_f: 0, base_n: 0, iva_n: 0 }; if (signo > 0) { g.base_f += parseFloat(x.base); g.iva_f += parseFloat(x.iva); } else { g.base_n += parseFloat(x.base); g.iva_n += parseFloat(x.iva); } m.set(k, g); });
            add(d.iva_facturas, 1); add(d.iva_notas, -1);
            return [...m.values()].sort((a, b) => b.tarifa - a.tarifa).map(g => ({ ...g, base: g.base_f - g.base_n, ivaNeto: g.iva_f - g.iva_n }));
        },
        tablas(d) {
            const iva = this.iva(d), F = infSum(d.facturas, 'total'), N = infSum(d.notas, 'total');
            return `<h3 class="pt">Resumen de IVA por tarifa</h3>` + infTabla([{ t: 'Tarifa', f: x => x.tarifa + '%' }, { t: 'Base facturas', k: 'base_f', m: 1 }, { t: 'IVA facturas', k: 'iva_f', m: 1 },
                { t: 'Base notas', k: 'base_n', m: 1 }, { t: 'IVA notas', k: 'iva_n', m: 1 }, { t: 'Base neta', k: 'base', m: 1 }, { t: 'IVA neto', k: 'ivaNeto', m: 1 }], iva,
                ['TOTAL', infMoney(infSum(iva, 'base_f')), infMoney(infSum(iva, 'iva_f')), infMoney(infSum(iva, 'base_n')), infMoney(infSum(iva, 'iva_n')), infMoney(infSum(iva, 'base')), infMoney(infSum(iva, 'ivaNeto'))])
                + `<h3 class="pt">Facturas autorizadas (${d.facturas.length})</h3>` + infTabla([{ t: 'Factura', f: x => (x.prefijo || '') + x.numero }, { t: 'Fecha', f: x => infFecha(x.fecha) }, { t: 'Cliente', k: 'cliente_nombre' }, { t: 'NIT/CC', k: 'cliente_identificacion' },
                    { t: 'Pago', f: x => String(x.forma_pago) === '2' || x.forma_pago === 'credito' ? 'Crédito' : 'Contado' }, { t: 'Subtotal', k: 'subtotal', m: 1 }, { t: 'IVA', k: 'iva', m: 1 }, { t: 'Total', k: 'total', m: 1 }],
                    d.facturas, ['TOTAL', '', '', '', '', infMoney(infSum(d.facturas, 'subtotal')), infMoney(infSum(d.facturas, 'iva')), infMoney(F)], { vacio: 'Sin facturas en el período' })
                + `<h3 class="pt">Notas crédito (${d.notas.length})</h3>` + infTabla([{ t: 'Nota', f: x => (x.prefijo || '') + x.numero }, { t: 'Fecha', f: x => infFecha(x.fecha) }, { t: 'Afecta factura', f: x => (x.factura_prefijo || '') + x.factura_numero },
                    { t: 'Cliente', k: 'cliente_nombre' }, { t: 'Tipo', f: x => +x.concepto === 2 ? 'Anulación' : 'Devolución' }, { t: 'Total', k: 'total', m: 1 }],
                    d.notas, ['TOTAL', '', '', '', '', infMoney(N)], { vacio: 'Sin notas crédito en el período' });
        },
        render(d) {
            const F = infSum(d.facturas, 'total'), N = infSum(d.notas, 'total'), iva = this.iva(d);
            return `
                ${infHero(`FACTURACIÓN ELECTRÓNICA · ${infFecha(d.periodo.desde)} al ${infFecha(d.periodo.hasta)}`, infMoney(F - N), 'Total facturado menos notas crédito', [['Facturas', infMoney(F), `${d.facturas.length}`], ['Notas crédito', infMoney(N), `${d.notas.length}`]])}
                ${infStats([['Base gravable neta', infMoney(infSum(iva, 'base')), '', 'blue', 'fa-file-invoice'], ['IVA generado neto', infMoney(infSum(iva, 'ivaNeto')), '', 'purple', 'fa-percent'],
                    ['Facturas', d.facturas.length, 'autorizadas por la DIAN', 'green', 'fa-file-circle-check'], ['Notas crédito', d.notas.length, infMoney(N), 'orange', 'fa-file-circle-minus']])}
                <div class="card"><div class="card-body inf-ec">${this.tablas(d)}</div></div>`;
        },
        imprimir(d) {
            const F = infSum(d.facturas, 'total'), N = infSum(d.notas, 'total'), iva = this.iva(d);
            return infKpisPrint([['Facturado', infMoney(F)], ['Notas crédito', infMoney(N)], ['Neto', infMoney(F - N)], ['IVA neto', infMoney(infSum(iva, 'ivaNeto'))]]) + this.tablas(d);
        },
        excel(d) {
            return [['FACTURACIÓN ELECTRÓNICA', d.periodo.desde, d.periodo.hasta], [], ['IVA POR TARIFA'], ['Tarifa', 'Base facturas', 'IVA facturas', 'Base notas', 'IVA notas', 'Base neta', 'IVA neto'],
                ...this.iva(d).map(x => [x.tarifa, x.base_f, x.iva_f, x.base_n, x.iva_n, x.base, x.ivaNeto]), [],
                ['FACTURAS'], ['Factura', 'Fecha', 'Cliente', 'NIT/CC', 'Forma pago', 'Subtotal', 'IVA', 'Descuento', 'Total', 'CUFE'],
                ...d.facturas.map(x => [(x.prefijo || '') + x.numero, String(x.fecha).substring(0, 10), x.cliente_nombre, x.cliente_identificacion, String(x.forma_pago) === '2' ? 'Crédito' : 'Contado', x.subtotal, x.iva, x.descuento, x.total, x.cufe]), [],
                ['NOTAS CRÉDITO'], ['Nota', 'Fecha', 'Factura', 'Cliente', 'Concepto', 'Motivo', 'Total'],
                ...d.notas.map(x => [(x.prefijo || '') + x.numero, String(x.fecha).substring(0, 10), (x.factura_prefijo || '') + x.factura_numero, x.cliente_nombre, +x.concepto === 2 ? 'Anulación' : 'Devolución', x.motivo, x.total])];
        },
    },
};
