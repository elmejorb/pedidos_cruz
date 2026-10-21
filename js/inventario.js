/* ========================================
   PEDIDOS CRUZ - Reporte de inventario (agotados / stock bajo)
   ======================================== */

const invEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const invMoney = n => '$' + Math.round(parseFloat(n || 0)).toLocaleString('es-CO');
const invNum = n => Math.round(parseFloat(n || 0)).toLocaleString('es-CO');

function invEstado(p) {
    const s = parseFloat(p.stock), m = parseFloat(p.stock_minimo || 0);
    if (s <= 0) return 'agotado';
    if (s <= m) return 'bajo';
    return 'ok';
}

/** Sugerido a pedir: cubrir lo vendido en 30 días o el doble del mínimo (lo mayor) */
function invSugerido(p) {
    const objetivo = Math.max(parseFloat(p.stock_minimo || 0) * 2, Math.ceil(parseFloat(p.vendidos_30d || 0)));
    return Math.max(0, Math.ceil(objetivo - Math.max(0, parseFloat(p.stock))));
}

/** Días que alcanza el stock al ritmo de los últimos 30 días */
function invCobertura(p) {
    const diario = parseFloat(p.vendidos_30d || 0) / 30;
    if (diario <= 0) return null;
    return Math.max(0, parseFloat(p.stock)) / diario;
}

