/* ========================================
   PEDIDOS CRUZ - Catálogos, proveedores y modal de producto
   - El vendedor solo ve los productos de sus catálogos asignados
   - Cada catálogo tiene un enlace público para compartir con clientes
   ======================================== */

const CAT = { proveedores: null, catalogos: null };

const catEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const catMoney = n => '$' + Math.round(parseFloat(n || 0)).toLocaleString('es-CO');
const CAT_UNIDADES = [[70, 'Unidad'], [642, 'Cada'], [923, 'Paquete'], [636, 'Docena'], [372, 'Botella'], [938, 'Par'], [767, 'Kilogramo'], [692, 'Gramo'], [802, 'Libra'], [821, 'Litro'], [686, 'Galón'], [865, 'Metro']];

async function catCargarListas(forzar = false) {
    if (forzar || !CAT.proveedores || !CAT.catalogos) {
        const [p, c] = await Promise.all([api('/proveedores'), api('/catalogos')]);
        CAT.proveedores = p?.proveedores || [];
        CAT.catalogos = c?.catalogos || [];
        CAT.generalPublico = c?.catalogo_general_publico !== false;
    }
    return CAT;
}

function catEnlace(c) {
    const base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return `${base}catalogo.html?c=${encodeURIComponent(c.codigo)}`;
}

