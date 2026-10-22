/* ========================================
   PEDIDOS CRUZ - Modo sin conexión
   - Registra el service worker (app instalable + datos guardados)
   - Cola de pendientes: pedidos y abonos tomados sin señal
   - Sincroniza sola al volver la señal (con identificador único: nunca duplica)
   Debe cargarse DESPUÉS de app.js (envuelve api() y logout()).
   ======================================== */

const OFF = {
    SYNC_INTERVAL_MS: 30000,
    PRECARGA_INTERVAL_MS: 30 * 60 * 1000,
    POST_TIMEOUT_MS: 15000,
    sincronizando: false,
    installPrompt: null,
};

// ========================================
// COLA DE PENDIENTES (localStorage, por usuario)
// ========================================
function offKey() { return 'pc_outbox_' + (state.usuario?.id_usuario || 'anon'); }

function offLeer() {
    try { return JSON.parse(localStorage.getItem(offKey()) || '[]'); } catch (e) { return []; }
}

function offGuardar(lista) {
    localStorage.setItem(offKey(), JSON.stringify(lista));
    offPintarEstado();
}

function offUuid() {
    if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

function offSiguienteTemporal() {
    const k = 'pc_off_seq_' + (state.usuario?.id_usuario || 'anon');
    const n = (parseInt(localStorage.getItem(k)) || 0) + 1;
    localStorage.setItem(k, n);
    return 'OFF-' + String(n).padStart(3, '0');
}

function offPendientes(tipo = null) {
    return offLeer().filter(x => !tipo || x.tipo === tipo);
}

// ========================================
// ENVOLVER api(): pedidos y abonos se encolan si no hay señal
// ========================================
const _apiConRed = api;

api = async function (endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const tipo = method === 'POST' && endpoint === '/pedidos' ? 'pedido'
        : method === 'POST' && endpoint === '/pagos' ? 'pago' : null;

    if (tipo) return offEnviarOEncolar(tipo, JSON.parse(options.body || '{}'), options.offResumen || {});

    if (method !== 'GET' && !navigator.onLine) {
        return { error: true, offline: true, mensaje: 'Sin conexión: esta acción necesita internet. Inténtalo cuando vuelva la señal.' };
    }
    return _apiConRed(endpoint, options);
};

async function offPost(endpoint, body, timeout = OFF.POST_TIMEOUT_MS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
        const resp = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        let data = null;
        try { data = await resp.json(); } catch (e) { /* respuesta no JSON */ }
        return { red: true, status: resp.status, data };
    } catch (e) {
        return { red: false }; // sin señal, timeout o conexión cortada
    } finally {
        clearTimeout(t);
    }
}

async function offEnviarOEncolar(tipo, body, resumen) {
    body.uuid_offline = body.uuid_offline || offUuid();
    body.fecha_offline = body.fecha_offline || new Date().toISOString();

    if (navigator.onLine) {
        const r = await offPost(tipo === 'pedido' ? '/pedidos' : '/pagos', body);
        if (r.red) {
            if (r.status === 401) { logout(); return null; }
            return r.data || { error: true, mensaje: `Error del servidor (HTTP ${r.status})` };
        }
        // La señal se cayó durante el envío: se encola (el uuid evita duplicados si sí llegó)
    }

    const temporal = offSiguienteTemporal();
    const lista = offLeer();
    lista.push({ uuid: body.uuid_offline, tipo, temporal, body, resumen, creado: body.fecha_offline, estado: 'pendiente', error: null, intentos: 0 });
    offGuardar(lista);
    setTimeout(offSincronizar, 3000);

    const quien = tipo === 'pedido' ? 'Pedido' : 'Abono';
    return {
        error: false, offline: true, temporal,
        mensaje: `${quien} ${temporal} guardado en el celular. Se enviará solo cuando vuelva la señal.`,
        pedido: tipo === 'pedido' ? { id_pedido: null, numero_pedido: temporal } : undefined,
        pago: tipo === 'pago' ? { id_pago: null, valor: body.valor, medio_pago: body.medio_pago } : undefined,
    };
}

