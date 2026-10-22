/* ========================================
   PEDIDOS CRUZ - Conteo de inventario (toma física)
   Crear conteo → contar (cajas + unidades) → aplicar ajustes al stock
   ======================================== */

const CONT = { conteo: null, productos: [], filtro: 'pendientes', buscar: '', ciego: false };
const contEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const contNum = n => Math.round(parseFloat(n || 0)).toLocaleString('es-CO');
const contMoney = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(parseFloat(n || 0))).toLocaleString('es-CO');
const contSigno = n => (n > 0 ? '+' : '') + contNum(n);
const ALCANCES = { todo: 'Todo el inventario', catalogo: 'Catálogo', categoria: 'Categoría', proveedor: 'Proveedor' };

try { CONT.ciego = localStorage.getItem('pc_conteo_ciego') === '1'; } catch (e) { }

// ========================================
// LISTADO DE CONTEOS
// ========================================
async function renderConteo() {
    const m = location.hash.match(/^#\/conteo\/(\d+)/);
    if (m) return contAbrir(parseInt(m[1]), true);

    const actionBtn = document.getElementById('header-action-btn');
    actionBtn.style.display = '';
    document.getElementById('header-action-text').textContent = 'Nuevo conteo';
    actionBtn.onclick = contNuevo;

    const container = document.getElementById('page-container');
    const data = await api('/conteos');
    if (!data || data.error) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>No disponible</h3><p>${contEsc(data?.mensaje || 'No se pudo cargar')}</p></div>`;
        return;
    }
    const conteos = data.conteos || [];
    const abiertos = conteos.filter(c => c.estado === 'abierto');

    container.innerHTML = `
        <div class="cont-intro fade-in">
            <i class="fas fa-clipboard-check"></i>
            <div><strong>Conteo físico de inventario</strong>
            <span>Crea un conteo, cuenta los productos en bodega (por cajas y unidades) y al final aplica los ajustes. Las ventas que se hagan mientras cuentas no se pierden.</span></div>
            <button class="btn btn-primary" onclick="contNuevo()"><i class="fas fa-plus"></i> Nuevo conteo</button>
        </div>
        ${!conteos.length ? `<div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>Aún no hay conteos</h3><p>Empieza por un catálogo o proveedor pequeño, o cuenta todo el inventario.</p></div>` : `
        ${abiertos.length ? `<h3 class="cont-sec-title"><i class="fas fa-hourglass-half"></i> En curso</h3>
            <div class="cont-grid">${abiertos.map(contCard).join('')}</div>` : ''}
        ${conteos.length > abiertos.length ? `<h3 class="cont-sec-title"><i class="fas fa-clock-rotate-left"></i> Historial</h3>
            <div class="card"><div class="table-wrapper"><table class="data-table">
                <thead><tr><th>Conteo</th><th class="cont-hide-m">Alcance</th><th class="cont-hide-m">Fecha</th><th class="cont-hide-m" style="text-align:right">Contados</th><th class="cont-hide-m" style="text-align:right">Ajustados</th><th style="text-align:right">Unidades</th><th style="text-align:right">Valor ajuste</th><th>Estado</th></tr></thead>
                <tbody>${conteos.filter(c => c.estado !== 'abierto').map(c => `
                    <tr style="cursor:pointer" onclick="contAbrir(${c.id_conteo})">
                        <td><strong>${contEsc(c.nombre)}</strong><div style="font-size:12px;color:var(--text-muted)">${formatDateShort(c.aplicado_at || c.updated_at)} · ${contEsc(c.usuario_aplica || c.usuario || '')}</div></td>
                        <td class="cont-hide-m">${contAlcanceTxt(c)}</td>
                        <td class="cont-hide-m">${formatDate(c.aplicado_at || c.updated_at)}</td>
                        <td class="cont-hide-m" style="text-align:right">${contNum(c.contados)}</td>
                        <td class="cont-hide-m" style="text-align:right">${c.estado === 'aplicado' ? contNum(c.productos_ajustados) : '-'}</td>
                        <td style="text-align:right" class="${c.unidades_ajuste < 0 ? 'cont-neg' : c.unidades_ajuste > 0 ? 'cont-pos' : ''}">${c.estado === 'aplicado' ? contSigno(c.unidades_ajuste) : '-'}</td>
                        <td style="text-align:right" class="${c.valor_ajuste < 0 ? 'cont-neg' : c.valor_ajuste > 0 ? 'cont-pos' : ''}">${c.estado === 'aplicado' ? contMoney(c.valor_ajuste) : '-'}</td>
                        <td><span class="cont-estado ${c.estado}">${c.estado === 'aplicado' ? 'Aplicado' : 'Cancelado'}</span></td>
                    </tr>`).join('')}</tbody>
            </table></div></div>` : ''}`}`;
}

function contAlcanceTxt(c) {
    return c.alcance === 'todo' ? 'Todo el inventario' : `${ALCANCES[c.alcance]}: <b>${contEsc(c.alcance_nombre)}</b>`;
}

function contCard(c) {
    const pct = c.total_productos ? Math.round(c.contados / c.total_productos * 100) : 0;
    return `
        <div class="cont-card" onclick="contAbrir(${c.id_conteo})">
            <div class="cont-card-top">
                <div><strong>${contEsc(c.nombre)}</strong><span>${contAlcanceTxt(c)}</span></div>
                <span class="cont-estado abierto">En curso</span>
            </div>
            <div class="cont-progress"><div style="width:${pct}%"></div></div>
            <div class="cont-card-nums">
                <span><b>${contNum(c.contados)}</b> de ${contNum(c.total_productos)} contados (${pct}%)</span>
                ${c.con_diferencia ? `<span class="cont-neg"><i class="fas fa-triangle-exclamation"></i> ${c.con_diferencia} con diferencia</span>` : ''}
            </div>
            <div class="cont-card-foot">Creado ${formatDate(c.created_at)} · ${contEsc(c.usuario || '')}<span>Continuar <i class="fas fa-arrow-right"></i></span></div>
        </div>`;
}

async function contNuevo() {
    const [cat, catData] = await Promise.all([catCargarListas(true), api('/categorias')]);
    const listas = {
        catalogo: cat.catalogos.map(c => [c.id_catalogo, c.nombre]),
        categoria: (catData?.categorias || []).map(c => [c.id_categoria, c.nombre]),
        proveedor: cat.proveedores.map(p => [p.id_proveedor, p.nombre]),
    };
    const hoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

    openModal('Nuevo conteo de inventario', `
        <div class="form-group">
            <label>Nombre del conteo *</label>
            <input type="text" id="cn-nombre" value="Conteo ${hoy}" maxlength="150">
        </div>
        <div class="form-group">
            <label>¿Qué vas a contar?</label>
            <div class="cont-alcances">
                ${Object.entries(ALCANCES).map(([k, l], i) => `
                    <label class="cont-alcance ${i === 0 ? 'on' : ''} ${k !== 'todo' && !listas[k].length ? 'off' : ''}">
                        <input type="radio" name="cn-alcance" value="${k}" ${i === 0 ? 'checked' : ''} ${k !== 'todo' && !listas[k].length ? 'disabled' : ''}>
                        <i class="fas ${{ todo: 'fa-warehouse', catalogo: 'fa-book-open', categoria: 'fa-tags', proveedor: 'fa-truck-field' }[k]}"></i>
                        <span>${l}</span>
                    </label>`).join('')}
            </div>
        </div>
        <div class="form-group" id="cn-id-box" style="display:none">
            <label id="cn-id-label">Escoge</label>
            <select id="cn-id" class="filter-select" style="width:100%"></select>
        </div>
        <div class="form-group">
            <label>Notas (opcional)</label>
            <input type="text" id="cn-notas" maxlength="500" placeholder="Ej: conteo de fin de mes, bodega principal">
        </div>`, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="cn-crear"><i class="fas fa-play"></i> Empezar conteo</button>`);

    const radios = document.querySelectorAll('input[name="cn-alcance"]');
    radios.forEach(r => r.onchange = () => {
        document.querySelectorAll('.cont-alcance').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
        const k = r.value;
        document.getElementById('cn-id-box').style.display = k === 'todo' ? 'none' : '';
        if (k !== 'todo') {
            document.getElementById('cn-id-label').textContent = ALCANCES[k];
            document.getElementById('cn-id').innerHTML = listas[k].map(([id, n]) => `<option value="${id}">${contEsc(n)}</option>`).join('');
        }
    });

    document.getElementById('cn-crear').onclick = async () => {
        const alcance = document.querySelector('input[name="cn-alcance"]:checked').value;
        const body = {
            nombre: document.getElementById('cn-nombre').value.trim(),
            alcance,
            id_alcance: alcance === 'todo' ? null : document.getElementById('cn-id').value,
            notas: document.getElementById('cn-notas').value.trim() || null,
        };
        if (!body.nombre) return toast('Escribe un nombre para el conteo', 'warning');
        const btn = document.getElementById('cn-crear');
        btn.disabled = true;
        const r = await api('/conteos', { method: 'POST', body: JSON.stringify(body) });
        if (!r || r.error) { btn.disabled = false; return toast(r?.mensaje || 'No se pudo crear', 'error'); }
        closeModal();
        toast('Conteo creado. ¡A contar!');
        contAbrir(r.id_conteo);
    };
}

