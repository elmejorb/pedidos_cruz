/* ========================================
   PEDIDOS CRUZ - Créditos y Pagos
   Pedidos a crédito, cartera y registro de abonos
   ======================================== */

const CR = {
    MEDIOS: [
        ['efectivo', 'Efectivo', 'fa-money-bill-wave'],
        ['transferencia', 'Transferencia', 'fa-building-columns'],
        ['nequi', 'Nequi', 'fa-mobile-screen'],
        ['daviplata', 'Daviplata', 'fa-mobile-screen-button'],
        ['consignacion', 'Consignación', 'fa-receipt'],
        ['tarjeta', 'Tarjeta', 'fa-credit-card'],
        ['cheque', 'Cheque', 'fa-money-check'],
        ['otro', 'Otro', 'fa-ellipsis'],
    ],
    PLAZOS: [8, 15, 30, 45, 60],
};

function crEsc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function crMoney(n) {
    return '$' + Math.round(parseFloat(n || 0)).toLocaleString('es-CO');
}

function crMedio(code) {
    return CR.MEDIOS.find(m => m[0] === code) || [code, code, 'fa-circle'];
}

function crHoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function crFecha(s) {
    if (!s) return '-';
    const [y, m, d] = String(s).substring(0, 10).split('-');
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Fecha de vencimiento = fecha del pedido + días */
function crVence(fechaPedido, dias) {
    const d = new Date(String(fechaPedido).replace(' ', 'T'));
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (parseInt(dias) || 0));
    return d;
}

function crDiasVencido(fechaPedido, dias) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((hoy - crVence(fechaPedido, dias)) / 86400000);
}

/** Estado del crédito: pagado | vencido | por_vencer | al_dia */
function crEstado(saldo, diasVencido) {
    if (parseFloat(saldo) <= 0.009) return { key: 'pagado', label: 'Pagado', icon: 'fa-circle-check' };
    if (diasVencido > 0) return { key: 'vencido', label: `Vencido ${diasVencido}d`, icon: 'fa-triangle-exclamation' };
    if (diasVencido >= -3) return { key: 'por-vencer', label: diasVencido === 0 ? 'Vence hoy' : `Vence en ${-diasVencido}d`, icon: 'fa-hourglass-half' };
    return { key: 'al-dia', label: `Al día · ${-diasVencido}d`, icon: 'fa-clock' };
}

// ========================================
// SELECTOR CONTADO / CRÉDITO (wizard y edición)
// ========================================
function crFormaPagoHTML(prefix, forma = 'contado', dias = 30) {
    const credito = forma === 'credito';
    return `
        <div class="cr-forma" id="${prefix}-forma" data-forma="${credito ? 'credito' : 'contado'}">
            <label class="cr-forma-label">Tipo de pedido</label>
            <div class="cr-toggle">
                <button type="button" class="cr-toggle-btn ${!credito ? 'active' : ''}" data-forma="contado"><i class="fas fa-money-bill-wave"></i> Contado</button>
                <button type="button" class="cr-toggle-btn ${credito ? 'active credito' : ''}" data-forma="credito"><i class="fas fa-handshake"></i> Crédito</button>
            </div>
            <div class="cr-plazo" style="${credito ? '' : 'display:none'}">
                <label class="cr-forma-label">Plazo (días)</label>
                <div class="cr-plazo-row">
                    ${CR.PLAZOS.map(d => `<button type="button" class="cr-plazo-chip ${parseInt(dias) === d ? 'active' : ''}" data-dias="${d}">${d}</button>`).join('')}
                    <input type="number" min="1" max="365" class="cr-plazo-input" value="${parseInt(dias) || 30}">
                </div>
                <div class="cr-plazo-vence"></div>
            </div>
        </div>`;
}

/** fechaBase: fecha del pedido (en edición); por defecto hoy */
function crInitFormaPago(prefix, onChange, fechaBase = null) {
    const root = document.getElementById(prefix + '-forma');
    if (!root) return;
    const plazo = root.querySelector('.cr-plazo');
    const input = root.querySelector('.cr-plazo-input');
    const vence = root.querySelector('.cr-plazo-vence');

    const pintarVence = () => {
        const d = crVence(fechaBase || new Date().toISOString(), input.value);
        const vencido = d < new Date().setHours(0, 0, 0, 0);
        vence.innerHTML = `<i class="fas fa-calendar-day"></i> Vence el <strong>${d.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</strong>${vencido ? ' <span style="color:var(--danger);font-weight:700">(ya vencido)</span>' : ''}`;
        root.querySelectorAll('.cr-plazo-chip').forEach(c => c.classList.toggle('active', parseInt(c.dataset.dias) === parseInt(input.value)));
        onChange && onChange(crFormaPagoValue(prefix));
    };

    root.querySelectorAll('.cr-toggle-btn').forEach(b => b.onclick = () => {
        root.dataset.forma = b.dataset.forma;
        root.querySelectorAll('.cr-toggle-btn').forEach(x => x.classList.remove('active', 'credito'));
        b.classList.add('active');
        if (b.dataset.forma === 'credito') b.classList.add('credito');
        plazo.style.display = b.dataset.forma === 'credito' ? '' : 'none';
        pintarVence();
    });
    root.querySelectorAll('.cr-plazo-chip').forEach(c => c.onclick = () => { input.value = c.dataset.dias; pintarVence(); });
    input.oninput = pintarVence;
    pintarVence();
}