// ========================================
// SINCRONIZACIÓN
// ========================================
async function offSincronizar(manual = false) {
    if (OFF.sincronizando || !state.token) return;
    if (!navigator.onLine) { if (manual) toast('Sigues sin conexión', 'warning'); return; }

    const aEnviar = offLeer().filter(x => x.estado === 'pendiente' || (manual && x.estado === 'error'));
    if (!aEnviar.length) { if (manual) toast('No hay pendientes por enviar'); return; }

    OFF.sincronizando = true;
    offPintarEstado();
    let enviados = 0, conError = 0, cortado = false;

    for (const item of aEnviar) {
        const r = await offPost(item.tipo === 'pedido' ? '/pedidos' : '/pagos', item.body, 20000);
        let lista = offLeer();
        const i = lista.findIndex(x => x.uuid === item.uuid);
        if (i < 0) continue;

        if (!r.red || r.status >= 500) { cortado = true; break; } // se reintenta en el próximo ciclo
        if (r.status === 401) { cortado = true; toast('Tu sesión venció: inicia sesión para enviar los pendientes', 'warning', 6000); break; }

        if (r.data && !r.data.error) {
            const real = item.tipo === 'pedido' ? r.data.pedido?.numero_pedido : `pago #${r.data.pago?.id_pago}`;
            lista.splice(i, 1);
            offGuardar(lista);
            offHistorial({ temporal: item.temporal, tipo: item.tipo, real, resumen: item.resumen, fecha: new Date().toISOString() });
            enviados++;
            toast(item.tipo === 'pedido' ? `${item.temporal} sincronizado como ${real}` : `Abono ${item.temporal} sincronizado`, 'success', 4500);
        } else {
            lista[i].estado = 'error';
            lista[i].intentos = (lista[i].intentos || 0) + 1;
            lista[i].error = r.data?.mensaje || offErroresValidacion(r.data) || `Rechazado por el servidor (HTTP ${r.status})`;
            offGuardar(lista);
            conError++;
        }
    }

    OFF.sincronizando = false;
    offPintarEstado();
    if (conError) toast(conError === 1
        ? '1 pendiente fue rechazado por el servidor. Revísalo en el indicador de arriba.'
        : `${conError} pendientes fueron rechazados por el servidor. Revísalos en el indicador de arriba.`, 'error', 7000);
    if (enviados && !cortado) offPrecargar(true);
    if (enviados || conError) offRefrescarPagina();
}

function offErroresValidacion(data) {
    if (!data || typeof data !== 'object') return '';
    const msgs = Object.values(data).flat().filter(v => typeof v === 'string');
    return msgs.join(' ');
}