// ========================================
// DETALLE DE UN CONTEO
// ========================================
async function contAbrir(id, skipHash = false) {
    if (!skipHash && location.hash !== '#/conteo/' + id) history.pushState(null, '', '#/conteo/' + id);
    document.getElementById('header-action-btn').style.display = 'none';
    const container = document.getElementById('page-container');
    container.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></div>';

    const data = await api(`/conteos/${id}`);
    if (!data || data.error) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>No se pudo abrir el conteo</h3><p>${contEsc(data?.mensaje || '')}</p><button class="btn btn-primary" onclick="contVolver()">Volver</button></div>`;
        return;
    }
    CONT.conteo = data.conteo;
    CONT.productos = data.productos || [];
    CONT.buscar = '';
    const abierto = CONT.conteo.estado === 'abierto';
    CONT.filtro = abierto ? 'pendientes' : 'diferencias';
    if (!abierto && !CONT.productos.some(p => p.diferencia)) CONT.filtro = 'todos';

    const c = CONT.conteo;
    container.innerHTML = `
        <div class="fade-in">
            <div class="cont-head">
                <button class="btn btn-ghost btn-sm" onclick="contVolver()"><i class="fas fa-arrow-left"></i> Conteos</button>
                <div class="cont-head-info">
                    <h2>${contEsc(c.nombre)} <span class="cont-estado ${c.estado}">${{ abierto: 'En curso', aplicado: 'Aplicado', cancelado: 'Cancelado' }[c.estado]}</span></h2>
                    <span>${contAlcanceTxt(c)}${c.notas ? ' · ' + contEsc(c.notas) : ''}${c.aplicado_at ? ' · Aplicado ' + formatDate(c.aplicado_at) : ''}</span>
                </div>
                <div class="cont-head-actions">
                    ${abierto ? `
                        <button class="btn btn-outline btn-sm" onclick="contPlanilla()"><i class="fas fa-print"></i> Planilla</button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="contCancelar()"><i class="fas fa-ban"></i> Cancelar</button>
                        <button class="btn btn-primary btn-sm" onclick="contAplicar()"><i class="fas fa-check-double"></i> Aplicar ajustes</button>`
                    : `<button class="btn btn-outline btn-sm" onclick="contImprimirReporte()"><i class="fas fa-print"></i> Imprimir reporte</button>`}
                </div>
            </div>

            <div id="cont-stats"></div>

            <div class="card" style="margin-top:16px">
                <div class="card-body">
                    <div class="cont-toolbar">
                        <div class="search-box" style="flex:1;min-width:200px">
                            <input type="text" id="cont-buscar" placeholder="${abierto ? 'Buscar o escanear código... (Enter para contar)' : 'Buscar producto...'}" autocomplete="off">
                            <i class="fas ${abierto ? 'fa-barcode' : 'fa-search'}"></i>
                        </div>
                        <div class="cont-chips" id="cont-chips"></div>
                        ${abierto ? `<label class="cont-ciego" title="Oculta el stock del sistema para que el conteo no se influencie">
                            <input type="checkbox" id="cont-ciego" ${CONT.ciego ? 'checked' : ''}> Conteo ciego</label>` : ''}
                    </div>
                    <div id="cont-lista"></div>
                </div>
            </div>
        </div>`;

    const buscar = document.getElementById('cont-buscar');
    // Timer propio: el Enter del lector de código de barras llega antes de los 200 ms y debe cancelar
    // el re-dibujo pendiente (si no, borraría el foco del producto escaneado)
    let tBuscar = null;
    buscar.oninput = () => {
        clearTimeout(tBuscar);
        tBuscar = setTimeout(() => { CONT.buscar = buscar.value.trim().toLowerCase(); contRenderLista(); }, 200);
    };
    buscar.onkeydown = e => {
        if (e.key !== 'Enter' || !abierto) return;
        e.preventDefault();
        clearTimeout(tBuscar);
        const t = buscar.value.trim().toLowerCase();
        if (!t) return;
        // Código exacto (lector de código de barras) o un único resultado → ir a contarlo
        let p = CONT.productos.find(x => (x.codigo || '').toLowerCase() === t);
        if (!p) { const l = contFiltrados(true); if (l.length === 1) p = l[0]; }
        if (!p) return toast('Hay varios productos con esa búsqueda; escoge uno de la lista', 'warning');
        CONT.buscar = (p.codigo || p.nombre).toLowerCase();
        buscar.value = p.codigo || p.nombre;
        if (!contFiltrados().some(x => x.id_producto === p.id_producto)) CONT.filtro = 'todos';
        contRenderLista();
        contEnfocar(p.id_producto);
    };
    const ciego = document.getElementById('cont-ciego');
    if (ciego) ciego.onchange = () => {
        CONT.ciego = ciego.checked;
        try { localStorage.setItem('pc_conteo_ciego', CONT.ciego ? '1' : '0'); } catch (e) { }
        contRenderLista();
    };

    contRenderStats();
    contRenderLista();
    if (abierto && window.innerWidth > 768) buscar.focus();
}

function contVolver() {
    navigateTo('conteo');
}

function contResumen() {
    const ps = CONT.productos;
    const contados = ps.filter(p => p.contado !== null);
    const dif = contados.filter(p => p.diferencia);
    const sobra = dif.filter(p => p.diferencia > 0), falta = dif.filter(p => p.diferencia < 0);
    return {
        total: ps.length, contados: contados.length, pendientes: ps.length - contados.length, dif: dif.length,
        sobraU: sobra.reduce((s, p) => s + p.diferencia, 0), faltaU: falta.reduce((s, p) => s + p.diferencia, 0),
        sobraV: sobra.reduce((s, p) => s + p.diferencia * (p.costo || 0), 0), faltaV: falta.reduce((s, p) => s + p.diferencia * (p.costo || 0), 0),
    };
}

function contRenderStats() {
    const el = document.getElementById('cont-stats');
    if (!el) return;
    const r = contResumen();
    const abierto = CONT.conteo.estado === 'abierto';
    const pct = r.total ? Math.round(r.contados / r.total * 100) : 0;
    el.innerHTML = `
        ${abierto ? `<div class="cont-progreso-big">
            <div class="cont-progress"><div style="width:${pct}%"></div></div>
            <span><b>${contNum(r.contados)}</b> de ${contNum(r.total)} productos contados · ${pct}%</span>
        </div>` : ''}
        <div class="stats-grid cont-stats">
            ${abierto ? `<div class="stat-card blue"><div class="stat-icon blue"><i class="fas fa-hourglass-half"></i></div>
                <div class="stat-info"><h4>Pendientes</h4><div class="stat-value">${contNum(r.pendientes)}</div></div></div>`
            : `<div class="stat-card blue"><div class="stat-icon blue"><i class="fas fa-clipboard-check"></i></div>
                <div class="stat-info"><h4>Contados</h4><div class="stat-value">${contNum(r.contados)}</div></div></div>`}
            <div class="stat-card orange"><div class="stat-icon orange"><i class="fas fa-triangle-exclamation"></i></div>
                <div class="stat-info"><h4>Con diferencia</h4><div class="stat-value">${contNum(r.dif)}</div></div></div>
            <div class="stat-card green"><div class="stat-icon green"><i class="fas fa-arrow-trend-up"></i></div>
                <div class="stat-info"><h4>Sobrantes</h4><div class="stat-value">${contSigno(r.sobraU)} u</div><div class="cr-stat-sub">${contMoney(r.sobraV)}</div></div></div>
            <div class="stat-card red"><div class="stat-icon red"><i class="fas fa-arrow-trend-down"></i></div>
                <div class="stat-info"><h4>Faltantes</h4><div class="stat-value">${contNum(r.faltaU)} u</div><div class="cr-stat-sub">${contMoney(r.faltaV)}</div></div></div>
        </div>`;

    const chips = document.getElementById('cont-chips');
    if (chips) {
        const ops = abierto
            ? [['pendientes', 'Pendientes', r.pendientes], ['contados', 'Contados', r.contados], ['diferencias', 'Con diferencia', r.dif], ['todos', 'Todos', r.total]]
            : [['diferencias', 'Con diferencia', r.dif], ['todos', 'Todos', r.total]];
        chips.innerHTML = ops.map(([k, l, n]) => `<button class="fe-chip-filter ${CONT.filtro === k ? 'active' : ''}" data-f="${k}">${l} <span class="cont-chip-n">${contNum(n)}</span></button>`).join('');
        chips.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { CONT.filtro = b.dataset.f; contRenderStats(); contRenderLista(); });
    }
}

function contFiltrados(ignorarFiltro = false) {
    const t = CONT.buscar;
    return CONT.productos.filter(p => {
        if (!ignorarFiltro) {
            if (CONT.filtro === 'pendientes' && p.contado !== null) return false;
            if (CONT.filtro === 'contados' && p.contado === null) return false;
            if (CONT.filtro === 'diferencias' && !p.diferencia) return false;
        }
        return !t || p.nombre.toLowerCase().includes(t) || (p.codigo || '').toLowerCase().includes(t);
    });
}

function contRenderLista() {
    const el = document.getElementById('cont-lista');
    if (!el) return;
    const lista = contFiltrados();
    const abierto = CONT.conteo.estado === 'abierto';
    if (!lista.length) {
        el.innerHTML = `<div class="empty-state" style="padding:30px"><i class="fas ${CONT.filtro === 'pendientes' && !CONT.buscar ? 'fa-circle-check' : 'fa-box-open'}"></i>
            <p>${CONT.filtro === 'pendientes' && !CONT.buscar ? '¡Todos los productos están contados! Revisa las diferencias y aplica los ajustes.' : 'No hay productos con ese filtro'}</p></div>`;
        return;
    }
    el.innerHTML = `<div class="cont-lista">${lista.map(p => abierto ? contFila(p) : contFilaAplicada(p)).join('')}</div>`;
    if (abierto) contConectarFilas(el);
}

function contFila(p) {
    const upc = parseInt(p.unidades_por_caja) > 1 ? parseInt(p.unidades_por_caja) : 0;
    const cajas = upc && p.contado !== null ? Math.floor(p.contado / upc) : '';
    const unid = p.contado === null ? '' : (upc ? p.contado % upc : p.contado);
    return `
        <div class="cont-fila ${p.contado !== null ? 'contado' : ''} ${p.diferencia ? 'dif' : ''}" data-id="${p.id_producto}">
            <div class="cont-prod">
                <div class="cont-img">${p.foto ? `<img src="${UPLOADS_URL}${p.foto}" loading="lazy">` : '<i class="fas fa-box"></i>'}</div>
                <div style="min-width:0">
                    <div class="cont-nombre">${contEsc(p.nombre)}</div>
                    <div class="cont-meta">${contEsc(p.codigo || 'Sin código')}${p.categoria ? ' · ' + contEsc(p.categoria) : ''}${upc ? ` · Caja x${upc}` : ''}</div>
                </div>
            </div>
            <div class="cont-sistema ${CONT.ciego ? 'oculto' : ''}"><span>Sistema</span><b>${CONT.ciego ? '•••' : contNum(p.stock_sistema ?? p.stock)}</b></div>
            <div class="cont-inputs">
                ${upc ? `<label><span>Cajas</span><input type="number" min="0" inputmode="numeric" class="cont-in" data-k="cajas" value="${cajas}" placeholder="0"></label>` : ''}
                <label><span>${upc ? 'Unid. sueltas' : 'Unidades'}</span><input type="number" min="0" inputmode="numeric" class="cont-in" data-k="unid" value="${unid}" placeholder="${upc ? '0' : '—'}"></label>
            </div>
            <div class="cont-res">${contResultado(p)}</div>
        </div>`;
}

function contResultado(p) {
    if (p.contado === null) return '<span class="cont-pend">Sin contar</span>';
    const d = p.diferencia;
    return `
        <div class="cont-total">${contNum(p.contado)} u</div>
        ${CONT.ciego ? '<div class="cont-ok"><i class="fas fa-check"></i> Contado</div>'
            : d === 0 ? '<div class="cont-ok"><i class="fas fa-check"></i> Cuadra</div>'
            : `<div class="cont-dif ${d > 0 ? 'pos' : 'neg'}">${contSigno(d)} u</div>`}
        <button class="cont-borrar" title="Quitar este conteo"><i class="fas fa-xmark"></i></button>`;
}

function contFilaAplicada(p) {
    const d = p.diferencia || 0;
    return `
        <div class="cont-fila aplicada contado ${d ? 'dif' : ''}">
            <div class="cont-prod">
                <div class="cont-img">${p.foto ? `<img src="${UPLOADS_URL}${p.foto}" loading="lazy">` : '<i class="fas fa-box"></i>'}</div>
                <div style="min-width:0">
                    <div class="cont-nombre">${contEsc(p.nombre)}</div>
                    <div class="cont-meta">${contEsc(p.codigo || 'Sin código')}${p.contado_por ? ' · Contó ' + contEsc(p.contado_por) : ''}</div>
                </div>
            </div>
            <div class="cont-aplicado">
                <div><span>Sistema</span><b>${contNum(p.stock_sistema)}</b></div>
                <div><span>Contado</span><b>${contNum(p.contado)}</b></div>
                <div><span>Diferencia</span><b class="${d > 0 ? 'cont-pos' : d < 0 ? 'cont-neg' : ''}">${d ? contSigno(d) : '0'}</b></div>
                <div><span>Quedó en</span><b>${p.stock_final !== null ? contNum(p.stock_final) : '-'}</b></div>
                <div><span>Valor</span><b class="${d > 0 ? 'cont-pos' : d < 0 ? 'cont-neg' : ''}">${contMoney(d * (p.costo || 0))}</b></div>
            </div>
        </div>`;
}

function contConectarFilas(el) {
    el.querySelectorAll('.cont-fila').forEach(fila => {
        const id = parseInt(fila.dataset.id);
        const inputs = [...fila.querySelectorAll('.cont-in')];
        inputs.forEach((inp, i) => {
            inp.onfocus = () => inp.select();
            inp.onchange = () => contGuardar(id, fila);
            inp.onkeydown = e => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (i < inputs.length - 1) return inputs[i + 1].focus();
                inp.blur(); // dispara el guardado
                const sig = fila.nextElementSibling?.querySelector('.cont-in');
                if (sig) sig.focus(); else document.getElementById('cont-buscar')?.focus();
            };
        });
        const borrar = fila.querySelector('.cont-borrar');
        if (borrar) borrar.onclick = () => contGuardar(id, fila, true);
    });
}

function contEnfocar(id) {
    const inp = document.querySelector(`.cont-fila[data-id="${id}"] .cont-in`);
    if (inp) { inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => inp.focus(), 150); }
}

async function contGuardar(id, fila, quitar = false) {
    const p = CONT.productos.find(x => x.id_producto === id);
    if (!p) return;
    const upc = parseInt(p.unidades_por_caja) > 1 ? parseInt(p.unidades_por_caja) : 0;
    const val = k => fila.querySelector(`.cont-in[data-k="${k}"]`)?.value.trim() ?? '';
    const cajas = val('cajas'), unid = val('unid');
    let contado = null;
    if (!quitar && (cajas !== '' || unid !== '')) {
        contado = (parseInt(cajas) || 0) * (upc || 1) + (parseInt(unid) || 0);
        if (contado < 0) return toast('La cantidad no puede ser negativa', 'warning');
    }
    if (contado === p.contado && !quitar) return;

    fila.classList.add('guardando');
    const r = await api(`/conteos/${CONT.conteo.id_conteo}/item`, { method: 'PUT', body: JSON.stringify({ id_producto: id, contado }) });
    fila.classList.remove('guardando');
    if (!r || r.error) return toast(r?.mensaje || 'No se pudo guardar el conteo', 'error');

    if (r.item) {
        Object.assign(p, { contado: r.item.contado, stock_sistema: r.item.stock_sistema, diferencia: r.item.diferencia, stock: r.item.stock_sistema });
    } else {
        Object.assign(p, { contado: null, stock_sistema: null, diferencia: null });
        fila.querySelectorAll('.cont-in').forEach(i => i.value = '');
    }
    // Se actualiza solo la fila (no se re-dibuja la lista, para no perder el foco del siguiente producto)
    fila.classList.toggle('contado', p.contado !== null);
    fila.classList.toggle('dif', !!p.diferencia);
    fila.querySelector('.cont-res').innerHTML = contResultado(p);
    const b = fila.querySelector('.cont-borrar');
    if (b) b.onclick = () => contGuardar(id, fila, true);
    if (!CONT.ciego) fila.querySelector('.cont-sistema b').textContent = contNum(p.stock_sistema ?? p.stock);
    fila.classList.add('flash');
    setTimeout(() => fila.classList.remove('flash'), 600);
    contRenderStats();
}

// ========================================
// APLICAR / CANCELAR
// ========================================
async function contAplicar() {
    const r = contResumen();
    if (!r.contados) return toast('Todavía no has contado ningún producto', 'warning');

    openModal('Aplicar ajustes de inventario', `
        <div class="cont-aplicar-res">
            <div><span>Productos contados</span><b>${contNum(r.contados)} de ${contNum(r.total)}</b></div>
            <div><span>Con diferencia</span><b>${contNum(r.dif)}</b></div>
            <div><span>Sobrantes</span><b class="cont-pos">${contSigno(r.sobraU)} u · ${contMoney(r.sobraV)}</b></div>
            <div><span>Faltantes</span><b class="cont-neg">${contNum(r.faltaU)} u · ${contMoney(r.faltaV)}</b></div>
            <div class="total"><span>Ajuste neto</span><b>${contSigno(r.sobraU + r.faltaU)} u · ${contMoney(r.sobraV + r.faltaV)}</b></div>
        </div>
        ${r.pendientes ? `
            <div class="fe-alert warning" style="margin-top:14px">
                <div class="fe-alert-title"><i class="fas fa-circle-question"></i> Hay ${contNum(r.pendientes)} producto(s) sin contar</div>
                <label class="fe-check" style="margin-top:8px"><input type="checkbox" id="ca-ceros">
                    Ponerlos en <b>&nbsp;0&nbsp;</b> (no se encontraron en bodega)</label>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Si no lo marcas, su stock queda igual.</div>
            </div>` : ''}
        <p style="font-size:12px;color:var(--text-muted);margin-top:12px"><i class="fas fa-circle-info"></i> El valor se calcula con el precio de costo (o el de venta si el producto no tiene costo). Si se vendió algo mientras contabas, esas ventas se respetan.</p>`, `
        <button class="btn btn-outline" onclick="closeModal()">Volver</button>
        <button class="btn btn-primary" id="ca-ok"><i class="fas fa-check-double"></i> Aplicar ajustes</button>`);

    document.getElementById('ca-ok').onclick = async () => {
        const ceros = !!document.getElementById('ca-ceros')?.checked;
        const ok = await confirmar(
            `Se modificará el stock de ${contNum(r.dif + (ceros ? r.pendientes : 0))} producto(s). Esta acción no se puede deshacer.`,
            { titulo: '¿Aplicar los ajustes al inventario?', ok: 'Sí, aplicar', tipo: 'warning', icono: 'fa-warehouse' });
        if (!ok) return;
        const btn = document.getElementById('ca-ok');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando...';
        const res = await api(`/conteos/${CONT.conteo.id_conteo}/aplicar`, { method: 'POST', body: JSON.stringify({ no_contados_en_cero: ceros }) });
        if (!res || res.error) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-double"></i> Aplicar ajustes';
            return toast(res?.mensaje || 'No se pudo aplicar', 'error');
        }
        closeModal();
        toast(res.mensaje || 'Inventario ajustado');
        contAbrir(CONT.conteo.id_conteo, true);
    };
}

async function contCancelar() {
    const ok = await confirmar('Lo contado se descarta y el inventario no se modifica.', { titulo: '¿Cancelar este conteo?', ok: 'Cancelar conteo', cancelar: 'Volver', tipo: 'danger', icono: 'fa-ban' });
    if (!ok) return;
    const r = await api(`/conteos/${CONT.conteo.id_conteo}/cancelar`, { method: 'POST' });
    if (!r || r.error) return toast(r?.mensaje || 'No se pudo cancelar', 'error');
    toast(r.mensaje);
    contVolver();
}

// ========================================
// IMPRESIÓN
// ========================================
function contPlanilla() {
    const c = CONT.conteo;
    const filas = CONT.productos.map((p, i) => {
        const upc = parseInt(p.unidades_por_caja) > 1 ? parseInt(p.unidades_por_caja) : 0;
        return `<tr>
            <td style="color:#888">${i + 1}</td><td>${contEsc(p.codigo || '')}</td><td>${contEsc(p.nombre)}</td>
            <td style="text-align:center">${upc ? 'x' + upc : '-'}</td>
            ${CONT.ciego ? '' : `<td style="text-align:right">${contNum(p.stock)}</td>`}
            <td class="caja"></td><td class="caja"></td><td class="caja"></td>
        </tr>`;
    }).join('');
    printHTML(`
        <style>td.caja{border:1px solid #bbb;min-width:70px} td{padding:7px 8px;font-size:12px} th{padding:7px 8px}</style>
        <h1>Planilla de conteo de inventario</h1>
        <p style="margin-bottom:12px"><b>${contEsc(c.nombre)}</b> · ${c.alcance === 'todo' ? 'Todo el inventario' : ALCANCES[c.alcance] + ': ' + contEsc(c.alcance_nombre)} · ${CONT.productos.length} productos</p>
        <table>
            <thead><tr><th>#</th><th>Código</th><th>Producto</th><th>Caja</th>${CONT.ciego ? '' : '<th style="text-align:right">Sistema</th>'}<th>Cajas</th><th>Unidades</th><th>Total</th></tr></thead>
            <tbody>${filas}</tbody>
        </table>
        <div style="margin-top:40px;display:flex;gap:40px">
            <div style="flex:1;border-top:1px solid #999;padding-top:6px;text-align:center;font-size:12px;color:#666">Contó</div>
            <div style="flex:1;border-top:1px solid #999;padding-top:6px;text-align:center;font-size:12px;color:#666">Revisó</div>
        </div>`);
}

function contImprimirReporte() {
    const c = CONT.conteo;
    const lista = [...CONT.productos].sort((a, b) => Math.abs(b.diferencia || 0) - Math.abs(a.diferencia || 0));
    const filas = lista.map(p => {
        const d = p.diferencia || 0;
        const color = d > 0 ? '#047857' : d < 0 ? '#B91C1C' : '#333';
        return `<tr>
            <td>${contEsc(p.codigo || '')}</td><td>${contEsc(p.nombre)}</td>
            <td style="text-align:right">${contNum(p.stock_sistema)}</td><td style="text-align:right">${contNum(p.contado)}</td>
            <td style="text-align:right;color:${color};font-weight:700">${d ? contSigno(d) : '0'}</td>
            <td style="text-align:right">${p.stock_final !== null ? contNum(p.stock_final) : '-'}</td>
            <td style="text-align:right;color:${color}">${contMoney(d * (p.costo || 0))}</td>
        </tr>`;
    }).join('');
    printHTML(`
        <h1>Reporte de conteo de inventario</h1>
        <p style="margin-bottom:12px"><b>${contEsc(c.nombre)}</b> · ${c.alcance === 'todo' ? 'Todo el inventario' : ALCANCES[c.alcance] + ': ' + contEsc(c.alcance_nombre)}
            ${c.aplicado_at ? ' · Aplicado ' + formatDate(c.aplicado_at) : ''}${c.no_contados_en_cero == 1 ? ' · No contados puestos en 0' : ''}</p>
        <p style="margin-bottom:12px">Productos ajustados: <b>${contNum(c.productos_ajustados)}</b> · Unidades: <b>${contSigno(c.unidades_ajuste)}</b> · Valor del ajuste: <b>${contMoney(c.valor_ajuste)}</b></p>
        <table>
            <thead><tr><th>Código</th><th>Producto</th><th style="text-align:right">Sistema</th><th style="text-align:right">Contado</th><th style="text-align:right">Diferencia</th><th style="text-align:right">Quedó</th><th style="text-align:right">Valor</th></tr></thead>
            <tbody>${filas}</tbody>
        </table>`);
}