function crFormaPagoValue(prefix) {
    const root = document.getElementById(prefix + '-forma');
    if (!root) return {};
    const credito = root.dataset.forma === 'credito';
    return { forma_pago: credito ? 'credito' : 'contado', dias_credito: credito ? (parseInt(root.querySelector('.cr-plazo-input').value) || 0) : 0 };
}

// ========================================
// CHIP EN LISTADO DE PEDIDOS
// ========================================
function crPedidoChip(p) {
    if (p.forma_pago !== 'credito') return '';
    if (p.saldo === undefined) return `<span class="cr-chip"><i class="fas fa-handshake"></i>Crédito</span>`;
    if (parseFloat(p.saldo) <= 0.009) return `<span class="cr-chip ok"><i class="fas fa-circle-check"></i>Pagado</span>`;
    const venc = crDiasVencido(p.fecha_pedido, p.dias_credito) > 0;
    return `<span class="cr-chip ${venc ? 'bad' : ''}" title="Saldo pendiente"><i class="fas fa-handshake"></i>Debe ${crMoney(p.saldo)}</span>`;
}

// ========================================
// CARD EN DETALLE DEL PEDIDO
// ========================================
function crCardPedido(p) {
    if (p.forma_pago !== 'credito' || p.saldo === undefined) return '';
    const total = parseFloat(p.total);
    const pagado = parseFloat(p.pagado || 0);
    const saldo = parseFloat(p.saldo);
    const pct = total > 0 ? Math.min(100, Math.round(pagado / total * 100)) : 0;
    const dv = crDiasVencido(p.fecha_pedido, p.dias_credito);
    const est = crEstado(saldo, dv);
    const pagos = p.pagos || [];
    const admin = state.usuario?.rol === 'admin';

    return `
        <div class="card cr-card ${est.key}" style="margin-bottom:20px">
            <div class="card-body">
                <div class="cr-card-head">
                    <div class="cr-card-title"><i class="fas fa-handshake"></i> Crédito a ${p.dias_credito} días</div>
                    <span class="cr-badge ${est.key}"><i class="fas ${est.icon}"></i> ${est.label}</span>
                </div>
                <div class="cr-saldo-label">${saldo > 0 ? 'Saldo pendiente' : 'Crédito saldado'}</div>
                <div class="cr-saldo">${crMoney(Math.max(0, saldo))}</div>
                <div class="cr-progress"><div style="width:${pct}%"></div></div>
                <div class="cr-progress-legend"><span>Pagado ${crMoney(pagado)} (${pct}%)</span><span>Total ${crMoney(total)}</span></div>
                <div class="cr-vence"><i class="fas fa-calendar-day"></i> Vence: <strong>${crVence(p.fecha_pedido, p.dias_credito).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
                ${saldo > 0 && p.estado !== 'cancelado' ? `
                    <button class="btn btn-block cr-btn-pagar" onclick="crAbrirPago(${p.id_pedido})"><i class="fas fa-hand-holding-dollar"></i> Registrar pago</button>` : ''}
                ${pagos.length ? `
                    <div class="cr-pagos-title">Pagos (${pagos.filter(x => !+x.anulado).length})</div>
                    <div class="cr-pagos">
                        ${pagos.map(x => {
                            const m = crMedio(x.medio_pago);
                            return `
                            <div class="cr-pago ${+x.anulado ? 'anulado' : ''}">
                                <div class="cr-pago-icon"><i class="fas ${m[2]}"></i></div>
                                <div class="cr-pago-info">
                                    <div><strong>${crMoney(x.valor)}</strong> · ${m[1]}${x.referencia ? ` <span class="cr-ref">#${crEsc(x.referencia)}</span>` : ''}</div>
                                    <div class="cr-pago-meta">${crFecha(x.fecha)} · ${crEsc(x.usuario_nombre || '')}${+x.anulado ? ` · <span style="color:var(--danger)">ANULADO: ${crEsc(x.motivo_anulacion || '')}</span>` : ''}</div>
                                </div>
                                ${!+x.anulado ? `
                                    <button class="btn btn-ghost btn-sm" title="Imprimir recibo" onclick="crImprimirRecibo(${x.id_pago})"><i class="fas fa-print"></i></button>
                                    ${admin ? `<button class="btn btn-ghost btn-sm" title="Anular pago" style="color:var(--danger)" onclick="crAnularPago(${x.id_pago}, () => viewPedido(${p.id_pedido}))"><i class="fas fa-ban"></i></button>` : ''}` : ''}
                            </div>`;
                        }).join('')}
                    </div>` : ''}
            </div>
        </div>`;
}

// ========================================
// REGISTRAR PAGO
// ========================================
async function crAbrirPago(idPedido, onDone = null) {
    const data = await api(`/pedidos/${idPedido}`);
    if (!data || data.error) return;
    const p = data.pedido;
    const pendienteOff = typeof offAbonosPendientes === 'function' ? offAbonosPendientes(idPedido) : 0;
    const saldo = Math.max(0, parseFloat(p.saldo || 0) - pendienteOff);
    if (saldo <= 0) { toast(pendienteOff ? 'Este crédito queda saldado con los abonos pendientes de sincronizar' : 'Este crédito ya está pagado', 'warning'); return; }

    const cliente = p.cliente?.razon_social || p.cliente?.nombre || '';
    openModal('Registrar pago', `
        <div class="cr-pago-head">
            <div>
                <div class="cr-pago-head-cli">${crEsc(cliente)}</div>
                <div class="cr-pago-head-sub">Pedido ${crEsc(p.numero_pedido)} · Total ${crMoney(p.total)} · Pagado ${crMoney(p.pagado)}${pendienteOff ? ` · <b>${crMoney(pendienteOff)} sin sincronizar</b>` : ''}</div>
            </div>
            <div style="text-align:right">
                <div class="cr-pago-head-sub">SALDO</div>
                <div class="cr-pago-head-saldo">${crMoney(saldo)}</div>
            </div>
        </div>
        <div class="form-group">
            <label>Valor del pago *</label>
            <div class="cr-valor-wrap">
                <span>$</span>
                <input type="text" inputmode="numeric" id="cr-valor" class="cr-valor" value="${Math.round(saldo).toLocaleString('es-CO')}" autocomplete="off">
                <button type="button" class="btn btn-ghost btn-sm" id="cr-total">Saldo total</button>
            </div>
            <div id="cr-valor-hint" class="cr-valor-hint"></div>
        </div>
        <div class="form-group">
            <label>Medio de pago</label>
            <div class="cr-medios">
                ${CR.MEDIOS.map(([v, l, i], k) => `<button type="button" class="cr-medio ${k === 0 ? 'active' : ''}" data-medio="${v}"><i class="fas ${i}"></i><span>${l}</span></button>`).join('')}
            </div>
        </div>
        <div class="grid-2">
            <div class="form-group"><label>Fecha</label><input type="date" id="cr-fecha" value="${crHoy()}" max="${crHoy()}" style="padding-left:14px"></div>
            <div class="form-group"><label>Referencia / comprobante</label><input type="text" id="cr-ref" maxlength="100" placeholder="Opcional"></div>
        </div>
        <div class="form-group" style="margin-bottom:0"><label>Notas</label><input type="text" id="cr-notas" maxlength="255" placeholder="Opcional"></div>
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn cr-btn-pagar" id="cr-guardar"><i class="fas fa-check"></i> Registrar pago</button>
    `);

    const input = document.getElementById('cr-valor');
    const hint = document.getElementById('cr-valor-hint');
    let medio = 'efectivo';

    const leer = () => parseInt(input.value.replace(/\D/g, '')) || 0;
    const pintar = () => {
        const v = leer();
        input.value = v ? v.toLocaleString('es-CO') : '';
        const resta = Math.round(saldo - v);
        if (v > Math.round(saldo)) { hint.className = 'cr-valor-hint bad'; hint.textContent = `Supera el saldo por ${crMoney(v - saldo)}`; }
        else if (v <= 0) { hint.className = 'cr-valor-hint bad'; hint.textContent = 'Ingresa un valor'; }
        else if (resta <= 0) { hint.className = 'cr-valor-hint ok'; hint.innerHTML = '<i class="fas fa-circle-check"></i> Con este pago el crédito queda saldado'; }
        else { hint.className = 'cr-valor-hint'; hint.textContent = `Abono parcial · quedará debiendo ${crMoney(resta)}`; }
    };
    input.oninput = pintar;
    input.onfocus = () => input.select();
    document.getElementById('cr-total').onclick = () => { input.value = Math.round(saldo); pintar(); };
    document.querySelectorAll('.cr-medio').forEach(b => b.onclick = () => {
        medio = b.dataset.medio;
        document.querySelectorAll('.cr-medio').forEach(x => x.classList.toggle('active', x === b));
    });
    pintar();

    document.getElementById('cr-guardar').onclick = async () => {
        const valor = Math.min(leer(), saldo);
        if (leer() <= 0 || leer() > Math.round(saldo)) { pintar(); input.focus(); return; }
        const btn = document.getElementById('cr-guardar');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const r = await api('/pagos', {
            method: 'POST',
            body: JSON.stringify({
                id_pedido: idPedido, valor, medio_pago: medio,
                fecha: document.getElementById('cr-fecha').value || null,
                referencia: document.getElementById('cr-ref').value.trim() || null,
                notas: document.getElementById('cr-notas').value.trim() || null,
            }),
            offResumen: { numero_pedido: p.numero_pedido, cliente },
        });

        if (r && r.offline) {
            toast(r.mensaje, 'warning', 6000);
            document.getElementById('modal-body').innerHTML = `
                <div class="cr-ok">
                    <div class="cr-ok-icon" style="background:var(--gradient-warm)"><i class="fas fa-cloud-arrow-up"></i></div>
                    <h3>Abono guardado sin conexión</h3>
                    <div class="cr-ok-valor" style="color:#B45309">${crMoney(valor)}</div>
                    <p>${crEsc(cliente)} · ${crMedio(medio)[1]}</p>
                    <p class="cr-ok-saldo">Quedó como <strong>${crEsc(r.temporal)}</strong>. Se enviará solo cuando vuelva la señal.<br>Saldo estimado: <strong>${crMoney(Math.max(0, saldo - valor))}</strong></p>
                </div>`;
            document.getElementById('modal-footer').innerHTML = `<button class="btn btn-primary" id="cr-cerrar">Listo</button>`;
            document.getElementById('cr-cerrar').onclick = () => { closeModal(); onDone ? onDone() : viewPedido(idPedido); };
            return;
        }

        if (r && !r.error) {
            toast(r.mensaje || 'Pago registrado');
            document.getElementById('modal-body').innerHTML = `
                <div class="cr-ok">
                    <div class="cr-ok-icon"><i class="fas fa-check"></i></div>
                    <h3>${r.saldo <= 0 ? '¡Crédito saldado!' : 'Pago registrado'}</h3>
                    <div class="cr-ok-valor">${crMoney(r.pago.valor)}</div>
                    <p>${crEsc(cliente)} · ${crMedio(r.pago.medio_pago)[1]}</p>
                    <p class="cr-ok-saldo">${r.saldo <= 0 ? 'Sin saldo pendiente' : 'Saldo pendiente: <strong>' + crMoney(r.saldo) + '</strong>'}</p>
                </div>`;
            document.getElementById('modal-footer').innerHTML = `
                <button class="btn btn-outline" onclick="crImprimirRecibo(${r.pago.id_pago})"><i class="fas fa-print"></i> Imprimir recibo</button>
                <button class="btn btn-primary" id="cr-cerrar">Listo</button>`;
            document.getElementById('cr-cerrar').onclick = () => { closeModal(); onDone ? onDone() : viewPedido(idPedido); };
        } else {
            toast(r?.mensaje || 'No se pudo registrar el pago', 'error');
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Registrar pago';
        }
    };
    setTimeout(() => input.focus(), 100);
}

function crAnularPago(idPago, onDone) {
    openModal('Anular pago', `
        <p style="color:var(--text-secondary);margin-bottom:14px">El pago quedará en el historial como <strong>anulado</strong> y su valor volverá al saldo del crédito.</p>
        <div class="form-group" style="margin-bottom:0"><label>Motivo *</label><input type="text" id="cr-motivo" maxlength="255" placeholder="Ej: la transferencia no llegó"></div>
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-danger" id="cr-anular-ok"><i class="fas fa-ban"></i> Anular pago</button>
    `);
    document.getElementById('cr-anular-ok').onclick = async () => {
        const motivo = document.getElementById('cr-motivo').value.trim();
        if (!motivo) { toast('Indica el motivo', 'warning'); return; }
        const r = await api(`/pagos/${idPago}/anular`, { method: 'PUT', body: JSON.stringify({ motivo }) });
        if (r && !r.error) { toast('Pago anulado'); closeModal(); onDone && onDone(); }
        else toast(r?.mensaje || 'No se pudo anular', 'error');
    };
}

// ========================================
// RECIBO DE PAGO (ticket 80mm)
// ========================================
async function crImprimirRecibo(idPago) {
    const r = await api(`/pagos/${idPago}`);
    if (!r || r.error) { toast('No se pudo cargar el pago', 'error'); return; }
    const x = r.pago;
    const cli = x.cliente || {};
    const html = `
        <div class="t">
            <div class="c b big">PEDIDOS CRUZ</div>
            <div class="c">RECIBO DE PAGO No. ${String(x.id_pago).padStart(6, '0')}</div>
            <hr>
            <div class="row"><span>Fecha:</span><span>${crFecha(x.fecha)}</span></div>
            <div>Cliente: <b>${crEsc(cli.razon_social || cli.nombre || '')}</b></div>
            ${cli.razon_social && cli.nombre ? `<div>${crEsc(cli.nombre)}</div>` : ''}
            ${cli.nit_cedula ? `<div>NIT/CC: ${crEsc(cli.nit_cedula)}</div>` : ''}
            <div>Pedido: ${crEsc(x.pedido?.numero_pedido || '')}</div>
            <hr>
            <div class="row b big"><span>VALOR PAGADO</span><span>${crMoney(x.valor)}</span></div>
            <div class="row"><span>Medio:</span><span>${crMedio(x.medio_pago)[1]}${x.referencia ? ' #' + crEsc(x.referencia) : ''}</span></div>
            <hr>
            <div class="row"><span>Total pedido</span><span>${crMoney(x.pedido?.total)}</span></div>
            <div class="row"><span>Total abonado</span><span>${crMoney(r.pagado)}</span></div>
            <div class="row b"><span>SALDO</span><span>${crMoney(Math.max(0, r.saldo))}</span></div>
            ${x.notas ? `<hr><div>Nota: ${crEsc(x.notas)}</div>` : ''}
            <hr>
            <div>Recibido por: ${crEsc(x.usuario?.nombre || '')}</div>
            <br><br>
            <div class="c">_______________________</div>
            <div class="c">Firma</div>
            ${x.anulado ? '<hr><div class="c b big">*** ANULADO ***</div>' : ''}
        </div>`;
    const css = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000}
        .t{width:72mm;padding:2mm}.c{text-align:center}.b{font-weight:700}.big{font-size:14px}
        .row{display:flex;justify-content:space-between;gap:6px}hr{border:none;border-top:1px dashed #000;margin:6px 0}
        @media print{@page{size:80mm auto;margin:0}}`;
    const win = window.open('', '_blank', 'width=400,height=640');
    if (!win) { toast('Permite las ventanas emergentes para imprimir', 'warning'); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recibo ${x.id_pago}</title><style>${css}</style></head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
    win.document.close();
}

// ========================================
// PÁGINA CARTERA Y PAGOS
// ========================================
async function renderCartera() {
    const container = document.getElementById('page-container');
    const yearNow = new Date().getFullYear();
    container.innerHTML = `
        <div class="stats-grid fade-in" id="cr-stats"></div>
        <div id="off-pendientes" data-tipo="pago"></div>
        <div class="cr-tabs">
            <button class="cr-tab active" data-tab="cartera"><i class="fas fa-hand-holding-dollar"></i> Cartera</button>
            <button class="cr-tab" data-tab="pagos"><i class="fas fa-clock-rotate-left"></i> Pagos recibidos</button>
        </div>
        <div id="cr-tab-body"></div>`;

    let tab = 'cartera';
    let rutas = [];
    api('/rutas').then(r => { rutas = r?.rutas || []; const s = document.getElementById('cr-ruta'); if (s) fillRutas(s); });
    const fillRutas = sel => rutas.forEach(r => { const o = document.createElement('option'); o.value = r.id_ruta; o.textContent = r.nombre; sel.appendChild(o); });

    function pintarStats(res) {
        document.getElementById('cr-stats').innerHTML = `
            <div class="stat-card purple"><div class="stat-icon purple"><i class="fas fa-sack-dollar"></i></div>
                <div class="stat-info"><h4>Cartera por cobrar</h4><div class="stat-value">${crMoney(res.cartera_total)}</div><div class="cr-stat-sub">${res.creditos_abiertos} crédito${res.creditos_abiertos == 1 ? '' : 's'} abierto${res.creditos_abiertos == 1 ? '' : 's'}</div></div></div>
            <div class="stat-card orange"><div class="stat-icon orange"><i class="fas fa-triangle-exclamation"></i></div>
                <div class="stat-info"><h4>Vencida</h4><div class="stat-value">${crMoney(res.vencida_total)}</div><div class="cr-stat-sub">${res.creditos_vencidos} vencido${res.creditos_vencidos == 1 ? '' : 's'}</div></div></div>
            <div class="stat-card green"><div class="stat-icon green"><i class="fas fa-hand-holding-dollar"></i></div>
                <div class="stat-info"><h4>Cobrado hoy</h4><div class="stat-value">${crMoney(res.cobrado_hoy)}</div></div></div>
            <div class="stat-card blue"><div class="stat-icon blue"><i class="fas fa-calendar-check"></i></div>
                <div class="stat-info"><h4>Cobrado este mes</h4><div class="stat-value">${crMoney(res.cobrado_mes)}</div></div></div>`;
    }

    // ---------- TAB CARTERA ----------
    async function tabCartera() {
        const body = document.getElementById('cr-tab-body');
        body.innerHTML = `
            <div class="toolbar">
                <div class="search-box"><input type="text" id="cr-buscar" placeholder="Buscar cliente o # pedido..."><i class="fas fa-search"></i></div>
                <div class="fe-chips" id="cr-estado">
                    ${[['pendiente', 'Por cobrar'], ['vencido', 'Vencidos'], ['pagado', 'Pagados'], ['todos', 'Todos']]
                        .map(([v, l], i) => `<button class="fe-chip-filter ${i === 0 ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}
                </div>
                <select class="filter-select" id="cr-ruta"><option value="">Todas las rutas</option></select>
                <button class="btn btn-outline btn-sm" id="cr-print"><i class="fas fa-print"></i> Imprimir</button>
            </div>
            <div class="card fade-in"><div class="table-wrapper">
                <table class="data-table">
                    <thead><tr><th>Cliente</th><th>Pedido</th><th>Vence</th><th style="text-align:right">Total</th><th style="text-align:right">Abonado</th><th style="text-align:right">Saldo</th><th>Estado</th><th></th></tr></thead>
                    <tbody id="cr-tbody"><tr><td colspan="8" style="text-align:center;padding:30px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></td></tr></tbody>
                    <tfoot id="cr-tfoot"></tfoot>
                </table>
            </div></div>`;
        fillRutas(document.getElementById('cr-ruta'));

        let estado = 'pendiente';
        let lista = [];

        async function cargar() {
            const qs = new URLSearchParams({ estado });
            const ruta = document.getElementById('cr-ruta').value;
            if (ruta) qs.set('id_ruta', ruta);
            const d = await api('/cartera?' + qs);
            if (!d || d.error) {
                document.getElementById('cr-tbody').innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-database"></i><h3>Módulo no disponible</h3><p>${crEsc(d?.mensaje || 'Ejecuta la migración de créditos (creditos_schema.sql).')}</p></div></td></tr>`;
                return;
            }
            lista = d.creditos || [];
            pintarStats(d.resumen);
            pintar();
            if (typeof offPintarPendientes === 'function') offPintarPendientes();
        }

        function filtrados() {
            const t = document.getElementById('cr-buscar').value.toLowerCase().trim();
            return !t ? lista : lista.filter(c =>
                (c.cliente_nombre || '').toLowerCase().includes(t) || (c.cliente_razon || '').toLowerCase().includes(t) || c.numero_pedido.toLowerCase().includes(t));
        }

        function pintar() {
            const l = filtrados();
            const tb = document.getElementById('cr-tbody');
            if (!l.length) {
                tb.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="fas fa-face-smile"></i><h3>${estado === 'pagado' ? 'Sin créditos pagados' : 'Sin cartera pendiente'}</h3><p>Los pedidos a crédito aparecen aquí hasta que se paguen.</p></div></td></tr>`;
                document.getElementById('cr-tfoot').innerHTML = '';
                return;
            }
            tb.innerHTML = l.map(c => {
                const est = crEstado(c.saldo, parseInt(c.dias_vencido));
                return `
                    <tr>
                        <td><div style="font-weight:600">${crEsc(c.cliente_razon || c.cliente_nombre)}</div>
                            <div style="font-size:12px;color:var(--text-muted)">${c.cliente_razon ? crEsc(c.cliente_nombre) + ' · ' : ''}${crEsc(c.cliente_telefono || '')}</div></td>
                        <td><a class="fe-link" onclick="viewPedido(${c.id_pedido})">${crEsc(c.numero_pedido)}</a>
                            <div style="font-size:12px;color:var(--text-muted)">${crFecha(c.fecha_pedido)} · ${c.dias_credito}d</div></td>
                        <td>${crFecha(c.vence)}</td>
                        <td style="text-align:right">${crMoney(c.total)}</td>
                        <td style="text-align:right;color:var(--success)">${crMoney(c.pagado)}</td>
                        <td style="text-align:right"><strong>${crMoney(c.saldo)}</strong></td>
                        <td><span class="cr-badge ${est.key}"><i class="fas ${est.icon}"></i> ${est.label}</span></td>
                        <td style="white-space:nowrap">
                            ${parseFloat(c.saldo) > 0 ? `<button class="btn btn-sm cr-btn-pagar" onclick="crAbrirPago(${c.id_pedido}, () => renderCartera())"><i class="fas fa-hand-holding-dollar"></i> Pagar</button>` : ''}
                            ${c.cliente_telefono && parseFloat(c.saldo) > 0 ? `<a class="btn btn-ghost btn-sm" title="Recordar por WhatsApp" target="_blank" href="${crWhatsapp(c)}"><i class="fab fa-whatsapp" style="color:#25D366;font-size:16px"></i></a>` : ''}
                        </td>
                    </tr>`;
            }).join('');
            const tot = k => l.reduce((s, c) => s + parseFloat(c[k] || 0), 0);
            document.getElementById('cr-tfoot').innerHTML = `
                <tr class="cr-tfoot"><td colspan="3">${l.length} crédito${l.length === 1 ? '' : 's'}</td>
                    <td style="text-align:right">${crMoney(tot('total'))}</td><td style="text-align:right">${crMoney(tot('pagado'))}</td>
                    <td style="text-align:right">${crMoney(tot('saldo'))}</td><td colspan="2"></td></tr>`;
        }

        document.getElementById('cr-buscar').addEventListener('input', debounce(pintar, 250));
        document.getElementById('cr-ruta').addEventListener('change', cargar);
        document.getElementById('cr-estado').onclick = e => {
            const b = e.target.closest('.fe-chip-filter'); if (!b) return;
            document.querySelectorAll('#cr-estado .fe-chip-filter').forEach(x => x.classList.toggle('active', x === b));
            estado = b.dataset.v; cargar();
        };
        document.getElementById('cr-print').onclick = () => {
            const l = filtrados();
            const tot = k => l.reduce((s, c) => s + parseFloat(c[k] || 0), 0);
            printHTML(`
                <h1>Cartera — ${document.querySelector('#cr-estado .active').textContent}</h1>
                <p style="color:#666;margin-bottom:16px">Generado: ${new Date().toLocaleString('es-CO')} | ${l.length} créditos</p>
                <table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Pedido</th><th>Vence</th><th style="text-align:right">Total</th><th style="text-align:right">Abonado</th><th style="text-align:right">Saldo</th></tr></thead>
                <tbody>${l.map(c => `<tr><td>${crEsc(c.cliente_razon || c.cliente_nombre)}</td><td>${crEsc(c.cliente_telefono || '')}</td><td>${crEsc(c.numero_pedido)}</td><td>${crFecha(c.vence)}${parseInt(c.dias_vencido) > 0 && parseFloat(c.saldo) > 0 ? ` <b style="color:#c00">(${c.dias_vencido}d)</b>` : ''}</td><td style="text-align:right">${crMoney(c.total)}</td><td style="text-align:right">${crMoney(c.pagado)}</td><td style="text-align:right"><b>${crMoney(c.saldo)}</b></td></tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="4" style="text-align:right;font-weight:700;padding-top:12px">TOTALES</td><td style="text-align:right;font-weight:700">${crMoney(tot('total'))}</td><td style="text-align:right;font-weight:700">${crMoney(tot('pagado'))}</td><td style="text-align:right;font-weight:700;font-size:15px">${crMoney(tot('saldo'))}</td></tr></tfoot></table>`);
        };
        cargar();
    }

    // ---------- TAB PAGOS RECIBIDOS ----------
    async function tabPagos() {
        const body = document.getElementById('cr-tab-body');
        const hoy = crHoy();
        const ini = hoy.substring(0, 8) + '01';
        body.innerHTML = `
            <div class="toolbar">
                <div class="search-box"><input type="text" id="pg-buscar" placeholder="Buscar cliente, pedido o referencia..."><i class="fas fa-search"></i></div>
                <input type="date" class="filter-select" id="pg-desde" value="${ini}" title="Desde">
                <input type="date" class="filter-select" id="pg-hasta" value="${hoy}" title="Hasta">
                <select class="filter-select" id="pg-medio"><option value="">Todos los medios</option>${CR.MEDIOS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
                <label class="fe-check"><input type="checkbox" id="pg-anulados"> Ver anulados</label>
                <button class="btn btn-outline btn-sm" id="pg-print"><i class="fas fa-print"></i> Imprimir</button>
            </div>
            <div id="pg-resumen" class="cr-resumen-medios"></div>
            <div class="card fade-in"><div class="table-wrapper">
                <table class="data-table">
                    <thead><tr><th>Fecha</th><th>Cliente</th><th>Pedido</th><th>Medio</th><th>Recibió</th><th style="text-align:right">Valor</th><th></th></tr></thead>
                    <tbody id="pg-tbody"></tbody>
                </table>
            </div></div>`;

        let lista = [];
        const admin = state.usuario?.rol === 'admin';

        async function cargar() {
            const qs = new URLSearchParams();
            ['desde', 'hasta'].forEach(k => { const v = document.getElementById('pg-' + k).value; if (v) qs.set('fecha_' + k, v); });
            const medio = document.getElementById('pg-medio').value; if (medio) qs.set('medio_pago', medio);
            if (document.getElementById('pg-anulados').checked) qs.set('incluir_anulados', 1);
            const d = await api('/pagos?' + qs);
            if (!d || d.error) return;
            lista = d.pagos || [];
            pintar();
        }

        function filtrados() {
            const t = document.getElementById('pg-buscar').value.toLowerCase().trim();
            return !t ? lista : lista.filter(x =>
                (x.cliente?.nombre || '').toLowerCase().includes(t) || (x.cliente?.razon_social || '').toLowerCase().includes(t) ||
                (x.pedido?.numero_pedido || '').toLowerCase().includes(t) || (x.referencia || '').toLowerCase().includes(t));
        }

        function pintar() {
            const l = filtrados();
            const validos = l.filter(x => !x.anulado);
            const porMedio = {};
            validos.forEach(x => porMedio[x.medio_pago] = (porMedio[x.medio_pago] || 0) + parseFloat(x.valor));
            document.getElementById('pg-resumen').innerHTML = `
                <div class="cr-medio-total main"><span>Total recibido</span><strong>${crMoney(validos.reduce((s, x) => s + parseFloat(x.valor), 0))}</strong><small>${validos.length} pagos</small></div>
                ${Object.entries(porMedio).sort((a, b) => b[1] - a[1]).map(([m, v]) => `<div class="cr-medio-total"><span><i class="fas ${crMedio(m)[2]}"></i> ${crMedio(m)[1]}</span><strong>${crMoney(v)}</strong></div>`).join('')}`;

            const tb = document.getElementById('pg-tbody');
            if (!l.length) { tb.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fas fa-receipt"></i><h3>Sin pagos en el período</h3></div></td></tr>`; return; }
            tb.innerHTML = l.map(x => `
                <tr style="${x.anulado ? 'opacity:.5;text-decoration:line-through' : ''}">
                    <td>${crFecha(x.fecha)}</td>
                    <td><div style="font-weight:600">${crEsc(x.cliente?.razon_social || x.cliente?.nombre || '')}</div></td>
                    <td><a class="fe-link" onclick="viewPedido(${x.id_pedido})">${crEsc(x.pedido?.numero_pedido || '')}</a></td>
                    <td><i class="fas ${crMedio(x.medio_pago)[2]}" style="color:var(--text-muted);margin-right:4px"></i>${crMedio(x.medio_pago)[1]}${x.referencia ? `<div style="font-size:11px;color:var(--text-muted)">#${crEsc(x.referencia)}</div>` : ''}</td>
                    <td style="font-size:13px">${crEsc(x.usuario?.nombre || '')}</td>
                    <td style="text-align:right"><strong>${crMoney(x.valor)}</strong></td>
                    <td style="white-space:nowrap">
                        <button class="btn btn-ghost btn-sm" title="Recibo" onclick="crImprimirRecibo(${x.id_pago})"><i class="fas fa-print"></i></button>
                        ${admin && !x.anulado ? `<button class="btn btn-ghost btn-sm" title="Anular" style="color:var(--danger)" onclick="crAnularPago(${x.id_pago}, () => renderCartera())"><i class="fas fa-ban"></i></button>` : ''}
                    </td>
                </tr>`).join('');
        }

        document.getElementById('pg-buscar').addEventListener('input', debounce(pintar, 250));
        ['pg-desde', 'pg-hasta', 'pg-medio', 'pg-anulados'].forEach(id => document.getElementById(id).addEventListener('change', cargar));
        document.getElementById('pg-print').onclick = () => {
            const l = filtrados().filter(x => !x.anulado);
            printHTML(`
                <h1>Pagos recibidos</h1>
                <p style="color:#666;margin-bottom:16px">Del ${crFecha(document.getElementById('pg-desde').value)} al ${crFecha(document.getElementById('pg-hasta').value)} | ${l.length} pagos</p>
                <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Pedido</th><th>Medio</th><th>Recibió</th><th style="text-align:right">Valor</th></tr></thead>
                <tbody>${l.map(x => `<tr><td>${crFecha(x.fecha)}</td><td>${crEsc(x.cliente?.razon_social || x.cliente?.nombre || '')}</td><td>${crEsc(x.pedido?.numero_pedido || '')}</td><td>${crMedio(x.medio_pago)[1]}${x.referencia ? ' #' + crEsc(x.referencia) : ''}</td><td>${crEsc(x.usuario?.nombre || '')}</td><td style="text-align:right">${crMoney(x.valor)}</td></tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="5" style="text-align:right;font-weight:700;padding-top:12px">TOTAL RECIBIDO</td><td style="text-align:right;font-weight:700;font-size:16px">${crMoney(l.reduce((s, x) => s + parseFloat(x.valor), 0))}</td></tr></tfoot></table>`);
        };
        cargar();
    }

    document.querySelector('.cr-tabs').onclick = e => {
        const b = e.target.closest('.cr-tab'); if (!b) return;
        document.querySelectorAll('.cr-tab').forEach(x => x.classList.toggle('active', x === b));
        tab = b.dataset.tab;
        tab === 'cartera' ? tabCartera() : tabPagos();
    };

    // Las stats se cargan siempre desde /cartera
    tabCartera();
}

function crWhatsapp(c) {
    let tel = String(c.cliente_telefono || '').replace(/\D/g, '');
    if (tel.length === 10) tel = '57' + tel;
    const nombre = c.cliente_nombre || c.cliente_razon || '';
    const msg = `Hola ${nombre}, te recordamos que el pedido ${c.numero_pedido} tiene un saldo pendiente de ${crMoney(c.saldo)}` +
        (parseInt(c.dias_vencido) > 0 ? `, vencido desde el ${crFecha(c.vence)}.` : `, con vencimiento el ${crFecha(c.vence)}.`) + ' ¡Gracias!';
    return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
}