async function renderInventario(root) {
    const st = { estado: 'alerta', prov: '', cat: '', catalogo: '', buscar: '', conVentas: false, orden: 'urgencia', lista: [] };

    root.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></div>';
    const [data] = await Promise.all([api('/reportes/stock'), typeof catCargarListas === 'function' ? catCargarListas(true) : null]);
    if (!data || data.error) { root.innerHTML = `<div class="empty-state"><i class="fas fa-circle-exclamation"></i><h3>No se pudo cargar</h3><p>${invEsc(data?.mensaje || '')}</p></div>`; return; }
    if (!root.isConnected) return; // cambió de pestaña mientras cargaba
    st.lista = data.productos || [];

    const opciones = (lista, idKey, nomKey) => {
        const m = new Map(); lista.forEach(p => { if (p[idKey]) m.set(String(p[idKey]), p[nomKey]); });
        return [...m].sort((a, b) => (a[1] || '').localeCompare(b[1] || '')).map(([k, v]) => `<option value="${k}">${invEsc(v)}</option>`).join('');
    };
    const catalogos = (typeof CAT !== 'undefined' && CAT.catalogos) || [];
    const hayProv = st.lista.some(p => 'proveedor' in p);

    root.innerHTML = `
        <div class="stats-grid fade-in" id="inv-stats"></div>
        <div class="cm-filtros">
            <div class="cm-filtro-grupo">
                <span class="cm-filtro-label">Mostrar</span>
                <div class="fe-chips" id="inv-estado">
                    ${[['alerta', 'Agotados + stock bajo'], ['agotado', 'Agotados'], ['bajo', 'Stock bajo'], ['todos', 'Todo el inventario']]
                        .map(([v, l]) => `<button class="fe-chip-filter ${v === st.estado ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}
                </div>
            </div>
            <div class="cm-filtro-grupo">
                <span class="cm-filtro-label">Filtrar</span>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <div class="search-box" style="min-width:200px"><input type="text" id="inv-buscar" placeholder="Producto o código..."><i class="fas fa-search"></i></div>
                    ${hayProv ? `<select class="filter-select" id="inv-prov"><option value="">Todos los proveedores</option><option value="sin">Sin proveedor</option>${opciones(st.lista, 'id_proveedor', 'proveedor')}</select>` : ''}
                    <select class="filter-select" id="inv-cat"><option value="">Todas las categorías</option>${opciones(st.lista, 'id_categoria', 'categoria')}</select>
                    ${catalogos.length ? `<select class="filter-select" id="inv-catalogo"><option value="">Todos los catálogos</option>${catalogos.map(c => `<option value="${c.id_catalogo}">${invEsc(c.nombre)}</option>`).join('')}</select>` : ''}
                    <select class="filter-select" id="inv-orden">
                        <option value="urgencia">Orden: más urgentes</option><option value="vendidos">Más vendidos</option>
                        <option value="stock">Menor stock</option><option value="nombre">Nombre A-Z</option>
                    </select>
                    <label class="fe-check"><input type="checkbox" id="inv-ventas"> Solo con ventas (30 días)</label>
                </div>
            </div>
        </div>
        <div class="card fade-in">
            <div class="card-header">
                <h3><i class="fas fa-boxes-stacked" style="color:var(--warning);margin-right:8px"></i><span id="inv-titulo"></span></h3>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn btn-outline btn-sm" id="inv-csv"><i class="fas fa-file-excel"></i> Excel</button>
                    <button class="btn btn-primary btn-sm" id="inv-print"><i class="fas fa-print"></i> Lista de pedido a proveedores</button>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead><tr><th>Producto</th><th>${hayProv ? 'Proveedor / ' : ''}Categoría</th><th style="text-align:center">Stock</th><th style="text-align:center">Mínimo</th>
                        <th style="text-align:center" title="Unidades vendidas en pedidos no cancelados de los últimos 30 días">Vendidos 30d</th><th style="text-align:center" title="Días que alcanza el stock al ritmo de venta actual">Alcanza</th>
                        <th style="text-align:center" title="Para cubrir lo vendido en 30 días o el doble del mínimo">Sugerido pedir</th><th></th></tr></thead>
                    <tbody id="inv-tbody"></tbody>
                </table>
            </div>
        </div>`;

    const $ = id => document.getElementById(id);

    function filtrar() {
        const t = st.buscar.toLowerCase();
        let l = st.lista.filter(p =>
            (st.estado === 'todos' || (st.estado === 'alerta' ? invEstado(p) !== 'ok' : invEstado(p) === st.estado)) &&
            (!t || p.nombre.toLowerCase().includes(t) || (p.codigo || '').toLowerCase().includes(t)) &&
            (!st.prov || (st.prov === 'sin' ? !p.id_proveedor : String(p.id_proveedor) === st.prov)) &&
            (!st.cat || String(p.id_categoria) === st.cat) &&
            (!st.catalogo || (p.catalogos || []).includes(parseInt(st.catalogo))) &&
            (!st.conVentas || parseFloat(p.vendidos_30d) > 0));
        const peso = { agotado: 0, bajo: 1, ok: 2 };
        const ord = {
            urgencia: (a, b) => peso[invEstado(a)] - peso[invEstado(b)] || parseFloat(b.vendidos_30d) - parseFloat(a.vendidos_30d) || a.stock - b.stock,
            vendidos: (a, b) => parseFloat(b.vendidos_30d) - parseFloat(a.vendidos_30d),
            stock: (a, b) => a.stock - b.stock,
            nombre: (a, b) => a.nombre.localeCompare(b.nombre),
        };
        return l.sort(ord[st.orden]);
    }

    function stats() {
        const ag = st.lista.filter(p => invEstado(p) === 'agotado');
        const bajo = st.lista.filter(p => invEstado(p) === 'bajo');
        const urgentes = ag.filter(p => parseFloat(p.vendidos_30d) > 0);
        const conCosto = st.lista.filter(p => parseFloat(p.precio_costo) > 0 && p.stock > 0);
        const valorCosto = conCosto.reduce((s, p) => s + p.stock * p.precio_costo, 0);
        const valorVenta = st.lista.filter(p => p.stock > 0).reduce((s, p) => s + p.stock * p.precio, 0);
        $('inv-stats').innerHTML = `
            <div class="stat-card orange inv-stat" data-v="agotado"><div class="stat-icon orange" style="background:var(--danger-light);color:var(--danger)"><i class="fas fa-ban"></i></div>
                <div class="stat-info"><h4>Agotados</h4><div class="stat-value" style="color:var(--danger)">${ag.length}</div><div class="cr-stat-sub">${urgentes.length} con ventas recientes</div></div></div>
            <div class="stat-card orange inv-stat" data-v="bajo"><div class="stat-icon orange"><i class="fas fa-triangle-exclamation"></i></div>
                <div class="stat-info"><h4>Stock bajo</h4><div class="stat-value">${bajo.length}</div><div class="cr-stat-sub">en o bajo el mínimo</div></div></div>
            <div class="stat-card green"><div class="stat-icon green"><i class="fas fa-box-open"></i></div>
                <div class="stat-info"><h4>Productos activos</h4><div class="stat-value">${st.lista.length}</div><div class="cr-stat-sub">${st.lista.length - ag.length - bajo.length} con stock suficiente</div></div></div>
            <div class="stat-card purple"><div class="stat-icon purple"><i class="fas fa-sack-dollar"></i></div>
                <div class="stat-info"><h4>Valor del inventario</h4><div class="stat-value">${invMoney(valorVenta)}</div><div class="cr-stat-sub">a precio de venta${conCosto.length ? ` · ${invMoney(valorCosto)} a costo (${conCosto.length} con costo)` : ''}</div></div></div>`;
        document.querySelectorAll('.inv-stat').forEach(el => el.onclick = () => { st.estado = el.dataset.v; marcarChip(); pintar(); });
    }

    const marcarChip = () => document.querySelectorAll('#inv-estado .fe-chip-filter').forEach(b => b.classList.toggle('active', b.dataset.v === st.estado));

    function pintar() {
        const l = filtrar();
        const titulos = { alerta: 'Agotados y stock bajo', agotado: 'Productos agotados', bajo: 'Productos con stock bajo', todos: 'Todo el inventario' };
        $('inv-titulo').textContent = `${titulos[st.estado]} (${l.length})`;
        $('inv-tbody').innerHTML = l.length ? l.map(p => {
            const e = invEstado(p), sug = invSugerido(p), cob = invCobertura(p), upc = parseInt(p.unidades_por_caja) || 1;
            return `
                <tr class="inv-row ${e}">
                    <td><div class="inv-prod">
                        <div class="inv-img">${p.foto ? `<img src="${UPLOADS_URL}${p.foto}" loading="lazy">` : '<i class="fas fa-box"></i>'}</div>
                        <div><strong>${invEsc(p.nombre)}</strong><span>${invEsc(p.codigo || '')}</span></div>
                    </div></td>
                    <td style="font-size:12.5px">${hayProv ? `<div style="font-weight:600">${invEsc(p.proveedor || '—')}</div>` : ''}<div style="color:var(--text-muted)">${invEsc(p.categoria || 'Sin categoría')}</div></td>
                    <td style="text-align:center"><span class="inv-stock ${e}">${invNum(p.stock)}</span></td>
                    <td style="text-align:center;color:var(--text-muted)">${invNum(p.stock_minimo)}</td>
                    <td style="text-align:center">${parseFloat(p.vendidos_30d) > 0 ? `<strong>${invNum(p.vendidos_30d)}</strong>` : '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td style="text-align:center;font-size:12.5px">${cob === null ? '<span style="color:var(--text-muted)">sin ventas</span>' : cob < 1 ? '<span style="color:var(--danger);font-weight:700">hoy</span>' : `${Math.round(cob)} días`}</td>
                    <td style="text-align:center">${sug > 0 ? `<strong>${invNum(sug)}</strong> und${upc > 1 ? `<div style="font-size:11px;color:var(--text-muted)">≈ ${Math.ceil(sug / upc)} caja${Math.ceil(sug / upc) > 1 ? 's' : ''} x${upc}</div>` : ''}` : '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td><button class="btn btn-ghost btn-sm" title="Editar producto / stock" onclick="invEditar(${p.id_producto})"><i class="fas fa-edit"></i></button></td>
                </tr>`;
        }).join('') : `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-circle-check" style="color:var(--success)"></i><h3>${st.estado === 'todos' ? 'Sin productos' : '¡Todo en orden!'}</h3><p>${st.estado === 'todos' ? 'No hay productos con estos filtros.' : 'No hay productos agotados ni con stock bajo con estos filtros.'}</p></div></td></tr>`;
    }

    window.invEditar = async id => {
        const r = await api(`/productos/${id}`);
        if (r && !r.error) openProductModal(async () => { const d = await api('/reportes/stock'); if (d && !d.error) { st.lista = d.productos; stats(); pintar(); } }, r.producto);
    };

    $('inv-estado').onclick = e => { const b = e.target.closest('.fe-chip-filter'); if (!b) return; st.estado = b.dataset.v; marcarChip(); pintar(); };
    $('inv-buscar').addEventListener('input', debounce(e => { st.buscar = e.target.value.trim(); pintar(); }, 200));
    $('inv-prov')?.addEventListener('change', e => { st.prov = e.target.value; pintar(); });
    $('inv-cat').addEventListener('change', e => { st.cat = e.target.value; pintar(); });
    $('inv-catalogo')?.addEventListener('change', e => { st.catalogo = e.target.value; pintar(); });
    $('inv-orden').addEventListener('change', e => { st.orden = e.target.value; pintar(); });
    $('inv-ventas').addEventListener('change', e => { st.conVentas = e.target.checked; pintar(); });

    $('inv-csv').onclick = () => {
        const filas = [['Codigo', 'Producto', 'Proveedor', 'Categoria', 'Estado', 'Stock', 'Minimo', 'Vendidos 30d', 'Sugerido pedir', 'Unid x caja', 'Cajas sugeridas']];
        filtrar().forEach(p => {
            const sug = invSugerido(p), upc = parseInt(p.unidades_por_caja) || 1;
            filas.push([p.codigo || '', p.nombre, p.proveedor || '', p.categoria || '', invEstado(p), p.stock, p.stock_minimo, p.vendidos_30d, sug, upc, upc > 1 ? Math.ceil(sug / upc) : '']);
        });
        const csv = '﻿' + filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `inventario_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };

    // Impresión agrupada por proveedor: lista para hacer el pedido de reposición
    $('inv-print').onclick = () => {
        const l = filtrar().filter(p => invSugerido(p) > 0 || invEstado(p) !== 'ok');
        if (!l.length) { toast('No hay productos para reponer con estos filtros', 'warning'); return; }
        const grupos = new Map();
        l.forEach(p => { const k = p.proveedor || 'Sin proveedor'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); });
        const bloques = [...grupos].sort((a, b) => a[0] === 'Sin proveedor' ? 1 : b[0] === 'Sin proveedor' ? -1 : a[0].localeCompare(b[0])).map(([prov, items]) => `
            <h3 style="margin:18px 0 6px;font-size:14px">${invEsc(prov)} <span style="color:#666;font-weight:400">(${items.length} productos)</span></h3>
            <table><thead><tr><th>Código</th><th>Producto</th><th style="text-align:center">Stock</th><th style="text-align:center">Mín.</th><th style="text-align:center">Vend. 30d</th><th style="text-align:center">Pedir (und)</th><th style="text-align:center">Cajas</th><th style="width:70px">✓</th></tr></thead>
            <tbody>${items.map(p => { const sug = invSugerido(p), upc = parseInt(p.unidades_por_caja) || 1; return `<tr>
                <td>${invEsc(p.codigo || '')}</td><td>${invEsc(p.nombre)}${invEstado(p) === 'agotado' ? ' <b style="color:#c00">AGOTADO</b>' : ''}</td>
                <td style="text-align:center">${invNum(p.stock)}</td><td style="text-align:center">${invNum(p.stock_minimo)}</td><td style="text-align:center">${invNum(p.vendidos_30d)}</td>
                <td style="text-align:center"><b>${invNum(sug)}</b></td><td style="text-align:center">${upc > 1 ? Math.ceil(sug / upc) + ' x' + upc : '-'}</td><td></td></tr>`; }).join('')}</tbody></table>`).join('');
        printHTML(`
            <h1>Lista de reposición de inventario</h1>
            <p style="color:#666;margin-bottom:8px">Generado: ${new Date().toLocaleString('es-CO')} · ${l.length} productos · Sugerido = cubrir las ventas de 30 días o el doble del stock mínimo</p>
            ${bloques}`);
    };

    stats();
    pintar();
}
