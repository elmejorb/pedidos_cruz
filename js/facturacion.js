/* ========================================
   PEDIDOS CRUZ - Facturación Electrónica DIAN
   Pedido → API DIAN (send-v2) → Factura Electrónica
   ======================================== */

const FE = {
    MEDIOS_PAGO: [
        [10, 'Efectivo'], [30, 'Transferencia crédito'], [42, 'Consignación bancaria'],
        [47, 'Transferencia PSE / botón de pagos'], [48, 'Tarjeta crédito'], [49, 'Tarjeta débito'], [20, 'Cheque'],
    ],
    TIPOS_DOC: [
        ['13', 'Cédula de ciudadanía'], ['31', 'NIT'], ['22', 'Cédula de extranjería'],
        ['41', 'Pasaporte'], ['42', 'Documento extranjero'],
    ],
    RESPONSABILIDADES: [
        [4, 'No aplica (R-99-PN)'], [1, 'Gran contribuyente'], [2, 'Autorretenedor'], [3, 'Agente de retención IVA'],
    ],
    UNIDADES: [
        [70, 'Unidad'], [642, 'Cada'], [923, 'Paquete'], [636, 'Docena'], [372, 'Botella'], [938, 'Par'],
        [767, 'Kilogramo'], [692, 'Gramo'], [802, 'Libra'], [821, 'Litro'], [686, 'Galón'], [865, 'Metro'],
    ],
    REGIMENES: ['No responsable de IVA', 'Responsable de IVA', 'Régimen Simple de Tributación'],
    ESTADOS: {
        autorizada: { label: 'Autorizada', icon: 'fa-check-circle' },
        rechazada: { label: 'Rechazada', icon: 'fa-times-circle' },
        error: { label: 'Error de envío', icon: 'fa-plug-circle-xmark' },
        pendiente: { label: 'Enviando', icon: 'fa-clock' },
        anulada: { label: 'Anulada', icon: 'fa-ban' },
    },
    CONCEPTOS_NC: [
        [2, 'Anulación de factura electrónica', 'La factura queda sin efecto. Se envía NC por el total de la factura original.', true],
        [1, 'Devolución de productos', 'Devuelve parte o todos los productos. Vuelven al inventario.', true],
        [3, 'Rebaja o descuento parcial o total', 'Próximamente — requiere campo de rebaja.', false],
        [4, 'Ajuste de precio', 'Próximamente — requiere precio nuevo por ítem.', false],
        [5, 'Otros', 'Próximamente.', false],
    ],
    QR_BASE: 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=',
    CONSUMIDOR_FINAL: '222222222',
};

