/* ========================================
   PEDIDOS CRUZ - Compras a proveedores y cuentas por pagar
   #/compras · #/compras/nueva · #/compras/{id} · #/compras/{id}/editar · #/cuentas-pagar[/{idProveedor}]
   ======================================== */

const comEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const comMoney = n => (parseFloat(n || 0) < 0 ? '-$' : '$') + Math.abs(Math.round(parseFloat(n || 0))).toLocaleString('es-CO');
const comNum = n => Math.round(parseFloat(n || 0)).toLocaleString('es-CO');
const comFecha = f => f ? new Date(String(f).substring(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const comHoy = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().substring(0, 10); };
const COM_MEDIOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['nequi', 'Nequi'], ['daviplata', 'Daviplata'], ['tarjeta', 'Tarjeta'], ['cheque', 'Cheque'], ['otro', 'Otro']];
const comMedio = m => (COM_MEDIOS.find(x => x[0] === m) || [m, m || '-'])[1];
const COM_BORRADOR = 'pc_compra_borrador';

function comIrA(hash) {
    if (location.hash !== hash) history.pushState(null, '', hash);
    const page = hash.split('/')[1];
    navigateTo(page, { skipHash: true });
}

function comAccion(texto, fn) {
    const b = document.getElementById('header-action-btn');
    if (!texto) { b.style.display = 'none'; return; }
    b.style.display = '';
    document.getElementById('header-action-text').textContent = texto;
    b.onclick = fn;
}

// ========================================
// ROUTER DE LA PÁGINA COMPRAS
// ========================================
async function renderCompras() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    if (parts[1] === 'nueva') return comFormulario(null);
    if (/^\d+$/.test(parts[1] || '')) return parts[2] === 'editar' ? comFormulario(parseInt(parts[1])) : comDetalle(parseInt(parts[1]));
    return comListado();
}