function offHistorial(reg) {
    const k = 'pc_off_hist_' + (state.usuario?.id_usuario || 'anon');
    let h = [];
    try { h = JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { /* vacío */ }
    h.unshift(reg);
    localStorage.setItem(k, JSON.stringify(h.slice(0, 30)));
}

function offRefrescarPagina() {
    if (['pedidos', 'cartera'].includes(state.currentPage) && !document.getElementById('modal-overlay').classList.contains('show')) {
        navigateTo(state.currentPage, { skipHash: true });
    }
}

// ========================================
// PRECARGA: deja en el celular lo que el vendedor necesita sin señal
// ========================================
async function offPrecargar(forzar = false) {
    if (!state.token || !navigator.onLine || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    const k = 'pc_off_precarga_' + state.usuario?.id_usuario;
    const ultima = parseInt(localStorage.getItem(k)) || 0;
    if (!forzar && Date.now() - ultima < OFF.PRECARGA_INTERVAL_MS) return;
    localStorage.setItem(k, Date.now());

    const get = async path => {
        try {
            const r = await fetch(API_BASE + path, { headers: { 'Authorization': `Bearer ${state.token}` } });
            return r.ok ? await r.json() : null;
        } catch (e) { return null; }
    };

    const [rutas, productos] = await Promise.all([get('/rutas'), get('/productos'), get('/clientes'), get('/pedidos'), get('/categorias')]);
    const cartera = await get('/cartera');

    // Clientes por ruta (el paso 1 del pedido los pide así)
    for (const r of (rutas?.rutas || [])) await get(`/clientes?id_ruta=${r.id_ruta}`);

    // Detalle de los créditos con saldo (para registrar abonos sin señal)
    for (const c of (cartera?.creditos || []).slice(0, 80)) await get(`/pedidos/${c.id_pedido}`);

    // Fotos de productos (una vez al día)
    const kf = 'pc_off_fotos_' + state.usuario?.id_usuario;
    if (forzar || Date.now() - (parseInt(localStorage.getItem(kf)) || 0) > 24 * 3600 * 1000) {
        localStorage.setItem(kf, Date.now());
        const fotos = (productos?.productos || []).filter(p => p.foto).map(p => UPLOADS_URL + p.foto);
        for (let i = 0; i < fotos.length; i += 4) {
            await Promise.all(fotos.slice(i, i + 4).map(u => fetch(u).catch(() => null)));
        }
    }
    localStorage.setItem('pc_off_precarga_ok_' + state.usuario?.id_usuario, Date.now());
    offPintarEstado();
}

// ========================================
// INDICADOR DE CONEXIÓN Y PENDIENTES
// ========================================
function offPintarEstado() {
    let el = document.getElementById('off-status');
    const header = document.getElementById('app-header');
    if (!header) return;
    if (!el) {
        el = document.createElement('button');
        el.id = 'off-status';
        el.className = 'off-status';
        el.onclick = offAbrirPanel;
        header.insertBefore(el, header.querySelector('.header-actions'));
    }
    const n = offLeer().length;
    const errores = offLeer().filter(x => x.estado === 'error').length;
    const online = navigator.onLine;

    el.className = 'off-status ' + (OFF.sincronizando ? 'sync' : !online ? 'offline' : errores ? 'error' : n ? 'pend' : 'online');
    el.innerHTML = OFF.sincronizando
        ? '<i class="fas fa-rotate fa-spin"></i><span>Enviando...</span>'
        : !online
            ? `<i class="fas fa-wifi"></i><span>Sin conexión${n ? ` · ${n}` : ''}</span>`
            : errores
                ? `<i class="fas fa-triangle-exclamation"></i><span>${errores} con error</span>`
                : n
                    ? `<i class="fas fa-cloud-arrow-up"></i><span>${n} pendiente${n > 1 ? 's' : ''}</span>`
                    : '<i class="fas fa-circle"></i><span>En línea</span>';
    el.title = online ? 'Conexión y pendientes por sincronizar' : 'Estás sin internet: los pedidos y abonos se guardan en el celular';

    // Si estamos en Pedidos o Cartera, refrescar el bloque de pendientes
    offPintarPendientes();
}

function offAbrirPanel() {
    const lista = offLeer();
    const hist = (() => { try { return JSON.parse(localStorage.getItem('pc_off_hist_' + (state.usuario?.id_usuario || 'anon')) || '[]'); } catch (e) { return []; } })();
    const precarga = parseInt(localStorage.getItem('pc_off_precarga_ok_' + state.usuario?.id_usuario)) || 0;

    openModal('Conexión y pendientes', `
        <div class="off-panel-estado ${navigator.onLine ? 'on' : 'off'}">
            <i class="fas ${navigator.onLine ? 'fa-wifi' : 'fa-plane'}"></i>
            <div>
                <strong>${navigator.onLine ? 'Con conexión' : 'Sin conexión'}</strong>
                <div>${navigator.onLine ? 'Los pendientes se envían solos cada 30 segundos.' : 'Puedes seguir tomando pedidos y abonos; se guardan en el celular.'}</div>
                <div class="off-panel-sub">Datos guardados: ${precarga ? 'actualizados ' + offHace(precarga) : 'aún no se han descargado'}</div>
            </div>
        </div>
        <div class="off-panel-title">Pendientes por enviar (${lista.length})</div>
        ${lista.length ? lista.map(offFilaPendiente).join('') : '<div class="off-vacio"><i class="fas fa-circle-check"></i> Todo está sincronizado</div>'}
        ${hist.length ? `
            <div class="off-panel-title">Enviados recientemente</div>
            ${hist.slice(0, 8).map(h => `
                <div class="off-hist"><i class="fas fa-check"></i> <b>${cmEscOff(h.temporal)}</b> → ${cmEscOff(h.real || '')} <span>${offHace(new Date(h.fecha).getTime())}</span></div>`).join('')}` : ''}
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cerrar</button>
        <button class="btn btn-outline" onclick="offPrecargar(true).then(() => toast('Datos actualizados'))" ${navigator.onLine ? '' : 'disabled'}><i class="fas fa-download"></i> Actualizar datos</button>
        <button class="btn btn-primary" onclick="closeModal();offSincronizar(true)" ${navigator.onLine && lista.length ? '' : 'disabled'}><i class="fas fa-cloud-arrow-up"></i> Enviar ahora</button>
    `);
}

function offFilaPendiente(x) {
    const r = x.resumen || {};
    const titulo = x.tipo === 'pedido'
        ? `Pedido <b>${cmEscOff(x.temporal)}</b> · ${cmEscOff(r.cliente || 'Cliente #' + x.body.id_cliente)}`
        : `Abono <b>${cmEscOff(x.temporal)}</b> · ${cmEscOff(r.numero_pedido || 'Pedido #' + x.body.id_pedido)}${r.cliente ? ' · ' + cmEscOff(r.cliente) : ''}`;
    const valor = x.tipo === 'pedido' ? (r.total || 0) : x.body.valor;
    return `
        <div class="off-item ${x.estado}">
            <div class="off-item-icon"><i class="fas ${x.tipo === 'pedido' ? 'fa-cart-shopping' : 'fa-hand-holding-dollar'}"></i></div>
            <div class="off-item-info">
                <div>${titulo}</div>
                <div class="off-item-meta">$${formatNumber(valor)} · ${offHace(new Date(x.creado).getTime())}${x.tipo === 'pedido' && r.items ? ` · ${r.items} producto${r.items > 1 ? 's' : ''}` : ''}</div>
                ${x.estado === 'error' ? `<div class="off-item-error"><i class="fas fa-circle-exclamation"></i> ${cmEscOff(x.error)}</div>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" title="Descartar" onclick="offDescartar('${x.uuid}')"><i class="fas fa-trash" style="color:var(--danger)"></i></button>
        </div>`;
}

async function offDescartar(uuid) {
    const x = offLeer().find(i => i.uuid === uuid);
    if (!x) return;
    if (!(await confirmar('No se enviará al servidor y se perderá de este celular.', { titulo: `¿Descartar ${x.tipo === 'pedido' ? 'el pedido' : 'el abono'} ${x.temporal}?`, ok: 'Descartar', tipo: 'danger' }))) return;
    offGuardar(offLeer().filter(i => i.uuid !== uuid));
    offAbrirPanel();
}

/** Bloque "pendientes" en Pedidos y Cartera */
function offPintarPendientes() {
    const cont = document.getElementById('off-pendientes');
    if (!cont) return;
    const tipo = cont.dataset.tipo;
    const lista = offPendientes(tipo);
    if (!lista.length) { cont.innerHTML = ''; return; }
    cont.innerHTML = `
        <div class="off-banner">
            <div class="off-banner-head">
                <div><i class="fas fa-cloud-arrow-up"></i> <strong>${lista.length} ${tipo === 'pago' ? 'abono' : 'pedido'}${lista.length > 1 ? 's' : ''} sin sincronizar</strong>
                    <span>${navigator.onLine ? 'se están enviando…' : 'se enviarán cuando vuelva la señal'}</span></div>
                <button class="btn btn-sm btn-outline" onclick="offAbrirPanel()">Ver</button>
            </div>
            ${lista.map(offFilaPendiente).join('')}
        </div>`;
}

function offHace(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'hace un momento';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

function cmEscOff(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Total pendiente de abonos de un pedido (para descontarlo del saldo mostrado) */
function offAbonosPendientes(idPedido) {
    return offPendientes('pago').filter(x => x.body.id_pedido == idPedido).reduce((s, x) => s + parseFloat(x.body.valor || 0), 0);
}

// ========================================
// LOGOUT: avisar si quedan pendientes y borrar los datos guardados
// ========================================
const _logoutOriginal = logout;
logout = function () {
    const n = offLeer().length;
    if (n && state.token) {
        toast(`Tienes ${n} pendiente${n > 1 ? 's' : ''} sin enviar. Se conservan y se enviarán cuando vuelvas a entrar con este usuario.`, 'warning', 7000);
    }
    if ('caches' in window) caches.delete('pc-api');
    _logoutOriginal();
    offPintarEstado();
};

// ========================================
// INSTALAR APP (Android)
// ========================================
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    OFF.installPrompt = e;
    const nav = document.querySelector('.sidebar-footer');
    if (nav && !document.getElementById('off-instalar')) {
        nav.insertAdjacentHTML('afterbegin', `<button class="off-instalar" id="off-instalar"><i class="fas fa-mobile-screen-button"></i> Instalar app en el celular</button>`);
        document.getElementById('off-instalar').onclick = async () => {
            OFF.installPrompt.prompt();
            await OFF.installPrompt.userChoice;
            OFF.installPrompt = null;
            document.getElementById('off-instalar')?.remove();
        };
    }
});
window.addEventListener('appinstalled', () => { document.getElementById('off-instalar')?.remove(); toast('¡App instalada! Ábrela desde el ícono del celular'); });

// ========================================
// ARRANQUE
// ========================================
(function offInit() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        navigator.serviceWorker.register('sw.js?api=' + encodeURIComponent(API_BASE))
            .then(() => navigator.serviceWorker.ready)
            .then(reg => {
                // Guardar la app completa (JS, CSS, íconos, fuentes de los CDN) para abrir sin señal
                const enviar = () => {
                    const urls = performance.getEntriesByType('resource').map(r => r.name)
                        .filter(u => !u.startsWith(API_BASE) && (u.startsWith(location.origin) || /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(u)));
                    urls.push(location.origin + location.pathname);
                    reg.active?.postMessage({ type: 'cache-urls', urls: [...new Set(urls)] });
                };
                enviar();
                setTimeout(enviar, 8000); // fuentes de íconos y archivos que cargan tarde
                setTimeout(() => offPrecargar(), 4000);
            })
            .catch(err => console.warn('SW no registrado', err));
    }

    window.addEventListener('online', () => { offPintarEstado(); toast('Conexión restablecida', 'success', 2500); setTimeout(() => offSincronizar(), 1500); });
    window.addEventListener('offline', () => { offPintarEstado(); toast('Sin conexión: puedes seguir trabajando, todo se guarda en el celular', 'warning', 5000); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { offPintarEstado(); offSincronizar(); } });
    setInterval(() => { offSincronizar(); offPrecargar(); }, OFF.SYNC_INTERVAL_MS);

    // Pintar el indicador cuando la app ya inició sesión
    const t = setInterval(() => {
        if (document.getElementById('app-header') && state.token) { offPintarEstado(); offSincronizar(); clearInterval(t); }
    }, 1000);
})();