// ========================================
// HELPERS
// ========================================
function feEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function feMoney(n) {
    return '$' + parseFloat(n || 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function feNumero(f) {
    return f && f.numero ? `${f.prefijo || ''}${f.numero}` : '—';
}

function feMedioPago(code) {
    return (FE.MEDIOS_PAGO.find(m => m[0] == code) || [code, 'Otro'])[1];
}

function feTipoDoc(code) {
    return (FE.TIPOS_DOC.find(t => t[0] == code) || [code, code])[1];
}

function feOptions(list, selected) {
    return list.map(([v, l]) => `<option value="${v}" ${String(v) === String(selected) ? 'selected' : ''}>${l}</option>`).join('');
}

function feEstadoBadge(estado) {
    const e = FE.ESTADOS[estado] || { label: estado, icon: 'fa-circle' };
    return `<span class="badge-status badge-fe-${estado}">${e.label}</span>`;
}

/** Chip pequeño para el listado de pedidos */
function fePedidoChip(f) {
    if (!f) return '';
    if (f.estado === 'autorizada') {
        return `<span class="fe-chip ok" title="Factura electrónica autorizada"><i class="fas fa-file-invoice-dollar"></i>${feEsc(feNumero(f))}</span>`;
    }
    if (f.estado === 'rechazada' || f.estado === 'error') {
        return `<span class="fe-chip bad" title="Factura rechazada / con error"><i class="fas fa-triangle-exclamation"></i>FE</span>`;
    }
    if (f.estado === 'anulada') {
        return `<span class="fe-chip anulada" title="Factura anulada con nota crédito"><i class="fas fa-ban"></i>${feEsc(feNumero(f))}</span>`;
    }
    return '';
}

function feQrDataURL(cufe, cell = 4) {
    try {
        if (typeof qrcode === 'undefined' || !cufe) return '';
        const qr = qrcode(0, 'M');
        qr.addData(FE.QR_BASE + cufe);
        qr.make();
        return qr.createDataURL(cell, 4);
    } catch (e) {
        console.error(e);
        return '';
    }
}

function feCopiar(texto, msg = 'Copiado') {
    navigator.clipboard?.writeText(texto).then(() => toast(msg)).catch(() => toast('No se pudo copiar', 'error'));
}

function feModalWide() {
    document.getElementById('modal-container').classList.add('modal-wide');
}

// ========================================
// PEDIDO → FACTURA (card + modal)
// ========================================

/** Card en el detalle del pedido */
function feCardPedido(p) {
    if (state.usuario?.rol !== 'admin') {
        return p.factura?.estado === 'autorizada'
            ? `<div class="card fe-card-pedido ok" style="margin-bottom:20px"><div class="card-body">
                   <div class="fe-card-title"><i class="fas fa-file-invoice-dollar"></i> Facturado electrónicamente</div>
                   <div class="fe-card-num">${feEsc(feNumero(p.factura))}</div></div></div>`
            : '';
    }

    const f = p.factura;
    if (f && f.estado === 'autorizada') {
        return `
            <div class="card fe-card-pedido ok" style="margin-bottom:20px">
                <div class="card-body">
                    <div class="fe-card-title"><i class="fas fa-circle-check"></i> Factura Electrónica</div>
                    <div class="fe-card-num">${feEsc(feNumero(f))}</div>
                    <div class="fe-card-sub">Autorizada por la DIAN · ${feMoney(f.total)}</div>
                    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
                        <button class="btn btn-sm fe-btn-light" onclick="viewFactura(${f.id_factura})"><i class="fas fa-eye"></i> Ver factura</button>
                        <button class="btn btn-sm fe-btn-light" onclick="feImprimirCarta(${f.id_factura})"><i class="fas fa-file-pdf"></i> PDF</button>
                    </div>
                </div>
            </div>`;
    }

    if (p.estado === 'cancelado') return '';

    const rechazo = f && (f.estado === 'rechazada' || f.estado === 'error');
    const anulada = f && f.estado === 'anulada';
    return `
        <div class="card fe-card-pedido ${rechazo ? 'bad' : ''}" style="margin-bottom:20px">
            <div class="card-body">
                <div class="fe-card-title"><i class="fas ${rechazo ? 'fa-triangle-exclamation' : 'fa-file-invoice-dollar'}"></i> Facturación Electrónica</div>
                ${rechazo
                    ? `<div class="fe-card-sub" style="margin:6px 0 12px">Último intento ${f.estado === 'error' ? 'con error' : 'rechazado por la DIAN'}:<br><em>${feEsc(f.mensaje_dian || '')}</em></div>`
                    : anulada
                        ? `<div class="fe-card-sub" style="margin:6px 0 12px">La factura <a class="fe-link" onclick="viewFactura(${f.id_factura})">${feEsc(feNumero(f))}</a> fue <b>anulada</b> con nota crédito. Puedes volver a facturar el pedido.</div>`
                        : `<div class="fe-card-sub" style="margin:6px 0 12px">Convierte este pedido en factura electrónica válida ante la DIAN.</div>`}
                <button class="btn btn-block fe-btn-main" onclick="abrirFacturarPedido(${p.id_pedido}, ${p.id_cliente}, '${p.forma_pago || 'contado'}', ${parseInt(p.dias_credito) || 0})">
                    <i class="fas fa-paper-plane"></i> ${rechazo ? 'Corregir y reintentar' : 'Facturar electrónicamente'}
                </button>
                ${rechazo ? `<button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="viewFactura(${f.id_factura})"><i class="fas fa-magnifying-glass"></i> Ver detalle del rechazo</button>` : ''}
            </div>
        </div>`;
}

async function abrirFacturarPedido(idPedido, idCliente, formaPedido = 'contado', diasPedido = 0) {
    const credito = formaPedido === 'credito';
    const opts = { forma_pago: credito ? 2 : 1, medio_pago: credito ? 30 : 10, dias_credito: credito && diasPedido > 0 ? diasPedido : 30, consumidor_final: false, email: '' };
    let preview = null;
    let enviando = false;
    let clientePedido = null; // datos del cliente real, para mostrarlo aunque se elija Consumidor Final

    openModal('Facturar electrónicamente', `<div style="text-align:center;padding:40px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></div>`);
    feModalWide();

    async function cargarPreview() {
        const qs = new URLSearchParams({
            forma_pago: opts.forma_pago, medio_pago: opts.medio_pago, dias_credito: opts.dias_credito,
            consumidor_final: opts.consumidor_final ? 1 : 0, email: opts.email,
        });
        const data = await api(`/pedidos/${idPedido}/factura/preview?${qs}`);
        if (!data || data.error) {
            document.getElementById('modal-body').innerHTML = `<div class="empty-state"><i class="fas fa-plug-circle-xmark"></i><h3>No disponible</h3><p>${feEsc(data?.mensaje || 'No se pudo cargar la vista previa. ¿Ya se ejecutó la migración de facturación?')}</p></div>`;
            return;
        }
        preview = data.preview;
        if (!opts.consumidor_final) clientePedido = preview.cliente;
        if (!opts.email && preview.cliente.email) opts.email = preview.cliente.email;
        render();
    }

    function render() {
        const p = preview;
        const c = p.cliente;
        const t = p.totales;
        const bloqueado = p.errores.length > 0;

        document.getElementById('modal-body').innerHTML = `
            <div class="fe-steps-hint"><i class="fas fa-shield-halved"></i> Se enviará a la DIAN. Una vez autorizada, la factura <strong>no se puede modificar</strong> (solo con Nota Crédito).</div>

            ${p.errores.length ? `
                <div class="fe-alert danger">
                    <div class="fe-alert-title"><i class="fas fa-circle-xmark"></i> Corrige esto antes de enviar</div>
                    <ul>${p.errores.map(e => `<li>${feEsc(e)}</li>`).join('')}</ul>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
                        <button class="btn btn-sm btn-outline" onclick="window._feEditarCliente()"><i class="fas fa-user-pen"></i> Editar cliente</button>
                        <button class="btn btn-sm btn-outline" onclick="closeModal();navigateTo('config-fe')"><i class="fas fa-gear"></i> Configuración FE</button>
                    </div>
                </div>` : ''}
            ${p.advertencias.length ? `
                <div class="fe-alert warning"><ul>${p.advertencias.map(e => `<li>${feEsc(e)}</li>`).join('')}</ul></div>` : ''}

            <div class="fe-grid-2">
                <div class="fe-box">
                    <div class="fe-box-title"><i class="fas fa-user"></i> Facturar a</div>
                    <div class="fe-adq-opciones">
                        <button type="button" class="fe-adq-op ${!opts.consumidor_final ? 'active' : ''}" data-cf="0">
                            <i class="fas fa-user-check"></i>
                            <span><b>Cliente del pedido</b><small>${feEsc(clientePedido?.nombre || 'Cliente')}${clientePedido?.identificacion ? ' · ' + feEsc(clientePedido.identificacion) : ''}</small></span>
                        </button>
                        <button type="button" class="fe-adq-op ${opts.consumidor_final ? 'active' : ''}" data-cf="1">
                            <i class="fas fa-users"></i>
                            <span><b>Consumidor Final</b><small>NIT 222222222</small></span>
                        </button>
                    </div>
                    <div class="fe-kv"><span>Nombre</span><strong>${feEsc(c.nombre)}</strong></div>
                    <div class="fe-kv"><span>${feEsc(c.tipo_documento_nombre)}</span><strong>${feEsc(c.identificacion || '—')}${c.identificacion ? '-' + c.dv : ''}</strong></div>
                    <div class="fe-kv"><span>Municipio</span><strong>${feEsc(c.municipio ? c.municipio.name + ' (' + c.municipio.dept_name + ')' : '—')}</strong></div>
                    <div class="fe-kv"><span>Dirección</span><strong>${feEsc(c.direccion)}</strong></div>
                </div>
                <div class="fe-box">
                    <div class="fe-box-title"><i class="fas fa-credit-card"></i> Pago</div>
                    <div class="grid-2" style="gap:10px">
                        <div class="form-group" style="margin:0">
                            <label>Forma de pago</label>
                            <select id="fe-forma" class="filter-select" style="width:100%">
                                <option value="1" ${opts.forma_pago == 1 ? 'selected' : ''}>Contado</option>
                                <option value="2" ${opts.forma_pago == 2 ? 'selected' : ''}>Crédito</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;${opts.forma_pago == 2 ? '' : 'display:none'}" id="fe-dias-box">
                            <label>Días de plazo</label>
                            <input type="number" id="fe-dias" min="1" value="${opts.dias_credito}">
                        </div>
                    </div>
                    <div class="form-group" style="margin:10px 0 0">
                        <label>Medio de pago</label>
                        <select id="fe-medio" class="filter-select" style="width:100%">${feOptions(FE.MEDIOS_PAGO, opts.medio_pago)}</select>
                    </div>
                    <div class="form-group" style="margin:10px 0 0">
                        <label>Enviar al email</label>
                        <input type="email" id="fe-email" value="${feEsc(opts.email)}" placeholder="cliente@correo.com">
                    </div>
                </div>
            </div>

            <div class="table-wrapper fe-preview-table">
                <table class="data-table">
                    <thead><tr><th>Producto</th><th style="text-align:right">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">IVA</th><th style="text-align:right">Total</th></tr></thead>
                    <tbody>
                        ${p.lineas.map(l => `
                            <tr>
                                <td><div style="font-weight:600">${feEsc(l.descripcion)}</div><div style="font-size:11px;color:var(--text-muted)">${feEsc(l.codigo)} · ${feEsc(l.unidad)}</div></td>
                                <td style="text-align:right">${formatNumber(l.cantidad)}</td>
                                <td style="text-align:right">${feMoney(l.precio)}</td>
                                <td style="text-align:right">${l.iva_porcentaje > 0 ? `${formatNumber(l.iva_porcentaje)}%<div style="font-size:11px;color:var(--text-muted)">${feMoney(l.iva)}</div>` : '<span style="color:var(--text-muted)">0%</span>'}</td>
                                <td style="text-align:right;font-weight:700">${feMoney(l.total)}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>

            <div class="fe-totals">
                <div><span>Subtotal (base)</span><span>${feMoney(t.subtotal)}</span></div>
                <div><span>IVA</span><span>${feMoney(t.iva)}</span></div>
                ${t.descuento > 0 ? `<div><span>Descuento</span><span>-${feMoney(t.descuento)}</span></div>` : ''}
                <div class="total"><span>Total a facturar</span><span>${feMoney(t.total)}</span></div>
            </div>
        `;

        document.getElementById('modal-footer').innerHTML = `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn fe-btn-main" id="fe-enviar" ${bloqueado ? 'disabled' : ''}>
                <i class="fas fa-paper-plane"></i> Enviar a la DIAN
            </button>`;

        const recargar = debounce(cargarPreview, 400);
        document.querySelectorAll('.fe-adq-op').forEach(b => b.onclick = () => {
            const cf = b.dataset.cf === '1';
            if (cf === opts.consumidor_final) return;
            opts.consumidor_final = cf;
            cargarPreview();
        });
        document.getElementById('fe-forma').onchange = e => {
            opts.forma_pago = parseInt(e.target.value);
            cargarPreview();
        };
        const dias = document.getElementById('fe-dias');
        if (dias) dias.oninput = e => { opts.dias_credito = parseInt(e.target.value) || 0; recargar(); };
        document.getElementById('fe-medio').onchange = e => { opts.medio_pago = parseInt(e.target.value); };
        document.getElementById('fe-email').oninput = e => { opts.email = e.target.value.trim(); };
        document.getElementById('fe-enviar').onclick = enviar;
    }

    window._feEditarCliente = async () => {
        const data = await api(`/clientes/${idCliente}`);
        if (!data || data.error) return;
        openClientModal(() => abrirFacturarPedido(idPedido, idCliente, formaPedido, diasPedido), data.cliente);
    };

    async function enviar() {
        if (enviando) return;
        if (!(await confirmar(`Se enviará la factura electrónica a la DIAN. Una vez autorizada no se puede modificar.`, {
            titulo: 'Enviar factura a la DIAN', ok: '<i class="fas fa-paper-plane"></i> Enviar a la DIAN', tipo: 'dian',
            detalle: `<div><span>A nombre de</span><b>${feEsc(preview.cliente.nombre)}</b></div><div><span>Total</span><b>${feMoney(preview.totales.total)}</b></div>`,
        }))) return;
        enviando = true;

        document.getElementById('modal-body').innerHTML = `
            <div class="fe-sending">
                <div class="fe-sending-icon"><i class="fas fa-paper-plane"></i></div>
                <h3>Enviando a la DIAN...</h3>
                <p>Firmando y validando el documento. Puede tardar unos segundos, no cierres esta ventana.</p>
            </div>`;
        document.getElementById('modal-footer').innerHTML = '';

        const data = await api(`/pedidos/${idPedido}/facturar`, { method: 'POST', body: JSON.stringify(opts) });
        enviando = false;

        if (data && !data.error && data.factura) {
            const f = data.factura;
            document.getElementById('modal-body').innerHTML = `
                <div class="fe-result ok">
                    <div class="fe-result-icon"><i class="fas fa-check"></i></div>
                    <h3>¡Factura autorizada!</h3>
                    <div class="fe-result-num">${feEsc(feNumero(f))}</div>
                    <p>${feMoney(f.total)} · ${feEsc(f.cliente_nombre)}</p>
                    <div class="fe-cufe" title="CUFE">${feEsc(f.cufe)}</div>
                    ${f.email_enviado ? `<p style="color:var(--success);font-size:13px"><i class="fas fa-envelope-circle-check"></i> Enviada a ${feEsc(f.cliente_email)}</p>` : ''}
                </div>`;
            document.getElementById('modal-footer').innerHTML = `
                <button class="btn btn-outline" onclick="closeModal();viewPedido(${idPedido})">Cerrar</button>
                <button class="btn btn-outline" onclick="feImprimirCarta(${f.id_factura})"><i class="fas fa-file-pdf"></i> PDF</button>
                <button class="btn btn-primary" onclick="closeModal();viewFactura(${f.id_factura})"><i class="fas fa-eye"></i> Ver factura</button>`;
            toast(data.mensaje || 'Factura autorizada');
            return;
        }

        const errores = data?.errores?.length ? data.errores : [data?.mensaje || 'Error desconocido'];
        document.getElementById('modal-body').innerHTML = `
            <div class="fe-result bad">
                <div class="fe-result-icon"><i class="fas fa-xmark"></i></div>
                <h3>${feEsc(data?.mensaje || 'No se pudo facturar')}</h3>
                <p>Corrige los datos indicados y vuelve a intentarlo. El pedido no se modificó.</p>
            </div>
            <div class="fe-alert danger"><ul>${errores.map(e => `<li>${feEsc(e)}</li>`).join('')}</ul></div>`;
        document.getElementById('modal-footer').innerHTML = `
            <button class="btn btn-outline" onclick="closeModal();viewPedido(${idPedido})">Cerrar</button>
            <button class="btn btn-outline" onclick="window._feEditarCliente()"><i class="fas fa-user-pen"></i> Editar cliente</button>
            <button class="btn btn-primary" onclick="abrirFacturarPedido(${idPedido}, ${idCliente}, '${formaPedido}', ${diasPedido})"><i class="fas fa-rotate"></i> Revisar y reintentar</button>`;
    }

    cargarPreview();
}

// ========================================
// LISTADO DE FACTURAS
// ========================================
async function renderFacturas() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="stats-grid fade-in" id="fe-stats"></div>
        <div class="toolbar">
            <div class="search-box">
                <input type="text" id="fe-buscar" placeholder="Buscar por número, cliente, NIT, pedido o CUFE...">
                <i class="fas fa-search"></i>
            </div>
            <div class="fe-chips" id="fe-chips">
                ${[['', 'Todas'], ['facturas', 'Facturas'], ['autorizada', 'Autorizadas'], ['nota', 'Notas crédito'], ['anulada', 'Anuladas'], ['rechazada', 'Rechazadas'], ['error', 'Con error']]
                    .map(([v, l]) => `<button class="fe-chip-filter ${v === '' ? 'active' : ''}" data-estado="${v}">${l}</button>`).join('')}
            </div>
            <input type="date" class="filter-select" id="fe-desde" title="Desde">
            <input type="date" class="filter-select" id="fe-hasta" title="Hasta">
        </div>
        <div class="card fade-in">
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr><th>Factura</th><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Pago</th><th style="text-align:right">Total</th><th>Estado</th><th>Acciones</th></tr>
                    </thead>
                    <tbody id="fe-tbody"><tr><td colspan="8" style="text-align:center;padding:30px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></td></tr></tbody>
                </table>
            </div>
        </div>`;

    let estado = '';
    let facturas = [];
    let notas = [];

    async function cargar() {
        const qs = new URLSearchParams();
        if (estado && estado !== 'nota' && estado !== 'facturas') qs.set('estado', estado); // 'nota' y 'facturas' se filtran aquí
        const desde = document.getElementById('fe-desde').value;
        const hasta = document.getElementById('fe-hasta').value;
        if (desde) qs.set('fecha_desde', desde);
        if (hasta) qs.set('fecha_hasta', hasta);
        const data = await api('/facturas' + (qs.toString() ? '?' + qs : ''));
        if (!data || data.error) {
            document.getElementById('fe-tbody').innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-plug-circle-xmark"></i><h3>Módulo no disponible</h3><p>${feEsc(data?.mensaje || 'Ejecuta la migración de facturación electrónica en la base de datos.')}</p></div></td></tr>`;
            return;
        }
        facturas = data.facturas || [];
        notas = data.notas || [];
        renderStats(data.stats || {});
        renderTabla(filtrar());
    }

    function renderStats(s) {
        const n = k => parseInt(s[k]?.cantidad || 0);
        const tot = parseFloat(s.autorizada?.total || 0);
        document.getElementById('fe-stats').innerHTML = `
            <div class="stat-card green"><div class="stat-icon green"><i class="fas fa-circle-check"></i></div>
                <div class="stat-info"><h4>Autorizadas</h4><div class="stat-value">${n('autorizada')}</div></div></div>
            <div class="stat-card purple"><div class="stat-icon purple"><i class="fas fa-sack-dollar"></i></div>
                <div class="stat-info"><h4>Total Facturado</h4><div class="stat-value">$${formatNumber(tot)}</div></div></div>
            <div class="stat-card orange"><div class="stat-icon orange"><i class="fas fa-file-circle-minus"></i></div>
                <div class="stat-info"><h4>Notas crédito</h4><div class="stat-value">${n('notas')}</div><div class="cr-stat-sub">-${feMoney(s.notas?.total || 0)}</div></div></div>
            <div class="stat-card blue"><div class="stat-icon blue"><i class="fas fa-file-invoice"></i></div>
                <div class="stat-info"><h4>Rechazadas / Error</h4><div class="stat-value">${n('rechazada') + n('error')}</div></div></div>`;
    }

    function filtrar() {
        const t = document.getElementById('fe-buscar').value.toLowerCase().trim();
        const filas = [
            ...(estado === 'nota' ? [] : facturas.map(f => ({ ...f, _tipo: 'factura', _orden: f.fecha_emision || f.created_at }))),
            ...(estado === '' || estado === 'nota' ? notas.map(n => ({ ...n, _tipo: 'nota', _orden: n.fecha_emision || n.created_at })) : []),
        ].sort((a, b) => String(b._orden).replace('T', ' ').localeCompare(String(a._orden).replace('T', ' ')));
        if (!t) return filas;
        return filas.filter(f => f._tipo === 'nota'
            ? [(f.prefijo || '') + (f.numero || ''), (f.factura_prefijo || '') + (f.factura_numero || ''), f.cliente_nombre, f.cliente_identificacion, f.numero_pedido, f.cufe]
                .some(v => String(v || '').toLowerCase().includes(t))
            : feNumero(f).toLowerCase().includes(t) ||
              (f.cliente_nombre || '').toLowerCase().includes(t) ||
              (f.cliente_identificacion || '').includes(t) ||
              (f.cufe || '').toLowerCase().includes(t) ||
              (f.pedido?.numero_pedido || '').toLowerCase().includes(t));
    }

    function filaNota(n) {
        const dev = +n.concepto === 1;
        return `
            <tr class="fe-fila-nc">
                <td><strong class="fe-num">${feEsc((n.prefijo || '') + (n.numero || ''))}</strong>
                    <div class="fe-nc-ref"><i class="fas fa-turn-up fa-rotate-90"></i> NC de ${feEsc((n.factura_prefijo || '') + (n.factura_numero || ''))}</div></td>
                <td>${n.id_pedido ? `<a class="fe-link" onclick="viewPedido(${n.id_pedido})">${feEsc(n.numero_pedido || '#' + n.id_pedido)}</a>` : '-'}</td>
                <td><div style="font-weight:600">${feEsc(n.cliente_nombre)}</div><div style="font-size:12px;color:var(--text-muted)">${feEsc(n.cliente_identificacion)}</div></td>
                <td>${formatDate(n.fecha_emision || n.created_at)}</td>
                <td><span class="fe-nc-tipo ${dev ? 'dev' : 'anu'}">${dev ? 'Devolución' : 'Anulación'}</span></td>
                <td style="text-align:right"><strong style="color:#B45309">-${feMoney(n.total)}</strong></td>
                <td><span class="badge-status badge-fe-nota">Nota crédito</span></td>
                <td style="white-space:nowrap">
                    <button class="btn btn-ghost btn-sm" onclick="viewFactura(${n.id_factura})" title="Ver factura y nota"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-ghost btn-sm" onclick="feImprimirCarta(${n.id_factura}, ${n.id_nota})" title="PDF de la nota crédito"><i class="fas fa-file-pdf" style="color:#B45309"></i></button>
                </td>
            </tr>`;
    }

    function renderTabla(list) {
        const tbody = document.getElementById('fe-tbody');
        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-file-invoice-dollar"></i><h3>Sin facturas</h3><p>Factura un pedido desde su detalle con el botón <strong>Facturar electrónicamente</strong>.</p></div></td></tr>`;
            return;
        }
        tbody.innerHTML = list.map(f => f._tipo === 'nota' ? filaNota(f) : `
            <tr>
                <td><strong class="fe-num">${feEsc(feNumero(f))}</strong>${f.email_enviado ? ' <i class="fas fa-envelope-circle-check" style="color:var(--success)" title="Enviada por email"></i>' : ''}</td>
                <td><a class="fe-link" onclick="viewPedido(${f.id_pedido})">${feEsc(f.pedido?.numero_pedido || '#' + f.id_pedido)}</a></td>
                <td><div style="font-weight:600">${feEsc(f.cliente_nombre)}</div><div style="font-size:12px;color:var(--text-muted)">${feEsc(f.cliente_identificacion)}</div></td>
                <td>${formatDate(f.fecha_emision || f.created_at)}</td>
                <td><span style="font-size:12px">${f.forma_pago == 2 ? `Crédito ${f.dias_credito}d` : 'Contado'}</span></td>
                <td style="text-align:right"><strong>${feMoney(f.total)}</strong>${(() => {
                    const dev = notas.filter(n => n.id_factura === f.id_factura && +n.concepto === 1).reduce((s, n) => s + parseFloat(n.total), 0);
                    return dev > 0 ? `<div class="fe-devuelto">-${feMoney(dev)} devuelto</div>` : '';
                })()}</td>
                <td>${feEstadoBadge(f.estado)}</td>
                <td style="white-space:nowrap">
                    <button class="btn btn-ghost btn-sm" onclick="viewFactura(${f.id_factura})" title="Ver detalle"><i class="fas fa-eye"></i></button>
                    ${f.estado === 'autorizada' ? `
                        <button class="btn btn-ghost btn-sm" onclick="feImprimirCarta(${f.id_factura})" title="PDF carta"><i class="fas fa-file-pdf" style="color:#DC2626"></i></button>
                        <button class="btn btn-ghost btn-sm" onclick="feImprimirTicket(${f.id_factura})" title="Ticket 80mm"><i class="fas fa-receipt"></i></button>
                        <button class="btn btn-ghost btn-sm" onclick="feEnviarEmail(${f.id_factura}, '${feEsc(f.cliente_email || '')}')" title="Enviar por email"><i class="fas fa-envelope"></i></button>`
                    : f.estado === 'anulada'
                        ? `<button class="btn btn-ghost btn-sm" onclick="feImprimirCarta(${f.id_factura})" title="PDF (anulada)"><i class="fas fa-file-pdf" style="color:var(--text-muted)"></i></button>`
                        : `<button class="btn btn-ghost btn-sm" onclick="feReintentar(${f.id_factura})" title="Reintentar envío"><i class="fas fa-rotate" style="color:var(--warning)"></i></button>`}
                </td>
            </tr>`).join('');
    }

    document.getElementById('fe-buscar').addEventListener('input', debounce(() => renderTabla(filtrar()), 250));
    document.getElementById('fe-chips').onclick = e => {
        const b = e.target.closest('.fe-chip-filter');
        if (!b) return;
        document.querySelectorAll('.fe-chip-filter').forEach(x => x.classList.toggle('active', x === b));
        estado = b.dataset.estado;
        cargar();
    };
    ['fe-desde', 'fe-hasta'].forEach(id => document.getElementById(id).addEventListener('change', cargar));

    cargar();
}

// ========================================
// DETALLE DE FACTURA
// ========================================
async function viewFactura(id, skipHash = false) {
    closeModal();
    const data = await api(`/facturas/${id}`);
    if (!data || data.error) { toast(data?.mensaje || 'No se pudo cargar la factura', 'error'); return; }

    const f = data.factura;
    const emp = data.empresa || {};
    state.currentPage = 'detalle-factura';
    if (!skipHash) {
        const h = '#/facturas/' + id;
        if (location.hash !== h) history.pushState(null, '', h);
    }
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === 'facturas'));
    document.getElementById('header-title').textContent = f.estado === 'autorizada' ? `Factura ${feNumero(f)}`
        : f.estado === 'anulada' ? `Factura ${feNumero(f)} (anulada)` : 'Intento de facturación';
    document.getElementById('header-action-btn').style.display = 'none';

    const ok = f.estado === 'autorizada';
    const anulada = f.estado === 'anulada';
    const conCufe = ok || anulada;
    const qr = conCufe ? feQrDataURL(f.cufe, 5) : '';
    const ncs = (f.notas_credito || []).filter(n => n.estado === 'autorizada');
    const nc = ncs.find(n => +n.concepto === 2);
    const devuelto = parseFloat(f.total_devuelto || 0);
    const ncFallidas = (f.notas_credito || []).filter(n => n.estado === 'rechazada' || n.estado === 'error');
    const ivas = feResumenIva(f.detalles || []);

    document.getElementById('page-container').innerHTML = `
        <div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost" onclick="navigateTo('facturas')"><i class="fas fa-arrow-left"></i> Facturas</button>
            <button class="btn btn-ghost" onclick="viewPedido(${f.id_pedido})"><i class="fas fa-file-lines"></i> Pedido ${feEsc(f.pedido?.numero_pedido || '')}</button>
            <div style="flex:1"></div>
            ${ok ? `
                <button class="btn btn-outline btn-sm" onclick="feImprimirCarta(${f.id_factura})"><i class="fas fa-file-pdf"></i> PDF Carta</button>
                <button class="btn btn-outline btn-sm" onclick="feImprimirTicket(${f.id_factura})"><i class="fas fa-receipt"></i> Ticket</button>
                <button class="btn btn-outline btn-sm" onclick="feEnviarEmail(${f.id_factura}, '${feEsc(f.cliente_email || '')}')"><i class="fas fa-envelope"></i> Email</button>
                ${devuelto >= parseFloat(f.total) - 1
                    ? `<span class="badge-status badge-fe-nota" style="align-self:center"><i class="fas fa-check"></i> Totalmente devuelta</span>`
                    : `<button class="btn btn-sm fe-btn-anular" onclick="feAnular(${f.id_factura})"><i class="fas fa-file-circle-minus"></i> Nota Crédito</button>`}`
            : anulada ? `
                <button class="btn btn-outline btn-sm" onclick="feImprimirCarta(${f.id_factura})"><i class="fas fa-file-pdf"></i> PDF (anulada)</button>`
            : `
                <button class="btn btn-warning btn-sm" onclick="feReintentar(${f.id_factura})"><i class="fas fa-rotate"></i> Reintentar envío</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="feEliminarIntento(${f.id_factura})"><i class="fas fa-trash"></i></button>`}
            <button class="btn btn-ghost btn-sm" onclick="feVerTrazas(${f.id_factura})" title="JSON enviado / respuesta API"><i class="fas fa-code"></i></button>
        </div>

        <div class="fe-hero ${ok ? 'ok' : anulada ? 'anulada' : 'bad'} fade-in">
            <div>
                <div class="fe-hero-label">${ok ? 'FACTURA ELECTRÓNICA DE VENTA' : anulada ? 'FACTURA ANULADA CON NOTA CRÉDITO' : 'FACTURA NO AUTORIZADA'}</div>
                <div class="fe-hero-num">${conCufe ? feEsc(feNumero(f)) : feEsc(FE.ESTADOS[f.estado]?.label || f.estado)}</div>
                <div class="fe-hero-sub">${feEsc(f.cliente_nombre)} · ${formatDate(f.fecha_emision || f.created_at)}</div>
            </div>
            <div style="text-align:right">
                <div class="fe-hero-label">TOTAL</div>
                <div class="fe-hero-num">${feMoney(f.total)}</div>
                <div class="fe-hero-sub">${f.intentos} intento${f.intentos == 1 ? '' : 's'} de envío</div>
            </div>
        </div>

        <div class="detail-grid fade-in">
            <div>
                ${devuelto > 0 ? `
                    <div class="fe-devol-resumen">
                        <div><span>Facturado</span><strong>${feMoney(f.total)}</strong></div>
                        <div class="menos"><span>Devuelto (${ncs.filter(n => +n.concepto === 1).length} NC)</span><strong>-${feMoney(devuelto)}</strong></div>
                        <div class="neto"><span>Neto</span><strong>${feMoney(parseFloat(f.total) - devuelto)}</strong></div>
                    </div>` : ''}
                ${ncs.map(n => `
                    <div class="card fe-nc-card ${+n.concepto === 1 ? 'devolucion' : ''}" style="margin-bottom:20px">
                        <div class="card-body">
                            <div class="fe-nc-title"><i class="fas ${+n.concepto === 1 ? 'fa-rotate-left' : 'fa-file-circle-minus'}"></i> Nota Crédito ${feEsc((n.prefijo || '') + (n.numero || ''))} <span class="badge-status badge-fe-autorizada" style="margin-left:6px">Autorizada</span>
                                <button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="feImprimirCarta(${f.id_factura}, ${n.id_nota})"><i class="fas fa-file-pdf"></i> PDF</button></div>
                            <div class="fe-nc-grid">
                                <div><span>Concepto</span><strong>${+n.concepto === 1 ? '1 · Devolución de productos' : '2 · Anulación de factura electrónica'}</strong></div>
                                <div><span>Valor</span><strong>${feMoney(n.total)}</strong></div>
                                <div><span>Fecha</span><strong>${formatDate(n.fecha_emision || n.created_at)}</strong></div>
                                <div><span>Emitida por</span><strong>${feEsc(n.usuario?.nombre || '-')}</strong></div>
                            </div>
                            ${(n.detalles || []).length ? `
                                <div class="fe-nc-lineas">${n.detalles.map(d => `<div><span>${formatNumber(d.cantidad)} × ${feEsc(d.descripcion)}</span><b>${feMoney(d.total)}</b></div>`).join('')}</div>` : ''}
                            <div class="fe-nc-motivo"><b>Motivo:</b> ${feEsc(n.motivo)}</div>
                            <div class="fe-cufe" style="margin:10px 0 0;max-width:none">CUDE: ${feEsc(n.cufe || '')}</div>
                        </div>
                    </div>`).join('')}
                ${ok && ncFallidas.length ? `
                    <div class="fe-alert warning" style="margin-bottom:20px">
                        <div class="fe-alert-title"><i class="fas fa-triangle-exclamation"></i> Último intento de nota crédito fallido</div>
                        ${feEsc(ncFallidas[ncFallidas.length - 1].mensaje_dian || '')}
                        ${(ncFallidas[ncFallidas.length - 1].errores || []).length ? `<ul>${ncFallidas[ncFallidas.length - 1].errores.map(e => `<li><code>${feEsc(e.code)}</code> ${feEsc(e.message)}</li>`).join('')}</ul>` : ''}
                    </div>` : ''}
                ${!conCufe && f.errores?.length ? `
                    <div class="fe-alert danger" style="margin-bottom:20px">
                        <div class="fe-alert-title"><i class="fas fa-circle-xmark"></i> ${feEsc(f.mensaje_dian || 'Respuesta de la DIAN')}</div>
                        <ul>${f.errores.map(e => `<li><code>${feEsc(e.code)}</code> ${feEsc(e.message)}</li>`).join('')}</ul>
                        <div style="font-size:12px;margin-top:8px;opacity:.8">Corrige los datos del cliente / productos y pulsa <strong>Reintentar envío</strong>: se toman los datos actuales del pedido.</div>
                    </div>` : ''}
                <div class="card" style="margin-bottom:20px">
                    <div class="card-header"><h3>Detalle</h3>${feEstadoBadge(f.estado)}</div>
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead><tr><th>Producto</th><th style="text-align:right">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">IVA</th><th style="text-align:right">Total</th></tr></thead>
                            <tbody>
                                ${(f.detalles || []).map(d => `
                                    <tr>
                                        <td><div style="font-weight:600">${feEsc(d.descripcion)}</div><div style="font-size:11px;color:var(--text-muted)">${feEsc(d.codigo || '')} · ${feEsc(d.unidad || '')}</div></td>
                                        <td style="text-align:right">${formatNumber(d.cantidad)}${parseFloat(d.devuelto) > 0 ? `<div class="fe-devuelto">-${formatNumber(d.devuelto)} devuelto</div>` : ''}</td>
                                        <td style="text-align:right">${feMoney(d.precio)}</td>
                                        <td style="text-align:right">${formatNumber(d.iva_porcentaje)}%</td>
                                        <td style="text-align:right;font-weight:700">${feMoney(d.total)}</td>
                                    </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div style="padding:20px">
                        <div class="fe-totals" style="margin:0 0 0 auto">
                            <div><span>Subtotal (base gravable)</span><span>${feMoney(f.subtotal)}</span></div>
                            ${ivas.map(i => `<div><span>IVA ${formatNumber(i.pct)}% <small style="color:var(--text-muted)">sobre ${feMoney(i.base)}</small></span><span>${feMoney(i.iva)}</span></div>`).join('')}
                            ${parseFloat(f.descuento) > 0 ? `<div><span>Descuento</span><span>-${feMoney(f.descuento)}</span></div>` : ''}
                            <div class="total"><span>Total a pagar</span><span>${feMoney(f.total)}</span></div>
                        </div>
                    </div>
                </div>
            </div>
            <div>
                ${conCufe ? `
                    <div class="card" style="margin-bottom:20px">
                        <div class="card-header"><h3><i class="fas fa-qrcode" style="color:var(--primary);margin-right:6px"></i>Validación DIAN</h3></div>
                        <div class="card-body" style="text-align:center">
                            ${qr ? `<a href="${FE.QR_BASE}${feEsc(f.cufe)}" target="_blank" title="Consultar en la DIAN"><img src="${qr}" class="fe-qr" alt="QR DIAN"></a>` : ''}
                            <div class="fe-cufe" style="margin-top:10px">${feEsc(f.cufe)}</div>
                            <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap">
                                <button class="btn btn-ghost btn-sm" onclick="feCopiar('${feEsc(f.cufe)}', 'CUFE copiado')"><i class="fas fa-copy"></i> Copiar CUFE</button>
                                <a class="btn btn-ghost btn-sm" href="${FE.QR_BASE}${feEsc(f.cufe)}" target="_blank"><i class="fas fa-arrow-up-right-from-square"></i> Ver en DIAN</a>
                                ${emp.api_url ? `<a class="btn btn-ghost btn-sm" href="${feEsc(emp.api_url.replace(/\/$/, ''))}/api/documentos-electronicos/${feEsc(f.cufe)}/pdf" target="_blank"><i class="fas fa-file-arrow-down"></i> PDF API</a>` : ''}
                            </div>
                        </div>
                    </div>` : ''}
                <div class="card" style="margin-bottom:20px">
                    <div class="card-header"><h3>Adquiriente</h3></div>
                    <div class="card-body">
                        <div class="info-row"><label>Nombre</label><span>${feEsc(f.cliente_nombre)}</span></div>
                        <div class="info-row"><label>${feEsc(feTipoDoc(f.cliente_tipo_documento))}</label><span>${feEsc(f.cliente_identificacion)}-${feEsc(f.cliente_dv)}</span></div>
                        <div class="info-row"><label>Municipio</label><span>${feEsc(f.cliente_municipio || '-')}</span></div>
                        <div class="info-row"><label>Dirección</label><span>${feEsc(f.cliente_direccion || '-')}</span></div>
                        <div class="info-row"><label>Teléfono</label><span>${feEsc(f.cliente_telefono || '-')}</span></div>
                        <div class="info-row"><label>Email</label><span>${feEsc(f.cliente_email || '-')}</span></div>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><h3>Documento</h3></div>
                    <div class="card-body">
                        <div class="info-row"><label>Forma de pago</label><span>${f.forma_pago == 2 ? 'Crédito' : 'Contado'}</span></div>
                        ${f.forma_pago == 2 ? `<div class="info-row"><label>Vence</label><span>${feEsc(f.fecha_vencimiento || '-')} (${f.dias_credito} días)</span></div>` : ''}
                        <div class="info-row"><label>Medio de pago</label><span>${feEsc(feMedioPago(f.medio_pago))}</span></div>
                        <div class="info-row"><label>Emitida por</label><span>${feEsc(f.usuario?.nombre || '-')}</span></div>
                        <div class="info-row"><label>Vendedor</label><span>${feEsc(f.pedido?.vendedor?.nombre || '-')}</span></div>
                        <div class="info-row"><label>Email</label><span>${f.email_enviado ? `<span style="color:var(--success)"><i class="fas fa-check"></i> Enviado</span>` : 'No enviado'}</span></div>
                        ${f.nota ? `<div style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:var(--radius-sm);font-size:13px"><strong>Nota:</strong> ${feEsc(f.nota)}</div>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
}

function feResumenIva(detalles) {
    const g = {};
    detalles.forEach(d => {
        const k = parseFloat(d.iva_porcentaje);
        g[k] = g[k] || { pct: k, base: 0, iva: 0 };
        g[k].base += parseFloat(d.base);
        g[k].iva += parseFloat(d.iva);
    });
    return Object.values(g).filter(x => x.pct > 0).sort((a, b) => b.pct - a.pct);
}

// ========================================
// ACCIONES
// ========================================
async function feReintentar(id) {
    if (!(await confirmar('Se enviará de nuevo con los datos actuales del pedido y del cliente.', { titulo: '¿Reintentar el envío a la DIAN?', ok: '<i class="fas fa-rotate-right"></i> Reintentar', tipo: 'dian' }))) return;
    toast('Enviando a la DIAN...', 'warning', 6000);
    const data = await api(`/facturas/${id}/reenviar`, { method: 'POST', body: '{}' });
    if (data && !data.error) {
        toast(data.mensaje || 'Factura autorizada');
        viewFactura(data.factura.id_factura);
    } else {
        toast(data?.mensaje || 'La DIAN rechazó la factura', 'error', 6000);
        viewFactura(data?.factura?.id_factura || id);
    }
}

async function feEliminarIntento(id) {
    if (!(await confirmar('El pedido no se afecta; solo se borra este intento fallido.', { titulo: '¿Eliminar este intento de facturación?', ok: 'Eliminar', tipo: 'danger' }))) return;
    const data = await api(`/facturas/${id}`, { method: 'DELETE' });
    if (data && !data.error) { toast('Intento eliminado'); navigateTo('facturas'); }
    else toast(data?.mensaje || 'Error', 'error');
}

function feEnviarEmail(id, emailActual = '') {
    openModal('Enviar factura por email', `
        <p style="color:var(--text-secondary);margin-bottom:14px">Se enviará el PDF y el XML de la factura electrónica (AttachedDocument).</p>
        <div class="form-group"><label>Email del destinatario</label><input type="email" id="fe-email-dest" value="${feEsc(emailActual)}" placeholder="cliente@correo.com"></div>
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="fe-email-btn"><i class="fas fa-paper-plane"></i> Enviar</button>
    `);
    document.getElementById('fe-email-btn').onclick = async () => {
        const email = document.getElementById('fe-email-dest').value.trim();
        if (!email) { toast('Ingresa un email', 'warning'); return; }
        const btn = document.getElementById('fe-email-btn');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        const data = await api(`/facturas/${id}/email`, { method: 'POST', body: JSON.stringify({ email }) });
        if (data && !data.error) { toast(data.mensaje || 'Email enviado'); closeModal(); }
        else { toast(data?.mensaje || 'No se pudo enviar', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar'; }
    };
}

async function feVerTrazas(id) {
    const data = await api(`/facturas/${id}/trazas`);
    if (!data || data.error) return;
    window._feTrazaReq = data.request;
    const pre = o => `<pre class="fe-json">${feEsc(JSON.stringify(o, null, 2) || 'null')}</pre>`;
    openModal('Trazas API DIAN', `
        <div class="fe-box-title">JSON enviado</div>${pre(data.request)}
        <div class="fe-box-title" style="margin-top:14px">Respuesta recibida</div>${pre(data.response)}
    `, `<button class="btn btn-outline" onclick="feCopiar(JSON.stringify(window._feTrazaReq, null, 2), 'JSON copiado')"><i class="fas fa-copy"></i> Copiar JSON enviado</button>
        <button class="btn btn-primary" onclick="closeModal()">Cerrar</button>`);
    feModalWide();
}

// ========================================
// REPRESENTACIÓN GRÁFICA (PDF / TICKET)
// ========================================
async function feCargarParaImprimir(id) {
    const data = await api(`/facturas/${id}`);
    if (!data || data.error) { toast('No se pudo cargar la factura', 'error'); return null; }
    if (!['autorizada', 'anulada'].includes(data.factura.estado)) { toast('Solo se imprimen facturas autorizadas', 'warning'); return null; }
    return data;
}

function feTextoResolucion(emp) {
    if (!emp.resolucion_numero) return '';
    const pref = emp.resolucion_prefijo || '';
    return `Autorización de numeración N° ${emp.resolucion_numero}` +
        (emp.resolucion_fecha ? ` de ${emp.resolucion_fecha}` : '') +
        ` Modalidad Factura Electrónica de Venta` +
        (emp.resolucion_desde ? ` Desde N° ${pref}${emp.resolucion_desde} hasta ${pref}${emp.resolucion_hasta || ''}` : '') +
        (emp.resolucion_vigencia ? ` vigencia hasta ${emp.resolucion_vigencia}` : '');
}

function feAbrirVentana(titulo, html, css) {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { toast('Permite las ventanas emergentes para imprimir', 'warning'); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${feEsc(titulo)}</title><style>${css}</style></head>
        <body>${html}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    win.document.close();
}

/** Número a letras en español (pesos colombianos) */
function feNumeroALetras(valor) {
    const U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
        'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO',
        'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
    const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
    const decenas = n => n < 30 ? U[n] : D[Math.floor(n / 10)] + (n % 10 ? ' Y ' + U[n % 10] : '');
    const centenas = n => {
        if (n === 100) return 'CIEN';
        const c = Math.floor(n / 100), r = n % 100;
        return [C[c], decenas(r)].filter(Boolean).join(' ');
    };
    const miles = n => {
        const m = Math.floor(n / 1000), r = n % 1000;
        const pre = m === 0 ? '' : m === 1 ? 'MIL' : centenas(m) + ' MIL';
        return [pre, centenas(r)].filter(Boolean).join(' ');
    };
    const entero = Math.floor(Math.abs(valor));
    const centavos = Math.round((Math.abs(valor) - entero) * 100);
    let txt;
    if (entero === 0) txt = 'CERO';
    else {
        const mill = Math.floor(entero / 1000000), r = entero % 1000000;
        const pre = mill === 0 ? '' : mill === 1 ? 'UN MILLON' : miles(mill) + ' MILLONES';
        txt = [pre, miles(r)].filter(Boolean).join(' ');
        if (r === 0 && mill > 0) txt += ' DE';
    }
    return `${txt} PESOS${centavos ? ` CON ${decenas(centavos) || centavos} CENTAVOS` : ''}`.replace(/\s+/g, ' ').trim();
}

/** Representación gráfica tamaño carta (diseño clásico con bordes, como la factura impresa anterior) */
/** PDF carta de la factura, o de una de sus notas crédito si se pasa idNota (mismo diseño) */
async function feImprimirCarta(id, idNota = null) {
    const data = await feCargarParaImprimir(id);
    if (!data) return;
    const f = data.factura;
    const e = data.empresa || {};
    const nota = idNota ? (f.notas_credito || []).find(n => n.id_nota === idNota && n.estado === 'autorizada') : null;
    if (idNota && !nota) { toast('La nota crédito no está autorizada', 'warning'); return; }
    const esNota = !!nota;
    const qr = feQrDataURL(esNota ? nota.cufe : f.cufe, 3);
    // Devolución: solo las líneas devueltas. Anulación: todas las de la factura.
    const det = esNota && (nota.detalles || []).length ? nota.detalles : (f.detalles || []);
    const ncA = (f.notas_credito || []).find(n => n.estado === 'autorizada' && +n.concepto === 2);
    const conceptoNC = esNota ? (+nota.concepto === 1 ? '1 - Devolución de parte de los bienes' : '2 - Anulación de factura electrónica') : '';

    const n2 = v => parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fechaHora = s => {
        if (!s) return '';
        if (/T.*(Z|[+-]\d\d:?\d\d)$/.test(String(s))) { // ISO con zona (ej. created_at en UTC) -> hora local
            const x = new Date(s), z = n => String(n).padStart(2, '0');
            return `${z(x.getDate())}-${z(x.getMonth() + 1)}-${x.getFullYear()} ${z(x.getHours())}:${z(x.getMinutes())}`;
        }
        const [d, t] = String(s).replace('T', ' ').split(' ');
        const [y, m, dd] = d.split('-');
        return `${dd}-${m}-${y}${t ? ' ' + t.substring(0, 5) : ''}`;
    };
    const tipoDoc = { '13': 'CC', '31': 'NIT', '22': 'CE', '41': 'PA', '42': 'DE' }[f.cliente_tipo_documento] || 'NIT / CC';
    const um = u => ({ unidad: 'UND', caja: 'CAJ', paquete: 'PAC', docena: 'DOC', botella: 'BOT', kilogramo: 'KG', gramo: 'GR', libra: 'LB', litro: 'LT', 'galón': 'GAL', par: 'PAR', metro: 'MT', cada: 'UND' })[String(u || '').toLowerCase()] || String(u || 'UND').substring(0, 3).toUpperCase();
    const iva = det.reduce((s, d) => s + parseFloat(d.iva || 0), 0);
    const notaConLineas = esNota && (nota.detalles || []).length;
    const subtotal = notaConLineas ? det.reduce((s, d) => s + parseFloat(d.base || 0), 0) : parseFloat(f.subtotal || 0);
    const totalFactura = subtotal + iva;
    const descuento = notaConLineas ? 0 : parseFloat(f.descuento || 0);
    const totalDoc = esNota ? parseFloat(nota.total || 0) : parseFloat(f.total);
    const formaPago = f.forma_pago == 2 ? `CRÉDITO ${f.dias_credito} días` : 'CONTADO';
    const pref = e.resolucion_prefijo || f.prefijo || '';
    const resol = !esNota && e.resolucion_numero
        ? `Resolución DIAN No. ${e.resolucion_numero}${e.resolucion_fecha ? ' del ' + e.resolucion_fecha : ''}${e.resolucion_vigencia ? ' al ' + e.resolucion_vigencia : ''}${e.resolucion_desde ? ` Rango del ${pref}${e.resolucion_desde} al ${pref}${e.resolucion_hasta || ''}` : ''}`
        : '';
    const FILAS_MIN = 18; // altura fija de la tabla, como el formato impreso

    const html = `
        <div class="page">
            ${!esNota && f.estado === 'anulada' ? `<div class="sello-anulada">ANULADA</div><div class="anulada-nota">Anulada con Nota Crédito ${feEsc(ncA ? (ncA.prefijo || '') + (ncA.numero || '') : '')} · ${feEsc(ncA?.motivo || '')}</div>` : ''}
            <header>
                <div class="logo">${e.empresa_logo_url ? `<img src="${feEsc(e.empresa_logo_url)}">` : `<div class="logo-txt">${feEsc(e.empresa_nombre || '')}</div>`}</div>
                <div class="emp">
                    <div class="emp-nombre">${feEsc(e.empresa_nombre || '')}${e.empresa_propietario ? '- ' + feEsc(e.empresa_propietario) : ''}</div>
                    <div><b>NIT: ${feEsc(e.empresa_nit || '')}</b></div>
                    ${e.empresa_direccion ? `<div>Dirección: ${feEsc(e.empresa_direccion)}</div>` : ''}
                    ${data.empresa_ciudad ? `<div>Ciudad: ${feEsc(data.empresa_ciudad)}</div>` : ''}
                    ${e.empresa_telefono ? `<div>Teléfono: ${feEsc(e.empresa_telefono)}</div>` : ''}
                    ${e.empresa_email ? `<div>Email: ${feEsc(e.empresa_email)}</div>` : ''}
                    ${resol ? `<div>${feEsc(resol)}</div>` : ''}
                    <div class="emp-regimen">${feEsc((e.empresa_regimen || '').toUpperCase())}</div>
                </div>
                <div class="qr">${qr ? `<img src="${qr}">` : ''}</div>
            </header>

            <table class="caja datos">
                <tr>
                    <td class="col-cli">
                        <table class="kv">
                            <tr><th>Cliente:</th><td><b>${feEsc(f.cliente_nombre)}</b></td></tr>
                            <tr><th>${tipoDoc === 'NIT' ? 'NIT:' : 'NIT / CC:'}</th><td>${feEsc(f.cliente_identificacion)}${f.cliente_tipo_documento === '31' ? '-' + feEsc(f.cliente_dv) : ''}</td></tr>
                            <tr><th>Dirección:</th><td>${feEsc(f.cliente_direccion && f.cliente_direccion !== '-' ? f.cliente_direccion : '')}</td></tr>
                            <tr><th>Ciudad:</th><td>${feEsc(f.cliente_municipio || '')}</td></tr>
                            <tr><th>Departamento:</th><td>${feEsc((f.cliente_departamento || '').toUpperCase())}</td></tr>
                            <tr><th>Teléfono:</th><td>${feEsc(f.cliente_telefono && f.cliente_telefono !== '0' ? f.cliente_telefono : '')}</td></tr>
                            <tr><th><u>Email:</u></th><td><u>${feEsc(f.cliente_email || '')}</u></td></tr>
                        </table>
                    </td>
                    <td class="col-doc">
                        ${esNota ? `
                        <div class="doc-num"><span>Nota Crédito Electrónica:</span><b>${feEsc((nota.prefijo || '') + (nota.numero || ''))}</b></div>
                        <table class="fechas">
                            <tr><th>Fecha de Expedición:</th><th>Factura Afectada:</th></tr>
                            <tr><td>${fechaHora(nota.fecha_emision || nota.created_at)}</td><td><b>${feEsc(feNumero(f))}</b></td></tr>
                        </table>
                        <div class="linea"><b>Fecha Factura:</b> ${fechaHora(f.fecha_emision)}</div>
                        <div class="linea"><b>Concepto:</b> ${feEsc(conceptoNC)}</div>
                        <div class="linea"><b>Forma de Pago:</b> ${formaPago} &nbsp; ${feEsc(feMedioPago(f.medio_pago))}</div>
                        <div class="linea"><b>Pedido:</b> ${feEsc(f.pedido?.numero_pedido || '')}</div>
                        <div class="linea"><b>Moneda Aplicable:</b> COP &nbsp;&nbsp; <b>Tasa Cambio:</b></div>`
                        : `
                        <div class="doc-num"><span>Factura Electrónica de Venta:</span><b>${feEsc(feNumero(f))}</b></div>
                        <table class="fechas">
                            <tr><th>Fecha de Expedición:</th><th>Fecha de Vencimiento:</th></tr>
                            <tr><td>${fechaHora(f.fecha_emision)}</td><td>${fechaHora(f.fecha_vencimiento || f.fecha_emision).substring(0, 10)}</td></tr>
                        </table>
                        <div class="linea"><b>Elaboración:</b> ${fechaHora(f.created_at || f.fecha_emision)}</div>
                        <div class="linea"><b>Forma de Pago:</b> ${formaPago} &nbsp; ${feEsc(feMedioPago(f.medio_pago))}</div>
                        <div class="linea"><b>Orden de Compra:</b></div>
                        <div class="linea"><b>Orden de Despacho:</b> ${feEsc(f.pedido?.numero_pedido || '')}</div>
                        <div class="linea"><b>Nro. de Remisión:</b></div>
                        <div class="linea"><b>Moneda Aplicable:</b> COP &nbsp;&nbsp; <b>Tasa Cambio:</b></div>`}
                    </td>
                </tr>
                <tr><td colspan="2" class="vendedor"><b>Vendedor:</b> ${feEsc((f.pedido?.vendedor?.nombre || f.usuario?.nombre || '').toUpperCase())}</td></tr>
            </table>

            <table class="items">
                <thead><tr><th class="c-cod">Código</th><th>Descripción</th><th class="c-um">UM</th><th class="c-cant">Cantidad</th><th class="c-val">Vr.Unitario</th><th class="c-pct">%INC</th><th class="c-pct">%IVA</th><th class="c-tot">Valor Total</th></tr></thead>
                <tbody>
                    ${det.map(d => {
                        const factor = 1 + parseFloat(d.iva_porcentaje || 0) / 100;
                        return `<tr>
                            <td>${feEsc(d.codigo || '')}</td><td>${feEsc(d.descripcion)}</td><td>${um(d.unidad)}</td>
                            <td class="r">${n2(d.cantidad)}</td><td class="r">${n2(parseFloat(d.precio) / factor)}</td>
                            <td class="r">0.0</td><td class="r">${parseFloat(d.iva_porcentaje || 0).toFixed(1)}</td><td class="r">${n2(d.total)}</td>
                        </tr>`;
                    }).join('')}
                    <tr class="relleno" style="height:${Math.max(0, FILAS_MIN - det.length) * 17}px"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
                </tbody>
            </table>

            <table class="caja pie">
                <tr>
                    <td class="col-obs">
                        <div class="obs"><b>Observaciones:</b> ${esNota
                            ? `<b>Motivo:</b> ${feEsc(nota.motivo || '')}<br><b>Factura referenciada:</b> ${feEsc(feNumero(f))} del ${fechaHora(f.fecha_emision).substring(0, 10)}<br><b>CUFE factura:</b> <span class="mono">${feEsc(f.cufe)}</span>`
                            : feEsc(f.nota || '')}</div>
                        <div class="letras"><b>Valor en Letras:</b> ${feNumeroALetras(totalDoc)}</div>
                    </td>
                    <td class="col-tot">
                        <table class="totales">
                            <tr><th>Subtotal:</th><td>${n2(subtotal)}</td></tr>
                            <tr><th>Descuento:</th><td>${n2(descuento)}</td></tr>
                            <tr><th>Impoconsumo:</th><td>0.00</td></tr>
                            <tr><th>IVA:</th><td>${n2(iva)}</td></tr>
                            <tr class="b"><th>${esNota ? 'Total Nota:' : 'Total Factura:'}</th><td>${n2(totalFactura)}</td></tr>
                            <tr><th>Retefuente:</th><td>0.00</td></tr>
                            <tr><th>ReteIVA:</th><td>0.00</td></tr>
                            <tr><th>Otros Dsctos:</th><td>0.00</td></tr>
                            <tr class="neto"><th>${esNota ? 'TOTAL NOTA CRÉDITO:' : 'NETO A PAGAR:'}</th><td>${n2(totalDoc)}</td></tr>
                        </table>
                    </td>
                </tr>
            </table>

            <div class="cufe"><b>${esNota ? 'CUDE' : 'CUFE'}:</b> ${feEsc(esNota ? nota.cufe : f.cufe)}</div>

            <table class="final">
                <tr>
                    <td class="legal">
                        <div>${esNota ? 'Documento que corrige la factura electrónica de venta referenciada. Las cantidades y valores aquí indicados se descuentan de dicha factura.' : feEsc(e.nota_legal || 'La presente factura de venta se asimila en todos sus efectos a una letra de cambio (Código de Comercio Artículo 774 Numeral 5). Causará vencida la fecha de pago intereses de mora máximo permitido por la ley.')}</div>
                        <div class="software">Elaborado por: Innovación Digital - Software: ContaRs 3.5 - NIT 11.105.169-8 - www.innovacion-digital.com - Representación gráfica de la ${esNota ? 'nota crédito electrónica' : 'factura electrónica de venta'}</div>
                    </td>
                    <td class="firma">
                        <div class="firma-txt">${esNota ? 'Recibí la devolución / corrección indicada en esta nota crédito' : 'Manifiesto que recibí real y materialmente las mercancías y servicios indicados en esta factura'}</div>
                        <div class="firma-linea">Nombre, firma, cédula y sello</div>
                    </td>
                </tr>
            </table>
        </div>`;

    const css = `
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:10.5px;background:#fff}
        .page{position:relative;padding:16px 20px;max-width:816px;margin:0 auto}
        header{display:grid;grid-template-columns:150px 1fr 110px;gap:14px;align-items:start;margin-bottom:10px}
        .logo img{max-width:150px;max-height:110px;object-fit:contain}
        .logo-txt{font-family:Georgia,serif;font-weight:900;font-size:26px;letter-spacing:1px;text-align:center;padding-top:16px}
        .emp{line-height:1.38;font-size:10.5px}
        .emp-nombre{font-weight:800;font-size:12.5px}
        .emp-regimen{font-weight:800;font-size:12.5px;margin-top:1px}
        .qr img{width:104px;height:104px;image-rendering:pixelated;display:block;margin-left:auto}
        table{border-collapse:collapse;width:100%}
        .caja{border:1.5px solid #000;margin-bottom:6px}
        .caja>tbody>tr>td{border:1px solid #000;vertical-align:top}
        .col-cli{width:60%;padding:6px 8px}
        .col-doc{padding:0}
        .kv th{text-align:left;font-weight:700;width:96px;padding:2.5px 0;white-space:nowrap}
        .kv td{padding:2.5px 0}
        .doc-num{display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border-bottom:1px solid #000;font-weight:700;font-size:11px}
        .doc-num b{font-size:12px}
        .fechas{border-bottom:1px solid #000}
        .fechas th{font-weight:700;padding:4px 8px 1px;text-align:center}
        .fechas td{text-align:center;padding:0 8px 4px}
        .linea{padding:3px 8px;border-bottom:1px solid #000}
        .linea:last-child{border-bottom:none}
        .vendedor{padding:5px 8px}
        .items{border:1.5px solid #000;margin-bottom:6px}
        .items th{border:1px solid #000;padding:4px 5px;font-weight:700;text-align:center;font-size:10.5px}
        .items td{border-left:1px solid #000;border-right:1px solid #000;padding:2px 5px;height:17px;font-size:10.5px}
        .items .r{text-align:right}
        .c-cod{width:52px}.c-um{width:40px}.c-cant{width:66px}.c-val{width:86px}.c-pct{width:38px}.c-tot{width:100px}
        .relleno td{height:auto}
        .col-obs{width:64%;padding:0}
        .obs{padding:6px 8px;min-height:92px;border-bottom:1px solid #000}
        .letras{padding:6px 8px}
        .col-tot{padding:4px 8px}
        .totales th{text-align:left;font-weight:700;padding:1.6px 0}
        .totales td{text-align:right;padding:1.6px 0}
        .totales .neto th,.totales .neto td{font-weight:800;font-size:11.5px;border-top:1px solid #000;padding-top:3px}
        .cufe{padding:6px 2px 8px;font-size:10px;word-break:break-all}
        .mono{font-family:Consolas,monospace;font-size:9px;word-break:break-all}
        .final td{vertical-align:bottom}
        .legal{width:56%;padding-right:14px}
        .legal div:first-child{border:1px solid #000;padding:5px 7px;font-size:9.5px;font-weight:700;background:#f2f2f2;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .software{font-size:8.5px;margin-top:4px;color:#222}
        .final td.firma{border:1px solid #000;padding:6px 10px;height:92px;position:relative;vertical-align:top}
        .firma-txt{text-align:center;font-size:10px}
        .firma-linea{position:absolute;left:12px;right:12px;bottom:8px;border-top:1px solid #000;text-align:center;font-size:10px;padding-top:2px}
        .sello-anulada{position:absolute;top:330px;left:50%;transform:translateX(-50%) rotate(-24deg);font-size:110px;font-weight:900;color:rgba(220,38,38,.16);border:10px solid rgba(220,38,38,.16);padding:0 30px;border-radius:20px;letter-spacing:10px;pointer-events:none;z-index:5}
        .anulada-nota{background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;border-radius:6px;padding:5px 10px;margin-bottom:8px;font-weight:700;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        @media print{@page{size:letter;margin:9mm}.page{padding:0}}`;

    feAbrirVentana(esNota ? `NC_${(nota.prefijo || '') + (nota.numero || '')}` : `FE_${feNumero(f)}`, html, css);
}

async function feImprimirTicket(id) {
    const data = await feCargarParaImprimir(id);
    if (!data) return;
    const f = data.factura;
    const e = data.empresa || {};
    const qr = feQrDataURL(f.cufe, 3);
    const ivas = feResumenIva(f.detalles || []);
    const resol = feTextoResolucion(e);

    const html = `
        <div class="t">
            ${f.estado === 'anulada' ? '<div class="c b big">*** FACTURA ANULADA ***</div><hr>' : ''}
            <div class="c b">REPRESENTACIÓN GRÁFICA DE<br>FACTURA ELECTRÓNICA DE VENTA</div>
            <hr>
            ${e.empresa_logo_url ? `<div class="c"><img src="${feEsc(e.empresa_logo_url)}" class="logo"></div>` : ''}
            <div class="c b big">${feEsc(e.empresa_nombre || '')}</div>
            <div class="c">NIT ${feEsc(e.empresa_nit || '')}</div>
            <div class="c">${feEsc(e.empresa_direccion || '')}</div>
            <div class="c">${e.empresa_telefono ? 'Tel: ' + feEsc(e.empresa_telefono) : ''}</div>
            <div class="c">${feEsc(e.empresa_regimen || '')}</div>
            <hr>
            <div class="c b big">No. ${feEsc(feNumero(f))}</div>
            <div>Fecha: ${feEsc((f.fecha_emision || '').substring(0, 16))}</div>
            <div>Cliente: ${feEsc(f.cliente_nombre)}</div>
            <div>${feEsc(feTipoDoc(f.cliente_tipo_documento))}: ${feEsc(f.cliente_identificacion)}-${feEsc(f.cliente_dv)}</div>
            ${f.cliente_direccion && f.cliente_direccion !== '-' ? `<div>Dir: ${feEsc(f.cliente_direccion)}</div>` : ''}
            <hr>
            ${(f.detalles || []).map(d => `
                <div>${feEsc(d.descripcion)}</div>
                <div class="row"><span>${formatNumber(d.cantidad)} x ${feMoney(d.precio)} ${parseFloat(d.iva_porcentaje) > 0 ? 'A' : 'E'}</span><span>${feMoney(d.total)}</span></div>`).join('')}
            <hr>
            <div class="row"><span>SUBTOTAL</span><span>${feMoney(f.subtotal)}</span></div>
            ${ivas.map(i => `<div class="row"><span>IVA ${formatNumber(i.pct)}%</span><span>${feMoney(i.iva)}</span></div>`).join('')}
            ${parseFloat(f.descuento) > 0 ? `<div class="row"><span>DESCUENTO</span><span>-${feMoney(f.descuento)}</span></div>` : ''}
            <div class="row b big"><span>TOTAL</span><span>${feMoney(f.total)}</span></div>
            <hr>
            <div>Forma de pago: ${f.forma_pago == 2 ? `Crédito ${f.dias_credito} días` : 'Contado'}</div>
            <div>Medio de pago: ${feEsc(feMedioPago(f.medio_pago))}</div>
            <hr>
            ${qr ? `<div class="c"><img src="${qr}" class="qr"></div>` : ''}
            <div class="cufe">CUFE: ${feEsc(f.cufe)}</div>
            ${resol ? `<div class="small c">${feEsc(resol)}</div>` : ''}
            <hr>
            <div class="c b">GRACIAS POR SU COMPRA</div>
        </div>`;

    const css = `
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;font-size:11px;color:#000}
        .t{width:72mm;padding:2mm}
        .c{text-align:center}.b{font-weight:700}.big{font-size:13px}
        .row{display:flex;justify-content:space-between;gap:6px}
        hr{border:none;border-top:1px dashed #000;margin:5px 0}
        .logo{max-width:40mm;max-height:20mm}
        .qr{width:34mm;height:34mm;image-rendering:pixelated}
        .cufe{font-size:8px;word-break:break-all;margin:4px 0}
        .small{font-size:8.5px}
        @media print{@page{size:80mm auto;margin:0}}`;

    feAbrirVentana(`Ticket_${feNumero(f)}`, html, css);
}

// ========================================
// CONFIGURACIÓN FE
// ========================================
async function renderConfigFE() {
    const data = await api('/config-fe');
    const container = document.getElementById('page-container');
    if (!data || data.error) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-database"></i><h3>Módulo no instalado</h3><p>${feEsc(data?.mensaje || 'Ejecuta la migración de facturación electrónica en la base de datos.')}</p></div>`;
        return;
    }
    const c = data.config;
    const mun = data.municipio_default;
    const v = k => feEsc(c[k] ?? '');

    container.innerHTML = `
        <div class="fe-config fade-in">
            <div class="card fe-config-card">
                <div class="card-header">
                    <h3><i class="fas fa-plug" style="color:var(--primary);margin-right:8px"></i>Conexión API DIAN</h3>
                    <label class="fe-switch"><input type="checkbox" id="cf-activo" ${c.activo ? 'checked' : ''}><span></span> Activa</label>
                </div>
                <div class="card-body">
                    <div class="form-group"><label>URL de la API</label><input type="text" id="cf-api_url" value="${v('api_url')}"></div>
                    <div class="grid-2">
                        <div class="form-group"><label>Usuario (email)</label><input type="email" id="cf-api_email" value="${v('api_email')}" autocomplete="off"></div>
                        <div class="form-group"><label>Contraseña</label>
                            <div class="pass-wrap"><input type="password" id="cf-api_password" placeholder="${c.tiene_password ? '•••••••• (sin cambios)' : 'Contraseña de la API'}" autocomplete="new-password">
                            <button type="button" class="pass-toggle" onclick="togglePassword(this)"><i class="fas fa-eye"></i></button></div>
                        </div>
                    </div>
                    <label class="fe-check"><input type="checkbox" id="cf-enviar_email" ${c.enviar_email ? 'checked' : ''}> Enviar la factura al email del cliente automáticamente</label>
                    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
                        <button class="btn btn-outline btn-sm" id="cf-probar"><i class="fas fa-satellite-dish"></i> Probar conexión</button>
                    </div>
                    <div id="cf-probar-res"></div>
                </div>
            </div>

            <div class="card fe-config-card">
                <div class="card-header"><h3><i class="fas fa-building" style="color:var(--info);margin-right:8px"></i>Datos del emisor (PDF)</h3></div>
                <div class="card-body">
                    <div class="grid-2">
                        <div class="form-group"><label>Razón social / Nombre</label><input type="text" id="cf-empresa_nombre" value="${v('empresa_nombre')}"></div>
                        <div class="form-group"><label>Propietario</label><input type="text" id="cf-empresa_propietario" value="${v('empresa_propietario')}"></div>
                    </div>
                    <div class="grid-2">
                        <div class="form-group"><label>NIT (con DV)</label><input type="text" id="cf-empresa_nit" value="${v('empresa_nit')}" placeholder="900123456-7"></div>
                        <div class="form-group"><label>Régimen</label>
                            <select id="cf-empresa_regimen" class="filter-select" style="width:100%">${FE.REGIMENES.map(r => `<option ${r === c.empresa_regimen ? 'selected' : ''}>${r}</option>`).join('')}</select>
                        </div>
                    </div>
                    <div class="fe-hint"><i class="fas fa-circle-info"></i> Si el régimen es <b>No responsable de IVA</b> o <b>Simple</b>, todas las facturas salen con IVA 0%. Con <b>Responsable de IVA</b> se usa el % de cada producto (incluido en el precio).</div>
                    <div class="form-group"><label>Dirección</label><input type="text" id="cf-empresa_direccion" value="${v('empresa_direccion')}"></div>
                    <div class="grid-2">
                        <div class="form-group"><label>Teléfono</label><input type="text" id="cf-empresa_telefono" value="${v('empresa_telefono')}"></div>
                        <div class="form-group"><label>Email</label><input type="email" id="cf-empresa_email" value="${v('empresa_email')}"></div>
                    </div>
                    <div class="form-group" style="margin-bottom:0"><label>Logo <small style="color:var(--text-muted);font-weight:500">(aparece en el PDF y el ticket de la factura)</small></label>
                        <div class="cf-logo">
                            <div class="cf-logo-prev" id="cf-logo-prev">${c.empresa_logo_url ? `<img src="${v('empresa_logo_url')}" alt="Logo">` : '<i class="fas fa-image"></i><span>Sin logo</span>'}</div>
                            <div class="cf-logo-acc">
                                <label class="btn btn-primary btn-sm" style="cursor:pointer"><i class="fas fa-upload"></i> ${c.empresa_logo_url ? 'Cambiar logo' : 'Subir logo'}
                                    <input type="file" id="cf-logo-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
                                <button type="button" class="btn btn-ghost btn-sm" id="cf-logo-quitar" style="color:var(--danger);${c.empresa_logo_url ? '' : 'display:none'}"><i class="fas fa-trash"></i> Quitar</button>
                                <div class="cf-logo-hint">PNG o JPG, máximo 3 MB. Mejor con fondo blanco o transparente.</div>
                            </div>
                        </div>
                        <input type="hidden" id="cf-empresa_logo_url" value="${v('empresa_logo_url')}">
                    </div>
                </div>
            </div>

            <div class="card fe-config-card">
                <div class="card-header"><h3><i class="fas fa-stamp" style="color:var(--warning);margin-right:8px"></i>Resolución de numeración</h3></div>
                <div class="card-body">
                    <div class="fe-hint"><i class="fas fa-circle-info"></i> El número y prefijo de cada factura los asigna la API. Estos datos solo se usan en el pie del PDF.</div>
                    <div class="grid-2">
                        <div class="form-group"><label>N° Resolución</label><input type="text" id="cf-resolucion_numero" value="${v('resolucion_numero')}"></div>
                        <div class="form-group"><label>Prefijo</label><input type="text" id="cf-resolucion_prefijo" value="${v('resolucion_prefijo')}"></div>
                    </div>
                    <div class="grid-2">
                        <div class="form-group"><label>Desde N°</label><input type="number" id="cf-resolucion_desde" value="${v('resolucion_desde')}"></div>
                        <div class="form-group"><label>Hasta N°</label><input type="number" id="cf-resolucion_hasta" value="${v('resolucion_hasta')}"></div>
                    </div>
                    <div class="grid-2">
                        <div class="form-group"><label>Fecha resolución</label><input type="date" id="cf-resolucion_fecha" value="${v('resolucion_fecha')}"></div>
                        <div class="form-group"><label>Vigencia hasta</label><input type="date" id="cf-resolucion_vigencia" value="${v('resolucion_vigencia')}"></div>
                    </div>
                </div>
            </div>

            <div class="card fe-config-card">
                <div class="card-header"><h3><i class="fas fa-sliders" style="color:var(--success);margin-right:8px"></i>Valores por defecto</h3></div>
                <div class="card-body">
                    <div class="form-group">
                        <label>Municipio por defecto del cliente</label>
                        ${feMunicipioPickerHTML('cf-mun', c.id_municipio_default, mun ? mun.name : '')}
                        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Se usa cuando el cliente no tiene municipio y su "ciudad" no coincide con ninguno.</div>
                    </div>
                    <div class="form-group"><label>Texto legal del PDF</label><textarea id="cf-nota_legal" rows="4" style="padding-left:14px">${v('nota_legal')}</textarea></div>
                </div>
            </div>
        </div>
        <div class="fe-config-save">
            <button class="btn btn-primary btn-lg" id="cf-guardar"><i class="fas fa-save"></i> Guardar configuración</button>
        </div>`;

    feInitMunicipioPicker('cf-mun');

    const campos = ['api_url', 'api_email', 'api_password', 'empresa_nombre', 'empresa_propietario', 'empresa_nit',
        'empresa_regimen', 'empresa_direccion', 'empresa_telefono', 'empresa_email', 'empresa_logo_url',
        'resolucion_numero', 'resolucion_prefijo', 'resolucion_desde', 'resolucion_hasta', 'resolucion_fecha',
        'resolucion_vigencia', 'nota_legal'];

    async function guardar(silencioso = false) {
        const body = { activo: document.getElementById('cf-activo').checked ? 1 : 0, enviar_email: document.getElementById('cf-enviar_email').checked ? 1 : 0 };
        campos.forEach(k => body[k] = document.getElementById('cf-' + k).value.trim());
        body.id_municipio_default = feMunicipioPickerValue('cf-mun');
        const r = await api('/config-fe', { method: 'PUT', body: JSON.stringify(body) });
        if (r && !r.error) { if (!silencioso) toast('Configuración guardada'); return true; }
        toast(r?.mensaje || 'Error al guardar', 'error');
        return false;
    }

    document.getElementById('cf-guardar').onclick = () => guardar();

    // Logo: se sube al servidor y queda guardado de una vez
    const pintarLogo = url => {
        document.getElementById('cf-empresa_logo_url').value = url || '';
        document.getElementById('cf-logo-prev').innerHTML = url ? `<img src="${feEsc(url)}" alt="Logo">` : '<i class="fas fa-image"></i><span>Sin logo</span>';
        document.getElementById('cf-logo-quitar').style.display = url ? '' : 'none';
    };
    document.getElementById('cf-logo-file').onchange = async e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) { toast('El logo no puede pesar más de 3 MB', 'warning'); return; }
        const prev = document.getElementById('cf-logo-prev');
        prev.innerHTML = '<div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary)"></div>';
        const fd = new FormData();
        fd.append('logo', file);
        const r = await api('/config-fe/logo', { method: 'POST', body: fd });
        if (r && !r.error) { pintarLogo(r.logo_url); toast('Logo actualizado'); }
        else { pintarLogo(document.getElementById('cf-empresa_logo_url').value); toast(r?.mensaje || 'No se pudo subir el logo', 'error'); }
    };
    document.getElementById('cf-logo-quitar').onclick = async () => {
        if (!(await confirmar('Las facturas se imprimirán con el nombre de la empresa en lugar del logo.', { titulo: '¿Quitar el logo?', ok: 'Quitar logo', tipo: 'warning', icono: 'fa-image' }))) return;
        const r = await api('/config-fe/logo', { method: 'DELETE' });
        if (r && !r.error) { pintarLogo(''); toast('Logo eliminado'); } else toast(r?.mensaje || 'Error', 'error');
    };

    document.getElementById('cf-probar').onclick = async () => {
        const btn = document.getElementById('cf-probar');
        const box = document.getElementById('cf-probar-res');
        if (!await guardar(true)) return;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Probando...';
        const r = await api('/config-fe/probar', { method: 'POST', body: '{}' });
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-satellite-dish"></i> Probar conexión';

        if (!r || r.error) {
            box.innerHTML = `<div class="fe-alert danger" style="margin-top:12px"><i class="fas fa-circle-xmark"></i> ${feEsc(r?.mensaje || 'Sin conexión')}</div>`;
            return;
        }
        const lista = Array.isArray(r.resoluciones) ? r.resoluciones
            : (r.resoluciones?.data || r.resoluciones?.resoluciones || r.resoluciones?.resolutions || []);
        window._feResoluciones = lista;
        box.innerHTML = `
            <div class="fe-alert success" style="margin-top:12px">
                <div class="fe-alert-title"><i class="fas fa-circle-check"></i> ${feEsc(r.mensaje)} · Empresa API #${r.company_id}</div>
                ${lista.length ? `<div style="margin-top:8px">${lista.map((x, i) => `
                    <div class="fe-res-row">
                        <span><b>${feEsc(x.prefix || '')}</b> · Res. ${feEsc(x.resolution || '')} · ${feEsc(x.from ?? '')}–${feEsc(x.to ?? '')} ${x.date_to ? '· vence ' + feEsc(x.date_to) : ''} ${x.type_document_name ? '· ' + feEsc(x.type_document_name) : ''}</span>
                        <button class="btn btn-ghost btn-sm" onclick="window._feUsarResolucion(${i})">Usar en PDF</button>
                    </div>`).join('')}</div>` : ''}
            </div>`;
    };

    window._feUsarResolucion = i => {
        const x = window._feResoluciones?.[i];
        if (!x) return;
        const set = (k, val) => { if (val !== undefined && val !== null) document.getElementById('cf-' + k).value = val; };
        set('resolucion_numero', x.resolution);
        set('resolucion_prefijo', x.prefix);
        set('resolucion_desde', x.from);
        set('resolucion_hasta', x.to);
        set('resolucion_fecha', (x.date_from || x.resolution_date || '').substring(0, 10));
        set('resolucion_vigencia', (x.date_to || '').substring(0, 10));
        toast('Datos de resolución cargados. Recuerda guardar.', 'warning');
    };
}

// ========================================
// SELECTOR DE MUNICIPIO (autocomplete)
// ========================================
function feMunicipioPickerHTML(id, selectedId = null, selectedLabel = '') {
    return `
        <div class="fe-ac" id="${id}" data-value="${feEsc(selectedId || '')}">
            <input type="text" class="fe-ac-input" value="${feEsc(selectedLabel || '')}" placeholder="Buscar municipio (ej. Montería)..." autocomplete="off">
            <button type="button" class="fe-ac-clear" title="Quitar"><i class="fas fa-xmark"></i></button>
            <div class="fe-ac-list"></div>
        </div>`;
}

function feInitMunicipioPicker(id) {
    const root = document.getElementById(id);
    if (!root) return;
    const input = root.querySelector('.fe-ac-input');
    const list = root.querySelector('.fe-ac-list');

    const buscar = debounce(async () => {
        const q = input.value.trim();
        if (q.length < 2) { list.classList.remove('show'); return; }
        const r = await api('/dian/municipios?q=' + encodeURIComponent(q));
        const items = r?.municipios || [];
        list.innerHTML = items.length
            ? items.map(m => `<div class="fe-ac-item" data-id="${m.id}" data-label="${feEsc(m.name.trim())}"><b>${feEsc(m.name.trim())}</b> <span>${feEsc(m.departamento)} · ${m.code}</span></div>`).join('')
            : '<div class="fe-ac-empty">Sin resultados</div>';
        list.classList.add('show');
    }, 250);

    input.addEventListener('input', () => { root.dataset.value = ''; buscar(); });
    input.addEventListener('focus', () => { if (input.value.length >= 2 && !root.dataset.value) buscar(); });
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('show'), 200));
    list.addEventListener('mousedown', e => {
        const it = e.target.closest('.fe-ac-item');
        if (!it) return;
        root.dataset.value = it.dataset.id;
        input.value = it.dataset.label;
        list.classList.remove('show');
    });
    root.querySelector('.fe-ac-clear').onclick = () => { root.dataset.value = ''; input.value = ''; input.focus(); };
}

function feMunicipioPickerValue(id) {
    return document.getElementById(id)?.dataset.value || null;
}

// ========================================
// CAMPOS FISCALES: CLIENTE Y PRODUCTO
// ========================================
function feClienteFieldsHTML(c = null) {
    return `
        <div class="fe-fiscal">
            <div class="fe-fiscal-title"><i class="fas fa-file-invoice-dollar"></i> Datos para factura electrónica</div>
            <div class="grid-2">
                <div class="form-group"><label>Tipo de documento</label>
                    <select id="m-cli-tipodoc" class="filter-select" style="width:100%">${feOptions(FE.TIPOS_DOC, c?.tipo_documento || '13')}</select>
                </div>
                <div class="form-group"><label>Tipo de persona</label>
                    <select id="m-cli-tipoorg" class="filter-select" style="width:100%">${feOptions([[2, 'Persona natural'], [1, 'Persona jurídica']], c?.tipo_organizacion || 2)}</select>
                </div>
            </div>
            <div class="grid-2">
                <div class="form-group"><label>Responsabilidad fiscal</label>
                    <select id="m-cli-resp" class="filter-select" style="width:100%">${feOptions(FE.RESPONSABILIDADES, c?.id_responsabilidad || 4)}</select>
                </div>
                <div class="form-group"><label>Municipio (DIAN)</label>
                    ${feMunicipioPickerHTML('m-cli-mun', c?.id_municipio, '')}
                </div>
            </div>
        </div>`;
}

function feInitClienteFields(c = null) {
    feInitMunicipioPicker('m-cli-mun');
    if (c?.id_municipio) {
        api('/dian/municipios?id=' + c.id_municipio).then(r => {
            const m = r?.municipios?.[0];
            const input = document.querySelector('#m-cli-mun .fe-ac-input');
            if (m && input) input.value = m.name.trim();
        });
    }
}

function feClienteFieldsValues() {
    if (!document.getElementById('m-cli-tipodoc')) return {};
    return {
        tipo_documento: document.getElementById('m-cli-tipodoc').value,
        tipo_organizacion: parseInt(document.getElementById('m-cli-tipoorg').value),
        id_responsabilidad: parseInt(document.getElementById('m-cli-resp').value),
        id_municipio: feMunicipioPickerValue('m-cli-mun'),
    };
}

function feProductoFieldsHTML(p = null) {
    const iva = p?.iva != null ? parseFloat(p.iva) : 0;
    return `
        <div class="grid-2">
            <div class="form-group"><label>IVA (incluido en el precio)</label>
                <select id="m-prod-iva" class="filter-select" style="width:100%">${feOptions([[0, '0% - Excluido / Exento'], [5, '5%'], [19, '19%']], iva)}</select>
            </div>
            <div class="form-group"><label>Unidad de medida (DIAN)</label>
                <select id="m-prod-unidad" class="filter-select" style="width:100%">${feOptions(FE.UNIDADES, p?.unit_measure_id || 70)}</select>
            </div>
        </div>`;
}

function feProductoFieldsValues() {
    if (!document.getElementById('m-prod-iva')) return {};
    return {
        iva: parseFloat(document.getElementById('m-prod-iva').value) || 0,
        unit_measure_id: parseInt(document.getElementById('m-prod-unidad').value) || 70,
    };
}

// ========================================
// ANULAR CON NOTA CRÉDITO
// ========================================
async function feAnular(id) {
    const data = await api(`/facturas/${id}`);
    if (!data || data.error) return;
    const f = data.factura;
    const lineas = (f.detalles || []).map(d => ({ ...d, disponible: Math.max(0, parseFloat(d.cantidad) - parseFloat(d.devuelto || 0)) }));
    const hayDevoluciones = lineas.some(l => parseFloat(l.devuelto || 0) > 0);
    let concepto = hayDevoluciones ? 1 : 2;

    openModal('Emitir Nota Crédito', `
        <div class="fe-nc-sub"><i class="fas fa-file-circle-minus"></i> Factura <b>${feEsc(feNumero(f))}</b> — ${feEsc(f.cliente_nombre)} — <b>${feMoney(f.total)}</b></div>
        <div class="fe-box-title" style="margin-top:16px">Concepto DIAN *</div>
        <div class="fe-nc-conceptos">
            ${FE.CONCEPTOS_NC.map(([v, t, d, on]) => {
                const bloqueada = v === 2 && hayDevoluciones;
                return `
                <label class="fe-nc-concepto ${on && !bloqueada ? 'on' : 'off'}">
                    <input type="radio" name="fe-nc-concepto" value="${v}" ${v === concepto ? 'checked' : ''} ${on && !bloqueada ? '' : 'disabled'}>
                    <div><strong>${v}. ${t}</strong><span>${bloqueada ? 'No disponible: la factura ya tiene devoluciones. Devuelve lo que falta con el concepto 1.' : d}</span></div>
                </label>`;
            }).join('')}
        </div>
        <div id="fe-nc-devol" style="display:none;margin-top:14px">
            <div class="fe-box-title">Productos a devolver</div>
            <div class="fe-nc-tabla">
                ${lineas.map((l, i) => `
                    <div class="fe-nc-fila ${l.disponible <= 0 ? 'agotada' : ''}">
                        <div class="fe-nc-prod"><strong>${feEsc(l.descripcion)}</strong>
                            <span>${feMoney(l.precio)} c/u · facturado ${formatNumber(l.cantidad)}${parseFloat(l.devuelto || 0) > 0 ? ` · ya devuelto ${formatNumber(l.devuelto)}` : ''}</span></div>
                        <div class="fe-nc-cant">
                            ${l.disponible > 0 ? `
                                <input type="number" min="0" max="${l.disponible}" step="1" value="0" data-i="${i}" class="fe-nc-input">
                                <button type="button" class="btn btn-ghost btn-sm fe-nc-todo" data-i="${i}" title="Devolver todo lo disponible">Todo (${formatNumber(l.disponible)})</button>`
                            : '<span class="fe-nc-agotado">Devuelto completo</span>'}
                        </div>
                    </div>`).join('')}
            </div>
            <div class="fe-nc-total" id="fe-nc-total"></div>
        </div>
        <div class="form-group" style="margin-top:16px">
            <label>Motivo / descripción *</label>
            <textarea id="fe-nc-motivo" rows="2" maxlength="250" style="padding-left:14px" placeholder="Ej: El cliente devolvió producto en mal estado"></textarea>
        </div>
        <div class="fe-alert warning" style="margin:0" id="fe-nc-aviso"></div>
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn fe-btn-nc" id="fe-nc-enviar"><i class="fas fa-paper-plane"></i> Emitir Nota Crédito</button>
    `);
    document.getElementById('modal-container').classList.add('modal-nc');

    const $ = i => document.getElementById(i);
    const cantidades = () => [...document.querySelectorAll('.fe-nc-input')].map(inp => ({ i: +inp.dataset.i, cant: Math.min(Math.max(0, parseFloat(inp.value) || 0), lineas[+inp.dataset.i].disponible) }));
    const totalDevolucion = () => cantidades().reduce((s, c) => {
        const l = lineas[c.i];
        const desc = parseFloat(l.cantidad) > 0 ? parseFloat(l.descuento || 0) * c.cant / parseFloat(l.cantidad) : 0;
        return s + c.cant * parseFloat(l.precio) - desc;
    }, 0);
    const pintar = () => {
        $('fe-nc-devol').style.display = concepto === 1 ? '' : 'none';
        $('fe-nc-aviso').innerHTML = concepto === 1
            ? '<i class="fas fa-triangle-exclamation"></i> <b>Importante:</b> la Nota Crédito queda registrada en la DIAN permanentemente. Los productos devueltos <b>vuelven al inventario</b>.'
            : '<i class="fas fa-triangle-exclamation"></i> <b>Importante:</b> la Nota Crédito queda registrada en la DIAN permanentemente. La factura quedará <b>Anulada</b> y el pedido se podrá volver a facturar.';
        if (concepto === 1) {
            const t = totalDevolucion(), n = cantidades().filter(c => c.cant > 0).length;
            $('fe-nc-total').innerHTML = n ? `<span>${n} producto${n > 1 ? 's' : ''} a devolver</span><strong>${feMoney(t)}</strong>` : '<span>Indica la cantidad a devolver</span><strong>$0</strong>';
        }
    };
    document.querySelectorAll('input[name="fe-nc-concepto"]').forEach(r => r.onchange = () => { concepto = +r.value; pintar(); });
    document.querySelectorAll('.fe-nc-input').forEach(inp => inp.oninput = pintar);
    document.querySelectorAll('.fe-nc-todo').forEach(b => b.onclick = () => {
        const inp = document.querySelector(`.fe-nc-input[data-i="${b.dataset.i}"]`);
        inp.value = lineas[+b.dataset.i].disponible; pintar();
    });
    pintar();

    $('fe-nc-enviar').onclick = async () => {
        const motivo = $('fe-nc-motivo').value.trim();
        if (motivo.length < 5) { toast('Escribe el motivo de la nota crédito', 'warning'); $('fe-nc-motivo').focus(); return; }
        const body = { concepto, motivo };
        let valor = parseFloat(f.total);
        if (concepto === 1) {
            for (const c of cantidades()) {
                if (c.cant > lineas[c.i].disponible) { toast('Hay cantidades mayores a lo disponible', 'warning'); return; }
            }
            body.lineas = cantidades().filter(c => c.cant > 0).map(c => ({ id_detalle: lineas[c.i].id_detalle, cantidad: c.cant }));
            if (!body.lineas.length) { toast('Indica la cantidad a devolver de al menos un producto', 'warning'); return; }
            valor = totalDevolucion();
        }
        if (!(await confirmar(`Quedará registrada en la DIAN de forma permanente. Esta acción no se puede deshacer.`, {
            titulo: 'Emitir nota crédito', ok: '<i class="fas fa-paper-plane"></i> Emitir nota crédito', tipo: 'dian', icono: 'fa-file-circle-minus',
            detalle: `<div><span>Tipo</span><b>${concepto === 1 ? 'Devolución' : 'Anulación'}</b></div><div><span>Factura</span><b>${feEsc(feNumero(f))}</b></div><div><span>Valor</span><b>${feMoney(valor)}</b></div>`,
        }))) return;

        $('modal-body').innerHTML = `
            <div class="fe-sending">
                <div class="fe-sending-icon" style="background:var(--gradient-warm)"><i class="fas fa-file-circle-minus"></i></div>
                <h3>Enviando Nota Crédito a la DIAN...</h3>
                <p>Firmando y validando el documento. No cierres esta ventana.</p>
            </div>`;
        $('modal-footer').innerHTML = '';

        const r = await api(`/facturas/${id}/nota-credito`, { method: 'POST', body: JSON.stringify(body) });
        if (r && !r.error) {
            const n = r.nota || {};
            $('modal-body').innerHTML = `
                <div class="fe-result ok">
                    <div class="fe-result-icon"><i class="fas fa-check"></i></div>
                    <h3>${concepto === 1 ? 'Devolución registrada' : 'Factura anulada'}</h3>
                    <div class="fe-result-num">${feEsc((n.prefijo || '') + (n.numero || ''))}</div>
                    <p>${feEsc(r.mensaje || '')}</p>
                    <div class="fe-cufe">${feEsc(n.cufe || '')}</div>
                </div>`;
            $('modal-footer').innerHTML = `
                <button class="btn btn-outline" onclick="feImprimirCarta(${id}, ${n.id_nota})"><i class="fas fa-file-pdf"></i> PDF de la nota</button>
                <button class="btn btn-primary" onclick="closeModal();viewFactura(${id})">Ver factura</button>`;
            toast(r.mensaje || 'Nota crédito autorizada');
        } else {
            const errores = r?.errores?.length ? r.errores : [];
            $('modal-body').innerHTML = `
                <div class="fe-result bad">
                    <div class="fe-result-icon"><i class="fas fa-xmark"></i></div>
                    <h3>No se pudo emitir la nota crédito</h3>
                    <p>${feEsc(r?.mensaje || 'Error desconocido')}</p>
                </div>
                ${errores.length ? `<div class="fe-alert danger"><ul>${errores.map(e => `<li>${feEsc(e)}</li>`).join('')}</ul></div>` : ''}`;
            $('modal-footer').innerHTML = `<button class="btn btn-outline" onclick="closeModal();viewFactura(${id})">Cerrar</button>`;
        }
    };
}