function catCompartir(c, modo) {
    const url = catEnlace(c);
    if (modo === 'copiar') {
        navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado')).catch(() => prompt('Copia el enlace:', url));
    } else if (modo === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(`Hola 👋 Te comparto nuestro catálogo "${c.nombre}": ${url}`)}`, '_blank');
    } else {
        window.open(url, '_blank');
    }
}

function catCompartirId(id, modo) {
    const c = (CAT.catalogos || []).find(x => x.id_catalogo === id);
    if (c) catCompartir(c, modo);
}

/** Llena los filtros Proveedor / Catálogo de la página Productos */
async function catLlenarFiltrosProductos() {
    await catCargarListas(true);
    const fill = (id, lista, valor, texto, sinTexto) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const actual = sel.value;
        sel.innerHTML = `<option value="">${texto}</option><option value="sin">${sinTexto}</option>` +
            lista.map(x => `<option value="${x[valor]}">${catEsc(x.nombre)}</option>`).join('');
        sel.value = actual;
    };
    fill('filter-proveedor', CAT.proveedores, 'id_proveedor', 'Todos los proveedores', 'Sin proveedor');
    fill('filter-catalogo', CAT.catalogos, 'id_catalogo', 'Todos los catálogos', 'Sin catálogo');
}

// ========================================
// MODAL DE PRODUCTO (crear / editar)
// ========================================
async function openProductModal(callback, editData = null, categorias = []) {
    const isEdit = !!editData;
    const [catResp] = await Promise.all([categorias.length ? null : api('/categorias'), catCargarListas(true)]);
    if (!categorias.length) categorias = catResp?.categorias || [];
    const p = editData || {};
    const iva = parseFloat(p.iva || 0);
    const enCatalogos = new Set((p.catalogos || []).map(Number));

    openModal(isEdit ? 'Editar Producto' : 'Nuevo Producto', `
        <div class="pm-grid">
            <section class="pm-sec">
                <div class="pm-sec-title"><i class="fas fa-tag"></i> Información</div>
                <div class="pm-row">
                    <div class="form-group"><label>Código</label><input type="text" id="m-prod-codigo" value="${catEsc(p.codigo || '')}" placeholder="Ej: 3434"></div>
                    <div class="form-group"><label>Categoría</label>
                        <select id="m-prod-cat" class="pm-select"><option value="">Sin categoría</option>
                            ${categorias.map(c => `<option value="${c.id_categoria}" ${p.id_categoria == c.id_categoria ? 'selected' : ''}>${catEsc(c.nombre)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group"><label>Nombre *</label><input type="text" id="m-prod-nombre" value="${catEsc(p.nombre || '')}" placeholder="Nombre del producto"></div>
                <div class="form-group" style="margin-bottom:0"><label>Descripción</label><textarea id="m-prod-desc" rows="2" style="padding-left:14px" placeholder="Opcional">${catEsc(p.descripcion || '')}</textarea></div>
            </section>

            <section class="pm-sec">
                <div class="pm-sec-title"><i class="fas fa-dollar-sign"></i> Precio</div>
                <div class="pm-row">
                    <div class="form-group"><label>Precio de venta *</label>
                        <div class="pm-money"><span>$</span><input type="number" step="0.01" min="0" id="m-prod-precio" value="${p.precio ?? ''}" placeholder="0"></div>
                    </div>
                    <div class="form-group"><label>Precio de costo <small>(opcional)</small></label>
                        <div class="pm-money"><span>$</span><input type="number" step="0.01" min="0" id="m-prod-costo" value="${p.precio_costo ?? ''}" placeholder="0"></div>
                    </div>
                </div>
                <div class="pm-margen" id="m-prod-margen"></div>
                <div class="form-group" style="margin:12px 0 0"><label>IVA <small>(incluido en el precio)</small></label>
                    <div class="pm-seg" id="m-prod-iva">
                        ${[[0, 'Sin IVA'], [5, '5%'], [19, '19%']].map(([v, l]) => `<button type="button" data-v="${v}" class="${iva === v ? 'on' : ''}">${l}</button>`).join('')}
                    </div>
                </div>
            </section>

            <section class="pm-sec">
                <div class="pm-sec-title"><i class="fas fa-boxes-stacked"></i> Inventario</div>
                <div class="pm-row pm-row-3">
                    <div class="form-group"><label>Stock</label><input type="number" id="m-prod-stock" value="${p.stock ?? 0}"></div>
                    <div class="form-group"><label>Stock mínimo</label><input type="number" id="m-prod-stockmin" value="${p.stock_minimo ?? 5}"></div>
                    <div class="form-group"><label>Unid. por caja</label><input type="number" id="m-prod-upc" min="1" value="${p.unidades_por_caja ?? 1}" title="Cuántas unidades trae una caja. 1 si no se vende por caja."></div>
                </div>
                <div class="form-group" style="margin-bottom:0"><label>Unidad de medida (DIAN)</label>
                    <select id="m-prod-unidad" class="pm-select">${CAT_UNIDADES.map(([v, l]) => `<option value="${v}" ${(p.unit_measure_id || 70) == v ? 'selected' : ''}>${l}</option>`).join('')}</select>
                </div>
            </section>

            <section class="pm-sec">
                <div class="pm-sec-title"><i class="fas fa-layer-group"></i> Clasificación</div>
                <div class="form-group"><label>Proveedor <small>(opcional)</small></label>
                    <div class="pm-prov">
                        <select id="m-prod-prov" class="pm-select"><option value="">Sin proveedor</option>
                            ${CAT.proveedores.map(x => `<option value="${x.id_proveedor}" ${p.id_proveedor == x.id_proveedor ? 'selected' : ''}>${catEsc(x.nombre)}</option>`).join('')}
                        </select>
                        <button type="button" class="btn btn-outline btn-sm" id="m-prod-prov-nuevo" title="Nuevo proveedor"><i class="fas fa-plus"></i></button>
                    </div>
                    <div class="pm-prov-form" id="m-prod-prov-form" style="display:none">
                        <input type="text" id="m-prov-nombre" placeholder="Nombre del proveedor">
                        <button type="button" class="btn btn-primary btn-sm" id="m-prov-guardar">Agregar</button>
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:0"><label>Catálogos</label>
                    ${CAT.catalogos.length ? `
                        <div class="pm-chips" id="m-prod-catalogos">
                            ${CAT.catalogos.map(c => `<button type="button" class="pm-chip ${enCatalogos.has(c.id_catalogo) ? 'on' : ''}" data-id="${c.id_catalogo}" style="--c:${c.color}"><i class="fas fa-check"></i>${catEsc(c.nombre)}</button>`).join('')}
                        </div>
                        <div class="pm-hint">En el Nuevo Pedido el vendedor escoge qué catálogo mostrar.</div>`
                    : `<div class="pm-hint">Aún no hay catálogos. Créalos en <a class="fe-link" onclick="closeModal();navigateTo('catalogos')">Catálogos</a>.</div>`}
                </div>
            </section>
        </div>
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="m-prod-save"><i class="fas fa-save"></i> ${isEdit ? 'Actualizar' : 'Guardar'}</button>
    `);
    document.getElementById('modal-container').classList.add('modal-producto');

    const $ = id => document.getElementById(id);

    // Margen en vivo
    const margen = () => {
        const v = parseFloat($('m-prod-precio').value) || 0, c = parseFloat($('m-prod-costo').value) || 0;
        const el = $('m-prod-margen');
        if (!v || !c) { el.innerHTML = '<i class="fas fa-circle-info"></i> Con el costo se calcula el margen de ganancia.'; el.className = 'pm-margen'; return; }
        const g = v - c, pct = g / v * 100;
        el.className = 'pm-margen ' + (g < 0 ? 'bad' : pct < 10 ? 'warn' : 'ok');
        el.innerHTML = `<i class="fas ${g < 0 ? 'fa-arrow-trend-down' : 'fa-arrow-trend-up'}"></i> Ganancia <b>${catMoney(g)}</b> por unidad · margen <b>${pct.toFixed(1)}%</b>`;
    };
    ['m-prod-precio', 'm-prod-costo'].forEach(id => $(id).addEventListener('input', margen));
    margen();

    $('m-prod-iva').onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        $('m-prod-iva').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    };
    $('m-prod-catalogos')?.addEventListener('click', e => {
        const b = e.target.closest('.pm-chip'); if (b) b.classList.toggle('on');
    });

    // Proveedor nuevo en línea
    $('m-prod-prov-nuevo').onclick = () => {
        const f = $('m-prod-prov-form');
        f.style.display = f.style.display === 'none' ? 'flex' : 'none';
        if (f.style.display === 'flex') $('m-prov-nombre').focus();
    };
    $('m-prov-guardar').onclick = async () => {
        const nombre = $('m-prov-nombre').value.trim();
        if (!nombre) { toast('Escribe el nombre del proveedor', 'warning'); return; }
        const r = await api('/proveedores', { method: 'POST', body: JSON.stringify({ nombre }) });
        if (!r || r.error) { toast(r?.mensaje || 'No se pudo crear', 'error'); return; }
        CAT.proveedores.push(r.proveedor);
        $('m-prod-prov').insertAdjacentHTML('beforeend', `<option value="${r.proveedor.id_proveedor}">${catEsc(r.proveedor.nombre)}</option>`);
        $('m-prod-prov').value = r.proveedor.id_proveedor;
        $('m-prod-prov-form').style.display = 'none';
        $('m-prov-nombre').value = '';
        toast('Proveedor agregado');
    };

    $('m-prod-save').onclick = async () => {
        const costo = $('m-prod-costo').value.trim();
        const body = {
            codigo: $('m-prod-codigo').value.trim(),
            nombre: $('m-prod-nombre').value.trim(),
            descripcion: $('m-prod-desc').value,
            id_categoria: $('m-prod-cat').value || null,
            precio: parseFloat($('m-prod-precio').value),
            precio_costo: costo === '' ? null : parseFloat(costo),
            stock: parseInt($('m-prod-stock').value) || 0,
            stock_minimo: parseInt($('m-prod-stockmin').value) || 5,
            unidades_por_caja: parseInt($('m-prod-upc').value) || 1,
            iva: parseFloat($('m-prod-iva').querySelector('.on')?.dataset.v || 0),
            unit_measure_id: parseInt($('m-prod-unidad').value) || 70,
            id_proveedor: $('m-prod-prov').value || null,
        };
        if ($('m-prod-catalogos')) body.catalogos = [...$('m-prod-catalogos').querySelectorAll('.pm-chip.on')].map(b => parseInt(b.dataset.id));

        if (!body.nombre || !(body.precio > 0)) { toast('Nombre y precio de venta son requeridos', 'warning'); return; }

        const btn = $('m-prod-save');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        const data = await api(isEdit ? `/productos/${p.id_producto}` : '/productos', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(body) });
        if (data && !data.error) {
            toast(isEdit ? 'Producto actualizado' : 'Producto creado');
            closeModal();
            (callback || window._recargarProductos || (() => {}))();
        } else {
            toast(data?.mensaje || 'Error al guardar', 'error');
            btn.disabled = false; btn.innerHTML = `<i class="fas fa-save"></i> ${isEdit ? 'Actualizar' : 'Guardar'}`;
        }
    };
}