// ========================================
// LISTADO
// ========================================
async function comListado() {
    comAccion('Nueva compra', () => comIrA('#/compras/nueva'));
    const c = document.getElementById('page-container');
    const ahora = new Date();
    const f = JSON.parse(sessionStorage.getItem('pc_compras_filtro') || 'null') || {
        mes: `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`, id_proveedor: '', forma_pago: '', estado: '', buscar: '',
    };
    const [prov] = await Promise.all([api('/proveedores')]);
    const proveedores = prov?.proveedores || [];
    const borrador = (() => { try { return JSON.parse(localStorage.getItem(COM_BORRADOR) || 'null'); } catch (e) { return null; } })();

    c.innerHTML = `
        <div class="fade-in">
            ${borrador && borrador.items?.length ? `<div class="com-borrador-aviso"><i class="fas fa-file-pen"></i>
                <span>Tienes una compra sin guardar${borrador.proveedor_nombre ? ' de <b>' + comEsc(borrador.proveedor_nombre) + '</b>' : ''} con ${borrador.items.length} producto(s).</span>
                <button class="btn btn-primary btn-sm" onclick="comIrA('#/compras/nueva')">Continuar</button></div>` : ''}
            <div class="stats-grid" id="com-stats"></div>
            <div class="card" style="margin-top:16px"><div class="card-body">
                <div class="com-filtros">
                    <div class="search-box" style="flex:1;min-width:200px"><input type="text" id="com-buscar" placeholder="Buscar factura, proveedor, NIT o # compra..." value="${comEsc(f.buscar)}"><i class="fas fa-search"></i></div>
                    <input type="month" id="com-mes" class="filter-select" value="${f.mes}" title="Mes (vacío = todos)">
                    <select id="com-prov" class="filter-select"><option value="">Todos los proveedores</option>${proveedores.map(p => `<option value="${p.id_proveedor}" ${String(p.id_proveedor) === String(f.id_proveedor) ? 'selected' : ''}>${comEsc(p.nombre)}</option>`).join('')}</select>
                    <select id="com-forma" class="filter-select"><option value="">Contado y crédito</option><option value="contado" ${f.forma_pago === 'contado' ? 'selected' : ''}>Contado</option><option value="credito" ${f.forma_pago === 'credito' ? 'selected' : ''}>Crédito</option></select>
                    <select id="com-estado" class="filter-select"><option value="">Todas</option><option value="recibida" ${f.estado === 'recibida' ? 'selected' : ''}>Recibidas</option><option value="anulada" ${f.estado === 'anulada' ? 'selected' : ''}>Anuladas</option></select>
                </div>
                <div class="table-wrapper"><table class="data-table">
                    <thead><tr><th>#</th><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Pago</th><th style="text-align:right">Ítems</th><th style="text-align:right">Total</th><th style="text-align:right">Saldo</th><th>Estado</th></tr></thead>
                    <tbody id="com-tbody"><tr><td colspan="9" style="text-align:center;padding:30px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></td></tr></tbody>
                </table></div>
            </div></div>
        </div>`;

    async function cargar() {
        sessionStorage.setItem('pc_compras_filtro', JSON.stringify(f));
        const qs = new URLSearchParams();
        if (f.mes) {
            const [y, m] = f.mes.split('-').map(Number);
            qs.set('desde', `${f.mes}-01`);
            qs.set('hasta', `${f.mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`);
        }
        ['id_proveedor', 'forma_pago', 'estado', 'buscar'].forEach(k => f[k] && qs.set(k, f[k]));
        const d = await api('/compras?' + qs);
        const tbody = document.getElementById('com-tbody');
        if (!tbody) return;
        if (!d || d.error) { tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-plug-circle-xmark"></i><p>${comEsc(d?.mensaje || 'No se pudo cargar')}</p></div></td></tr>`; return; }
        const s = d.stats;
        document.getElementById('com-stats').innerHTML = `
            <div class="stat-card purple"><div class="stat-icon purple"><i class="fas fa-cart-flatbed"></i></div>
                <div class="stat-info"><h4>Compras ${f.mes ? 'del mes' : ''}</h4><div class="stat-value">${comMoney(s.total)}</div><div class="cr-stat-sub">${s.cantidad} compra(s) · IVA ${comMoney(s.iva)}</div></div></div>
            <div class="stat-card green"><div class="stat-icon green"><i class="fas fa-money-bill-wave"></i></div>
                <div class="stat-info"><h4>De contado</h4><div class="stat-value">${comMoney(s.contado)}</div></div></div>
            <div class="stat-card blue"><div class="stat-icon blue"><i class="fas fa-handshake"></i></div>
                <div class="stat-info"><h4>A crédito</h4><div class="stat-value">${comMoney(s.credito)}</div></div></div>
            <div class="stat-card orange" style="cursor:pointer" onclick="comIrA('#/cuentas-pagar')"><div class="stat-icon orange"><i class="fas fa-file-invoice-dollar"></i></div>
                <div class="stat-info"><h4>Por pagar (total)</h4><div class="stat-value">${comMoney(s.por_pagar)}</div><div class="cr-stat-sub" style="${s.vencido > 0 ? 'color:var(--danger);font-weight:700' : ''}">${s.vencido > 0 ? comMoney(s.vencido) + ' vencido' : 'Nada vencido'}</div></div></div>`;
        tbody.innerHTML = d.compras.length ? d.compras.map(x => `
            <tr style="cursor:pointer" onclick="comIrA('#/compras/${x.id_compra}')" class="${x.estado === 'anulada' ? 'com-anulada' : ''}">
                <td><strong>#${x.numero}</strong></td>
                <td>${comFecha(x.fecha)}</td>
                <td><div style="font-weight:600">${comEsc(x.proveedor)}</div><div style="font-size:12px;color:var(--text-muted)">${comEsc(x.proveedor_nit || '')}</div></td>
                <td>${comEsc(x.factura_proveedor)}</td>
                <td>${x.forma_pago === 'credito' ? `<span class="com-tag cred">Crédito ${x.dias_credito}d</span>` : `<span class="com-tag cont">Contado</span>`}</td>
                <td style="text-align:right">${x.items}</td>
                <td style="text-align:right"><strong>${comMoney(x.total)}</strong></td>
                <td style="text-align:right">${x.estado === 'recibida' && parseFloat(x.saldo) > 0 ? `<strong style="color:${x.fecha_vencimiento && x.fecha_vencimiento < comHoy() ? 'var(--danger)' : '#B45309'}">${comMoney(x.saldo)}</strong>` : '<span style="color:var(--text-muted)">-</span>'}</td>
                <td>${x.estado === 'anulada' ? '<span class="badge-status badge-cancelado">Anulada</span>' : parseFloat(x.saldo) > 0 ? '<span class="badge-status badge-pendiente">Por pagar</span>' : '<span class="badge-status badge-entregado">Pagada</span>'}</td>
            </tr>`).join('')
            : `<tr><td colspan="9"><div class="empty-state"><i class="fas fa-cart-flatbed"></i><h3>Sin compras</h3><p>Registra la primera compra con el botón <b>Nueva compra</b>. Al guardarla sube el stock y se actualiza el costo de los productos.</p></div></td></tr>`;
    }

    const set = (id, k, ev = 'change') => document.getElementById(id).addEventListener(ev, e => { f[k] = e.target.value.trim(); cargar(); });
    set('com-mes', 'mes'); set('com-prov', 'id_proveedor'); set('com-forma', 'forma_pago'); set('com-estado', 'estado');
    document.getElementById('com-buscar').addEventListener('input', debounce(e => { f.buscar = e.target.value.trim(); cargar(); }, 350));
    cargar();
}

// ========================================
// FORMULARIO (nueva / editar)
// ========================================
function comCalcular(F) {
    const lineas = F.items.map(it => {
        const upc = it.tipo_unidad === 'caja' ? Math.max(1, it.upc) : 1;
        const cant = parseInt(it.cantidad) || 0;
        const pct = parseFloat(it.iva_porcentaje) || 0;
        const costo = parseFloat(it.costo) || 0;
        const sin = F.iva_incluido && pct > 0 ? costo / (1 + pct / 100) : costo;
        const base = cant * sin;
        return { it, upc, cant, unidades: cant * upc, pct, base, ivaBruto: base * pct / 100 };
    });
    const subtotal = lineas.reduce((s, l) => s + l.base, 0);
    const descuento = parseFloat(F.descuento) || 0, flete = parseFloat(F.flete) || 0, retencion = parseFloat(F.retencion) || 0;
    const factor = subtotal > 0 ? Math.min(1, descuento / subtotal) : 0;
    let valor = 0;
    lineas.forEach(l => { l.baseNeta = l.base * (1 - factor); l.iva = l.ivaBruto * (1 - factor); valor += l.baseNeta + l.iva; });
    let iva = 0;
    lineas.forEach(l => {
        l.flete = valor > 0 ? flete * (l.baseNeta + l.iva) / valor : (lineas.length ? flete / lineas.length : 0);
        l.total = l.baseNeta + l.iva + l.flete;
        l.costoUnit = l.unidades > 0 ? l.total / l.unidades : 0;
        iva += l.iva;
    });
    const total = subtotal - descuento + iva + flete;
    return { lineas, subtotal, descuento, iva, flete, total, retencion, neto: total - retencion };
}

async function comFormulario(idCompra) {
    comAccion(null);
    const c = document.getElementById('page-container');
    c.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></div>';

    const [pr, prov, comp] = await Promise.all([api('/productos'), catCargarListas(true), idCompra ? api(`/compras/${idCompra}`) : null]);
    const productos = (pr?.productos || []).filter(p => p.activo == 1 || p.activo === true || p.activo === undefined);
    const porId = new Map(productos.map(p => [p.id_producto, p]));
    let proveedores = prov.proveedores || [];

    let F;
    if (idCompra) {
        if (!comp || comp.error) { c.innerHTML = `<div class="empty-state"><i class="fas fa-circle-exclamation"></i><h3>No se pudo abrir la compra</h3><p>${comEsc(comp?.mensaje || '')}</p></div>`; return; }
        const x = comp.compra;
        if (x.estado !== 'recibida' || x.tiene_abonos) { toast(x.tiene_abonos ? 'La compra tiene abonos: anúlalos para poder editarla' : 'La compra está anulada', 'warning'); return comIrA(`#/compras/${idCompra}`); }
        F = {
            id: idCompra, numero: x.numero, id_proveedor: x.id_proveedor, factura_proveedor: x.factura_proveedor, fecha: String(x.fecha).substring(0, 10),
            forma_pago: x.forma_pago, dias_credito: x.dias_credito || 30, medio_pago: x.medio_pago || 'efectivo', iva_incluido: !!+x.iva_incluido,
            descuento: +x.descuento || '', flete: +x.flete || '', retencion: +x.retencion || '', notas: x.notas || '',
            items: x.detalles.map(d => {
                const p = porId.get(d.id_producto) || {};
                return { id_producto: d.id_producto, nombre: d.descripcion, codigo: d.codigo, upc: parseInt(p.unidades_por_caja) || d.unidades_por_caja || 1,
                    tipo_unidad: d.tipo_unidad, cantidad: parseInt(d.cantidad), costo: +d.costo, iva_porcentaje: +d.iva_porcentaje,
                    precio_venta: d.precio_venta_nuevo ? +d.precio_venta_nuevo : '', costo_ant: d.costo_anterior, precio_actual: d.precio_venta_anterior, stock: p.stock };
            }),
        };
    } else {
        let b = null;
        try { b = JSON.parse(localStorage.getItem(COM_BORRADOR) || 'null'); } catch (e) { }
        F = b || { id: null, id_proveedor: '', factura_proveedor: '', fecha: comHoy(), forma_pago: 'contado', dias_credito: 30, medio_pago: 'efectivo', iva_incluido: true, descuento: '', flete: '', retencion: '', notas: '', items: [] };
    }

    const guardarBorrador = () => {
        if (F.id) return;
        try {
            if (!F.items.length && !F.id_proveedor && !F.factura_proveedor) localStorage.removeItem(COM_BORRADOR);
            else localStorage.setItem(COM_BORRADOR, JSON.stringify({ ...F, proveedor_nombre: proveedores.find(p => p.id_proveedor == F.id_proveedor)?.nombre || '' }));
        } catch (e) { }
    };

    c.innerHTML = `
        <div class="fade-in com-form">
            <div class="cont-head">
                <button class="btn btn-ghost btn-sm" onclick="comIrA('${F.id ? '#/compras/' + F.id : '#/compras'}')"><i class="fas fa-arrow-left"></i> ${F.id ? 'Compra #' + F.numero : 'Compras'}</button>
                <div class="cont-head-info"><h2>${F.id ? 'Editar compra #' + F.numero : 'Nueva compra'}</h2>
                    <span>${F.id ? 'Al guardar se recalcula el inventario de esta compra' : 'Al guardar sube el stock y se actualiza el costo de cada producto'}</span></div>
                ${!F.id ? '<button class="btn btn-ghost btn-sm" id="cf-descartar" style="color:var(--danger)"><i class="fas fa-trash-can"></i> Descartar</button>' : ''}
            </div>

            <div class="card"><div class="card-body com-cab">
                <div class="form-group com-prov-box"><label>Proveedor *</label>
                    <div style="display:flex;gap:6px"><select id="cf-prov" class="filter-select" style="flex:1"></select>
                    <button class="btn btn-outline btn-sm" id="cf-prov-nuevo" title="Nuevo proveedor"><i class="fas fa-plus"></i></button></div></div>
                <div class="form-group"><label>Nº factura del proveedor *</label><input type="text" id="cf-factura" maxlength="50" value="${comEsc(F.factura_proveedor)}" placeholder="Ej: FV-1234"></div>
                <div class="form-group"><label>Fecha *</label><input type="date" id="cf-fecha" value="${F.fecha}" max="${comHoy()}"></div>
                <div class="form-group"><label>Forma de pago</label>
                    <div class="cr-toggle com-toggle">
                        <button type="button" data-fp="contado" class="cr-toggle-btn ${F.forma_pago === 'contado' ? 'active' : ''}"><i class="fas fa-money-bill-wave"></i> Contado</button>
                        <button type="button" data-fp="credito" class="cr-toggle-btn ${F.forma_pago === 'credito' ? 'active' : ''}"><i class="fas fa-handshake"></i> Crédito</button>
                    </div></div>
                <div class="form-group" id="cf-medio-box"><label>Medio de pago</label><select id="cf-medio" class="filter-select">${COM_MEDIOS.map(([v, l]) => `<option value="${v}" ${F.medio_pago === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
                <div class="form-group" id="cf-dias-box"><label>Días de crédito</label><input type="number" id="cf-dias" min="0" max="365" value="${F.dias_credito}"><small id="cf-vence" style="color:var(--text-muted)"></small></div>
                <label class="com-iva-switch"><label class="fe-switch"><input type="checkbox" id="cf-ivainc" ${F.iva_incluido ? 'checked' : ''}><span></span></label>
                    <span><b>Los costos incluyen IVA</b><small id="cf-ivainc-txt"></small></span></label>
            </div></div>

            <div class="card" style="margin-top:14px"><div class="card-body">
                <div class="com-buscar-wrap">
                    <div class="search-box" style="flex:1;min-width:220px"><input type="text" id="cf-buscar" placeholder="Agregar producto: escribe o escanea el código (Enter)" autocomplete="off"><i class="fas fa-barcode"></i></div>
                    <button class="btn btn-outline btn-sm" id="cf-agotados" title="Agrega los productos agotados (del proveedor escogido, si tiene)"><i class="fas fa-box-open"></i> Agotados</button>
                    <button class="btn btn-outline btn-sm" id="cf-bajos" title="Agrega los productos con stock en el mínimo o menos"><i class="fas fa-arrow-trend-down"></i> Stock bajo</button>
                    <div id="cf-sugerencias" class="com-sugerencias"></div>
                </div>
                <div id="cf-lineas"></div>
            </div></div>

            <div class="com-pie">
                <div class="card"><div class="card-body">
                    <div class="form-group" style="margin:0"><label>Notas</label><textarea id="cf-notas" rows="3" maxlength="500" placeholder="Observaciones de la compra">${comEsc(F.notas)}</textarea></div>
                </div></div>
                <div class="card"><div class="card-body com-totales" id="cf-totales"></div></div>
            </div>
            <div class="com-guardar-bar">
                <button class="btn btn-outline" onclick="comIrA('${F.id ? '#/compras/' + F.id : '#/compras'}')">Cancelar</button>
                <button class="btn btn-primary btn-lg" id="cf-guardar"><i class="fas fa-check"></i> ${F.id ? 'Guardar cambios' : 'Registrar compra'}</button>
            </div>
        </div>`;

    const $ = id => document.getElementById(id);
    const llenarProveedores = () => {
        $('cf-prov').innerHTML = `<option value="">— Escoge el proveedor —</option>` + proveedores.map(p => `<option value="${p.id_proveedor}" ${String(p.id_proveedor) === String(F.id_proveedor) ? 'selected' : ''}>${comEsc(p.nombre)}${p.nit ? ' · ' + comEsc(p.nit) : ''}</option>`).join('');
    };
    llenarProveedores();
    $('cf-prov').onchange = e => { F.id_proveedor = e.target.value; guardarBorrador(); };
    $('cf-prov-nuevo').onclick = () => catProveedor(null, async p => {
        const l = await catCargarListas(true); proveedores = l.proveedores || []; F.id_proveedor = p?.id_proveedor || F.id_proveedor; llenarProveedores(); guardarBorrador();
    });
    $('cf-factura').oninput = e => { F.factura_proveedor = e.target.value; guardarBorrador(); };
    $('cf-fecha').onchange = e => { F.fecha = e.target.value; pintarCabecera(); guardarBorrador(); };
    $('cf-medio').onchange = e => { F.medio_pago = e.target.value; guardarBorrador(); };
    $('cf-dias').oninput = e => { F.dias_credito = parseInt(e.target.value) || 0; pintarCabecera(); guardarBorrador(); };
    $('cf-notas').oninput = e => { F.notas = e.target.value; guardarBorrador(); };
    document.querySelectorAll('[data-fp]').forEach(b => b.onclick = () => {
        F.forma_pago = b.dataset.fp; document.querySelectorAll('[data-fp]').forEach(x => x.classList.toggle('active', x === b)); pintarCabecera(); pintarTotales(); guardarBorrador();
    });
    $('cf-ivainc').onchange = e => { F.iva_incluido = e.target.checked; pintarCabecera(); pintarLineas(); guardarBorrador(); };
    if ($('cf-descartar')) $('cf-descartar').onclick = async () => {
        if (!(await confirmar('Se borran el proveedor, los productos y los valores digitados.', { titulo: '¿Descartar esta compra?', ok: 'Descartar', tipo: 'danger' }))) return;
        localStorage.removeItem(COM_BORRADOR); comIrA('#/compras');
    };

    function pintarCabecera() {
        const cred = F.forma_pago === 'credito';
        $('cf-dias-box').style.display = cred ? '' : 'none';
        $('cf-medio-box').style.display = cred ? 'none' : '';
        if (cred && F.fecha) {
            const v = new Date(F.fecha + 'T12:00:00'); v.setDate(v.getDate() + (parseInt(F.dias_credito) || 0));
            $('cf-vence').textContent = 'Vence el ' + v.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        $('cf-ivainc-txt').textContent = F.iva_incluido ? 'Digita el costo tal como viene en la factura con IVA' : 'Digita el costo antes de IVA; el IVA se suma';
    }

    // ---------- Agregar productos ----------
    const sug = $('cf-sugerencias');
    function agregar(p, silencioso = false) {
        const ex = F.items.find(i => i.id_producto === p.id_producto);
        if (ex) { if (!silencioso) { ex.cantidad = (parseInt(ex.cantidad) || 0) + 1; toast(`${p.nombre}: cantidad ${ex.cantidad}`, 'success', 1200); } }
        else {
            const upc = parseInt(p.unidades_por_caja) || 1;
            const costoU = parseFloat(p.precio_costo) || 0; // por unidad, con IVA
            F.items.push({
                id_producto: p.id_producto, nombre: p.nombre, codigo: p.codigo, upc, tipo_unidad: upc > 1 ? 'caja' : 'unidad', cantidad: 1,
                costo: costoU > 0 ? Math.round((F.iva_incluido ? costoU : costoU / (1 + (parseFloat(p.iva) || 0) / 100)) * (upc > 1 ? upc : 1)) : '',
                iva_porcentaje: [0, 5, 19].includes(parseFloat(p.iva)) ? parseFloat(p.iva) : 0,
                precio_venta: '', costo_ant: p.precio_costo, precio_actual: p.precio, stock: p.stock,
            });
        }
        pintarLineas(); guardarBorrador();
        if (!silencioso) setTimeout(() => document.querySelector(`.com-linea[data-id="${p.id_producto}"] [data-k="cantidad"]`)?.focus(), 60);
    }
    function sugerir(t) {
        t = t.trim().toLowerCase();
        if (!t) { sug.innerHTML = ''; sug.classList.remove('show'); return; }
        const l = productos.filter(p => p.nombre.toLowerCase().includes(t) || (p.codigo || '').toLowerCase().includes(t)).slice(0, 12);
        sug.innerHTML = l.length ? l.map(p => `<div class="com-sug" data-id="${p.id_producto}">
                <div><b>${comEsc(p.nombre)}</b><small>${comEsc(p.codigo || 'Sin código')} · Stock ${comNum(p.stock)}${parseInt(p.unidades_por_caja) > 1 ? ' · Caja x' + p.unidades_por_caja : ''}</small></div>
                <span>${parseFloat(p.precio_costo) > 0 ? 'Últ. costo ' + comMoney(p.precio_costo) : '<i style="color:var(--text-muted)">Sin costo</i>'}</span></div>`).join('')
            : '<div class="com-sug vacio">Sin resultados</div>';
        sug.classList.add('show');
        sug.querySelectorAll('[data-id]').forEach(el => el.onclick = () => { agregar(porId.get(parseInt(el.dataset.id))); $('cf-buscar').value = ''; sugerir(''); });
    }
    let tB = null;
    $('cf-buscar').oninput = e => { clearTimeout(tB); tB = setTimeout(() => sugerir(e.target.value), 150); };
    $('cf-buscar').onkeydown = e => {
        if (e.key === 'Escape') { e.target.value = ''; sugerir(''); }
        if (e.key !== 'Enter') return;
        e.preventDefault(); clearTimeout(tB);
        const t = e.target.value.trim().toLowerCase(); if (!t) return;
        const exacto = productos.find(p => (p.codigo || '').toLowerCase() === t);
        const l = exacto ? [exacto] : productos.filter(p => p.nombre.toLowerCase().includes(t) || (p.codigo || '').toLowerCase().includes(t));
        if (l.length === 1) { agregar(l[0]); e.target.value = ''; sugerir(''); }
        else sugerir(e.target.value);
    };
    document.addEventListener('click', ev => { if (!ev.target.closest('.com-buscar-wrap')) sug.classList.remove('show'); });
    const agregarVarios = (lista, que) => {
        const delProv = F.id_proveedor ? lista.filter(p => String(p.id_proveedor) === String(F.id_proveedor)) : [];
        const usar = delProv.length ? delProv : lista;
        const nuevos = usar.filter(p => !F.items.some(i => i.id_producto === p.id_producto));
        if (!nuevos.length) return toast(`No hay productos ${que} para agregar`, 'warning');
        nuevos.forEach(p => agregar(p, true));
        toast(`${nuevos.length} producto(s) ${que} agregados${delProv.length ? ' del proveedor' : ''}. Ajusta las cantidades.`);
    };
    $('cf-agotados').onclick = () => agregarVarios(productos.filter(p => parseFloat(p.stock) <= 0), 'agotados');
    $('cf-bajos').onclick = () => agregarVarios(productos.filter(p => parseFloat(p.stock) > 0 && parseFloat(p.stock) <= parseFloat(p.stock_minimo || 0)), 'con stock bajo');

    // ---------- Líneas ----------
    function pintarLineas() {
        const cont = $('cf-lineas');
        if (!F.items.length) {
            cont.innerHTML = `<div class="empty-state" style="padding:26px"><i class="fas fa-boxes-stacked"></i><p>Busca los productos de la factura del proveedor, o usa <b>Agotados</b> / <b>Stock bajo</b> para cargarlos de una vez.</p></div>`;
            pintarTotales(); return;
        }
        const calc = comCalcular(F);
        cont.innerHTML = `
            <div class="com-linea com-linea-head">
                <span>Producto</span><span>Unidad</span><span>Cantidad</span><span>Costo ${F.iva_incluido ? 'c/IVA' : 's/IVA'}</span><span>IVA</span><span>Subtotal</span><span>Nuevo precio venta</span><span></span>
            </div>
            ${calc.lineas.map(({ it }, i) => `
            <div class="com-linea" data-id="${it.id_producto}" data-i="${i}">
                <div class="com-l-prod"><b>${comEsc(it.nombre)}</b><small>${comEsc(it.codigo || '')}${it.stock !== undefined ? ' · Stock ' + comNum(it.stock) : ''}${parseFloat(it.costo_ant) > 0 ? ' · Últ. costo ' + comMoney(it.costo_ant) + '/u' : ''}</small></div>
                <div class="com-l-und">${it.upc > 1 ? `<div class="com-und"><button type="button" data-k="und" data-v="unidad" class="${it.tipo_unidad === 'unidad' ? 'on' : ''}">Und</button><button type="button" data-k="und" data-v="caja" class="${it.tipo_unidad === 'caja' ? 'on' : ''}">Caja x${it.upc}</button></div>` : '<span class="com-und-fija">Und</span>'}</div>
                <label class="com-l-cant"><span class="com-m">Cantidad</span><input type="number" min="1" step="1" inputmode="numeric" data-k="cantidad" value="${it.cantidad}"></label>
                <label class="com-l-costo"><span class="com-m">Costo ${F.iva_incluido ? 'c/IVA' : 's/IVA'}</span><input type="number" min="0" step="any" inputmode="decimal" data-k="costo" value="${it.costo}" placeholder="0"></label>
                <label class="com-l-iva"><span class="com-m">IVA</span><select data-k="iva_porcentaje">${[0, 5, 19].map(v => `<option value="${v}" ${+it.iva_porcentaje === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></label>
                <div class="com-l-sub" data-out="sub"></div>
                <label class="com-l-pv"><span class="com-m">Nuevo precio venta</span><input type="number" min="0" step="any" inputmode="decimal" data-k="precio_venta" value="${it.precio_venta}" placeholder="${comNum(it.precio_actual)}"><small data-out="margen"></small></label>
                <button class="cart-item-remove com-l-del" title="Quitar"><i class="fas fa-trash-alt"></i></button>
            </div>`).join('')}`;
        cont.querySelectorAll('.com-linea[data-i]').forEach(row => {
            const it = F.items[+row.dataset.i];
            row.querySelectorAll('[data-k]').forEach(inp => {
                if (inp.dataset.k === 'und') return inp.onclick = () => {
                    if (it.tipo_unidad === inp.dataset.v) return;
                    // Mantener el costo por unidad al cambiar entre Und y Caja
                    const c = parseFloat(it.costo) || 0;
                    it.costo = c ? Math.round((inp.dataset.v === 'caja' ? c * it.upc : c / it.upc) * 100) / 100 : '';
                    it.tipo_unidad = inp.dataset.v; pintarLineas(); guardarBorrador();
                };
                inp.oninput = () => { it[inp.dataset.k] = inp.value; actualizarFila(row, it); pintarTotales(); guardarBorrador(); };
                inp.onfocus = () => inp.select && inp.select();
            });
            row.querySelector('.com-l-del').onclick = () => { F.items.splice(+row.dataset.i, 1); pintarLineas(); guardarBorrador(); };
            actualizarFila(row, it);
        });
        pintarTotales();
    }

    function actualizarFila(row, it) {
        const calc = comCalcular(F);
        const l = calc.lineas.find(x => x.it === it);
        if (!l) return;
        row.querySelector('[data-out="sub"]').innerHTML = `<b>${comMoney(l.baseNeta + l.iva)}</b><small>${comNum(l.unidades)} und · ${comMoney(l.costoUnit)}/u</small>`;
        const pv = parseFloat(it.precio_venta) || parseFloat(it.precio_actual) || 0;
        const m = row.querySelector('[data-out="margen"]');
        if (pv > 0 && l.costoUnit > 0) {
            const margen = (pv - l.costoUnit) / pv * 100;
            m.textContent = `Margen ${margen.toFixed(1)}%${it.precio_venta ? '' : ' (precio actual)'}`;
            m.className = margen < 0 ? 'neg' : margen < 10 ? 'bajo' : 'ok';
        } else { m.textContent = ''; }
        // los demás subtotales cambian con el prorrateo de descuento/flete
        document.querySelectorAll('.com-linea[data-i]').forEach(r => {
            if (r === row) return;
            const o = calc.lineas[+r.dataset.i];
            if (o) r.querySelector('[data-out="sub"]').innerHTML = `<b>${comMoney(o.baseNeta + o.iva)}</b><small>${comNum(o.unidades)} und · ${comMoney(o.costoUnit)}/u</small>`;
        });
    }

    function pintarTotales() {
        const t = comCalcular(F);
        const und = t.lineas.reduce((s, l) => s + l.unidades, 0);
        $('cf-totales').innerHTML = `
            <div class="com-tot"><span>Subtotal (sin IVA)</span><b>${comMoney(t.subtotal)}</b></div>
            <div class="com-tot in"><span>Descuento</span><input type="number" min="0" step="any" id="cf-desc" value="${F.descuento}" placeholder="0"></div>
            <div class="com-tot"><span>IVA</span><b>${comMoney(t.iva)}</b></div>
            <div class="com-tot in"><span>Flete <small>(se reparte en el costo)</small></span><input type="number" min="0" step="any" id="cf-flete" value="${F.flete}" placeholder="0"></div>
            <div class="com-tot grande"><span>Total factura</span><b>${comMoney(t.total)}</b></div>
            <div class="com-tot in"><span>Retención</span><input type="number" min="0" step="any" id="cf-ret" value="${F.retencion}" placeholder="0"></div>
            <div class="com-tot neto"><span>${F.forma_pago === 'credito' ? 'Queda por pagar' : 'Se paga hoy'}</span><b>${comMoney(t.neto)}</b></div>
            <div class="com-tot-info">${F.items.length} producto(s) · ${comNum(und)} unidades entran al inventario</div>`;
        [['cf-desc', 'descuento'], ['cf-flete', 'flete'], ['cf-ret', 'retencion']].forEach(([id, k]) => {
            const el = $(id);
            el.oninput = () => {
                F[k] = el.value; guardarBorrador();
                const pos = el.selectionStart;
                pintarTotales();
                document.querySelectorAll('.com-linea[data-i]').forEach(r => { const it = F.items[+r.dataset.i]; if (it) actualizarFila(r, it); });
                const n = $(id); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { }
            };
        });
    }

    // ---------- Guardar ----------
    $('cf-guardar').onclick = async () => {
        const t = comCalcular(F);
        if (!F.id_proveedor) return toast('Escoge el proveedor', 'warning');
        if (!String(F.factura_proveedor).trim()) return toast('Escribe el número de la factura del proveedor', 'warning');
        if (!F.items.length) return toast('Agrega al menos un producto', 'warning');
        const malas = F.items.filter(i => !(parseInt(i.cantidad) > 0) || i.costo === '' || isNaN(parseFloat(i.costo)));
        if (malas.length) return toast(`Revisa cantidad y costo de: ${malas.map(m => m.nombre).slice(0, 3).join(', ')}`, 'warning');
        const ceros = F.items.filter(i => parseFloat(i.costo) === 0).length;
        const prov = proveedores.find(p => String(p.id_proveedor) === String(F.id_proveedor));
        const und = t.lineas.reduce((s, l) => s + l.unidades, 0);
        const ok = await confirmar(`${F.id ? 'Se recalculará' : 'Entrarán'} ${comNum(und)} unidades al inventario y se actualizará el costo de ${F.items.length} producto(s).${ceros ? ` <br><b style="color:#B45309">${ceros} producto(s) con costo $0.</b>` : ''}`, {
            titulo: F.id ? `¿Guardar cambios de la compra #${F.numero}?` : '¿Registrar la compra?', ok: F.id ? 'Guardar' : 'Registrar compra', tipo: 'primary', icono: 'fa-cart-flatbed',
            detalle: `<div><span>Proveedor</span><b>${comEsc(prov?.nombre || '')}</b></div><div><span>Factura</span><b>${comEsc(F.factura_proveedor)}</b></div>
                <div><span>Total factura</span><b>${comMoney(t.total)}</b></div><div><span>${F.forma_pago === 'credito' ? 'A crédito (' + F.dias_credito + ' días)' : 'Contado · ' + comMedio(F.medio_pago)}</span><b>${comMoney(t.neto)}</b></div>`,
        });
        if (!ok) return;
        const btn = $('cf-guardar'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        const body = {
            id_proveedor: parseInt(F.id_proveedor), factura_proveedor: String(F.factura_proveedor).trim(), fecha: F.fecha, forma_pago: F.forma_pago,
            dias_credito: parseInt(F.dias_credito) || 0, medio_pago: F.forma_pago === 'contado' ? F.medio_pago : null, iva_incluido: !!F.iva_incluido,
            descuento: parseFloat(F.descuento) || 0, flete: parseFloat(F.flete) || 0, retencion: parseFloat(F.retencion) || 0, notas: F.notas || null,
            items: F.items.map(i => ({ id_producto: i.id_producto, tipo_unidad: i.tipo_unidad, cantidad: parseInt(i.cantidad), costo: parseFloat(i.costo) || 0,
                iva_porcentaje: parseFloat(i.iva_porcentaje) || 0, precio_venta: i.precio_venta === '' ? null : parseFloat(i.precio_venta) })),
        };
        const r = await api(F.id ? `/compras/${F.id}` : '/compras', { method: F.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        if (!r || r.error || !r.id_compra) {
            btn.disabled = false; btn.innerHTML = `<i class="fas fa-check"></i> ${F.id ? 'Guardar cambios' : 'Registrar compra'}`;
            const msg = r?.mensaje || (r && typeof r === 'object' ? Object.values(r).flat().join(' ') : '') || 'No se pudo guardar la compra';
            return toast(msg, 'error', 6000);
        }
        if (!F.id) localStorage.removeItem(COM_BORRADOR);
        toast(r.mensaje);
        comIrA(`#/compras/${r.id_compra}`);
    };

    pintarCabecera();
    pintarLineas();
    if (!F.id && F.items.length) toast('Se recuperó la compra que tenías sin guardar', 'success', 2500);
}

// ========================================
// DETALLE
// ========================================
async function comDetalle(id) {
    comAccion(null);
    const c = document.getElementById('page-container');
    const d = await api(`/compras/${id}`);
    if (!d || d.error) { c.innerHTML = `<div class="empty-state"><i class="fas fa-circle-exclamation"></i><h3>No se pudo abrir la compra</h3><p>${comEsc(d?.mensaje || '')}</p></div>`; return; }
    const x = d.compra;
    const anulada = x.estado === 'anulada';
    const editable = !anulada && !x.tiene_abonos;
    const vencida = !anulada && parseFloat(x.saldo) > 0 && x.fecha_vencimiento && x.fecha_vencimiento < comHoy();

    c.innerHTML = `
        <div class="fade-in">
            <div class="cont-head">
                <button class="btn btn-ghost btn-sm" onclick="comIrA('#/compras')"><i class="fas fa-arrow-left"></i> Compras</button>
                <div class="cont-head-info"><h2>Compra #${x.numero} ${anulada ? '<span class="badge-status badge-cancelado">Anulada</span>' : parseFloat(x.saldo) > 0 ? `<span class="badge-status badge-pendiente">${vencida ? 'Vencida' : 'Por pagar'}</span>` : '<span class="badge-status badge-entregado">Pagada</span>'}</h2>
                    <span>${comEsc(x.proveedor)} · Factura <b>${comEsc(x.factura_proveedor)}</b> · ${comFecha(x.fecha)}</span></div>
                <div class="cont-head-actions">
                    <button class="btn btn-outline btn-sm" onclick="comImprimir(${x.id_compra})"><i class="fas fa-print"></i> Imprimir</button>
                    ${!anulada && parseFloat(x.saldo) > 0 ? `<button class="btn btn-outline btn-sm" onclick="comIrA('#/cuentas-pagar/${x.id_proveedor}')"><i class="fas fa-hand-holding-dollar"></i> Pagar</button>` : ''}
                    ${editable ? `<button class="btn btn-outline btn-sm" onclick="comIrA('#/compras/${x.id_compra}/editar')"><i class="fas fa-pen"></i> Editar</button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="comAnular(${x.id_compra}, ${x.numero})"><i class="fas fa-ban"></i> Anular</button>` : ''}
                </div>
            </div>
            ${anulada ? `<div class="fe-alert danger" style="margin-bottom:14px"><div class="fe-alert-title"><i class="fas fa-ban"></i> Compra anulada</div>${comEsc(x.motivo_anulacion || '')} · ${comEsc(x.usuario_anula || '')} · ${formatDate(x.anulada_at)}. El stock de esta compra se descontó.</div>` : ''}
            ${x.tiene_abonos && !anulada ? `<div class="fe-alert warning" style="margin-bottom:14px"><i class="fas fa-circle-info"></i> Esta compra tiene abonos: para editarla o anularla primero anula esos pagos en Cuentas por pagar.</div>` : ''}

            <div class="com-det-grid">
                <div class="card"><div class="card-header"><h3>Productos (${x.detalles.length})</h3></div>
                    <div class="table-wrapper"><table class="data-table com-det-tabla">
                        <thead><tr><th>Producto</th><th style="text-align:right">Cant.</th><th style="text-align:right">Costo</th><th style="text-align:right">IVA</th><th style="text-align:right">Total línea</th><th style="text-align:right">Costo/u</th><th style="text-align:right">Precio venta</th></tr></thead>
                        <tbody>${x.detalles.map(l => {
                            const ant = parseFloat(l.costo_anterior), nue = parseFloat(l.costo_unitario_final);
                            const delta = ant > 0 ? (nue - ant) / ant * 100 : null;
                            return `<tr>
                                <td><div style="font-weight:600">${comEsc(l.descripcion)}</div><div style="font-size:11.5px;color:var(--text-muted)">${comEsc(l.codigo || '')}</div></td>
                                <td style="text-align:right">${comNum(l.cantidad)} ${l.tipo_unidad === 'caja' ? 'caja' + (l.cantidad > 1 ? 's' : '') + ` <small style="color:var(--text-muted)">(${comNum(l.unidades)} und)</small>` : 'und'}</td>
                                <td style="text-align:right">${comMoney(l.costo)}<div style="font-size:11px;color:var(--text-muted)">${+x.iva_incluido ? 'c/IVA' : 's/IVA'}</div></td>
                                <td style="text-align:right">${comNum(l.iva_porcentaje)}%</td>
                                <td style="text-align:right"><b>${comMoney(l.total)}</b>${parseFloat(l.flete) > 0 ? `<div style="font-size:11px;color:var(--text-muted)">flete ${comMoney(l.flete)}</div>` : ''}</td>
                                <td style="text-align:right"><b>${comMoney(nue)}</b>${delta !== null ? `<div class="com-delta ${delta > 0.5 ? 'sube' : delta < -0.5 ? 'baja' : ''}">antes ${comMoney(ant)}${Math.abs(delta) >= 0.5 ? ` · ${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : ''}</div>` : '<div style="font-size:11px;color:var(--text-muted)">primer costo</div>'}</td>
                                <td style="text-align:right">${l.precio_venta_nuevo ? `<b>${comMoney(l.precio_venta_nuevo)}</b><div style="font-size:11px;color:var(--text-muted)">antes ${comMoney(l.precio_venta_anterior)}</div>` : `<span style="color:var(--text-muted)">${comMoney(l.precio_venta_anterior)}</span>`}</td>
                            </tr>`; }).join('')}</tbody>
                    </table></div>
                </div>
                <div>
                    <div class="card"><div class="card-body com-totales">
                        <div class="com-tot"><span>Subtotal</span><b>${comMoney(x.subtotal)}</b></div>
                        ${parseFloat(x.descuento) > 0 ? `<div class="com-tot"><span>Descuento</span><b>-${comMoney(x.descuento)}</b></div>` : ''}
                        <div class="com-tot"><span>IVA</span><b>${comMoney(x.iva)}</b></div>
                        ${parseFloat(x.flete) > 0 ? `<div class="com-tot"><span>Flete</span><b>${comMoney(x.flete)}</b></div>` : ''}
                        <div class="com-tot grande"><span>Total factura</span><b>${comMoney(x.total)}</b></div>
                        ${parseFloat(x.retencion) > 0 ? `<div class="com-tot"><span>Retención</span><b>-${comMoney(x.retencion)}</b></div><div class="com-tot"><span>Neto a pagar</span><b>${comMoney(x.neto_pagar)}</b></div>` : ''}
                        ${!anulada ? `<div class="com-tot neto ${parseFloat(x.saldo) > 0 ? '' : 'pagada'}"><span>${parseFloat(x.saldo) > 0 ? 'Saldo por pagar' : 'Pagada'}</span><b>${comMoney(x.saldo)}</b></div>` : ''}
                    </div></div>
                    <div class="card" style="margin-top:14px"><div class="card-body">
                        <div class="info-row"><label>Forma de pago</label><span>${x.forma_pago === 'credito' ? `Crédito ${x.dias_credito} días` : 'Contado · ' + comMedio(x.medio_pago)}</span></div>
                        ${x.fecha_vencimiento ? `<div class="info-row"><label>Vence</label><span style="${vencida ? 'color:var(--danger);font-weight:700' : ''}">${comFecha(x.fecha_vencimiento)}</span></div>` : ''}
                        <div class="info-row"><label>Proveedor</label><span>${comEsc(x.proveedor)}${x.proveedor_nit ? '<br><small>NIT ' + comEsc(x.proveedor_nit) + '</small>' : ''}</span></div>
                        <div class="info-row"><label>Registró</label><span>${comEsc(x.usuario || '-')} · ${formatDate(x.created_at)}</span></div>
                        ${x.notas ? `<div style="margin-top:10px;padding:10px 12px;background:var(--bg);border-radius:var(--radius-sm);font-size:13px"><b>Notas:</b> ${comEsc(x.notas)}</div>` : ''}
                    </div></div>
                    ${x.pagos.length ? `<div class="card" style="margin-top:14px"><div class="card-header"><h3>Pagos</h3></div><div class="card-body" style="padding-top:4px">
                        ${x.pagos.map(p => `<div class="com-pago ${p.estado}"><div><b>Comprobante #${p.comprobante}</b><small>${comFecha(p.fecha)} · ${comMedio(p.medio_pago)}${+p.automatico ? ' · contado' : ''}${p.estado === 'anulado' ? ' · ANULADO' : ''}</small></div><b>${comMoney(p.valor)}</b></div>`).join('')}
                    </div></div>` : ''}
                </div>
            </div>
        </div>`;
}

async function comAnular(id, numero) {
    openModal(`Anular compra #${numero}`, `
        <div class="fe-alert warning" style="margin-bottom:14px"><i class="fas fa-triangle-exclamation"></i> Se descontará del inventario todo lo que entró con esta compra y se restaurará el costo anterior de los productos (si no ha cambiado después).</div>
        <div class="form-group" style="margin:0"><label>Motivo *</label><input type="text" id="ca-motivo" maxlength="300" placeholder="Ej: factura registrada por error"></div>`, `
        <button class="btn btn-outline" onclick="closeModal()">Volver</button>
        <button class="btn btn-danger" id="ca-ok"><i class="fas fa-ban"></i> Anular compra</button>`);
    document.getElementById('ca-ok').onclick = async () => {
        const motivo = document.getElementById('ca-motivo').value.trim();
        if (motivo.length < 3) return toast('Escribe el motivo', 'warning');
        if (!(await confirmar('El stock de los productos de esta compra se va a descontar. No se puede deshacer.', { titulo: `¿Anular la compra #${numero}?`, ok: 'Sí, anular', tipo: 'danger', icono: 'fa-ban' }))) return;
        const r = await api(`/compras/${id}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) });
        if (!r || r.error) return toast(r?.mensaje || 'No se pudo anular', 'error');
        closeModal(); toast(r.mensaje); comDetalle(id);
    };
}

async function comImprimir(id) {
    const d = await api(`/compras/${id}`);
    if (!d || d.error) return;
    const x = d.compra;
    printHTML(`
        <style>td,th{padding:6px 8px;font-size:12px} .r{text-align:right}</style>
        <h1>Compra #${x.numero}${x.estado === 'anulada' ? ' <span style="color:#B91C1C;font-size:16px">(ANULADA)</span>' : ''}</h1>
        <p style="margin:6px 0 14px"><b>Proveedor:</b> ${comEsc(x.proveedor)}${x.proveedor_nit ? ' · NIT ' + comEsc(x.proveedor_nit) : ''}<br>
            <b>Factura del proveedor:</b> ${comEsc(x.factura_proveedor)} · <b>Fecha:</b> ${comFecha(x.fecha)} ·
            <b>Pago:</b> ${x.forma_pago === 'credito' ? `Crédito ${x.dias_credito} días (vence ${comFecha(x.fecha_vencimiento)})` : 'Contado · ' + comMedio(x.medio_pago)}</p>
        <table><thead><tr><th>Código</th><th>Producto</th><th class="r">Cant.</th><th class="r">Und</th><th class="r">Costo</th><th class="r">IVA</th><th class="r">Total</th><th class="r">Costo/u</th></tr></thead>
        <tbody>${x.detalles.map(l => `<tr><td>${comEsc(l.codigo || '')}</td><td>${comEsc(l.descripcion)}</td><td class="r">${comNum(l.cantidad)} ${l.tipo_unidad === 'caja' ? 'cj' : 'und'}</td><td class="r">${comNum(l.unidades)}</td>
            <td class="r">${comMoney(l.costo)}</td><td class="r">${comNum(l.iva_porcentaje)}%</td><td class="r">${comMoney(l.total)}</td><td class="r">${comMoney(l.costo_unitario_final)}</td></tr>`).join('')}</tbody></table>
        <table style="width:300px;margin:14px 0 0 auto">
            <tr><td>Subtotal</td><td class="r">${comMoney(x.subtotal)}</td></tr>
            ${parseFloat(x.descuento) > 0 ? `<tr><td>Descuento</td><td class="r">-${comMoney(x.descuento)}</td></tr>` : ''}
            <tr><td>IVA</td><td class="r">${comMoney(x.iva)}</td></tr>
            ${parseFloat(x.flete) > 0 ? `<tr><td>Flete</td><td class="r">${comMoney(x.flete)}</td></tr>` : ''}
            <tr><td><b>Total factura</b></td><td class="r"><b>${comMoney(x.total)}</b></td></tr>
            ${parseFloat(x.retencion) > 0 ? `<tr><td>Retención</td><td class="r">-${comMoney(x.retencion)}</td></tr><tr><td><b>Neto a pagar</b></td><td class="r"><b>${comMoney(x.neto_pagar)}</b></td></tr>` : ''}
            <tr><td>Saldo</td><td class="r">${comMoney(x.saldo)}</td></tr>
        </table>
        ${x.notas ? `<p style="margin-top:12px"><b>Notas:</b> ${comEsc(x.notas)}</p>` : ''}
        <p style="margin-top:30px;font-size:11px;color:#666">Registró: ${comEsc(x.usuario || '')} · ${formatDate(x.created_at)}</p>`);
}

// ========================================
// CUENTAS POR PAGAR
// ========================================
async function renderCuentasPagar() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    if (/^\d+$/.test(parts[1] || '')) return comEstadoCuenta(parseInt(parts[1]));
    comAccion('Nueva compra', () => comIrA('#/compras/nueva'));
    const c = document.getElementById('page-container');
    const d = await api('/cuentas-pagar');
    if (!d || d.error) { c.innerHTML = `<div class="empty-state"><i class="fas fa-plug-circle-xmark"></i><h3>No disponible</h3><p>${comEsc(d?.mensaje || '')}</p></div>`; return; }
    const s = d.stats;
    const hoy = comHoy();
    c.innerHTML = `
        <div class="fade-in">
            <div class="stats-grid">
                <div class="stat-card orange"><div class="stat-icon orange"><i class="fas fa-file-invoice-dollar"></i></div><div class="stat-info"><h4>Total por pagar</h4><div class="stat-value">${comMoney(s.saldo)}</div><div class="cr-stat-sub">${s.proveedores} proveedor(es)</div></div></div>
                <div class="stat-card red"><div class="stat-icon red"><i class="fas fa-calendar-xmark"></i></div><div class="stat-info"><h4>Vencido</h4><div class="stat-value">${comMoney(s.vencido)}</div></div></div>
                <div class="stat-card green"><div class="stat-icon green"><i class="fas fa-hand-holding-dollar"></i></div><div class="stat-info"><h4>Pagado este mes</h4><div class="stat-value">${comMoney(s.pagado_mes)}</div></div></div>
                <div class="stat-card blue" style="cursor:pointer" onclick="comComprobantes()"><div class="stat-icon blue"><i class="fas fa-receipt"></i></div><div class="stat-info"><h4>Comprobantes</h4><div class="stat-value" style="font-size:16px">Ver pagos</div></div></div>
            </div>
            <div class="card" style="margin-top:16px"><div class="table-wrapper"><table class="data-table">
                <thead><tr><th>Proveedor</th><th style="text-align:right">Facturas</th><th>Próximo vencimiento</th><th style="text-align:right">Vencido</th><th style="text-align:right">Saldo</th><th></th></tr></thead>
                <tbody>${d.proveedores.length ? d.proveedores.map(p => `
                    <tr style="cursor:pointer" onclick="comIrA('#/cuentas-pagar/${p.id_proveedor}')">
                        <td><div style="font-weight:600">${comEsc(p.nombre)}</div><div style="font-size:12px;color:var(--text-muted)">${comEsc(p.nit || '')}${p.telefono ? ' · ' + comEsc(p.telefono) : ''}</div></td>
                        <td style="text-align:right">${p.facturas}</td>
                        <td style="${p.proximo_vencimiento && p.proximo_vencimiento < hoy ? 'color:var(--danger);font-weight:700' : ''}">${comFecha(p.proximo_vencimiento)}</td>
                        <td style="text-align:right">${parseFloat(p.vencido) > 0 ? `<b style="color:var(--danger)">${comMoney(p.vencido)}</b>` : '-'}</td>
                        <td style="text-align:right"><b>${comMoney(p.saldo)}</b></td>
                        <td><button class="btn btn-primary btn-sm"><i class="fas fa-hand-holding-dollar"></i> Pagar</button></td>
                    </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-circle-check"></i><h3>Al día</h3><p>No hay facturas de proveedores pendientes por pagar.</p></div></td></tr>`}</tbody>
            </table></div></div>
        </div>`;
}

async function comEstadoCuenta(idProveedor) {
    comAccion(null);
    const c = document.getElementById('page-container');
    const d = await api(`/cuentas-pagar/${idProveedor}`);
    if (!d || d.error) { c.innerHTML = `<div class="empty-state"><i class="fas fa-circle-exclamation"></i><h3>No disponible</h3><p>${comEsc(d?.mensaje || '')}</p></div>`; return; }
    const pv = d.proveedor;
    const hoy = comHoy();
    const sel = new Map(d.pendientes.map(f => [f.id_compra, { on: false, valor: +f.saldo, descuento: 0 }]));
    const comps = [...d.pagos.reduce((m, p) => {
        const k = p.comprobante;
        if (!m.has(k)) m.set(k, { comprobante: k, fecha: p.fecha, medio: p.medio_pago, referencia: p.referencia, estado: p.estado, automatico: +p.automatico, usuario: p.usuario, filas: [] });
        m.get(k).filas.push(p); return m;
    }, new Map()).values()];

    c.innerHTML = `
        <div class="fade-in">
            <div class="cont-head">
                <button class="btn btn-ghost btn-sm" onclick="comIrA('#/cuentas-pagar')"><i class="fas fa-arrow-left"></i> Cuentas por pagar</button>
                <div class="cont-head-info"><h2>${comEsc(pv.nombre)}</h2><span>${pv.nit ? 'NIT ' + comEsc(pv.nit) : ''}${pv.telefono ? ' · ' + comEsc(pv.telefono) : ''}${pv.contacto ? ' · ' + comEsc(pv.contacto) : ''}</span></div>
            </div>
            <div class="com-cxp-grid">
                <div class="card"><div class="card-header"><h3>Facturas pendientes</h3><span style="font-size:13px;color:var(--text-muted)">Saldo total <b style="color:#B45309">${comMoney(d.pendientes.reduce((s, f) => s + +f.saldo, 0))}</b></span></div>
                    ${d.pendientes.length ? `<div class="table-wrapper"><table class="data-table">
                        <thead><tr><th style="width:34px"><input type="checkbox" id="cx-todas"></th><th>Factura</th><th>Vence</th><th style="text-align:right">Saldo</th><th style="text-align:right">Pagar</th><th style="text-align:right">Dcto.</th></tr></thead>
                        <tbody>${d.pendientes.map(f => `<tr data-id="${f.id_compra}">
                            <td><input type="checkbox" class="cx-sel"></td>
                            <td><a class="fe-link" onclick="comIrA('#/compras/${f.id_compra}')">${comEsc(f.factura_proveedor)}</a><div style="font-size:11.5px;color:var(--text-muted)">Compra #${f.numero} · ${comFecha(f.fecha)} · ${comMoney(f.neto_pagar)}</div></td>
                            <td style="${f.fecha_vencimiento && f.fecha_vencimiento < hoy ? 'color:var(--danger);font-weight:700' : ''}">${comFecha(f.fecha_vencimiento)}</td>
                            <td style="text-align:right"><b>${comMoney(f.saldo)}</b></td>
                            <td style="text-align:right"><input type="number" class="cx-valor com-mini" min="0" step="any" value="${+f.saldo}" disabled></td>
                            <td style="text-align:right"><input type="number" class="cx-desc com-mini" min="0" step="any" value="0" disabled title="Descuento por pronto pago"></td>
                        </tr>`).join('')}</tbody></table></div>` : '<div class="empty-state" style="padding:24px"><i class="fas fa-circle-check"></i><p>Sin facturas pendientes con este proveedor.</p></div>'}
                </div>
                <div class="card"><div class="card-header"><h3>Registrar pago</h3></div><div class="card-body">
                    <div class="grid-2">
                        <div class="form-group"><label>Fecha</label><input type="date" id="cx-fecha" value="${hoy}" max="${hoy}"></div>
                        <div class="form-group"><label>Medio de pago</label><select id="cx-medio" class="filter-select" style="width:100%">${COM_MEDIOS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
                    </div>
                    <div class="form-group"><label>Referencia</label><input type="text" id="cx-ref" maxlength="80" placeholder="Nº de transferencia, cheque..."></div>
                    <div class="form-group"><label>Notas</label><input type="text" id="cx-notas" maxlength="300"></div>
                    <div class="com-tot grande" style="margin:8px 0 12px"><span>Total a pagar</span><b id="cx-total">$0</b></div>
                    <button class="btn btn-primary btn-block" id="cx-pagar" disabled><i class="fas fa-hand-holding-dollar"></i> Registrar pago</button>
                </div></div>
            </div>
            <div class="card" style="margin-top:16px"><div class="card-header"><h3>Historial de pagos</h3></div>
                ${comps.length ? `<div class="table-wrapper"><table class="data-table"><thead><tr><th>Comprobante</th><th>Fecha</th><th>Facturas</th><th>Medio</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>
                ${comps.map(k => `<tr class="${k.estado === 'anulado' ? 'com-anulada' : ''}">
                    <td><b>#${k.comprobante}</b>${k.automatico ? ' <span class="com-tag cont">Contado</span>' : ''}${k.estado === 'anulado' ? ' <span class="badge-status badge-cancelado">Anulado</span>' : ''}</td>
                    <td>${comFecha(k.fecha)}</td>
                    <td style="font-size:12.5px">${k.filas.map(f => comEsc(f.factura_proveedor)).join(', ')}</td>
                    <td>${comMedio(k.medio)}${k.referencia ? '<div style="font-size:11.5px;color:var(--text-muted)">' + comEsc(k.referencia) + '</div>' : ''}</td>
                    <td style="text-align:right"><b>${comMoney(k.filas.reduce((s, f) => s + +f.valor, 0))}</b></td>
                    <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="comImprimirComprobante(${k.comprobante})" title="Imprimir"><i class="fas fa-print"></i></button>
                        ${k.estado === 'valido' && !k.automatico ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="comAnularPago(${k.comprobante}, ${idProveedor})" title="Anular"><i class="fas fa-ban"></i></button>` : ''}</td>
                </tr>`).join('')}</tbody></table></div>` : '<div class="card-body" style="color:var(--text-muted)">Aún no hay pagos registrados.</div>'}
            </div>
        </div>`;

    const total = () => [...sel.values()].filter(v => v.on).reduce((s, v) => s + (parseFloat(v.valor) || 0), 0);
    const repintar = () => {
        document.getElementById('cx-total').textContent = comMoney(total());
        document.getElementById('cx-pagar').disabled = total() <= 0;
    };
    document.querySelectorAll('tr[data-id]').forEach(tr => {
        const v = sel.get(+tr.dataset.id);
        const chk = tr.querySelector('.cx-sel'), val = tr.querySelector('.cx-valor'), desc = tr.querySelector('.cx-desc');
        chk.onchange = () => { v.on = chk.checked; val.disabled = desc.disabled = !chk.checked; tr.classList.toggle('com-sel', chk.checked); repintar(); };
        val.oninput = () => { v.valor = val.value; repintar(); };
        desc.oninput = () => { v.descuento = desc.value; };
    });
    const todas = document.getElementById('cx-todas');
    if (todas) todas.onchange = () => document.querySelectorAll('.cx-sel').forEach(ch => { ch.checked = todas.checked; ch.onchange(); });
    document.getElementById('cx-pagar').onclick = async () => {
        const pagos = [...sel.entries()].filter(([, v]) => v.on).map(([id_compra, v]) => ({ id_compra, valor: parseFloat(v.valor) || 0, descuento: parseFloat(v.descuento) || 0 }));
        const t = total();
        const medio = document.getElementById('cx-medio').value;
        if (!(await confirmar(`Se registrará el pago de ${pagos.length} factura(s) a ${comEsc(pv.nombre)}.`, {
            titulo: '¿Registrar el pago?', ok: 'Registrar pago', icono: 'fa-hand-holding-dollar',
            detalle: `<div><span>Medio</span><b>${comMedio(medio)}</b></div><div><span>Total</span><b>${comMoney(t)}</b></div>`,
        }))) return;
        const r = await api('/pagos-proveedor', { method: 'POST', body: JSON.stringify({
            id_proveedor: idProveedor, fecha: document.getElementById('cx-fecha').value, medio_pago: medio,
            referencia: document.getElementById('cx-ref').value.trim() || null, notas: document.getElementById('cx-notas').value.trim() || null, pagos,
        }) });
        if (!r || r.error) return toast(r?.mensaje || 'No se pudo registrar el pago', 'error', 6000);
        toast(r.mensaje);
        comEstadoCuenta(idProveedor);
        comImprimirComprobante(r.comprobante);
    };
}

async function comAnularPago(comprobante, idProveedor) {
    openModal(`Anular comprobante #${comprobante}`, `
        <p style="color:var(--text-secondary);margin-bottom:12px">El valor pagado vuelve a quedar como saldo pendiente de las facturas.</p>
        <div class="form-group" style="margin:0"><label>Motivo *</label><input type="text" id="cp-motivo" maxlength="300"></div>`, `
        <button class="btn btn-outline" onclick="closeModal()">Volver</button>
        <button class="btn btn-danger" id="cp-ok"><i class="fas fa-ban"></i> Anular</button>`);
    document.getElementById('cp-ok').onclick = async () => {
        const motivo = document.getElementById('cp-motivo').value.trim();
        if (motivo.length < 3) return toast('Escribe el motivo', 'warning');
        const r = await api(`/pagos-proveedor/${comprobante}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) });
        if (!r || r.error) return toast(r?.mensaje || 'No se pudo anular', 'error');
        closeModal(); toast(r.mensaje); comEstadoCuenta(idProveedor);
    };
}

async function comImprimirComprobante(comprobante) {
    const d = await api(`/pagos-proveedor?comprobante=${comprobante}`);
    if (!d || d.error || !d.pagos.length) return;
    const p0 = d.pagos[0];
    const total = d.pagos.reduce((s, p) => s + +p.valor, 0);
    printHTML(`
        <h1>Comprobante de egreso #${comprobante}${p0.estado === 'anulado' ? ' <span style="color:#B91C1C;font-size:16px">(ANULADO)</span>' : ''}</h1>
        <p style="margin:6px 0 14px"><b>Pagado a:</b> ${comEsc(p0.proveedor)}${p0.proveedor_nit ? ' · NIT ' + comEsc(p0.proveedor_nit) : ''}<br>
            <b>Fecha:</b> ${comFecha(p0.fecha)} · <b>Medio:</b> ${comMedio(p0.medio_pago)}${p0.referencia ? ' · Ref. ' + comEsc(p0.referencia) : ''}</p>
        <table><thead><tr><th>Factura proveedor</th><th>Compra</th><th style="text-align:right">Descuento</th><th style="text-align:right">Valor pagado</th><th style="text-align:right">Saldo actual</th></tr></thead>
        <tbody>${d.pagos.map(p => `<tr><td>${comEsc(p.factura_proveedor)}</td><td>#${p.compra_numero}</td><td style="text-align:right">${comMoney(p.descuento)}</td><td style="text-align:right">${comMoney(p.valor)}</td><td style="text-align:right">${comMoney(p.compra_saldo)}</td></tr>`).join('')}</tbody></table>
        <p style="text-align:right;font-size:16px;margin-top:12px"><b>Total pagado: ${comMoney(total)}</b></p>
        ${p0.notas ? `<p><b>Notas:</b> ${comEsc(p0.notas)}</p>` : ''}
        <div style="margin-top:50px;display:flex;gap:40px">
            <div style="flex:1;border-top:1px solid #999;padding-top:6px;text-align:center;font-size:12px;color:#666">Elaboró: ${comEsc(p0.usuario || '')}</div>
            <div style="flex:1;border-top:1px solid #999;padding-top:6px;text-align:center;font-size:12px;color:#666">Recibí conforme</div>
        </div>`);
}

async function comComprobantes() {
    const ahora = new Date();
    const desde = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`;
    const d = await api(`/pagos-proveedor?desde=${desde}`);
    if (!d || d.error) return;
    const grupos = [...d.pagos.reduce((m, p) => { if (!m.has(p.comprobante)) m.set(p.comprobante, []); m.get(p.comprobante).push(p); return m; }, new Map()).entries()];
    openModal('Pagos a proveedores del mes', grupos.length ? `<div class="table-wrapper"><table class="data-table">
        <thead><tr><th>#</th><th>Fecha</th><th>Proveedor</th><th>Medio</th><th style="text-align:right">Valor</th><th></th></tr></thead>
        <tbody>${grupos.map(([k, f]) => `<tr class="${f[0].estado === 'anulado' ? 'com-anulada' : ''}"><td><b>#${k}</b>${+f[0].automatico ? ' <span class="com-tag cont">Contado</span>' : ''}</td><td>${comFecha(f[0].fecha)}</td><td>${comEsc(f[0].proveedor)}</td><td>${comMedio(f[0].medio_pago)}</td>
            <td style="text-align:right"><b>${comMoney(f.reduce((s, p) => s + +p.valor, 0))}</b></td><td><button class="btn btn-ghost btn-sm" onclick="comImprimirComprobante(${k})"><i class="fas fa-print"></i></button></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty-state"><i class="fas fa-receipt"></i><p>No hay pagos este mes.</p></div>', '<button class="btn btn-primary" onclick="closeModal()">Cerrar</button>');
    if (typeof feModalWide === 'function') feModalWide();
}