// ========================================
// PÁGINA CATÁLOGOS
// ========================================
async function renderCatalogos() {
    const admin = state.usuario?.rol === 'admin';
    const container = document.getElementById('page-container');
    await catCargarListas(true);

    if (admin) {
        const actionBtn = document.getElementById('header-action-btn');
        actionBtn.style.display = '';
        document.getElementById('header-action-text').textContent = 'Nuevo Catálogo';
        actionBtn.onclick = () => catEditar(null);
    }

    if (!admin) {
        container.innerHTML = `
            <div class="cat-intro fade-in"><i class="fas fa-share-nodes"></i><div><strong>Comparte un catálogo con tus clientes</strong><span>Solo verán los productos de ese catálogo, con sus precios y fotos. En el Nuevo Pedido también puedes escoger qué catálogo mostrar.</span></div></div>
            ${CAT.catalogos.length ? `<div class="cat-grid fade-in">${CAT.catalogos.map(c => catCard(c, false)).join('')}</div>`
                : '<div class="empty-state"><i class="fas fa-book-open"></i><h3>Aún no hay catálogos</h3><p>El administrador todavía no ha creado catálogos.</p></div>'}`;
        return;
    }

    container.innerHTML = `
        <div class="cat-toolbar fade-in">
            <div class="cat-general">
                <label class="fe-switch"><input type="checkbox" id="cat-general" ${CAT.generalPublico ? 'checked' : ''}><span></span></label>
                <div><strong>Catálogo general público</strong><span id="cat-general-txt">${CAT.generalPublico ? 'Cualquiera con el enlace catalogo.html ve todos los productos.' : 'Oculto: los clientes solo ven productos con el enlace de un catálogo.'}</span></div>
            </div>
        </div>
        ${CAT.catalogos.length ? `<div class="cat-grid fade-in">${CAT.catalogos.map(c => catCard(c, true)).join('')}</div>`
            : `<div class="empty-state"><i class="fas fa-book-open"></i><h3>Sin catálogos</h3><p>Crea un catálogo, asígnale productos y vendedores. Ej: uno por proveedor.</p><button class="btn btn-primary" style="margin-top:12px" onclick="catEditar(null)"><i class="fas fa-plus"></i> Crear catálogo</button></div>`}

        <div class="card fade-in" style="margin-top:24px">
            <div class="card-header"><h3><i class="fas fa-truck-field" style="color:var(--info);margin-right:8px"></i>Proveedores</h3>
                <button class="btn btn-outline btn-sm" onclick="catProveedor(null)"><i class="fas fa-plus"></i> Nuevo proveedor</button></div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead><tr><th>Proveedor</th><th>NIT</th><th>Teléfono</th><th>Contacto</th><th style="text-align:right">Productos</th><th></th></tr></thead>
                    <tbody>${CAT.proveedores.length ? CAT.proveedores.map(x => `
                        <tr>
                            <td><strong>${catEsc(x.nombre)}</strong></td><td>${catEsc(x.nit || '-')}</td><td>${catEsc(x.telefono || '-')}</td><td>${catEsc(x.contacto || '-')}</td>
                            <td style="text-align:right">${x.productos_count ?? 0}</td>
                            <td style="white-space:nowrap;text-align:right">
                                <button class="btn btn-ghost btn-sm" title="Editar" onclick="catProveedor(${x.id_proveedor})"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-ghost btn-sm" title="Eliminar" style="color:var(--danger)" onclick="catEliminarProveedor(${x.id_proveedor})"><i class="fas fa-trash-alt"></i></button>
                            </td>
                        </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Sin proveedores. También puedes crearlos desde el formulario de producto.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>`;

    document.getElementById('cat-general').onchange = async e => {
        const on = e.target.checked;
        const r = await api('/catalogos-ajustes', { method: 'PUT', body: JSON.stringify({ catalogo_general_publico: on }) });
        if (r && !r.error) {
            CAT.generalPublico = on;
            document.getElementById('cat-general-txt').textContent = on ? 'Cualquiera con el enlace catalogo.html ve todos los productos.' : 'Oculto: los clientes solo ven productos con el enlace de un catálogo.';
            toast(on ? 'Catálogo general visible' : 'Catálogo general oculto');
        } else { e.target.checked = !on; toast(r?.mensaje || 'Error', 'error'); }
    };
}

function catCard(c, admin) {
    return `
        <div class="cat-card" style="--c:${c.color}">
            <div class="cat-card-head">
                <div class="cat-card-icon"><i class="fas fa-book-open"></i></div>
                <div style="min-width:0">
                    <div class="cat-card-nombre">${catEsc(c.nombre)}</div>
                    ${c.descripcion ? `<div class="cat-card-desc">${catEsc(c.descripcion)}</div>` : ''}
                </div>
            </div>
            <div class="cat-card-stats">
                <div><strong>${c.productos_count ?? 0}</strong><span>productos</span></div>
            </div>
            <div class="cat-card-share">
                <button class="btn btn-sm cat-wa" onclick="catCompartirId(${c.id_catalogo}, 'whatsapp')"><i class="fab fa-whatsapp"></i> WhatsApp</button>
                <button class="btn btn-outline btn-sm" onclick="catCompartirId(${c.id_catalogo}, 'copiar')"><i class="fas fa-link"></i> Copiar enlace</button>
                <button class="btn btn-ghost btn-sm" title="Ver como cliente" onclick="catCompartirId(${c.id_catalogo}, 'abrir')"><i class="fas fa-arrow-up-right-from-square"></i></button>
            </div>
            ${admin ? `
                <div class="cat-card-actions">
                    <button class="btn btn-primary btn-sm" onclick="catAsignarProductos(${c.id_catalogo})"><i class="fas fa-boxes-stacked"></i> Productos</button>
                    <button class="btn btn-outline btn-sm" onclick="catEditar(${c.id_catalogo})"><i class="fas fa-edit"></i> Editar</button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--danger)" title="Eliminar" onclick="catEliminar(${c.id_catalogo})"><i class="fas fa-trash-alt"></i></button>
                </div>` : ''}
        </div>`;
}

async function catEditar(id) {
    const c = id ? CAT.catalogos.find(x => x.id_catalogo === id) : { nombre: '', descripcion: '', color: '#6366F1', vendedores: [] };

    openModal(id ? 'Editar catálogo' : 'Nuevo catálogo', `
        <div class="form-group"><label>Nombre *</label><input type="text" id="cat-nombre" value="${catEsc(c.nombre)}" placeholder="Ej: Dulces La Fama"></div>
        <div class="form-group"><label>Descripción <small>(la ve el cliente)</small></label><input type="text" id="cat-desc" value="${catEsc(c.descripcion || '')}" placeholder="Opcional"></div>
        <div class="form-group"><label>Color</label>${colorPickerHTML('cat-color', c.color)}</div>
        <div class="pm-hint" style="margin-top:0"><i class="fas fa-circle-info"></i> Todos los vendedores pueden usar este catálogo: lo escogen en el Nuevo Pedido antes de mostrar los productos, o lo comparten por enlace.</div>
        ${id ? `<label class="fe-check" style="margin-top:14px"><input type="checkbox" id="cat-nuevo-codigo"> Generar un enlace nuevo (el anterior deja de funcionar)</label>` : ''}
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="cat-guardar"><i class="fas fa-save"></i> Guardar</button>
    `);
    initColorPicker('cat-color');

    document.getElementById('cat-guardar').onclick = async () => {
        const body = {
            nombre: document.getElementById('cat-nombre').value.trim(),
            descripcion: document.getElementById('cat-desc').value.trim() || null,
            color: getColorPickerValue('cat-color'),
            nuevo_codigo: !!document.getElementById('cat-nuevo-codigo')?.checked,
        };
        if (!body.nombre) { toast('El nombre es requerido', 'warning'); return; }
        const r = await api(id ? `/catalogos/${id}` : '/catalogos', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        if (r && !r.error) {
            toast(r.mensaje);
            closeModal();
            if (!id) setTimeout(() => catAsignarProductos(r.catalogo.id_catalogo), 300);
            renderCatalogos();
        } else toast(r?.mensaje || 'Error', 'error');
    };
}

async function catEliminar(id) {
    const c = CAT.catalogos.find(x => x.id_catalogo === id);
    if (!confirm(`¿Eliminar el catálogo "${c?.nombre}"? Los productos no se borran; solo deja de existir el catálogo y su enlace.`)) return;
    const r = await api(`/catalogos/${id}`, { method: 'DELETE' });
    if (r && !r.error) { toast('Catálogo eliminado'); renderCatalogos(); } else toast(r?.mensaje || 'Error', 'error');
}

/** Asignación masiva de productos al catálogo */
async function catAsignarProductos(id) {
    const c = CAT.catalogos.find(x => x.id_catalogo === id) || (await catCargarListas(true)).catalogos.find(x => x.id_catalogo === id);
    const [prods, actuales, cats] = await Promise.all([api('/productos'), api(`/catalogos/${id}/productos`), api('/categorias')]);
    const productos = (prods?.productos || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const sel = new Set((actuales?.productos || []).map(Number));
    const categorias = cats?.categorias || [];

    openModal(`Productos de "${c.nombre}"`, `
        <div class="ca-toolbar">
            <div class="search-box" style="flex:1;min-width:200px"><input type="text" id="ca-buscar" placeholder="Buscar producto o código..."><i class="fas fa-search"></i></div>
            <select class="filter-select" id="ca-prov"><option value="">Todos los proveedores</option><option value="sin">Sin proveedor</option>${CAT.proveedores.map(x => `<option value="${x.id_proveedor}">${catEsc(x.nombre)}</option>`).join('')}</select>
            <select class="filter-select" id="ca-cat"><option value="">Todas las categorías</option>${categorias.map(x => `<option value="${x.id_categoria}">${catEsc(x.nombre)}</option>`).join('')}</select>
            <select class="filter-select" id="ca-ver"><option value="">Mostrar todos</option><option value="in">Solo en el catálogo</option><option value="out">Solo fuera</option></select>
        </div>
        <div class="ca-bar">
            <span id="ca-count"></span>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" id="ca-todos"><i class="fas fa-check-double"></i> Marcar visibles</button>
                <button class="btn btn-ghost btn-sm" id="ca-ninguno"><i class="fas fa-xmark"></i> Quitar visibles</button>
            </div>
        </div>
        <div class="ca-lista" id="ca-lista"></div>
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="ca-guardar"><i class="fas fa-save"></i> Guardar</button>
    `);
    document.getElementById('modal-container').classList.add('modal-wide');

    const $ = i => document.getElementById(i);
    const visibles = () => {
        const t = $('ca-buscar').value.toLowerCase().trim(), pv = $('ca-prov').value, ct = $('ca-cat').value, ver = $('ca-ver').value;
        return productos.filter(p =>
            (!t || p.nombre.toLowerCase().includes(t) || (p.codigo || '').toLowerCase().includes(t)) &&
            (!pv || (pv === 'sin' ? !p.id_proveedor : p.id_proveedor == pv)) &&
            (!ct || p.id_categoria == ct) &&
            (!ver || (ver === 'in' ? sel.has(p.id_producto) : !sel.has(p.id_producto))));
    };
    const pintar = () => {
        const v = visibles();
        $('ca-count').innerHTML = `<b>${sel.size}</b> en el catálogo · mostrando ${v.length} de ${productos.length}`;
        $('ca-lista').innerHTML = v.length ? v.map(p => `
            <label class="ca-item ${sel.has(p.id_producto) ? 'on' : ''}">
                <input type="checkbox" data-id="${p.id_producto}" ${sel.has(p.id_producto) ? 'checked' : ''}>
                <div class="ca-img">${p.foto ? `<img src="${UPLOADS_URL}${p.foto}" loading="lazy">` : '<i class="fas fa-box"></i>'}</div>
                <div class="ca-info"><strong>${catEsc(p.nombre)}</strong><span>${catEsc(p.codigo || '')}${p.proveedor ? ' · ' + catEsc(p.proveedor.nombre) : ''}${p.categoria ? ' · ' + catEsc(p.categoria.nombre) : ''}</span></div>
                <div class="ca-precio">${catMoney(p.precio)}</div>
            </label>`).join('') : '<div class="empty-state" style="padding:30px"><i class="fas fa-search"></i><p>Sin productos con estos filtros</p></div>';
    };
    $('ca-lista').addEventListener('change', e => {
        const id = parseInt(e.target.dataset.id); if (!id) return;
        e.target.checked ? sel.add(id) : sel.delete(id);
        e.target.closest('.ca-item').classList.toggle('on', e.target.checked);
        $('ca-count').innerHTML = `<b>${sel.size}</b> en el catálogo · mostrando ${visibles().length} de ${productos.length}`;
    });
    $('ca-buscar').addEventListener('input', debounce(pintar, 200));
    ['ca-prov', 'ca-cat', 'ca-ver'].forEach(i => $(i).addEventListener('change', pintar));
    $('ca-todos').onclick = () => { visibles().forEach(p => sel.add(p.id_producto)); pintar(); };
    $('ca-ninguno').onclick = () => { visibles().forEach(p => sel.delete(p.id_producto)); pintar(); };
    $('ca-guardar').onclick = async () => {
        const btn = $('ca-guardar'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
        const r = await api(`/catalogos/${id}/productos`, { method: 'PUT', body: JSON.stringify({ productos: [...sel] }) });
        if (r && !r.error) { toast(`${r.total} productos en "${c.nombre}"`); closeModal(); if (state.currentPage === 'catalogos') renderCatalogos(); }
        else { toast(r?.mensaje || 'Error', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar'; }
    };
    pintar();
}

// ---------- Proveedores ----------
function catProveedor(id) {
    const p = id ? CAT.proveedores.find(x => x.id_proveedor === id) : {};
    openModal(id ? 'Editar proveedor' : 'Nuevo proveedor', `
        <div class="form-group"><label>Nombre *</label><input type="text" id="pv-nombre" value="${catEsc(p.nombre || '')}"></div>
        <div class="grid-2">
            <div class="form-group"><label>NIT</label><input type="text" id="pv-nit" value="${catEsc(p.nit || '')}"></div>
            <div class="form-group"><label>Teléfono</label><input type="text" id="pv-tel" value="${catEsc(p.telefono || '')}"></div>
        </div>
        <div class="form-group" style="margin-bottom:0"><label>Contacto</label><input type="text" id="pv-contacto" value="${catEsc(p.contacto || '')}" placeholder="Nombre del asesor"></div>
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="pv-guardar"><i class="fas fa-save"></i> Guardar</button>
    `);
    document.getElementById('pv-guardar').onclick = async () => {
        const body = { nombre: document.getElementById('pv-nombre').value.trim(), nit: document.getElementById('pv-nit').value.trim(), telefono: document.getElementById('pv-tel').value.trim(), contacto: document.getElementById('pv-contacto').value.trim() };
        if (!body.nombre) { toast('El nombre es requerido', 'warning'); return; }
        const r = await api(id ? `/proveedores/${id}` : '/proveedores', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        if (r && !r.error) { toast(r.mensaje); closeModal(); renderCatalogos(); } else toast(r?.mensaje || 'Error', 'error');
    };
}

async function catEliminarProveedor(id) {
    const p = CAT.proveedores.find(x => x.id_proveedor === id);
    if (!confirm(`¿Eliminar el proveedor "${p?.nombre}"? Sus productos quedarán sin proveedor.`)) return;
    const r = await api(`/proveedores/${id}`, { method: 'DELETE' });
    if (r && !r.error) { toast('Proveedor eliminado'); renderCatalogos(); } else toast(r?.mensaje || 'Error', 'error');
}
