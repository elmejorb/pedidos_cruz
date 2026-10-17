/* ========================================
   PEDIDOS CRUZ - Main Application
   ======================================== */

const API_BASE = 'https://pedidosgb.innovacion-digital.com/api/public';
const UPLOADS_URL = API_BASE + '/uploads/productos/';

// ========================================
// STATE
// ========================================
const state = {
    token: localStorage.getItem('pc_token') || null,
    usuario: JSON.parse(localStorage.getItem('pc_usuario') || 'null'),
    currentPage: 'dashboard',
    cart: JSON.parse(sessionStorage.getItem('pc_cart') || '[]'),
    selectedClient: JSON.parse(sessionStorage.getItem('pc_selected_client') || 'null'),
    selectedRuta: JSON.parse(sessionStorage.getItem('pc_selected_ruta') || 'null'),
};

function saveCartState() {
    sessionStorage.setItem('pc_cart', JSON.stringify(state.cart));
    sessionStorage.setItem('pc_selected_client', JSON.stringify(state.selectedClient));
    sessionStorage.setItem('pc_selected_ruta', JSON.stringify(state.selectedRuta));
}

function clearCartState() {
    state.cart = [];
    state.selectedClient = null;
    state.selectedRuta = null;
    sessionStorage.removeItem('pc_cart');
    sessionStorage.removeItem('pc_selected_client');
    sessionStorage.removeItem('pc_selected_ruta');
}

// ========================================
// API HELPER
// ========================================
async function api(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

    // Remove Content-Type for FormData
    if (options.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    try {
        const resp = await fetch(`${API_BASE}${endpoint}`, {
            headers,
            ...options,
            ...(options.body instanceof FormData ? {} : { headers }),
        });

        if (resp.status === 401) {
            logout();
            return null;
        }

        const data = await resp.json();
        return data;
    } catch (err) {
        toast('Error de conexión con el servidor', 'error');
        console.error(err);
        return null;
    }
}

// ========================================
// TOAST
// ========================================
function toast(msg, type = 'success', duration = 3500) {
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle' };
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
        <i class="fas ${icons[type] || icons.success}"></i>
        <span>${msg}</span>
        <button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(el);
    setTimeout(() => el.remove(), duration);
}

// ========================================
// MODAL
// ========================================
function openModal(title, bodyHTML, footerHTML = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-footer').innerHTML = footerHTML;
    document.getElementById('modal-container').classList.remove('modal-wide');
    document.getElementById('modal-overlay').classList.add('show');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
}

// ========================================
// COLOR PICKER
// ========================================
const COLOR_PALETTE = [
    // Fila 1 - tonos claros
    '#FCA5A5', '#FDBA74', '#FCD34D', '#BEF264', '#6EE7B7', '#5EEAD4', '#7DD3FC', '#A5B4FC', '#D8B4FE', '#F9A8D4',
    // Fila 2 - tonos medios
    '#F87171', '#FB923C', '#FBBF24', '#A3E635', '#34D399', '#2DD4BF', '#38BDF8', '#818CF8', '#C084FC', '#F472B6',
    // Fila 3 - tonos base
    '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981', '#14B8A6', '#0EA5E9', '#6366F1', '#A855F7', '#EC4899',
    // Fila 4 - tonos oscuros
    '#B91C1C', '#C2410C', '#B45309', '#4D7C0F', '#047857', '#0F766E', '#0369A1', '#4338CA', '#7E22CE', '#BE185D',
    // Fila 5 - neutros
    '#F8FAFC', '#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B', '#475569', '#334155', '#1E293B', '#0F172A', '#000000',
];

function normalizeHex(value) {
    if (!value) return null;
    let hex = String(value).trim().toUpperCase();
    if (hex[0] !== '#') hex = '#' + hex;
    if (/^#[0-9A-F]{3}$/.test(hex)) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    return /^#[0-9A-F]{6}$/.test(hex) ? hex : null;
}

/**
 * HTML de un selector de color (paleta + color personalizado).
 * El valor se lee con getColorPickerValue(id).
 */
function colorPickerHTML(id, selected = '#6366F1') {
    const value = normalizeHex(selected) || '#6366F1';
    return `
        <div class="color-picker" id="${id}" data-color="${value}">
            <div class="color-palette">
                ${COLOR_PALETTE.map(c => `
                    <div class="color-swatch${c === value ? ' selected' : ''}" data-color="${c}"
                         style="background:${c}" title="${c}"></div>
                `).join('')}
            </div>
            <div class="color-picker-custom">
                <label>Personalizado</label>
                <input type="color" class="cp-native" value="${value}">
                <input type="text" class="cp-hex" value="${value}" maxlength="7" spellcheck="false">
                <div class="color-picker-preview">Vista previa <span class="cp-preview" style="background:${value}"></span></div>
            </div>
        </div>
    `;
}

function initColorPicker(id) {
    const root = document.getElementById(id);
    if (!root) return;
    const native = root.querySelector('.cp-native');
    const hex = root.querySelector('.cp-hex');
    const preview = root.querySelector('.cp-preview');

    const setColor = (color, source) => {
        const value = normalizeHex(color);
        if (!value) return;
        root.dataset.color = value;
        preview.style.background = value;
        if (source !== 'native') native.value = value;
        if (source !== 'hex') hex.value = value;
        root.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('selected', s.dataset.color === value);
        });
    };

    root.querySelector('.color-palette').onclick = (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (swatch) setColor(swatch.dataset.color);
    };
    native.oninput = () => setColor(native.value, 'native');
    hex.oninput = () => setColor(hex.value, 'hex');
    hex.onblur = () => { hex.value = root.dataset.color; };
}

function getColorPickerValue(id, fallback = '#6366F1') {
    return document.getElementById(id)?.dataset.color || fallback;
}

// ========================================
// AUTH
// ========================================
function saveSession(token, usuario) {
    state.token = token;
    state.usuario = usuario;
    localStorage.setItem('pc_token', token);
    localStorage.setItem('pc_usuario', JSON.stringify(usuario));
}

function logout() {
    if (state.token) api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.token = null;
    state.usuario = null;
    localStorage.removeItem('pc_token');
    localStorage.removeItem('pc_usuario');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const errDiv = document.getElementById('login-error');

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';
    btn.disabled = true;
    errDiv.classList.remove('show');

    const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
    btn.disabled = false;

    if (!data || data.error) {
        document.getElementById('login-error-text').textContent = data?.mensaje || 'Error al iniciar sesión';
        errDiv.classList.add('show');
        return;
    }

    saveSession(data.token, data.usuario);
    initApp();
}

// ========================================
// NAVIGATION
// ========================================
function navigateTo(page, options = {}) {
    state.currentPage = page;

    // Sync URL hash (unless explicitly skipped, e.g. from hashchange listener)
    if (!options.skipHash) {
        const newHash = '#/' + page + (options.id ? '/' + options.id : '');
        if (location.hash !== newHash) {
            history.pushState(null, '', newHash);
        }
    }

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');

    // Header action button
    const actionBtn = document.getElementById('header-action-btn');
    actionBtn.style.display = 'none';
    actionBtn.onclick = null;

    const titles = {
        'dashboard': 'Dashboard',
        'pedidos': 'Pedidos',
        'nuevo-pedido': 'Nuevo Pedido',
        'clientes': 'Clientes',
        'productos': 'Productos',
        'reportes': 'Reportes',
        'usuarios': 'Usuarios',
        'categorias': 'Categorías',
        'detalle-pedido': 'Detalle del Pedido',
        'perfil': 'Mi Perfil',
        'rutas': 'Rutas',
        'despacho': 'Generar Despacho',
        'facturas': 'Facturas Electrónicas',
        'config-fe': 'Configuración Facturación Electrónica',
    };

    document.getElementById('header-title').textContent = titles[page] || 'Pedidos Cruz';

    // Block admin-only pages for vendedores
    const adminPages = ['usuarios', 'categorias', 'productos', 'reportes', 'dashboard', 'rutas', 'despacho', 'facturas', 'config-fe'];
    if (adminPages.includes(page) && state.usuario?.rol !== 'admin') {
        const container = document.getElementById('page-container');
        container.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><h3>Acceso restringido</h3><p>No tienes permisos para acceder a esta sección</p></div>';
        return;
    }

    const container = document.getElementById('page-container');
    container.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></div>';

    // Route
    const routes = {
        'dashboard': renderDashboard,
        'pedidos': renderPedidos,
        'nuevo-pedido': renderNuevoPedido,
        'clientes': renderClientes,
        'productos': renderProductos,
        'reportes': renderReportes,
        'usuarios': renderUsuarios,
        'categorias': renderCategorias,
        'perfil': renderPerfil,
        'rutas': renderRutas,
        'despacho': renderDespacho,
        'facturas': renderFacturas,
        'config-fe': renderConfigFE,
    };

    if (routes[page]) routes[page]();
}

// ========================================
// DASHBOARD
// ========================================
async function renderDashboard() {
    const data = await api('/dashboard');
    if (!data || data.error) return;

    const d = data.data;
    const container = document.getElementById('page-container');

    container.innerHTML = `
        <div class="stats-grid fade-in">
            <div class="stat-card purple">
                <div class="stat-icon purple"><i class="fas fa-file-invoice"></i></div>
                <div class="stat-info">
                    <h4>Total Pedidos</h4>
                    <div class="stat-value">${d.total_pedidos}</div>
                </div>
            </div>
            <div class="stat-card orange">
                <div class="stat-icon orange"><i class="fas fa-clock"></i></div>
                <div class="stat-info">
                    <h4>Pendientes</h4>
                    <div class="stat-value">${d.pedidos_pendientes}</div>
                </div>
            </div>
            <div class="stat-card green">
                <div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div>
                <div class="stat-info">
                    <h4>Ventas del Mes</h4>
                    <div class="stat-value">$${formatNumber(d.ventas_mes)}</div>
                </div>
            </div>
            <div class="stat-card blue">
                <div class="stat-icon blue"><i class="fas fa-users"></i></div>
                <div class="stat-info">
                    <h4>Clientes</h4>
                    <div class="stat-value">${d.total_clientes}</div>
                </div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px" class="fade-in">
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-chart-line" style="color:var(--primary);margin-right:8px"></i>Ventas Última Semana</h3>
                </div>
                <div class="card-body">
                    <div class="chart-container"><canvas id="chart-ventas"></canvas></div>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-list" style="color:var(--warning);margin-right:8px"></i>Últimos Pedidos</h3>
                </div>
                <div class="card-body" style="padding:0">
                    ${d.ultimos_pedidos.length === 0 ? '<div class="empty-state" style="padding:30px"><i class="fas fa-inbox"></i><p>Sin pedidos aún</p></div>' :
                    d.ultimos_pedidos.map(p => `
                        <div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border-light);cursor:pointer" onclick="viewPedido(${p.id_pedido})">
                            <div style="flex:1">
                                <div style="font-weight:600;font-size:14px">${p.numero_pedido}</div>
                                <div style="font-size:12px;color:var(--text-muted)">${p.cliente?.nombre || 'N/A'}</div>
                            </div>
                            <span class="badge-status badge-${p.estado}">${p.estado}</span>
                            <span style="font-weight:700;font-size:14px">$${formatNumber(p.total)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    // Badge pendientes
    const badge = document.getElementById('badge-pendientes');
    if (d.pedidos_pendientes > 0) {
        badge.textContent = d.pedidos_pendientes;
        badge.style.display = '';
    }

    // Chart
    if (d.ventas_semana.length > 0) {
        const ctx = document.getElementById('chart-ventas');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: d.ventas_semana.map(v => formatDateShort(v.fecha)),
                datasets: [{
                    label: 'Ventas ($)',
                    data: d.ventas_semana.map(v => v.total),
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    borderColor: '#6366F1',
                    borderWidth: 2,
                    borderRadius: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

// ========================================
// PEDIDOS (List)
// ========================================
async function renderPedidos() {
    const actionBtn = document.getElementById('header-action-btn');
    actionBtn.style.display = '';
    document.getElementById('header-action-text').textContent = 'Nuevo Pedido';
    actionBtn.onclick = () => navigateTo('nuevo-pedido');

    const container = document.getElementById('page-container');
    const yearNow = new Date().getFullYear();
    const years = [];
    for (let y = yearNow; y >= yearNow - 5; y--) years.push(y);

    container.innerHTML = `
        <div class="toolbar">
            <div class="search-box">
                <input type="text" id="search-pedidos" placeholder="Buscar por # pedido o cliente...">
                <i class="fas fa-search"></i>
            </div>
            <select class="filter-select" id="filter-estado">
                <option value="">Todos los estados</option>
                <option value="pendiente">Pendiente</option>
                <option value="procesando">Procesando</option>
                <option value="enviado">Enviado</option>
                <option value="entregado">Entregado</option>
                <option value="cancelado">Cancelado</option>
            </select>
            <select class="filter-select" id="filter-ruta">
                <option value="">Todas las rutas</option>
            </select>
            <select class="filter-select" id="filter-modo-fecha">
                <option value="">Todas las fechas</option>
                <option value="hoy">Hoy</option>
                <option value="semana">Últimos 7 días</option>
                <option value="mes">Este mes</option>
                <option value="mes_year">Mes / Año</option>
                <option value="rango">Rango de fechas</option>
            </select>
            <div id="filter-mes-year-box" style="display:none;gap:6px">
                <select class="filter-select" id="filter-mes">
                    ${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
                        .map((m, i) => `<option value="${i+1}" ${(i+1) === (new Date().getMonth()+1) ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                <select class="filter-select" id="filter-year">
                    ${years.map(y => `<option value="${y}" ${y === yearNow ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
            </div>
            <div id="filter-rango-box" style="display:none;gap:6px">
                <input type="date" class="filter-select" id="filter-fecha-desde" title="Desde">
                <input type="date" class="filter-select" id="filter-fecha-hasta" title="Hasta">
            </div>
            <button class="btn btn-outline btn-sm" onclick="window._printListaPedidos()" title="Imprimir listado"><i class="fas fa-print"></i> Imprimir</button>
        </div>
        <div id="filter-summary" style="margin-bottom:12px;font-size:13px;color:var(--text-secondary);font-weight:500"></div>
        <div class="card">
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th># Pedido</th>
                            <th>Cliente</th>
                            <th>Ruta</th>
                            <th>Vendedor</th>
                            <th>Fecha</th>
                            <th>Estado</th>
                            <th>Total</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="pedidos-tbody"></tbody>
                </table>
            </div>
        </div>
    `;

    let allPedidos = [];

    async function loadPedidos(params = '') {
        const data = await api('/pedidos' + params);
        if (!data) return;
        allPedidos = data.pedidos || [];
        renderPedidosTable(allPedidos);
    }

    function renderPedidosTable(pedidos) {
        const tbody = document.getElementById('pedidos-tbody');
        if (pedidos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="fas fa-inbox"></i><h3>Sin pedidos</h3><p>Crea tu primer pedido</p></div></td></tr>';
            return;
        }
        tbody.innerHTML = pedidos.map(p => `
            <tr>
                <td><strong>${p.numero_pedido}</strong></td>
                <td>
                    <div style="font-weight:600">${p.cliente?.razon_social || p.cliente?.nombre || 'N/A'}</div>
                    ${p.cliente?.razon_social && p.cliente?.nombre ? `<div style="font-size:12px;color:var(--text-muted)">${p.cliente.nombre}</div>` : ''}
                </td>
                <td>${p.ruta ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:12px;background:${p.ruta.color}22;color:${p.ruta.color};font-weight:600;font-size:11px"><i class="fas fa-route"></i>${p.ruta.nombre}</span>` : '<span style="color:var(--text-muted);font-size:12px">-</span>'}</td>
                <td>${p.vendedor?.nombre || 'N/A'}</td>
                <td>${formatDate(p.fecha_pedido)}</td>
                <td><span class="badge-status badge-${p.estado}">${p.estado}</span> ${fePedidoChip(p.factura)}</td>
                <td><strong>$${formatNumber(p.total)}</strong></td>
                <td>
                    <button class="btn btn-ghost btn-sm" onclick="viewPedido(${p.id_pedido})" title="Ver detalle">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function getDateRange() {
        const modo = document.getElementById('filter-modo-fecha').value;
        if (!modo) return { desde: null, hasta: null, label: null };

        const today = new Date();
        const fmt = d => d.toISOString().split('T')[0];

        if (modo === 'hoy') {
            const d = fmt(today);
            return { desde: d, hasta: d, label: 'Hoy' };
        }
        if (modo === 'semana') {
            const past = new Date(today); past.setDate(today.getDate() - 7);
            return { desde: fmt(past), hasta: fmt(today), label: 'Últimos 7 días' };
        }
        if (modo === 'mes') {
            const first = new Date(today.getFullYear(), today.getMonth(), 1);
            const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            return { desde: fmt(first), hasta: fmt(last), label: today.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) };
        }
        if (modo === 'mes_year') {
            const mes = parseInt(document.getElementById('filter-mes').value);
            const year = parseInt(document.getElementById('filter-year').value);
            const first = new Date(year, mes - 1, 1);
            const last = new Date(year, mes, 0);
            return { desde: fmt(first), hasta: fmt(last), label: first.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) };
        }
        if (modo === 'rango') {
            const desde = document.getElementById('filter-fecha-desde').value;
            const hasta = document.getElementById('filter-fecha-hasta').value;
            if (!desde && !hasta) return { desde: null, hasta: null, label: null };
            return { desde: desde || null, hasta: hasta || null, label: `${desde || '...'} → ${hasta || '...'}` };
        }
        return { desde: null, hasta: null, label: null };
    }

    function applyFilters() {
        const estado = document.getElementById('filter-estado').value;
        const ruta = document.getElementById('filter-ruta')?.value;
        const params = [];
        if (estado) params.push(`estado=${estado}`);
        if (ruta) params.push(`id_ruta=${ruta}`);

        const { desde, hasta } = getDateRange();
        if (desde) params.push(`fecha_desde=${desde}`);
        if (hasta) params.push(`fecha_hasta=${hasta}`);

        loadPedidos(params.length ? '?' + params.join('&') : '');
    }

    function updateFilterSummary() {
        const summary = document.getElementById('filter-summary');
        const { label } = getDateRange();
        const estado = document.getElementById('filter-estado').value;
        const parts = [];
        if (estado) parts.push(`<strong>${estado}</strong>`);
        if (label) parts.push(`<i class="fas fa-calendar" style="margin-right:4px"></i>${label}`);
        summary.innerHTML = parts.length
            ? `<i class="fas fa-filter" style="margin-right:6px;color:var(--primary)"></i>Filtrando por: ${parts.join(' • ')}`
            : '';
    }

    document.getElementById('search-pedidos').addEventListener('input', debounce(function () {
        const term = this.value.toLowerCase();
        const filtered = allPedidos.filter(p =>
            p.numero_pedido.toLowerCase().includes(term) ||
            (p.cliente?.nombre || '').toLowerCase().includes(term) ||
            (p.cliente?.razon_social || '').toLowerCase().includes(term)
        );
        renderPedidosTable(filtered);
    }, 300));

    document.getElementById('filter-estado').addEventListener('change', () => {
        updateFilterSummary();
        applyFilters();
    });

    document.getElementById('filter-ruta').addEventListener('change', () => {
        updateFilterSummary();
        applyFilters();
    });

    // Cargar rutas en el filtro
    api('/rutas').then(rd => {
        const sel = document.getElementById('filter-ruta');
        if (sel && rd?.rutas) {
            rd.rutas.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id_ruta;
                opt.textContent = r.nombre;
                sel.appendChild(opt);
            });
        }
    });

    document.getElementById('filter-modo-fecha').addEventListener('change', function () {
        const modo = this.value;
        document.getElementById('filter-mes-year-box').style.display = modo === 'mes_year' ? 'flex' : 'none';
        document.getElementById('filter-rango-box').style.display = modo === 'rango' ? 'flex' : 'none';
        updateFilterSummary();
        applyFilters();
    });

    ['filter-mes', 'filter-year', 'filter-fecha-desde', 'filter-fecha-hasta'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            updateFilterSummary();
            applyFilters();
        });
    });

    window._printListaPedidos = () => {
        const estado = document.getElementById('filter-estado').value;
        const { label: fechaLabel } = getDateRange();
        const parts = [];
        if (estado) parts.push(`Estado: ${estado}`);
        if (fechaLabel) parts.push(`Período: ${fechaLabel}`);
        const titulo = parts.length ? `Pedidos — ${parts.join(' • ')}` : 'Listado de Pedidos';

        const rows = allPedidos.map(p => `
            <tr>
                <td>${p.numero_pedido}</td>
                <td>${p.cliente?.nombre || 'N/A'}${p.cliente?.razon_social ? '<br><small style="color:#666">' + p.cliente.razon_social + '</small>' : ''}</td>
                <td>${p.vendedor?.nombre || 'N/A'}</td>
                <td>${formatDate(p.fecha_pedido)}</td>
                <td>${p.estado}</td>
                <td style="text-align:right">$${formatNumber(p.total)}</td>
            </tr>
        `).join('');

        const totalGeneral = allPedidos.reduce((s, p) => s + parseFloat(p.total), 0);

        printHTML(`
            <h1>${titulo}</h1>
            <p style="color:#666;margin-bottom:16px">Generado: ${new Date().toLocaleString('es-CO')} | Total registros: ${allPedidos.length}</p>
            <table>
                <thead><tr><th># Pedido</th><th>Cliente</th><th>Vendedor</th><th>Fecha</th><th>Estado</th><th style="text-align:right">Total</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr><td colspan="5" style="text-align:right;font-weight:700;padding-top:12px">TOTAL GENERAL</td><td style="text-align:right;font-weight:700;font-size:16px;padding-top:12px">$${formatNumber(totalGeneral)}</td></tr></tfoot>
            </table>
        `);
    };

    loadPedidos();
}

// ========================================
// VIEW PEDIDO DETAIL
// ========================================
async function viewPedido(id, skipHash = false) {
    const data = await api(`/pedidos/${id}`);
    if (!data || data.error) return;

    const p = data.pedido;
    const facturado = p.factura?.estado === 'autorizada';
    state.currentPage = 'detalle-pedido';
    if (!skipHash) {
        const newHash = '#/pedidos/' + id;
        if (location.hash !== newHash) history.pushState(null, '', newHash);
    }
    document.getElementById('header-title').textContent = `Pedido ${p.numero_pedido}`;

    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost" onclick="navigateTo('pedidos')"><i class="fas fa-arrow-left"></i> Volver a Pedidos</button>
            <div style="flex:1"></div>
            ${facturado
                ? `<span class="fe-chip ok" style="align-self:center;padding:7px 12px"><i class="fas fa-lock"></i> Facturado ${p.factura.prefijo || ''}${p.factura.numero || ''}</span>`
                : `<button class="btn btn-outline btn-sm" onclick="window._editarPedido(${p.id_pedido})"><i class="fas fa-edit"></i> Editar Pedido</button>`}
            <div style="position:relative;display:inline-block" id="print-dropdown">
                <button class="btn btn-outline btn-sm" onclick="document.getElementById('print-menu').classList.toggle('show')"><i class="fas fa-print"></i> Imprimir <i class="fas fa-caret-down" style="margin-left:4px"></i></button>
                <div id="print-menu" class="dropdown-menu">
                    <a class="dropdown-item" onclick="window._printPedido(${p.id_pedido})"><i class="fas fa-file-alt"></i> Carta completa</a>
                    <a class="dropdown-item" onclick="window._printTicket(${p.id_pedido})"><i class="fas fa-receipt"></i> Ticket / Tirilla</a>
                </div>
            </div>
        </div>
        <div class="detail-grid fade-in">
            <div>
                <div class="card" style="margin-bottom:20px">
                    <div class="card-header">
                        <h3>Productos del Pedido</h3>
                        <span class="badge-status badge-${p.estado}">${p.estado}</span>
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead><tr><th>Producto</th><th>Precio Unit.</th><th>Cantidad</th><th>Subtotal</th></tr></thead>
                            <tbody>
                                ${(p.detalles || []).map(d => `
                                    <tr>
                                        <td>
                                            <div style="display:flex;align-items:center;gap:10px">
                                                <div style="width:40px;height:40px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                                                    ${d.producto?.foto ? `<img src="${UPLOADS_URL}${d.producto.foto}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-box" style="color:var(--text-muted)"></i>'}
                                                </div>
                                                <div>
                                                    <div style="font-weight:600">
                                                        ${d.producto?.nombre || 'Producto'}
                                                        ${d.tipo_unidad === 'caja' ? `<span style="font-size:10px;background:var(--primary-50);color:var(--primary);padding:2px 7px;border-radius:10px;margin-left:4px;font-weight:700">CAJA</span>` : ''}
                                                    </div>
                                                    <div style="font-size:12px;color:var(--text-muted)">${d.producto?.codigo || ''}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>$${formatNumber(d.precio_unitario)}<div style="font-size:11px;color:var(--text-muted)">/ ${d.tipo_unidad === 'caja' ? 'caja' : 'unidad'}</div></td>
                                        <td>${d.cantidad} ${d.tipo_unidad === 'caja' ? (d.cantidad > 1 ? 'cajas' : 'caja') : (d.cantidad > 1 ? 'uds' : 'ud')}</td>
                                        <td><strong>$${formatNumber(d.subtotal)}</strong></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div style="padding:20px">
                        <div class="cart-summary">
                            <div class="cart-summary-row"><span>Subtotal</span><span>$${formatNumber(p.subtotal)}</span></div>
                            ${p.descuento > 0 ? `<div class="cart-summary-row"><span>Descuento</span><span>-$${formatNumber(p.descuento)}</span></div>` : ''}
                            ${p.impuesto > 0 ? `<div class="cart-summary-row"><span>Impuesto</span><span>$${formatNumber(p.impuesto)}</span></div>` : ''}
                            <div class="cart-summary-row total"><span>Total</span><span>$${formatNumber(p.total)}</span></div>
                        </div>
                    </div>
                </div>
                ${p.notas ? `<div class="card" style="margin-bottom:20px"><div class="card-body"><strong>Notas:</strong> ${p.notas}</div></div>` : ''}
            </div>
            <div>
                ${feCardPedido(p)}
                <div class="card" style="margin-bottom:20px">
                    <div class="card-header"><h3>Información</h3></div>
                    <div class="card-body">
                        <div class="info-row"><label>Cliente</label><span>${p.cliente?.nombre || 'N/A'}</span></div>
                        ${p.cliente?.razon_social ? `<div class="info-row"><label>Negocio</label><span>${p.cliente.razon_social}</span></div>` : ''}
                        <div class="info-row"><label>Teléfono</label><span>${p.cliente?.telefono || '-'}</span></div>
                        <div class="info-row"><label>Dirección</label><span>${p.cliente?.direccion || '-'}</span></div>
                        <div class="info-row"><label>Vendedor</label><span>${p.vendedor?.nombre || 'N/A'}</span></div>
                        ${p.ruta ? `<div class="info-row"><label>Ruta</label><span style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:14px;background:${p.ruta.color}22;color:${p.ruta.color};font-weight:600;font-size:12px"><i class="fas fa-route"></i>${p.ruta.nombre}</span></div>` : ''}
                        <div class="info-row"><label>Fecha</label><span>${formatDate(p.fecha_pedido)}</span></div>
                        ${p.fecha_entrega ? `<div class="info-row"><label>Entrega</label><span>${p.fecha_entrega}</span></div>` : ''}
                    </div>
                </div>
                <div class="card" style="margin-bottom:20px">
                    <div class="card-header"><h3>Cambiar Estado</h3></div>
                    <div class="card-body">
                        <select class="filter-select" style="width:100%;margin-bottom:12px" id="cambiar-estado-select">
                            ${['pendiente','procesando','enviado','entregado','cancelado'].map(e =>
                                `<option value="${e}" ${e === p.estado ? 'selected' : ''}>${e.charAt(0).toUpperCase() + e.slice(1)}</option>`
                            ).join('')}
                        </select>
                        <input type="text" class="filter-select" style="width:100%;margin-bottom:12px" id="cambiar-estado-comentario" placeholder="Comentario (opcional)">
                        <button class="btn btn-primary btn-block" onclick="cambiarEstadoPedido(${p.id_pedido})">
                            <i class="fas fa-sync-alt"></i> Actualizar Estado
                        </button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><h3>Historial</h3></div>
                    <div class="card-body">
                        <div class="timeline">
                            ${(p.historial || []).reverse().map(h => `
                                <div class="timeline-item">
                                    <div class="timeline-dot"></div>
                                    <div class="time">${formatDate(h.fecha)}</div>
                                    <div class="event"><span class="badge-status badge-${h.estado_nuevo}">${h.estado_nuevo}</span></div>
                                    <div class="comment">${h.comentario || ''} - ${h.usuario?.nombre || ''}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function cambiarEstadoPedido(id) {
    const estado = document.getElementById('cambiar-estado-select').value;
    const comentario = document.getElementById('cambiar-estado-comentario').value;

    const data = await api(`/pedidos/${id}/estado`, {
        method: 'PUT',
        body: JSON.stringify({ estado, comentario })
    });

    if (data && !data.error) {
        toast('Estado actualizado correctamente');
        viewPedido(id);
    } else {
        toast(data?.mensaje || 'Error al actualizar', 'error');
    }
}

window._printPedido = async (id) => {
    const data = await api(`/pedidos/${id}`);
    if (!data || data.error) return;
    const p = data.pedido;

    const detalleRows = (p.detalles || []).map(d => {
        const tipoLabel = d.tipo_unidad === 'caja' ? (d.cantidad > 1 ? 'cajas' : 'caja') : (d.cantidad > 1 ? 'unidades' : 'unidad');
        const esCaja = d.tipo_unidad === 'caja';
        return `
        <tr>
            <td>${d.producto?.nombre || 'Producto'}${esCaja ? ' <span style="background:#E0E7FF;color:#4338CA;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:700">CAJA</span>' : ''}</td>
            <td>${d.producto?.codigo || '-'}</td>
            <td style="text-align:center">${d.cantidad} ${tipoLabel}</td>
            <td style="text-align:right">$${formatNumber(d.precio_unitario)}<br><span style="font-size:10px;color:#666">/ ${esCaja ? 'caja' : 'unidad'}</span></td>
            <td style="text-align:right">$${formatNumber(d.subtotal)}</td>
        </tr>
        `;
    }).join('');

    printHTML(`
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
            <div>
                <h1 style="margin:0 0 4px">Pedido ${p.numero_pedido}</h1>
                <p style="color:#666;margin:0">Fecha: ${formatDate(p.fecha_pedido)}</p>
                ${p.fecha_entrega ? `<p style="color:#666;margin:0">Entrega: ${p.fecha_entrega}</p>` : ''}
            </div>
            <div style="text-align:right">
                <div style="display:inline-block;padding:6px 16px;border:2px solid #333;border-radius:6px;font-weight:700;text-transform:uppercase">${p.estado}</div>
            </div>
        </div>

        <div style="display:flex;gap:40px;margin-bottom:24px">
            <div style="flex:1">
                <h3 style="font-size:12px;text-transform:uppercase;color:#999;margin-bottom:6px">Cliente</h3>
                <p style="font-weight:600;margin:0">${p.cliente?.nombre || 'N/A'}</p>
                ${p.cliente?.razon_social ? `<p style="font-weight:700;margin:2px 0;font-size:15px">${p.cliente.razon_social}</p>` : ''}
                <p style="color:#666;margin:2px 0">${p.cliente?.nit_cedula ? 'NIT/CC: ' + p.cliente.nit_cedula : ''}</p>
                <p style="color:#666;margin:2px 0">${p.cliente?.telefono || ''}</p>
                <p style="color:#666;margin:2px 0">${p.cliente?.direccion || ''} ${p.cliente?.ciudad || ''}</p>
            </div>
            <div style="flex:1">
                <h3 style="font-size:12px;text-transform:uppercase;color:#999;margin-bottom:6px">Vendedor</h3>
                <p style="font-weight:600;margin:0">${p.vendedor?.nombre || 'N/A'}</p>
            </div>
        </div>

        <table>
            <thead><tr><th>Producto</th><th>Código</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
            <tbody>${detalleRows}</tbody>
        </table>

        <div style="display:flex;justify-content:flex-end;margin-top:16px">
            <div style="width:280px">
                <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span>Subtotal</span><span>$${formatNumber(p.subtotal)}</span></div>
                ${parseFloat(p.descuento) > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span>Descuento</span><span>-$${formatNumber(p.descuento)}</span></div>` : ''}
                ${parseFloat(p.impuesto) > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee"><span>Impuesto</span><span>$${formatNumber(p.impuesto)}</span></div>` : ''}
                <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:18px;font-weight:800;border-top:2px solid #333"><span>TOTAL</span><span>$${formatNumber(p.total)}</span></div>
            </div>
        </div>

        ${p.notas ? `<div style="margin-top:20px;padding:12px;background:#f9f9f9;border-radius:6px"><strong>Notas:</strong> ${p.notas}</div>` : ''}

        <div style="margin-top:48px;display:flex;gap:40px">
            <div style="flex:1;text-align:center;border-top:1px solid #999;padding-top:8px;font-size:12px;color:#666">Firma del Vendedor</div>
            <div style="flex:1;text-align:center;border-top:1px solid #999;padding-top:8px;font-size:12px;color:#666">Firma del Cliente</div>
        </div>
    `);
};

window._editarPedido = async (id) => {
    const data = await api(`/pedidos/${id}`);
    if (!data || data.error) return;
    const p = data.pedido;

    const prodResp = await api('/productos');
    const allProductos = prodResp?.productos || [];

    let editCart = (p.detalles || []).map(d => ({
        id_producto: d.id_producto,
        nombre: d.producto?.nombre || 'Producto',
        precio_unitario: parseFloat(d.precio_unitario),
        cantidad: d.cantidad,
        foto: d.producto?.foto,
        tipo_unidad: d.tipo_unidad || 'unidad',
        unidades_por_caja: parseInt(d.producto?.unidades_por_caja) || 1,
        precio_base: d.tipo_unidad === 'caja' ? parseFloat(d.precio_unitario) / Math.max(1, parseInt(d.producto?.unidades_por_caja) || 1) : parseFloat(d.precio_unitario),
    }));

    function renderEditModal() {
        let subtotal = editCart.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0);

        openModal(`Editar Pedido ${p.numero_pedido}`, `
            <div style="margin-bottom:16px;padding:12px;background:var(--primary-50);border-radius:var(--radius);font-size:13px">
                <strong>Cliente:</strong> ${p.cliente?.nombre || 'N/A'} • <strong>Estado:</strong> <span class="badge-status badge-${p.estado}">${p.estado}</span>
            </div>

            <div class="search-box" style="margin-bottom:12px">
                <input type="text" id="edit-search-prod" placeholder="Buscar producto para agregar...">
                <i class="fas fa-search"></i>
            </div>
            <div id="edit-prod-suggest" style="max-height:140px;overflow-y:auto;margin-bottom:12px"></div>

            <h4 style="font-size:13px;color:var(--text-muted);margin-bottom:8px">PRODUCTOS DEL PEDIDO (${editCart.length})</h4>
            <div id="edit-cart-items" style="max-height:280px;overflow-y:auto"></div>

            <div class="cart-summary" style="margin-top:16px">
                <div class="cart-summary-row total"><span>Total</span><span id="edit-total">$${formatNumber(subtotal)}</span></div>
            </div>

            <div class="form-group" style="margin-top:16px;margin-bottom:8px">
                <label>Ruta de despacho</label>
                <select id="edit-ruta" style="padding:12px 14px;border:2px solid var(--border);border-radius:var(--radius);width:100%;font-family:var(--font);font-size:14px">
                    <option value="">Sin ruta asignada</option>
                </select>
            </div>
            <div class="form-group" style="margin-bottom:0">
                <label>Notas</label>
                <textarea id="edit-notas" style="padding-left:14px">${p.notas || ''}</textarea>
            </div>
        `, `
            <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" id="edit-pedido-save"><i class="fas fa-save"></i> Guardar Cambios</button>
        `);

        renderEditCart();

        // Cargar rutas en el select de edición
        api('/rutas').then(rd => {
            const sel = document.getElementById('edit-ruta');
            if (sel && rd?.rutas) {
                rd.rutas.forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r.id_ruta;
                    opt.textContent = r.nombre;
                    if (p.id_ruta == r.id_ruta) opt.selected = true;
                    sel.appendChild(opt);
                });
            }
        });

        document.getElementById('edit-search-prod').addEventListener('input', debounce(function () {
            const term = this.value.toLowerCase().trim();
            const suggest = document.getElementById('edit-prod-suggest');
            if (!term) { suggest.innerHTML = ''; return; }
            const matches = allProductos.filter(pr =>
                pr.nombre.toLowerCase().includes(term) || (pr.codigo || '').toLowerCase().includes(term)
            ).slice(0, 8);

            if (matches.length === 0) { suggest.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:13px">Sin resultados</div>'; return; }

            suggest.innerHTML = matches.map(pr => `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border-light);border-radius:8px;margin-bottom:4px;cursor:pointer" onclick="window._editAddProd(${pr.id_producto})">
                    <div style="width:32px;height:32px;border-radius:6px;background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                        ${pr.foto ? `<img src="${UPLOADS_URL}${pr.foto}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-box" style="color:var(--text-muted);font-size:14px"></i>'}
                    </div>
                    <div style="flex:1;font-size:13px"><strong>${pr.nombre}</strong></div>
                    <div style="font-size:13px;color:var(--primary);font-weight:700">$${formatNumber(pr.precio)}</div>
                </div>
            `).join('');
        }, 300));

        document.getElementById('edit-pedido-save').onclick = async () => {
            if (editCart.length === 0) { toast('El pedido debe tener al menos un producto', 'warning'); return; }

            const btn = document.getElementById('edit-pedido-save');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

            const body = {
                items: editCart.map(item => ({
                    id_producto: item.id_producto,
                    cantidad: item.cantidad,
                    tipo_unidad: item.tipo_unidad || 'unidad',
                    precio_unitario: item.precio_unitario,
                })),
                notas: document.getElementById('edit-notas').value || null,
                id_ruta: document.getElementById('edit-ruta')?.value || null,
            };

            const resp = await api(`/pedidos/${id}`, { method: 'PUT', body: JSON.stringify(body) });
            if (resp && !resp.error) {
                toast('Pedido actualizado correctamente');
                closeModal();
                viewPedido(id);
            } else {
                toast(resp?.mensaje || 'Error al actualizar', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
            }
        };
    }

    function renderEditCart() {
        const items = document.getElementById('edit-cart-items');
        const total = document.getElementById('edit-total');
        let subtotal = 0;

        if (editCart.length === 0) {
            items.innerHTML = '<div class="empty-state" style="padding:20px"><i class="fas fa-cart-arrow-down"></i><p>Sin productos</p></div>';
        } else {
            items.innerHTML = editCart.map((item, i) => {
                const lineTotal = item.precio_unitario * item.cantidad;
                subtotal += lineTotal;
                return `
                    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px;border:1px solid var(--border-light);border-radius:8px;margin-bottom:6px">
                        <div style="width:36px;height:36px;border-radius:6px;background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                            ${item.foto ? `<img src="${UPLOADS_URL}${item.foto}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-box" style="color:var(--text-muted);font-size:14px"></i>'}
                        </div>
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                                ${item.nombre}
                                ${item.tipo_unidad === 'caja' ? `<span style="font-size:10px;background:var(--primary-50);color:var(--primary);padding:2px 6px;border-radius:8px;margin-left:4px;font-weight:700">CAJA</span>` : ''}
                            </div>
                            <div style="font-size:12px;color:var(--text-muted)">$${formatNumber(item.precio_unitario)} / ${item.tipo_unidad === 'caja' ? 'caja' : 'und'}</div>
                        </div>
                        <div class="qty-control">
                            <button onclick="window._editQty(${i}, -1)">-</button>
                            <input type="number" value="${item.cantidad}" min="1" onchange="window._editSetQty(${i}, this.value)">
                            <button onclick="window._editQty(${i}, 1)">+</button>
                        </div>
                        <div style="font-weight:700;font-size:13px;min-width:70px;text-align:right">$${formatNumber(lineTotal)}</div>
                        <button class="cart-item-remove" onclick="window._editRemove(${i})"><i class="fas fa-trash-alt"></i></button>
                        <div style="width:100%;display:flex;gap:6px;margin-top:4px">
                            <button class="btn btn-sm ${item.tipo_unidad === 'unidad' ? 'btn-primary' : 'btn-outline'}" style="flex:1" onclick="window._editToggleTipo(${i}, 'unidad')"><i class="fas fa-cube"></i> Unidad</button>
                            <button class="btn btn-sm ${item.tipo_unidad === 'caja' ? 'btn-primary' : 'btn-outline'}" style="flex:1" onclick="window._editToggleTipo(${i}, 'caja')"><i class="fas fa-box"></i> Caja${item.unidades_por_caja > 1 ? ' x' + item.unidades_por_caja : ''}</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
        total.textContent = '$' + formatNumber(subtotal);
    }

    window._editAddProd = (idProd) => {
        const existing = editCart.find(c => c.id_producto === idProd);
        if (existing) { existing.cantidad++; }
        else {
            const pr = allProductos.find(x => x.id_producto === idProd);
            editCart.push({
                id_producto: pr.id_producto,
                nombre: pr.nombre,
                precio_unitario: parseFloat(pr.precio),
                cantidad: 1,
                foto: pr.foto,
            });
        }
        document.getElementById('edit-search-prod').value = '';
        document.getElementById('edit-prod-suggest').innerHTML = '';
        renderEditCart();
    };
    window._editQty = (i, d) => { editCart[i].cantidad = Math.max(1, editCart[i].cantidad + d); renderEditCart(); };
    window._editSetQty = (i, v) => { editCart[i].cantidad = Math.max(1, parseInt(v) || 1); renderEditCart(); };
    window._editRemove = (i) => { editCart.splice(i, 1); renderEditCart(); };
    window._editToggleTipo = (i, tipo) => {
        const item = editCart[i];
        if (item.tipo_unidad === tipo) return;
        const upc = item.unidades_por_caja && item.unidades_por_caja > 1 ? item.unidades_por_caja : 1;
        item.tipo_unidad = tipo;
        item.precio_unitario = tipo === 'caja' ? item.precio_base * upc : item.precio_base;
        renderEditCart();
    };

    renderEditModal();
};

window._printTicket = async (id) => {
    const data = await api(`/pedidos/${id}`);
    if (!data || data.error) return;
    const p = data.pedido;

    const items = (p.detalles || []).map(d => {
        const esCaja = d.tipo_unidad === 'caja';
        const tipoAbrev = esCaja ? 'CJA' : 'UND';
        return `
        <tr>
            <td style="padding:3px 0;font-size:12px">
                ${d.producto?.nombre || 'Producto'}
                ${esCaja ? '<br><span style="font-size:10px;font-weight:700">[CAJA]</span>' : ''}
            </td>
            <td style="padding:3px 0;text-align:center;font-size:14px"><span class="num" style="font-size:16px">${d.cantidad}</span> ${tipoAbrev}</td>
            <td style="padding:3px 0;text-align:right;font-size:12px" class="num">$${formatNumber(d.subtotal)}</td>
        </tr>
        `;
    }).join('');

    const win = window.open('', '_blank', 'width=350,height=600');
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Ticket ${p.numero_pedido}</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: Tahoma, Verdana, sans-serif; width: 80mm; padding: 6px; font-size: 13px; color: #000; line-height: 1.3; font-weight: 500; font-variant-numeric: tabular-nums; }
                .center { text-align: center; }
                .bold { font-weight: 700; }
                .divider { border-top: 1px dashed #000; margin: 6px 0; }
                table { width: 100%; border-collapse: collapse; }
                .total-line { display: flex; justify-content: space-between; padding: 2px 0; font-size: 13px; }
                .total-big { font-size: 17px; font-weight: 700; }
                .num { font-family: Tahoma, Verdana, sans-serif; font-weight: 700; letter-spacing: 1px; }
                tr { page-break-inside: avoid; }
                @media print {
                    body { width: 80mm; padding: 0; font-family: Tahoma, Verdana, sans-serif; transform-origin: top left; }
                    @page { size: 80mm auto; margin: 3mm; }
                    html, body { height: auto !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    tr, .no-break { page-break-inside: avoid; break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="center bold" style="font-size:18px;margin-bottom:2px">PEDIDOS CRUZ</div>
            <div class="center" style="font-size:11px;margin-bottom:8px">Sistema de Gestión de Pedidos</div>
            <div class="divider"></div>

            <div class="center bold" style="font-size:15px;margin:6px 0">${p.numero_pedido}</div>
            <div style="font-size:12px">
                <div>Fecha: ${formatDate(p.fecha_pedido)}</div>
                <div>Estado: ${p.estado.toUpperCase()}</div>
            </div>
            <div class="divider"></div>

            <div style="font-size:12px;margin-bottom:4px">
                <div class="bold">Cliente: ${p.cliente?.nombre || 'N/A'}</div>
                ${p.cliente?.razon_social ? '<div class="bold">Negocio: ' + p.cliente.razon_social + '</div>' : ''}
                ${p.cliente?.nit_cedula ? '<div>NIT/CC: ' + p.cliente.nit_cedula + '</div>' : ''}
                ${p.cliente?.telefono ? '<div>Tel: ' + p.cliente.telefono + '</div>' : ''}
                ${p.cliente?.direccion ? '<div>Dir: ' + p.cliente.direccion + '</div>' : ''}
            </div>
            <div class="divider"></div>

            <div class="bold" style="font-size:12px;margin-bottom:4px">Vendedor: ${p.vendedor?.nombre || 'N/A'}</div>
            <div class="divider"></div>

            <table>
                <thead>
                    <tr style="border-bottom:1px solid #000">
                        <th style="text-align:left;padding:3px 0;font-size:11px">PRODUCTO</th>
                        <th style="text-align:center;padding:3px 0;font-size:11px">CANT</th>
                        <th style="text-align:right;padding:3px 0;font-size:11px">TOTAL</th>
                    </tr>
                </thead>
                <tbody>${items}</tbody>
            </table>
            <div class="divider"></div>

            <div class="total-line"><span>Subtotal</span><span>$${formatNumber(p.subtotal)}</span></div>
            ${parseFloat(p.descuento) > 0 ? '<div class="total-line"><span>Descuento</span><span>-$' + formatNumber(p.descuento) + '</span></div>' : ''}
            ${parseFloat(p.impuesto) > 0 ? '<div class="total-line"><span>Impuesto</span><span>$' + formatNumber(p.impuesto) + '</span></div>' : ''}
            <div class="divider" style="border-top-style:double;border-width:3px"></div>
            <div class="total-line total-big"><span>TOTAL</span><span>$${formatNumber(p.total)}</span></div>
            <div class="divider"></div>

            ${p.notas ? '<div style="font-size:11px;margin:4px 0">Notas: ' + p.notas + '</div><div class="divider"></div>' : ''}
            ${p.fecha_entrega ? '<div style="font-size:11px;margin:4px 0">Entrega: ' + p.fecha_entrega + '</div><div class="divider"></div>' : ''}

            <div class="center" style="font-size:12px;margin-top:8px">¡Gracias por su compra!</div>
            <div class="center" style="font-size:10px;color:#000;margin-top:4px">${new Date().toLocaleString('es-CO')}</div>

            <script>window.onload = function() { setTimeout(function(){ window.print(); }, 150); }<\/script>
        </body>
        </html>
    `);
    win.document.close();
};

// ========================================
// NUEVO PEDIDO (Wizard)
// ========================================
async function renderNuevoPedido(forceNew = false) {
    if (!forceNew && (state.cart.length > 0 || state.selectedClient)) {
        // Has saved progress - resume
    } else {
        clearCartState();
    }
    let wizardStep = (state.selectedClient && state.selectedRuta) ? (state.cart.length > 0 ? 2 : 1) : 1;
    let allClientes = [];
    let allProductos = [];

    const container = document.getElementById('page-container');

    function renderWizard() {
        container.innerHTML = `
            <div class="wizard-steps">
                <div class="wizard-step ${wizardStep >= 1 ? (wizardStep > 1 ? 'done' : 'active') : ''}">
                    <span class="step-num">${wizardStep > 1 ? '<i class="fas fa-check"></i>' : '1'}</span>
                    <span>Cliente</span>
                </div>
                <div class="wizard-connector"></div>
                <div class="wizard-step ${wizardStep >= 2 ? (wizardStep > 2 ? 'done' : 'active') : ''}">
                    <span class="step-num">${wizardStep > 2 ? '<i class="fas fa-check"></i>' : '2'}</span>
                    <span>Productos</span>
                </div>
                <div class="wizard-connector"></div>
                <div class="wizard-step ${wizardStep >= 3 ? 'active' : ''}">
                    <span class="step-num">3</span>
                    <span>Confirmar</span>
                </div>
            </div>
            <div id="wizard-content" class="fade-in"></div>
        `;

        if (wizardStep === 1) renderStep1();
        else if (wizardStep === 2) renderStep2();
        else renderStep3();
    }

    // STEP 1: Select Client
    async function renderStep1() {
        const wc = document.getElementById('wizard-content');
        wc.innerHTML = `
            <div class="card" style="margin-bottom:16px">
                <div class="card-header">
                    <h3><i class="fas fa-route" style="color:var(--primary);margin-right:8px"></i>Ruta de Despacho <span style="color:var(--danger);margin-left:6px">*</span></h3>
                </div>
                <div class="card-body">
                    <select id="wizard-ruta" style="padding:14px 16px;border:2px solid var(--border);border-radius:var(--radius);width:100%;font-family:var(--font);font-size:15px;font-weight:600">
                        <option value="">Seleccione una ruta...</option>
                    </select>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-user" style="color:var(--primary);margin-right:8px"></i>Seleccionar Cliente</h3>
                    <button class="btn btn-outline btn-sm" onclick="window._wizardAddClient()"><i class="fas fa-plus"></i> Nuevo Cliente</button>
                </div>
                <div class="card-body">
                    <div class="search-box" style="margin-bottom:20px">
                        <input type="text" id="search-clientes-wizard" placeholder="Buscar cliente por nombre, cédula o teléfono...">
                        <i class="fas fa-search"></i>
                    </div>
                    <div id="clientes-list" style="display:grid;gap:10px;max-height:400px;overflow-y:auto"></div>
                </div>
            </div>
        `;

        // Cargar rutas
        api('/rutas').then(rd => {
            const sel = document.getElementById('wizard-ruta');
            if (sel && rd?.rutas) {
                rd.rutas.forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r.id_ruta;
                    opt.textContent = r.nombre;
                    opt.dataset.color = r.color;
                    opt.dataset.nombre = r.nombre;
                    if (state.selectedRuta && state.selectedRuta.id_ruta == r.id_ruta) opt.selected = true;
                    sel.appendChild(opt);
                });
                sel.addEventListener('change', async function () {
                    const opt = this.options[this.selectedIndex];
                    if (this.value) {
                        state.selectedRuta = { id_ruta: parseInt(this.value), nombre: opt.dataset.nombre, color: opt.dataset.color };
                        this.style.borderColor = 'var(--border)';
                    } else {
                        state.selectedRuta = null;
                    }
                    state.selectedClient = null;
                    saveCartState();
                    await reloadClientes();
                });
            }
        });

        async function reloadClientes() {
            const url = state.selectedRuta ? `/clientes?id_ruta=${state.selectedRuta.id_ruta}` : '/clientes';
            const cd = await api(url);
            if (cd) allClientes = cd.clientes || [];
            renderClientesList(allClientes);
        }

        const data = await api(state.selectedRuta ? `/clientes?id_ruta=${state.selectedRuta.id_ruta}` : '/clientes');
        if (data) allClientes = data.clientes || [];

        function renderClientesList(clientes) {
            const list = document.getElementById('clientes-list');
            if (clientes.length === 0) {
                list.innerHTML = `<div class="empty-state"><i class="fas fa-user-slash"></i><p>${state.selectedRuta ? 'No hay clientes asignados a la ruta <strong>' + state.selectedRuta.nombre + '</strong>' : 'No se encontraron clientes'}</p></div>`;
                return;
            }
            list.innerHTML = clientes.map(c => {
                const primary = c.razon_social || c.nombre;
                const secondary = c.razon_social ? c.nombre : '';
                return `
                <div class="client-card ${state.selectedClient?.id_cliente === c.id_cliente ? 'selected' : ''}" onclick="window._selectClient(${c.id_cliente})">
                    <div class="client-avatar">${primary.charAt(0).toUpperCase()}</div>
                    <div class="client-card-info">
                        <h4>${primary}${secondary ? ' <span style="color:var(--text-muted);font-weight:500;font-size:12px">— ' + secondary + '</span>' : ''}</h4>
                        <p>${c.nit_cedula || ''} ${c.telefono ? '• ' + c.telefono : ''} ${c.ciudad ? '• ' + c.ciudad : ''}</p>
                    </div>
                    ${state.selectedClient?.id_cliente === c.id_cliente ? '<i class="fas fa-check-circle" style="color:var(--primary);font-size:20px"></i>' : ''}
                </div>
                `;
            }).join('');
        }

        renderClientesList(allClientes);

        document.getElementById('search-clientes-wizard').addEventListener('input', debounce(function () {
            const term = this.value.toLowerCase();
            renderClientesList(allClientes.filter(c =>
                c.nombre.toLowerCase().includes(term) ||
                (c.razon_social || '').toLowerCase().includes(term) ||
                (c.nit_cedula || '').includes(term) ||
                (c.telefono || '').includes(term)
            ));
        }, 300));

        window._selectClient = (id) => {
            if (!state.selectedRuta) {
                toast('Primero selecciona una ruta de despacho', 'warning');
                const sel = document.getElementById('wizard-ruta');
                if (sel) {
                    sel.style.borderColor = 'var(--danger)';
                    sel.focus();
                    sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }
            state.selectedClient = allClientes.find(c => c.id_cliente === id);
            saveCartState();
            wizardStep = 2;
            renderWizard();
        };

        window._wizardAddClient = () => openClientModal(() => {
            // Reload clients
            api('/clientes').then(data => {
                if (data) allClientes = data.clientes || [];
                renderClientesList(allClientes);
            });
        });
    }

    // STEP 2: Add Products
    async function renderStep2() {
        const wc = document.getElementById('wizard-content');
        wc.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:14px 18px;background:var(--primary-50);border-radius:var(--radius);border:1px solid var(--primary-100)">
                <div class="client-avatar" style="width:44px;height:44px;border-radius:12px;font-size:18px">${(state.selectedClient.razon_social || state.selectedClient.nombre).charAt(0).toUpperCase()}</div>
                <div style="flex:1;min-width:0">
                    ${state.selectedClient.razon_social
                        ? `<div style="font-weight:700;font-size:16px;color:var(--text)">${state.selectedClient.razon_social}</div>
                           <div style="font-size:12px;color:var(--text-muted)">${state.selectedClient.nombre}${state.selectedClient.telefono ? ' • ' + state.selectedClient.telefono : ''}</div>`
                        : `<div style="font-weight:700;font-size:16px;color:var(--text)">${state.selectedClient.nombre}</div>
                           <div style="font-size:12px;color:var(--text-muted)">${state.selectedClient.telefono || ''}</div>`
                    }
                </div>
                <button class="btn btn-ghost btn-sm" onclick="window._backToStep1()"><i class="fas fa-pen"></i> Cambiar</button>
            </div>
            <div class="pedido-wizard-layout">
                <div class="card pedido-wizard-productos">
                    <div class="card-header">
                        <h3><i class="fas fa-box-open" style="color:var(--primary);margin-right:8px"></i>Productos</h3>
                    </div>
                    <div class="card-body">
                        <div class="search-box" style="margin-bottom:16px">
                            <input type="text" id="search-prods-wizard" placeholder="Buscar producto...">
                            <i class="fas fa-search"></i>
                        </div>
                        <div class="product-grid" id="products-grid"></div>
                    </div>
                </div>
                <div class="card pedido-wizard-carrito" style="align-self:start;position:sticky;top:80px">
                    <div class="card-header">
                        <h3><i class="fas fa-shopping-cart" style="color:var(--success);margin-right:8px"></i>Carrito</h3>
                        <span id="cart-count" style="font-size:13px;color:var(--text-muted)">0 items</span>
                    </div>
                    <div class="card-body" style="padding:12px">
                        <div id="cart-items"></div>
                        <div id="cart-summary-area"></div>
                        <button class="btn btn-primary btn-block btn-lg" id="btn-go-step3" style="margin-top:16px;display:none" onclick="window._goStep3()">
                            <i class="fas fa-arrow-right"></i> Confirmar Pedido
                        </button>
                    </div>
                </div>
            </div>
        `;

        const data = await api('/productos');
        if (data) allProductos = data.productos || [];

        function renderProducts(productos) {
            const grid = document.getElementById('products-grid');
            grid.innerHTML = productos.map(p => `
                <div class="product-card ${state.cart.find(c => c.id_producto === p.id_producto) ? 'selected' : ''}" onclick="window._addToCart(${p.id_producto})">
                    <div class="product-card-img" style="position:relative">
                        ${p.foto ? `<img src="${UPLOADS_URL}${p.foto}" alt="${p.nombre}">` : '<i class="fas fa-box"></i>'}
                        ${p.foto ? `<button onclick="event.stopPropagation();window._previewFoto(${p.id_producto})" title="Ver imagen" style="position:absolute;top:6px;right:6px;width:32px;height:32px;border-radius:50%;border:none;background:rgba(0,0,0,0.65);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;backdrop-filter:blur(4px)"><i class="fas fa-search-plus"></i></button>` : ''}
                    </div>
                    <div class="product-card-body">
                        <h4>${p.nombre}</h4>
                        <div class="price">$${formatNumber(p.precio)}</div>
                        <div class="stock">Stock: ${p.stock} uds</div>
                    </div>
                </div>
            `).join('');
        }

        window._previewFoto = (id) => {
            const p = allProductos.find(x => x.id_producto === id);
            if (!p || !p.foto) return;
            openModal(p.nombre, `
                <div style="text-align:center">
                    <img src="${UPLOADS_URL}${p.foto}" alt="${p.nombre}" style="max-width:100%;max-height:65vh;border-radius:var(--radius);object-fit:contain">
                </div>
                <div style="margin-top:14px;text-align:center">
                    <div style="font-size:22px;font-weight:800;color:var(--primary)">$${formatNumber(p.precio)}</div>
                    <div style="font-size:13px;color:var(--text-muted);margin-top:4px">${p.codigo || ''} ${p.codigo ? '•' : ''} Stock: ${p.stock} uds</div>
                    ${p.descripcion ? `<p style="margin-top:10px;font-size:14px;color:var(--text-secondary)">${p.descripcion}</p>` : ''}
                </div>
            `, `
                <button class="btn btn-outline" onclick="closeModal()">Cerrar</button>
                <button class="btn btn-primary" onclick="closeModal();window._addToCart(${p.id_producto})"><i class="fas fa-cart-plus"></i> Agregar al pedido</button>
            `);
        };

        function renderCart() {
            const items = document.getElementById('cart-items');
            const summary = document.getElementById('cart-summary-area');
            const countEl = document.getElementById('cart-count');
            const btn = document.getElementById('btn-go-step3');

            countEl.textContent = `${state.cart.length} items`;

            if (state.cart.length === 0) {
                items.innerHTML = '<div class="empty-state" style="padding:30px"><i class="fas fa-shopping-cart"></i><p>Agrega productos al carrito</p></div>';
                summary.innerHTML = '';
                btn.style.display = 'none';
                return;
            }

            btn.style.display = '';
            let subtotal = 0;

            items.innerHTML = state.cart.map((item, i) => {
                const lineTotal = item.precio_unitario * item.cantidad;
                subtotal += lineTotal;
                return `
                    <div class="cart-item" style="flex-wrap:wrap">
                        <div class="cart-item-img">
                            ${item.foto ? `<img src="${UPLOADS_URL}${item.foto}">` : '<i class="fas fa-box" style="color:var(--text-muted)"></i>'}
                        </div>
                        <div class="cart-item-info" style="flex:1;min-width:0">
                            <h4 style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.nombre}</h4>
                            <div class="price">$${formatNumber(item.precio_unitario)} / ${item.tipo_unidad === 'caja' ? 'caja' : 'unidad'}</div>
                        </div>
                        <button class="cart-item-remove" onclick="window._removeFromCart(${i})"><i class="fas fa-trash-alt"></i></button>
                        <div style="width:100%;display:flex;gap:6px;margin-top:8px">
                            <button class="btn btn-sm ${item.tipo_unidad === 'unidad' ? 'btn-primary' : 'btn-outline'}" style="flex:1" onclick="if(state.cart[${i}].tipo_unidad !== 'unidad') window._toggleTipoUnidad(${i})">
                                <i class="fas fa-cube"></i> Unidad
                            </button>
                            <button class="btn btn-sm ${item.tipo_unidad === 'caja' ? 'btn-primary' : 'btn-outline'}" style="flex:1" onclick="if(state.cart[${i}].tipo_unidad !== 'caja') window._toggleTipoUnidad(${i})">
                                <i class="fas fa-box"></i> Caja${item.unidades_por_caja > 1 ? ' x' + item.unidades_por_caja : ''}
                            </button>
                        </div>
                        <div style="width:100%;display:flex;align-items:center;justify-content:space-between;margin-top:6px;padding-top:8px;border-top:1px dashed var(--border-light)">
                            <div class="qty-control">
                                <button onclick="window._changeQty(${i}, -1)">-</button>
                                <input type="number" value="${item.cantidad}" min="1" onchange="window._setQty(${i}, this.value)">
                                <button onclick="window._changeQty(${i}, 1)">+</button>
                            </div>
                            <div class="cart-item-total">$${formatNumber(lineTotal)}</div>
                        </div>
                    </div>
                `;
            }).join('');

            summary.innerHTML = `
                <div class="cart-summary">
                    <div class="cart-summary-row total"><span>Total</span><span>$${formatNumber(subtotal)}</span></div>
                </div>
            `;
        }

        renderProducts(allProductos);
        renderCart();

        document.getElementById('search-prods-wizard').addEventListener('input', debounce(function () {
            const term = this.value.toLowerCase();
            renderProducts(allProductos.filter(p =>
                p.nombre.toLowerCase().includes(term) ||
                (p.codigo || '').toLowerCase().includes(term)
            ));
        }, 300));

        function getFilteredWizardProducts() {
            const term = (document.getElementById('search-prods-wizard')?.value || '').toLowerCase();
            if (!term) return allProductos;
            return allProductos.filter(p =>
                p.nombre.toLowerCase().includes(term) ||
                (p.codigo || '').toLowerCase().includes(term)
            );
        }

        window._addToCart = (id) => {
            const existing = state.cart.find(c => c.id_producto === id && c.tipo_unidad === 'unidad');
            if (existing) {
                existing.cantidad++;
            } else {
                const prod = allProductos.find(p => p.id_producto === id);
                state.cart.push({
                    id_producto: prod.id_producto,
                    nombre: prod.nombre,
                    precio_base: parseFloat(prod.precio),
                    precio_unitario: parseFloat(prod.precio),
                    cantidad: 1,
                    foto: prod.foto,
                    stock: prod.stock,
                    tipo_unidad: 'unidad',
                    unidades_por_caja: parseInt(prod.unidades_por_caja) || 1,
                });
            }
            saveCartState();
            renderCart();
            renderProducts(getFilteredWizardProducts());
        };

        window._toggleTipoUnidad = (i) => {
            const item = state.cart[i];
            const upc = item.unidades_por_caja && item.unidades_por_caja > 1 ? item.unidades_por_caja : 1;
            if (item.tipo_unidad === 'caja') {
                item.tipo_unidad = 'unidad';
                item.precio_unitario = item.precio_base;
            } else {
                item.tipo_unidad = 'caja';
                item.precio_unitario = item.precio_base * upc;
            }
            saveCartState();
            renderCart();
        };

        window._changeQty = (i, delta) => {
            state.cart[i].cantidad = Math.max(1, state.cart[i].cantidad + delta);
            saveCartState();
            renderCart();
        };

        window._setQty = (i, val) => {
            state.cart[i].cantidad = Math.max(1, parseInt(val) || 1);
            saveCartState();
            renderCart();
        };

        window._removeFromCart = (i) => {
            state.cart.splice(i, 1);
            saveCartState();
            renderCart();
            renderProducts(getFilteredWizardProducts());
        };

        window._backToStep1 = () => { wizardStep = 1; renderWizard(); };
        window._goStep3 = () => { wizardStep = 3; renderWizard(); };
    }

    // STEP 3: Confirm
    function renderStep3() {
        const wc = document.getElementById('wizard-content');
        let subtotal = state.cart.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0);

        wc.innerHTML = `
            <div class="card fade-in">
                <div class="card-header">
                    <h3><i class="fas fa-clipboard-check" style="color:var(--success);margin-right:8px"></i>Resumen del Pedido</h3>
                </div>
                <div class="card-body">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
                        <div>
                            <h4 style="font-size:13px;color:var(--text-muted);margin-bottom:8px">CLIENTE</h4>
                            <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--bg);border-radius:var(--radius)">
                                <div class="client-avatar" style="width:40px;height:40px;border-radius:12px;font-size:16px">${(state.selectedClient.razon_social || state.selectedClient.nombre).charAt(0).toUpperCase()}</div>
                                <div>
                                    ${state.selectedClient.razon_social
                                        ? `<div style="font-weight:700;font-size:15px">${state.selectedClient.razon_social}</div>
                                           <div style="font-size:12px;color:var(--text-muted)">${state.selectedClient.nombre}${state.selectedClient.telefono ? ' • ' + state.selectedClient.telefono : ''}${state.selectedClient.direccion ? ' • ' + state.selectedClient.direccion : ''}</div>`
                                        : `<div style="font-weight:700;font-size:15px">${state.selectedClient.nombre}</div>
                                           <div style="font-size:12px;color:var(--text-muted)">${state.selectedClient.telefono || ''}${state.selectedClient.direccion ? ' • ' + state.selectedClient.direccion : ''}</div>`
                                    }
                                </div>
                            </div>
                            ${state.selectedRuta ? `
                                <h4 style="font-size:13px;color:var(--text-muted);margin:14px 0 8px">RUTA DE DESPACHO</h4>
                                <div style="display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:var(--radius);background:${state.selectedRuta.color}22;color:${state.selectedRuta.color};font-weight:700;font-size:14px"><i class="fas fa-route"></i> ${state.selectedRuta.nombre}</div>
                            ` : ''}
                        </div>
                        <div>
                            <div class="form-group">
                                <label>Fecha de entrega (opcional)</label>
                                <input type="date" id="fecha-entrega" style="padding-left:14px">
                            </div>
                            <div class="form-group" style="margin-bottom:0">
                                <label>Notas</label>
                                <textarea id="pedido-notas" placeholder="Observaciones del pedido..." style="padding-left:14px"></textarea>
                            </div>
                        </div>
                    </div>

                    <h4 style="font-size:13px;color:var(--text-muted);margin-bottom:12px">PRODUCTOS (${state.cart.length})</h4>
                    ${state.cart.map(item => `
                        <div style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--border-light)">
                            <div style="width:40px;height:40px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                                ${item.foto ? `<img src="${UPLOADS_URL}${item.foto}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-box" style="color:var(--text-muted)"></i>'}
                            </div>
                            <div style="flex:1">
                                <strong>${item.nombre}</strong>
                                ${item.tipo_unidad === 'caja' ? `<span style="font-size:11px;background:var(--primary-50);color:var(--primary);padding:2px 8px;border-radius:10px;margin-left:6px;font-weight:600">CAJA x${item.unidades_por_caja}</span>` : ''}
                            </div>
                            <div style="color:var(--text-muted)">${item.cantidad} ${item.tipo_unidad === 'caja' ? (item.cantidad > 1 ? 'cajas' : 'caja') : (item.cantidad > 1 ? 'uds' : 'ud')} x $${formatNumber(item.precio_unitario)}</div>
                            <div style="font-weight:700;min-width:80px;text-align:right">$${formatNumber(item.precio_unitario * item.cantidad)}</div>
                        </div>
                    `).join('')}

                    <div class="cart-summary" style="margin-top:20px">
                        <div class="cart-summary-row total"><span>Total</span><span>$${formatNumber(subtotal)}</span></div>
                    </div>

                    <div style="display:flex;gap:12px;margin-top:24px;justify-content:flex-end">
                        <button class="btn btn-outline" onclick="window._backStep2()"><i class="fas fa-arrow-left"></i> Editar Productos</button>
                        <button class="btn btn-success btn-lg" id="btn-confirmar" onclick="window._confirmarPedido()">
                            <i class="fas fa-check"></i> Confirmar Pedido
                        </button>
                    </div>
                </div>
            </div>
        `;

        window._backStep2 = () => { wizardStep = 2; renderWizard(); };

        // Cargar rutas
        api('/rutas').then(rd => {
            const sel = document.getElementById('pedido-ruta');
            if (sel && rd?.rutas) {
                rd.rutas.forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r.id_ruta;
                    opt.textContent = r.nombre;
                    sel.appendChild(opt);
                });
            }
        });

        window._confirmarPedido = async () => {
            if (!state.selectedRuta) {
                toast('Falta seleccionar la ruta de despacho. Vuelve al paso 1.', 'warning');
                return;
            }
            const idRuta = state.selectedRuta.id_ruta;

            const btn = document.getElementById('btn-confirmar');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            btn.disabled = true;

            const body = {
                id_cliente: state.selectedClient.id_cliente,
                items: state.cart.map(item => ({
                    id_producto: item.id_producto,
                    cantidad: item.cantidad,
                    tipo_unidad: item.tipo_unidad || 'unidad',
                    precio_unitario: item.precio_unitario,
                })),
                fecha_entrega: document.getElementById('fecha-entrega').value || null,
                id_ruta: idRuta,
                notas: document.getElementById('pedido-notas').value || null,
            };

            const data = await api('/pedidos', {
                method: 'POST',
                body: JSON.stringify(body),
            });

            if (data && !data.error) {
                toast('Pedido creado exitosamente!');
                clearCartState();
                viewPedido(data.pedido.id_pedido);
            } else {
                toast(data?.mensaje || 'Error al crear pedido', 'error');
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Pedido';
                btn.disabled = false;
            }
        };
    }

    renderWizard();
}

// ========================================
// CLIENTES
// ========================================
async function renderClientes() {
    const actionBtn = document.getElementById('header-action-btn');
    actionBtn.style.display = '';
    document.getElementById('header-action-text').textContent = 'Nuevo Cliente';
    actionBtn.onclick = () => openClientModal();

    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="toolbar">
            <div class="search-box">
                <input type="text" id="search-clientes" placeholder="Buscar por nombre, negocio, cédula o teléfono...">
                <i class="fas fa-search"></i>
            </div>
        </div>
        <div class="card">
            <div class="table-wrapper">
                <table class="data-table">
                    <thead><tr><th>Negocio / Cliente</th><th>NIT/Cédula</th><th>Teléfono</th><th>Ruta</th><th>Ciudad</th><th>Vendedor</th><th>Acciones</th></tr></thead>
                    <tbody id="clientes-tbody"></tbody>
                </table>
            </div>
        </div>
    `;

    let allClientes = [];

    async function loadClientes() {
        const data = await api('/clientes');
        if (!data) return;
        allClientes = data.clientes || [];
        renderClientesTable(allClientes);
    }

    function renderClientesTable(clientes) {
        const tbody = document.getElementById('clientes-tbody');
        if (clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-users"></i><h3>Sin clientes</h3></div></td></tr>';
            return;
        }
        tbody.innerHTML = clientes.map(c => {
            const displayPrimary = c.razon_social || c.nombre;
            const displaySecondary = c.razon_social ? c.nombre : '';
            const initial = displayPrimary.charAt(0).toUpperCase();
            return `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px">
                        <div class="client-avatar" style="width:36px;height:36px;border-radius:10px;font-size:14px">${initial}</div>
                        <div>
                            <div style="font-weight:600">${displayPrimary}</div>
                            ${displaySecondary ? `<div style="font-size:12px;color:var(--text-muted)">${displaySecondary}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>${c.nit_cedula || '-'}</td>
                <td>${c.telefono || '-'}</td>
                <td>${c.ruta ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:12px;background:${c.ruta.color}22;color:${c.ruta.color};font-weight:600;font-size:11px"><i class="fas fa-route"></i>${c.ruta.nombre}</span>` : '<span style="color:var(--text-muted);font-size:12px">-</span>'}</td>
                <td>${c.ciudad || '-'}</td>
                <td>${c.vendedor?.nombre || '-'}</td>
                <td>
                    <button class="btn btn-ghost btn-sm" onclick="window._editCliente(${c.id_cliente})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-ghost btn-sm" onclick="window._deleteCliente(${c.id_cliente})" style="color:var(--danger)"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
            `;
        }).join('');
    }

    document.getElementById('search-clientes').addEventListener('input', debounce(function () {
        const term = this.value.toLowerCase();
        renderClientesTable(allClientes.filter(c =>
            c.nombre.toLowerCase().includes(term) ||
            (c.razon_social || '').toLowerCase().includes(term) ||
            (c.nit_cedula || '').includes(term) ||
            (c.telefono || '').includes(term)
        ));
    }, 300));

    window._editCliente = async (id) => {
        const data = await api(`/clientes/${id}`);
        if (data && !data.error) openClientModal(loadClientes, data.cliente);
    };

    window._deleteCliente = async (id) => {
        if (!confirm('¿Eliminar este cliente?')) return;
        const data = await api(`/clientes/${id}`, { method: 'DELETE' });
        if (data && !data.error) { toast('Cliente eliminado'); loadClientes(); }
    };

    loadClientes();
}

function openClientModal(callback, editData = null) {
    const isEdit = !!editData;
    openModal(isEdit ? 'Editar Cliente' : 'Nuevo Cliente', `
        <div class="form-group"><label>Nombre *</label><input type="text" id="m-cli-nombre" placeholder="Nombre del contacto" value="${editData?.nombre || ''}"></div>
        <div class="form-group"><label>Negocio / Razón Social</label><input type="text" id="m-cli-razon" placeholder="Nombre comercial del negocio" value="${editData?.razon_social || ''}"></div>
        <div class="grid-2">
            <div class="form-group"><label>NIT / Cédula</label><input type="text" id="m-cli-nit" value="${editData?.nit_cedula || ''}"></div>
            <div class="form-group"><label>Teléfono</label><input type="text" id="m-cli-tel" value="${editData?.telefono || ''}"></div>
        </div>
        <div class="grid-2">
            <div class="form-group"><label>Email</label><input type="email" id="m-cli-email" value="${editData?.email || ''}"></div>
            <div class="form-group"><label>Ciudad</label><input type="text" id="m-cli-ciudad" value="${editData?.ciudad || ''}"></div>
        </div>
        <div class="form-group"><label>Dirección</label><input type="text" id="m-cli-dir" value="${editData?.direccion || ''}"></div>
        <div class="form-group">
            <label>Ruta de despacho</label>
            <select id="m-cli-ruta" style="padding:12px 14px;border:2px solid var(--border);border-radius:var(--radius);width:100%;font-family:var(--font);font-size:14px">
                <option value="">Sin ruta asignada</option>
            </select>
        </div>
        <div class="form-group"><label>Notas</label><textarea id="m-cli-notas" style="padding-left:14px">${editData?.notas || ''}</textarea></div>
        ${feClienteFieldsHTML(editData)}
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="m-cli-save">${isEdit ? 'Actualizar' : 'Guardar'}</button>
    `);

    feInitClienteFields(editData);

    // Cargar rutas en el select
    api('/rutas').then(rd => {
        const sel = document.getElementById('m-cli-ruta');
        if (sel && rd?.rutas) {
            rd.rutas.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id_ruta;
                opt.textContent = r.nombre;
                if (editData?.id_ruta == r.id_ruta) opt.selected = true;
                sel.appendChild(opt);
            });
        }
    });

    document.getElementById('m-cli-save').onclick = async () => {
        const body = {
            nombre: document.getElementById('m-cli-nombre').value,
            razon_social: document.getElementById('m-cli-razon').value,
            nit_cedula: document.getElementById('m-cli-nit').value,
            telefono: document.getElementById('m-cli-tel').value,
            email: document.getElementById('m-cli-email').value,
            ciudad: document.getElementById('m-cli-ciudad').value,
            direccion: document.getElementById('m-cli-dir').value,
            id_ruta: document.getElementById('m-cli-ruta').value || null,
            notas: document.getElementById('m-cli-notas').value,
            ...feClienteFieldsValues(),
        };

        if (!body.nombre) { toast('El nombre es requerido', 'warning'); return; }

        const url = isEdit ? `/clientes/${editData.id_cliente}` : '/clientes';
        const method = isEdit ? 'PUT' : 'POST';

        const data = await api(url, { method, body: JSON.stringify(body) });
        if (data && !data.error) {
            toast(isEdit ? 'Cliente actualizado' : 'Cliente creado');
            closeModal();
            if (callback) callback();
        } else {
            toast(data?.mensaje || 'Error', 'error');
        }
    };
}

// ========================================
// PRODUCTOS
// ========================================
async function renderProductos() {
    const actionBtn = document.getElementById('header-action-btn');
    actionBtn.style.display = '';
    document.getElementById('header-action-text').textContent = 'Nuevo Producto';
    actionBtn.onclick = () => openProductModal();

    const container = document.getElementById('page-container');
    let viewMode = localStorage.getItem('pc_prod_view') || 'grid';
    let sortMode = localStorage.getItem('pc_prod_sort') || 'reciente';

    container.innerHTML = `
        <div class="toolbar">
            <div class="search-box">
                <input type="text" id="search-productos" placeholder="Buscar por nombre o código...">
                <i class="fas fa-search"></i>
            </div>
            <select class="filter-select" id="filter-categoria">
                <option value="">Todas las categorías</option>
            </select>
            <select class="filter-select" id="sort-productos">
                <option value="nombre" ${sortMode === 'nombre' ? 'selected' : ''}>A-Z Alfabético</option>
                <option value="nombre_desc" ${sortMode === 'nombre_desc' ? 'selected' : ''}>Z-A Alfabético</option>
                <option value="reciente" ${sortMode === 'reciente' ? 'selected' : ''}>Más recientes</option>
                <option value="antiguo" ${sortMode === 'antiguo' ? 'selected' : ''}>Más antiguos</option>
                <option value="precio_asc" ${sortMode === 'precio_asc' ? 'selected' : ''}>Precio menor</option>
                <option value="precio_desc" ${sortMode === 'precio_desc' ? 'selected' : ''}>Precio mayor</option>
                <option value="stock_asc" ${sortMode === 'stock_asc' ? 'selected' : ''}>Menor stock</option>
            </select>
            <div style="display:flex;border:2px solid var(--border);border-radius:var(--radius);overflow:hidden">
                <button class="btn btn-ghost btn-sm view-toggle ${viewMode === 'grid' ? 'active' : ''}" data-view="grid" title="Vista cuadrícula" style="border-radius:0;border-right:1px solid var(--border)"><i class="fas fa-th-large"></i></button>
                <button class="btn btn-ghost btn-sm view-toggle ${viewMode === 'table' ? 'active' : ''}" data-view="table" title="Vista tabla" style="border-radius:0"><i class="fas fa-list"></i></button>
            </div>
        </div>
        <div id="productos-counter" style="margin-bottom:12px;font-size:14px;color:var(--text-secondary);font-weight:500"></div>
        <div id="productos-content-area"></div>
    `;

    let allProductos = [];
    let categorias = [];

    function sortProductos(productos) {
        const sorted = [...productos];
        switch (sortMode) {
            case 'nombre': return sorted.sort((a, b) => a.nombre.localeCompare(b.nombre));
            case 'nombre_desc': return sorted.sort((a, b) => b.nombre.localeCompare(a.nombre));
            case 'reciente': return sorted.sort((a, b) => b.id_producto - a.id_producto);
            case 'antiguo': return sorted.sort((a, b) => a.id_producto - b.id_producto);
            case 'precio_asc': return sorted.sort((a, b) => parseFloat(a.precio) - parseFloat(b.precio));
            case 'precio_desc': return sorted.sort((a, b) => parseFloat(b.precio) - parseFloat(a.precio));
            case 'stock_asc': return sorted.sort((a, b) => a.stock - b.stock);
            default: return sorted;
        }
    }

    function getFilteredProducts() {
        const term = (document.getElementById('search-productos')?.value || '').toLowerCase();
        const catFilter = document.getElementById('filter-categoria')?.value || '';
        let filtered = allProductos;
        if (term) filtered = filtered.filter(p => p.nombre.toLowerCase().includes(term) || (p.codigo || '').toLowerCase().includes(term));
        if (catFilter) filtered = filtered.filter(p => p.id_categoria == catFilter);
        return sortProductos(filtered);
    }

    async function loadProductos() {
        const [prodData, catData] = await Promise.all([api('/productos'), api('/categorias')]);
        if (prodData) allProductos = prodData.productos || [];
        if (catData) {
            categorias = catData.categorias || [];
            const sel = document.getElementById('filter-categoria');
            if (sel && sel.options.length <= 1) {
                categorias.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id_categoria;
                    opt.textContent = c.nombre;
                    sel.appendChild(opt);
                });
            }
        }
        renderProductView(getFilteredProducts());
    }

    function renderProductView(productos) {
        const counter = document.getElementById('productos-counter');
        const total = allProductos.length;
        const showing = productos.length;
        counter.innerHTML = `<i class="fas fa-box-open" style="margin-right:6px"></i>Mostrando <strong>${showing}</strong> de <strong>${total}</strong> productos`;
        if (viewMode === 'table') renderProductTable(productos);
        else renderProductGrid(productos);
    }

    function renderProductGrid(productos) {
        const area = document.getElementById('productos-content-area');
        if (productos.length === 0) {
            area.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><h3>Sin productos</h3><p>Agrega tu primer producto</p></div>';
            return;
        }
        area.innerHTML = `<div class="product-grid" style="grid-template-columns:repeat(auto-fill, minmax(220px, 1fr))">${productos.map(p => `
            <div class="product-card" style="cursor:pointer" onclick="window._viewProducto(${p.id_producto})">
                <div class="product-card-img">
                    ${p.foto ? `<img src="${UPLOADS_URL}${p.foto}" alt="${p.nombre}">` : '<i class="fas fa-box"></i>'}
                </div>
                <div class="product-card-body">
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">${p.codigo || 'Sin código'} ${p.categoria ? '• ' + p.categoria.nombre : ''}</div>
                    <h4>${p.nombre}</h4>
                    <div class="price">$${formatNumber(p.precio)}</div>
                    <div class="stock" style="margin-bottom:8px">Stock: <strong>${p.stock}</strong> ${p.stock <= p.stock_minimo ? '<span style="color:var(--danger)">(Bajo)</span>' : ''}</div>
                    <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
                        <button class="btn btn-outline btn-sm" onclick="window._editProducto(${p.id_producto})" style="flex:1"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-outline btn-sm" onclick="window._uploadFoto(${p.id_producto})" style="flex:1"><i class="fas fa-camera"></i></button>
                        <button class="btn btn-outline btn-sm" onclick="window._deleteProducto(${p.id_producto})" style="color:var(--danger)"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            </div>
        `).join('')}</div>`;
    }

    function renderProductTable(productos) {
        const area = document.getElementById('productos-content-area');
        if (productos.length === 0) {
            area.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><h3>Sin productos</h3><p>Agrega tu primer producto</p></div>';
            return;
        }
        area.innerHTML = `
            <div class="card">
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead><tr>
                            <th>Foto</th><th>Código</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Acciones</th>
                        </tr></thead>
                        <tbody>
                            ${productos.map(p => `
                                <tr style="cursor:pointer" onclick="window._viewProducto(${p.id_producto})">
                                    <td>
                                        <div style="width:48px;height:48px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden">
                                            ${p.foto ? `<img src="${UPLOADS_URL}${p.foto}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-box" style="color:var(--text-muted)"></i>'}
                                        </div>
                                    </td>
                                    <td style="color:var(--text-muted);font-size:13px">${p.codigo || '-'}</td>
                                    <td><strong>${p.nombre}</strong></td>
                                    <td><span style="font-size:12px;padding:3px 10px;background:var(--bg);border-radius:20px">${p.categoria?.nombre || '-'}</span></td>
                                    <td><strong style="color:var(--primary)">$${formatNumber(p.precio)}</strong></td>
                                    <td>
                                        <strong>${p.stock}</strong>
                                        ${p.stock <= p.stock_minimo ? '<span style="color:var(--danger);font-size:11px;margin-left:4px">(Bajo)</span>' : ''}
                                    </td>
                                    <td onclick="event.stopPropagation()">
                                        <div style="display:flex;gap:4px">
                                            <button class="btn btn-ghost btn-sm" onclick="window._editProducto(${p.id_producto})" title="Editar"><i class="fas fa-edit"></i></button>
                                            <button class="btn btn-ghost btn-sm" onclick="window._uploadFoto(${p.id_producto})" title="Cambiar foto"><i class="fas fa-camera"></i></button>
                                            <button class="btn btn-ghost btn-sm" onclick="window._deleteProducto(${p.id_producto})" title="Eliminar" style="color:var(--danger)"><i class="fas fa-trash-alt"></i></button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // View toggle buttons
    document.querySelectorAll('.view-toggle').forEach(btn => {
        btn.addEventListener('click', function () {
            viewMode = this.dataset.view;
            localStorage.setItem('pc_prod_view', viewMode);
            document.querySelectorAll('.view-toggle').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderProductView(getFilteredProducts());
        });
    });

    // Sort
    document.getElementById('sort-productos').addEventListener('change', function () {
        sortMode = this.value;
        localStorage.setItem('pc_prod_sort', sortMode);
        renderProductView(getFilteredProducts());
    });

    document.getElementById('search-productos').addEventListener('input', debounce(function () {
        renderProductView(getFilteredProducts());
    }, 300));

    document.getElementById('filter-categoria').addEventListener('change', function () {
        renderProductView(getFilteredProducts());
    });

    // View full product detail
    window._viewProducto = (id) => {
        const p = allProductos.find(x => x.id_producto === id);
        if (!p) return;
        openModal(p.nombre, `
            <div style="text-align:center;margin-bottom:20px">
                <div style="width:100%;max-height:350px;border-radius:var(--radius);background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden;aspect-ratio:4/3">
                    ${p.foto ? `<img src="${UPLOADS_URL}${p.foto}" alt="${p.nombre}" style="width:100%;height:100%;object-fit:contain">` : '<i class="fas fa-box" style="font-size:80px;color:var(--text-muted)"></i>'}
                </div>
            </div>
            <div style="display:grid;gap:0">
                <div class="info-row"><label>Código</label><span>${p.codigo || '-'}</span></div>
                <div class="info-row"><label>Categoría</label><span>${p.categoria?.nombre || '-'}</span></div>
                <div class="info-row"><label>Precio</label><span style="color:var(--primary);font-weight:800;font-size:18px">$${formatNumber(p.precio)}</span></div>
                <div class="info-row"><label>Stock</label><span><strong>${p.stock}</strong> unidades ${p.stock <= p.stock_minimo ? '<span class="badge-status badge-cancelado" style="margin-left:6px">Bajo</span>' : '<span class="badge-status badge-entregado" style="margin-left:6px">OK</span>'}</span></div>
                <div class="info-row"><label>Stock Mínimo</label><span>${p.stock_minimo}</span></div>
                ${p.descripcion ? `<div style="margin-top:12px"><label style="font-size:13px;color:var(--text-muted);font-weight:500">Descripción</label><p style="margin-top:4px;font-size:14px">${p.descripcion}</p></div>` : ''}
            </div>
        `, `
            <button class="btn btn-outline" onclick="closeModal()">Cerrar</button>
            <button class="btn btn-outline" onclick="closeModal();window._uploadFoto(${p.id_producto})"><i class="fas fa-camera"></i> Foto</button>
            <button class="btn btn-primary" onclick="closeModal();window._editProducto(${p.id_producto})"><i class="fas fa-edit"></i> Editar</button>
        `);
    };

    window._editProducto = async (id) => {
        const data = await api(`/productos/${id}`);
        if (data && !data.error) openProductModal(loadProductos, data.producto, categorias);
    };

    window._deleteProducto = async (id) => {
        if (!confirm('¿Eliminar este producto?')) return;
        const data = await api(`/productos/${id}`, { method: 'DELETE' });
        if (data && !data.error) { toast('Producto eliminado'); loadProductos(); }
    };

    window._uploadFoto = (id) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const fd = new FormData();
            fd.append('foto', file);

            const resp = await fetch(`${API_BASE}/productos/${id}/foto`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` },
                body: fd,
            });
            const data = await resp.json();
            if (data && !data.error) { toast('Foto actualizada'); loadProductos(); }
            else toast(data?.mensaje || 'Error al subir foto', 'error');
        };
        input.click();
    };

    loadProductos();
}

function openProductModal(callback, editData = null, categorias = []) {
    const isEdit = !!editData;

    // If no categorias passed, fetch them
    if (categorias.length === 0) {
        api('/categorias').then(data => {
            if (data) openProductModal(callback, editData, data.categorias || []);
        });
        return;
    }

    openModal(isEdit ? 'Editar Producto' : 'Nuevo Producto', `
        <div class="grid-2">
            <div class="form-group"><label>Código</label><input type="text" id="m-prod-codigo" value="${editData?.codigo || ''}"></div>
            <div class="form-group"><label>Categoría</label>
                <select id="m-prod-cat" style="padding:12px 14px;border:2px solid var(--border);border-radius:var(--radius);width:100%;font-family:var(--font)">
                    <option value="">Sin categoría</option>
                    ${categorias.map(c => `<option value="${c.id_categoria}" ${editData?.id_categoria == c.id_categoria ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-group"><label>Nombre *</label><input type="text" id="m-prod-nombre" value="${editData?.nombre || ''}"></div>
        <div class="form-group"><label>Descripción</label><textarea id="m-prod-desc" style="padding-left:14px">${editData?.descripcion || ''}</textarea></div>
        <div class="grid-2">
            <div class="form-group"><label>Precio *</label><input type="number" step="0.01" id="m-prod-precio" value="${editData?.precio || ''}"></div>
            <div class="form-group"><label>Stock</label><input type="number" id="m-prod-stock" value="${editData?.stock ?? 0}"></div>
        </div>
        <div class="grid-2">
            <div class="form-group"><label>Stock Mínimo</label><input type="number" id="m-prod-stockmin" value="${editData?.stock_minimo ?? 5}"></div>
            <div class="form-group">
                <label>Unidades por Caja</label>
                <input type="number" id="m-prod-upc" min="1" value="${editData?.unidades_por_caja ?? 1}" title="Cuántas unidades contiene una caja. Usar 1 si no se vende por caja.">
            </div>
        </div>
        ${feProductoFieldsHTML(editData)}
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="m-prod-save">${isEdit ? 'Actualizar' : 'Guardar'}</button>
    `);

    document.getElementById('m-prod-save').onclick = async () => {
        const body = {
            codigo: document.getElementById('m-prod-codigo').value,
            nombre: document.getElementById('m-prod-nombre').value,
            descripcion: document.getElementById('m-prod-desc').value,
            id_categoria: document.getElementById('m-prod-cat').value || null,
            precio: parseFloat(document.getElementById('m-prod-precio').value),
            stock: parseInt(document.getElementById('m-prod-stock').value) || 0,
            stock_minimo: parseInt(document.getElementById('m-prod-stockmin').value) || 5,
            unidades_por_caja: parseInt(document.getElementById('m-prod-upc').value) || 1,
            ...feProductoFieldsValues(),
        };

        if (!body.nombre || !body.precio) { toast('Nombre y precio son requeridos', 'warning'); return; }

        const url = isEdit ? `/productos/${editData.id_producto}` : '/productos';
        const method = isEdit ? 'PUT' : 'POST';

        const data = await api(url, { method, body: JSON.stringify(body) });
        if (data && !data.error) {
            toast(isEdit ? 'Producto actualizado' : 'Producto creado');
            closeModal();
            if (callback) callback();
        } else {
            toast(data?.mensaje || 'Error', 'error');
        }
    };
}

// ========================================
// REPORTES
// ========================================
async function renderReportes() {
    const container = document.getElementById('page-container');
    container.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner" style="border-color:var(--border);border-top-color:var(--primary);margin:0 auto"></div></div>';

    const data = await api('/reportes/ventas');
    if (!data || data.error) return;

    const r = data.data;

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px" class="fade-in">
            <div class="card">
                <div class="card-header"><h3><i class="fas fa-chart-bar" style="color:var(--primary);margin-right:8px"></i>Ventas Mensuales</h3></div>
                <div class="card-body"><div class="chart-container"><canvas id="chart-mensual"></canvas></div></div>
            </div>
            <div class="card">
                <div class="card-header"><h3><i class="fas fa-chart-pie" style="color:var(--warning);margin-right:8px"></i>Pedidos por Estado</h3></div>
                <div class="card-body"><div class="chart-container"><canvas id="chart-estados"></canvas></div></div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" class="fade-in">
            <div class="card">
                <div class="card-header"><h3><i class="fas fa-trophy" style="color:var(--success);margin-right:8px"></i>Top Productos</h3></div>
                <div class="card-body" style="padding:0">
                    ${(r.top_productos || []).length === 0 ? '<div class="empty-state" style="padding:30px"><p>Sin datos aún</p></div>' :
                    r.top_productos.map((p, i) => `
                        <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border-light)">
                            <div style="width:28px;height:28px;border-radius:50%;background:var(--gradient);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0">${i + 1}</div>
                            <div style="flex:1;font-weight:500">${p.nombre}</div>
                            <div style="font-size:13px;color:var(--text-muted)">${p.total_vendido} uds</div>
                            <div style="font-weight:700">$${formatNumber(p.total_ingresos)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="card">
                <div class="card-header"><h3><i class="fas fa-star" style="color:var(--info);margin-right:8px"></i>Top Clientes</h3></div>
                <div class="card-body" style="padding:0">
                    ${(r.top_clientes || []).length === 0 ? '<div class="empty-state" style="padding:30px"><p>Sin datos aún</p></div>' :
                    r.top_clientes.map((c, i) => `
                        <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border-light)">
                            <div style="width:28px;height:28px;border-radius:50%;background:var(--gradient-cool);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0">${i + 1}</div>
                            <div style="flex:1;font-weight:500">${c.nombre}</div>
                            <div style="font-size:13px;color:var(--text-muted)">${c.total_pedidos} pedidos</div>
                            <div style="font-weight:700">$${formatNumber(c.total_compras)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    // Chart ventas mensuales - llenar últimos 12 meses con ceros
    const mesesShort = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const ventasMap = {};
    (r.ventas_mensuales || []).forEach(v => { ventasMap[v.mes] = parseFloat(v.total); });

    const chartLabels = [];
    const chartData = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        chartLabels.push(`${mesesShort[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`);
        chartData.push(ventasMap[key] || 0);
    }

    new Chart(document.getElementById('chart-mensual'), {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Ventas ($)',
                data: chartData,
                backgroundColor: chartData.map(v => v > 0 ? 'rgba(99,102,241,0.85)' : 'rgba(99,102,241,0.15)'),
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => '$' + ctx.parsed.y.toLocaleString('es-CO')
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#F1F5F9' },
                    ticks: { callback: (v) => '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'K' : v) }
                },
                x: { grid: { display: false } }
            }
        }
    });

    // Chart estados
    const estadoColors = { pendiente: '#F59E0B', procesando: '#3B82F6', enviado: '#6366F1', entregado: '#10B981', cancelado: '#EF4444' };
    if ((r.por_estado || []).length > 0) {
        new Chart(document.getElementById('chart-estados'), {
            type: 'doughnut',
            data: {
                labels: r.por_estado.map(e => e.estado.charAt(0).toUpperCase() + e.estado.slice(1)),
                datasets: [{
                    data: r.por_estado.map(e => e.cantidad),
                    backgroundColor: r.por_estado.map(e => estadoColors[e.estado] || '#94A3B8'),
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                cutout: '65%',
            }
        });
    }
}

// ========================================
// USUARIOS (Admin)
// ========================================
async function renderUsuarios() {
    const actionBtn = document.getElementById('header-action-btn');
    actionBtn.style.display = '';
    document.getElementById('header-action-text').textContent = 'Nuevo Usuario';
    actionBtn.onclick = () => openUserModal();

    const container = document.getElementById('page-container');
    const data = await api('/auth/usuarios');
    if (!data) return;

    container.innerHTML = `
        <div class="card">
            <div class="table-wrapper">
                <table class="data-table">
                    <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Rol</th><th>Estado</th><th>Registro</th><th>Acciones</th></tr></thead>
                    <tbody>
                        ${(data.usuarios || []).map(u => `
                            <tr>
                                <td>
                                    <div style="display:flex;align-items:center;gap:10px">
                                        <div class="client-avatar" style="width:36px;height:36px;border-radius:10px;font-size:14px">${u.nombre.charAt(0).toUpperCase()}</div>
                                        <strong>${u.nombre}</strong>
                                    </div>
                                </td>
                                <td>${u.email}</td>
                                <td>${u.telefono || '-'}</td>
                                <td><span class="badge-status badge-${u.rol === 'admin' ? 'enviado' : 'procesando'}">${u.rol}</span></td>
                                <td><span class="badge-status badge-${u.activo ? 'entregado' : 'cancelado'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
                                <td>${formatDate(u.created_at)}</td>
                                <td>
                                    <button class="btn btn-ghost btn-sm" onclick="window._editUser(${u.id_usuario})" title="Editar"><i class="fas fa-edit"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    window._editUser = async (id) => {
        const resp = await api(`/auth/usuarios/${id}`);
        if (resp && !resp.error) openUserModal(resp.usuario);
    };
}

function openUserModal(editData = null) {
    const isEdit = !!editData;
    openModal(isEdit ? `Editar Usuario: ${editData.nombre}` : 'Nuevo Usuario', `
        <div class="form-group"><label>Nombre *</label><input type="text" id="m-user-nombre" value="${editData?.nombre || ''}"></div>
        <div class="form-group"><label>Email *</label><input type="email" id="m-user-email" value="${editData?.email || ''}"></div>
        <div class="form-group">
            <label>${isEdit ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</label>
            <div class="pass-wrap">
                <input type="password" id="m-user-pass" placeholder="${isEdit ? '••••••' : ''}">
                <button type="button" class="pass-toggle" onclick="togglePassword(this)" tabindex="-1"><i class="fas fa-eye"></i></button>
            </div>
        </div>
        <div class="grid-2">
            <div class="form-group"><label>Teléfono</label><input type="text" id="m-user-tel" value="${editData?.telefono || ''}"></div>
            <div class="form-group"><label>Rol</label>
                <select id="m-user-rol" style="padding:12px 14px;border:2px solid var(--border);border-radius:var(--radius);width:100%;font-family:var(--font)">
                    <option value="vendedor" ${editData?.rol === 'vendedor' ? 'selected' : ''}>Vendedor</option>
                    <option value="admin" ${editData?.rol === 'admin' ? 'selected' : ''}>Administrador</option>
                </select>
            </div>
        </div>
        ${isEdit ? `
        <div class="form-group">
            <label>Estado</label>
            <select id="m-user-activo" style="padding:12px 14px;border:2px solid var(--border);border-radius:var(--radius);width:100%;font-family:var(--font)">
                <option value="1" ${editData?.activo ? 'selected' : ''}>Activo</option>
                <option value="0" ${!editData?.activo ? 'selected' : ''}>Inactivo</option>
            </select>
        </div>
        ` : ''}
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="m-user-save">${isEdit ? 'Guardar Cambios' : 'Crear Usuario'}</button>
    `);

    document.getElementById('m-user-save').onclick = async () => {
        const body = {
            nombre: document.getElementById('m-user-nombre').value,
            email: document.getElementById('m-user-email').value,
            telefono: document.getElementById('m-user-tel').value,
            rol: document.getElementById('m-user-rol').value,
        };

        const pass = document.getElementById('m-user-pass').value;
        if (pass) body.password = pass;

        if (isEdit) body.activo = parseInt(document.getElementById('m-user-activo').value);

        if (!body.nombre || !body.email) { toast('Nombre y email son requeridos', 'warning'); return; }
        if (!isEdit && !pass) { toast('La contraseña es requerida', 'warning'); return; }

        const url = isEdit ? `/auth/usuarios/${editData.id_usuario}` : '/auth/registro';
        const method = isEdit ? 'PUT' : 'POST';

        const data = await api(url, { method, body: JSON.stringify(body) });
        if (data && !data.error) {
            toast(isEdit ? 'Usuario actualizado' : 'Usuario creado');
            closeModal();
            renderUsuarios();
        } else {
            toast(data?.mensaje || 'Error', 'error');
        }
    };
}

// ========================================
// RUTAS
// ========================================
async function renderRutas() {
    const actionBtn = document.getElementById('header-action-btn');
    actionBtn.style.display = '';
    document.getElementById('header-action-text').textContent = 'Nueva Ruta';
    actionBtn.onclick = () => openRutaModal(loadRutas);

    const container = document.getElementById('page-container');
    container.innerHTML = '<div class="card"><div class="table-wrapper"><table class="data-table"><thead><tr><th>Color</th><th>Nombre</th><th>Descripción</th><th>Acciones</th></tr></thead><tbody id="rutas-tbody"></tbody></table></div></div>';

    async function loadRutas() {
        const data = await api('/rutas');
        if (!data) return;
        const tbody = document.getElementById('rutas-tbody');
        if (!data.rutas || data.rutas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><i class="fas fa-route"></i><h3>Sin rutas</h3><p>Crea tu primera ruta de despacho</p></div></td></tr>';
            return;
        }
        tbody.innerHTML = data.rutas.map(r => `
            <tr>
                <td><div style="width:32px;height:32px;border-radius:8px;background:${r.color || '#6366F1'}"></div></td>
                <td><strong>${r.nombre}</strong></td>
                <td>${r.descripcion || '-'}</td>
                <td>
                    <button class="btn btn-ghost btn-sm" onclick="window._editRuta(${r.id_ruta})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-ghost btn-sm" onclick="window._deleteRuta(${r.id_ruta})" style="color:var(--danger)"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `).join('');
    }

    window._editRuta = async (id) => {
        const data = await api('/rutas');
        const ruta = (data?.rutas || []).find(r => r.id_ruta === id);
        if (ruta) openRutaModal(loadRutas, ruta);
    };

    window._deleteRuta = async (id) => {
        if (!confirm('¿Eliminar esta ruta?')) return;
        const data = await api(`/rutas/${id}`, { method: 'DELETE' });
        if (data && !data.error) { toast('Ruta eliminada'); loadRutas(); }
    };

    loadRutas();
}

function openRutaModal(callback, editData = null) {
    const isEdit = !!editData;
    openModal(isEdit ? `Editar Ruta: ${editData.nombre}` : 'Nueva Ruta', `
        <div class="form-group"><label>Nombre *</label><input type="text" id="m-ruta-nombre" placeholder="Ej: Centro, Norte, Zona 1..." value="${editData?.nombre || ''}"></div>
        <div class="form-group"><label>Descripción</label><input type="text" id="m-ruta-desc" placeholder="Descripción opcional" value="${editData?.descripcion || ''}"></div>
        <div class="form-group">
            <label>Color de identificación</label>
            ${colorPickerHTML('m-ruta-colors', editData?.color || '#6366F1')}
        </div>
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="m-ruta-save">${isEdit ? 'Actualizar' : 'Guardar'}</button>
    `);

    initColorPicker('m-ruta-colors');

    document.getElementById('m-ruta-save').onclick = async () => {
        const body = {
            nombre: document.getElementById('m-ruta-nombre').value,
            descripcion: document.getElementById('m-ruta-desc').value,
            color: getColorPickerValue('m-ruta-colors'),
        };
        if (!body.nombre) { toast('El nombre es requerido', 'warning'); return; }

        const url = isEdit ? `/rutas/${editData.id_ruta}` : '/rutas';
        const method = isEdit ? 'PUT' : 'POST';
        const data = await api(url, { method, body: JSON.stringify(body) });
        if (data && !data.error) {
            toast(isEdit ? 'Ruta actualizada' : 'Ruta creada');
            closeModal();
            if (callback) callback();
        } else toast(data?.mensaje || 'Error', 'error');
    };
}

// ========================================
// DESPACHO
// ========================================
async function renderDespacho() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div class="card" style="margin-bottom:20px">
            <div class="card-header"><h3><i class="fas fa-truck" style="color:var(--primary);margin-right:8px"></i>Generar Informe de Despacho</h3></div>
            <div class="card-body">
                <p style="color:var(--text-secondary);margin-bottom:16px;font-size:14px">Selecciona los pedidos que se cargarán al carro. El informe consolidará los productos sumando las cantidades.</p>
                <div class="toolbar">
                    <select class="filter-select" id="despacho-ruta">
                        <option value="">Todas las rutas</option>
                    </select>
                    <select class="filter-select" id="despacho-estado">
                        <option value="pendiente">Pendientes</option>
                        <option value="procesando">Procesando</option>
                        <option value="">Todos los estados</option>
                    </select>
                    <input type="date" class="filter-select" id="despacho-fecha" title="Fecha del pedido">
                    <button class="btn btn-outline btn-sm" id="despacho-recargar"><i class="fas fa-sync"></i> Recargar</button>
                </div>
                <div id="despacho-resumen" style="margin:12px 0;font-size:14px;color:var(--text-secondary)"></div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <h3>Pedidos Disponibles</h3>
                <div style="display:flex;gap:8px">
                    <button class="btn btn-outline btn-sm" id="btn-marcar-todos">Marcar todos</button>
                    <div style="position:relative;display:inline-block" id="despacho-print-dropdown">
                        <button class="btn btn-success" id="btn-generar-despacho" disabled onclick="document.getElementById('despacho-print-menu').classList.toggle('show')"><i class="fas fa-print"></i> Generar Informe <i class="fas fa-caret-down" style="margin-left:4px"></i></button>
                        <div id="despacho-print-menu" class="dropdown-menu">
                            <a class="dropdown-item" id="opt-despacho-direct"><i class="fas fa-bolt" style="color:var(--success)"></i> <strong>Imprimir directo a térmica</strong></a>
                            <a class="dropdown-item" id="opt-despacho-ticket"><i class="fas fa-receipt"></i> Tirilla (con diálogo)</a>
                            <a class="dropdown-item" id="opt-despacho-carta"><i class="fas fa-file-alt"></i> Carta completa</a>
                            <a class="dropdown-item" id="opt-despacho-conectar" style="border-top:1px solid var(--border-light)"><i class="fas fa-cog"></i> Configurar impresora térmica</a>
                        </div>
                    </div>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width:40px"><input type="checkbox" id="check-all-pedidos"></th>
                            <th># Pedido</th>
                            <th>Cliente</th>
                            <th>Ruta</th>
                            <th>Fecha</th>
                            <th>Estado</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody id="despacho-tbody"></tbody>
                </table>
            </div>
        </div>
    `;

    let allPedidos = [];
    let allRutas = [];

    async function loadRutasSelect() {
        const data = await api('/rutas');
        allRutas = data?.rutas || [];
        const sel = document.getElementById('despacho-ruta');
        allRutas.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id_ruta;
            opt.textContent = r.nombre;
            sel.appendChild(opt);
        });
    }

    async function loadPedidos() {
        const ruta = document.getElementById('despacho-ruta').value;
        const estado = document.getElementById('despacho-estado').value;
        const fecha = document.getElementById('despacho-fecha').value;

        const params = [];
        if (ruta) params.push(`id_ruta=${ruta}`);
        if (estado) params.push(`estado=${estado}`);
        if (fecha) { params.push(`fecha_desde=${fecha}`); params.push(`fecha_hasta=${fecha}`); }

        const data = await api('/pedidos' + (params.length ? '?' + params.join('&') : ''));
        if (!data) return;
        allPedidos = data.pedidos || [];
        renderTable();
    }

    function renderTable() {
        const tbody = document.getElementById('despacho-tbody');
        if (allPedidos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-inbox"></i><h3>Sin pedidos para despachar</h3><p>Ajusta los filtros</p></div></td></tr>';
            updateResumen();
            return;
        }
        tbody.innerHTML = allPedidos.map(p => `
            <tr>
                <td><input type="checkbox" class="check-pedido" data-id="${p.id_pedido}" onchange="window._updateDespachoBtn()"></td>
                <td><strong>${p.numero_pedido}</strong></td>
                <td>
                    <div style="font-weight:600">${p.cliente?.razon_social || p.cliente?.nombre || 'N/A'}</div>
                    ${p.cliente?.razon_social && p.cliente?.nombre ? `<div style="font-size:11px;color:var(--text-muted)">${p.cliente.nombre}</div>` : ''}
                </td>
                <td>${p.ruta ? `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:14px;background:${p.ruta.color}22;color:${p.ruta.color};font-weight:600;font-size:12px"><i class="fas fa-route"></i>${p.ruta.nombre}</span>` : '<span style="color:var(--text-muted);font-size:12px">Sin ruta</span>'}</td>
                <td>${formatDate(p.fecha_pedido)}</td>
                <td><span class="badge-status badge-${p.estado}">${p.estado}</span></td>
                <td><strong>$${formatNumber(p.total)}</strong></td>
            </tr>
        `).join('');
        updateResumen();
    }

    function updateResumen() {
        const total = allPedidos.length;
        const checked = document.querySelectorAll('.check-pedido:checked').length;
        document.getElementById('despacho-resumen').innerHTML = `<i class="fas fa-list-check"></i> <strong>${checked}</strong> de ${total} pedidos seleccionados`;
        document.getElementById('btn-generar-despacho').disabled = checked === 0;
    }

    window._updateDespachoBtn = updateResumen;

    document.getElementById('check-all-pedidos').addEventListener('change', function () {
        document.querySelectorAll('.check-pedido').forEach(c => c.checked = this.checked);
        updateResumen();
    });

    document.getElementById('btn-marcar-todos').addEventListener('click', () => {
        document.querySelectorAll('.check-pedido').forEach(c => c.checked = true);
        document.getElementById('check-all-pedidos').checked = true;
        updateResumen();
    });

    document.getElementById('despacho-ruta').addEventListener('change', loadPedidos);
    document.getElementById('despacho-estado').addEventListener('change', loadPedidos);
    document.getElementById('despacho-fecha').addEventListener('change', loadPedidos);
    document.getElementById('despacho-recargar').addEventListener('click', loadPedidos);

    async function obtenerDespachoData() {
        const ids = Array.from(document.querySelectorAll('.check-pedido:checked')).map(c => parseInt(c.dataset.id));
        if (ids.length === 0) return null;
        const data = await api('/despacho/consolidado', {
            method: 'POST',
            body: JSON.stringify({ pedidos: ids })
        });
        if (!data || data.error) { toast(data?.mensaje || 'Error al generar', 'error'); return null; }
        return data;
    }

    document.getElementById('opt-despacho-carta').addEventListener('click', async () => {
        document.getElementById('despacho-print-menu').classList.remove('show');
        const data = await obtenerDespachoData();
        if (data) printDespacho(data);
    });

    document.getElementById('opt-despacho-ticket').addEventListener('click', async () => {
        document.getElementById('despacho-print-menu').classList.remove('show');
        const data = await obtenerDespachoData();
        if (data) printDespachoTicket(data);
    });

    document.getElementById('opt-despacho-direct').addEventListener('click', async () => {
        document.getElementById('despacho-print-menu').classList.remove('show');

        // Verificar plugin activo
        const impresoras = await pluginVerificarActivo();
        if (impresoras === false) {
            toast('Plugin Parzibyte no detectado. Descárgalo e inícialo primero.', 'error', 6000);
            return;
        }

        // Verificar que haya impresora seleccionada
        if (!localStorage.getItem('pc_impresora_termica')) {
            const seleccionada = await seleccionarImpresoraTermica();
            if (!seleccionada) return;
        }

        const data = await obtenerDespachoData();
        if (!data) return;
        try {
            toast('Enviando a impresora térmica...', 'success');
            await printDespachoDirect(data);
            toast('Impresión enviada correctamente', 'success');
        } catch (err) {
            console.error(err);
            if (err.message === 'NO_PRINTER_SELECTED') {
                toast('Configura la impresora primero', 'warning');
            } else {
                toast('Error: ' + (err.message || 'No se pudo imprimir'), 'error');
            }
        }
    });

    document.getElementById('opt-despacho-conectar').addEventListener('click', async () => {
        document.getElementById('despacho-print-menu').classList.remove('show');
        try {
            await seleccionarImpresoraTermica();
        } catch (err) {
            console.error(err);
            if (err.message === 'PLUGIN_NO_INSTALADO') {
                toast('Plugin Parzibyte no detectado. Descárgalo en parzibyte.me e inícialo', 'error', 8000);
            } else {
                toast('Error: ' + (err.message || ''), 'error');
            }
        }
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#despacho-print-dropdown')) {
            const menu = document.getElementById('despacho-print-menu');
            if (menu) menu.classList.remove('show');
        }
    });

    await loadRutasSelect();
    await loadPedidos();
}

function printDespacho(data) {
    const ruta = data.pedidos[0]?.ruta;
    const rutaTitulo = ruta ? `Ruta: ${ruta.nombre}` : 'Múltiples rutas';

    const consolidadoRows = (data.consolidado || []).map((c, i) => `
        <tr>
            <td style="text-align:center;font-weight:700;color:#666">${i + 1}</td>
            <td>${c.codigo || '-'}</td>
            <td><strong>${c.nombre}</strong></td>
            <td style="text-align:center">${c.total_cajas > 0 ? `<strong>${c.total_cajas}</strong> cajas` : '-'}</td>
            <td style="text-align:center">${c.total_unidades > 0 ? `<strong>${c.total_unidades}</strong> unid.` : '-'}</td>
            <td style="text-align:center;border-left:2px solid #000"><strong style="font-size:16px">${c.unidades_equivalentes}</strong></td>
        </tr>
    `).join('');

    const pedidosLista = (data.pedidos || []).map(p => `
        <tr>
            <td>${p.numero_pedido}</td>
            <td>${p.cliente?.razon_social || p.cliente?.nombre || ''}${p.cliente?.razon_social && p.cliente?.nombre ? ' (' + p.cliente.nombre + ')' : ''}</td>
            <td>${p.cliente?.direccion || '-'}</td>
            <td>${p.cliente?.telefono || '-'}</td>
            <td style="text-align:right">$${formatNumber(p.total)}</td>
        </tr>
    `).join('');

    const totalGeneral = data.pedidos.reduce((s, p) => s + parseFloat(p.total), 0);

    printHTML(`
        <h1 style="margin-bottom:6px">Informe de Despacho</h1>
        <p style="color:#666;margin-bottom:20px">${rutaTitulo} • ${data.total_pedidos} pedidos • Generado: ${new Date().toLocaleString('es-CO')}</p>

        <h2 style="font-size:16px;margin:24px 0 8px;background:#1E293B;color:#fff;padding:8px 14px;border-radius:6px">📦 Productos a Cargar</h2>
        <table>
            <thead>
                <tr>
                    <th style="text-align:center;width:40px">#</th>
                    <th>Código</th>
                    <th>Producto</th>
                    <th style="text-align:center">Cajas</th>
                    <th style="text-align:center">Unidades</th>
                    <th style="text-align:center;border-left:2px solid #000">TOTAL UNIDS</th>
                </tr>
            </thead>
            <tbody>${consolidadoRows}</tbody>
        </table>

        <h2 style="font-size:16px;margin:32px 0 8px;background:#1E293B;color:#fff;padding:8px 14px;border-radius:6px">🚚 Pedidos a Repartir</h2>
        <table>
            <thead>
                <tr>
                    <th># Pedido</th>
                    <th>Cliente</th>
                    <th>Dirección</th>
                    <th>Teléfono</th>
                    <th style="text-align:right">Total</th>
                </tr>
            </thead>
            <tbody>${pedidosLista}</tbody>
            <tfoot>
                <tr><td colspan="4" style="text-align:right;font-weight:700;padding-top:12px">TOTAL GENERAL</td>
                <td style="text-align:right;font-weight:700;font-size:16px;padding-top:12px">$${formatNumber(totalGeneral)}</td></tr>
            </tfoot>
        </table>

        <div style="margin-top:48px;display:flex;gap:40px">
            <div style="flex:1;text-align:center;border-top:1px solid #999;padding-top:8px;font-size:12px;color:#666">Cargado por</div>
            <div style="flex:1;text-align:center;border-top:1px solid #999;padding-top:8px;font-size:12px;color:#666">Verificado por</div>
            <div style="flex:1;text-align:center;border-top:1px solid #999;padding-top:8px;font-size:12px;color:#666">Conductor</div>
        </div>
    `);
}

function printDespachoTicket(data) {
    const ruta = data.pedidos[0]?.ruta;
    const rutaTitulo = ruta ? ruta.nombre : 'Multiples Rutas';
    const totalGeneral = data.pedidos.reduce((s, p) => s + parseFloat(p.total), 0);

    const productosRows = (data.consolidado || []).map((c, i) => {
        return `
            <tr style="border-bottom:1px dotted #000">
                <td colspan="4" style="padding:4px 0 1px;font-size:12px;font-weight:700">${c.nombre}</td>
            </tr>
            <tr style="border-bottom:1px solid #000">
                <td style="padding:0 0 6px;font-size:10px;color:#000">${c.codigo || '-'}</td>
                <td class="num" style="padding:0 0 6px;text-align:center;font-size:16px;border-left:1px solid #000;border-right:1px solid #000">${c.total_cajas > 0 ? c.total_cajas : '-'}</td>
                <td class="num" style="padding:0 0 6px;text-align:center;font-size:16px;border-right:1px solid #000">${c.total_unidades > 0 ? c.total_unidades : '-'}</td>
                <td class="num" style="padding:0 0 6px;text-align:center;font-size:18px">${c.unidades_equivalentes}</td>
            </tr>
        `;
    }).join('');

    const pedidosRows = (data.pedidos || []).map(p => {
        const cliente = p.cliente?.razon_social || p.cliente?.nombre || 'N/A';
        const persona = p.cliente?.razon_social ? p.cliente?.nombre : '';
        return `
            <div style="padding:6px 0;border-bottom:1px dashed #000;font-size:11px">
                <div style="font-weight:700">${p.numero_pedido} - $${formatNumber(p.total)}</div>
                <div>${cliente}${persona ? ' / ' + persona : ''}</div>
                ${p.cliente?.direccion ? '<div>Dir: ' + p.cliente.direccion + '</div>' : ''}
                ${p.cliente?.telefono ? '<div>Tel: ' + p.cliente.telefono + '</div>' : ''}
            </div>
        `;
    }).join('');

    const win = window.open('', '_blank', 'width=350,height=600');
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Despacho ${rutaTitulo}</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: Tahoma, Verdana, sans-serif; width: 80mm; padding: 6px; font-size: 13px; color: #000; line-height: 1.3; font-weight: 500; font-variant-numeric: tabular-nums; }
                .center { text-align: center; }
                .bold { font-weight: 700; }
                .divider { border-top: 1px dashed #000; margin: 6px 0; }
                .divider-double { border-top: 2px solid #000; border-bottom: 1px solid #000; height: 4px; margin: 6px 0; }
                table { width: 100%; border-collapse: collapse; }
                .num { font-family: Tahoma, Verdana, sans-serif; font-weight: 700; letter-spacing: 1px; }
                tr { page-break-inside: avoid; }
                @media print {
                    body { width: 80mm; padding: 0; font-family: Tahoma, Verdana, sans-serif; transform-origin: top left; }
                    @page { size: 80mm auto; margin: 3mm; }
                    html, body { height: auto !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    tr, .no-break { page-break-inside: avoid; break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="center bold" style="font-size:18px;margin-bottom:2px">PEDIDOS CRUZ</div>
            <div class="center bold" style="font-size:14px;margin-bottom:8px">INFORME DE DESPACHO</div>
            <div class="divider"></div>

            <div class="center" style="font-size:13px;margin:4px 0">
                <div class="bold" style="font-size:15px">RUTA: ${rutaTitulo.toUpperCase()}</div>
                <div>${data.total_pedidos} pedido${data.total_pedidos !== 1 ? 's' : ''}</div>
                <div style="font-size:11px">${new Date().toLocaleString('es-CO')}</div>
            </div>
            <div class="divider"></div>

            <div class="center bold" style="font-size:13px;margin:6px 0;background:#000;color:#fff;padding:4px 0">PRODUCTOS A CARGAR</div>
            <table style="border-collapse:collapse;width:100%">
                <thead>
                    <tr style="border-bottom:2px solid #000">
                        <th style="text-align:left;padding:3px 0;font-size:10px">CÓDIGO</th>
                        <th style="text-align:center;padding:3px 0;font-size:10px;border-left:1px solid #000;border-right:1px solid #000;width:18%">CJA</th>
                        <th style="text-align:center;padding:3px 0;font-size:10px;border-right:1px solid #000;width:18%">UND</th>
                        <th style="text-align:center;padding:3px 0;font-size:10px;width:22%">TOTAL</th>
                    </tr>
                </thead>
                <tbody>${productosRows}</tbody>
            </table>
            <div class="divider"></div>

            <div class="center bold" style="font-size:13px;margin:6px 0;background:#000;color:#fff;padding:4px 0">PEDIDOS A REPARTIR</div>
            ${pedidosRows}
            <div class="divider"></div>

            <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;padding:6px 0">
                <span>TOTAL GENERAL</span>
                <span>$${formatNumber(totalGeneral)}</span>
            </div>
            <div class="divider-double"></div>

            <div style="margin-top:24px">
                <div style="margin:18px 0 4px;border-top:1px solid #000;padding-top:4px;text-align:center;font-size:10px">Cargado por</div>
                <div style="margin:18px 0 4px;border-top:1px solid #000;padding-top:4px;text-align:center;font-size:10px">Verificado por</div>
                <div style="margin:18px 0 4px;border-top:1px solid #000;padding-top:4px;text-align:center;font-size:10px">Conductor</div>
            </div>

            <script>
                window.onload = function() {
                    var pxToMm = function(px) { return px * 25.4 / 96; };
                    var altoMm = Math.ceil(pxToMm(document.body.scrollHeight)) + 10;
                    var style = document.createElement('style');
                    style.innerHTML = '@page { size: 80mm ' + altoMm + 'mm; margin: 0; }';
                    document.head.appendChild(style);
                    setTimeout(function() { window.print(); }, 100);
                }
            <\/script>
        </body>
        </html>
    `);
    win.document.close();
}

async function printDespachoDirect(data) {
    const ruta = data.pedidos[0]?.ruta;
    const rutaNombre = ruta ? ruta.nombre : 'Multiples Rutas';
    const totalGeneral = data.pedidos.reduce((s, p) => s + parseFloat(p.total), 0);

    const b = parzibyteOpsBuilder();

    // Header
    b.align(1).bold(true).size(2, 2);
    b.line('PEDIDOS CRUZ');
    b.size(1, 1).bold(true);
    b.line('INFORME DE DESPACHO');
    b.bold(false).divider();

    // Route info
    b.align(1).bold(true).size(2, 1);
    b.line('RUTA: ' + rutaNombre.toUpperCase());
    b.size(1, 1).bold(false);
    b.line(data.total_pedidos + ' pedido' + (data.total_pedidos !== 1 ? 's' : ''));
    b.line(new Date().toLocaleString('es-CO'));
    b.divider();

    // Productos section
    b.align(1).bold(true).line('PRODUCTOS A CARGAR').bold(false);
    b.line();
    b.align(0).bold(true);
    b.cols(['PRODUCTO', 'CJA', 'UND', 'TOT'], [26, 6, 6, 8]);
    b.bold(false);
    b.line('-'.repeat(LINE_WIDTH));

    (data.consolidado || []).forEach(c => {
        b.bold(true).line(c.nombre).bold(false);
        b.cols([
            (c.codigo || '').substring(0, 24),
            c.total_cajas > 0 ? String(c.total_cajas) : '-',
            c.total_unidades > 0 ? String(c.total_unidades) : '-',
            String(c.unidades_equivalentes)
        ], [26, 6, 6, 8]);
        b.line('-'.repeat(LINE_WIDTH));
    });
    b.line();

    // Pedidos section
    b.align(1).bold(true).line('PEDIDOS A REPARTIR').bold(false);
    b.line();
    b.align(0);

    (data.pedidos || []).forEach(p => {
        const cliente = p.cliente?.razon_social || p.cliente?.nombre || 'N/A';
        const persona = p.cliente?.razon_social ? p.cliente?.nombre : '';
        b.bold(true).row(p.numero_pedido, '$' + formatNumber(p.total)).bold(false);
        b.line(cliente);
        if (persona) b.line('  ' + persona);
        if (p.cliente?.direccion) b.line('Dir: ' + p.cliente.direccion);
        if (p.cliente?.telefono) b.line('Tel: ' + p.cliente.telefono);
        b.line('. . . . . . . . . . . . . . . . . . . . . . . .');
    });

    // Total
    b.line();
    b.bold(true).size(2, 1);
    b.row('TOTAL', '$' + formatNumber(totalGeneral), 24);
    b.size(1, 1).bold(false);
    b.divider('=');
    b.line();

    // Signatures
    b.feed(2);
    b.align(1).line('________________________');
    b.line('Cargado por');
    b.feed(2);
    b.line('________________________');
    b.line('Verificado por');
    b.feed(2);
    b.line('________________________');
    b.line('Conductor');

    b.feed(4);
    b.cut();

    await imprimirParzibyte(b.build());
}

// ========================================
// CATEGORIAS
// ========================================
async function renderCategorias() {
    const actionBtn = document.getElementById('header-action-btn');
    actionBtn.style.display = '';
    document.getElementById('header-action-text').textContent = 'Nueva Categoría';
    actionBtn.onclick = () => openCategoriaModal();

    const container = document.getElementById('page-container');
    const data = await api('/categorias');
    if (!data) return;

    container.innerHTML = `
        <div class="card">
            <div class="table-wrapper">
                <table class="data-table">
                    <thead><tr><th>ID</th><th>Nombre</th><th>Descripción</th></tr></thead>
                    <tbody>
                        ${(data.categorias || []).map(c => `
                            <tr>
                                <td>${c.id_categoria}</td>
                                <td><strong>${c.nombre}</strong></td>
                                <td>${c.descripcion || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ========================================
// MI PERFIL
// ========================================
async function renderPerfil() {
    const data = await api('/auth/perfil');
    if (!data || data.error) return;
    const u = data.usuario;

    const container = document.getElementById('page-container');
    container.innerHTML = `
        <div style="max-width:720px;margin:0 auto" class="fade-in">
            <div class="card" style="margin-bottom:20px">
                <div class="card-header"><h3><i class="fas fa-user-circle" style="color:var(--primary);margin-right:8px"></i>Información Personal</h3></div>
                <div class="card-body">
                    <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--border-light)">
                        <div class="client-avatar" style="width:72px;height:72px;border-radius:20px;font-size:28px">${u.nombre.charAt(0).toUpperCase()}</div>
                        <div>
                            <h3 style="font-size:20px;font-weight:700">${u.nombre}</h3>
                            <div style="display:flex;gap:8px;margin-top:6px">
                                <span class="badge-status badge-${u.rol === 'admin' ? 'enviado' : 'procesando'}">${u.rol}</span>
                                <span style="color:var(--text-muted);font-size:13px">${u.email}</span>
                            </div>
                        </div>
                    </div>

                    <div class="form-group"><label>Nombre completo</label><input type="text" id="perfil-nombre" value="${u.nombre || ''}"></div>
                    <div class="grid-2">
                        <div class="form-group"><label>Email</label><input type="email" id="perfil-email" value="${u.email || ''}"></div>
                        <div class="form-group"><label>Teléfono</label><input type="text" id="perfil-tel" value="${u.telefono || ''}"></div>
                    </div>
                    <div style="text-align:right">
                        <button class="btn btn-primary" id="btn-save-perfil"><i class="fas fa-save"></i> Guardar Datos</button>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h3><i class="fas fa-key" style="color:var(--warning);margin-right:8px"></i>Cambiar Contraseña</h3></div>
                <div class="card-body">
                    <div class="form-group"><label>Contraseña actual</label>
                        <div class="pass-wrap">
                            <input type="password" id="perfil-pass-actual" placeholder="••••••">
                            <button type="button" class="pass-toggle" onclick="togglePassword(this)" tabindex="-1"><i class="fas fa-eye"></i></button>
                        </div>
                    </div>
                    <div class="grid-2">
                        <div class="form-group"><label>Nueva contraseña</label>
                            <div class="pass-wrap">
                                <input type="password" id="perfil-pass-nueva" placeholder="Mín. 6 caracteres">
                                <button type="button" class="pass-toggle" onclick="togglePassword(this)" tabindex="-1"><i class="fas fa-eye"></i></button>
                            </div>
                        </div>
                        <div class="form-group"><label>Confirmar nueva contraseña</label>
                            <div class="pass-wrap">
                                <input type="password" id="perfil-pass-confirm" placeholder="Repite la contraseña">
                                <button type="button" class="pass-toggle" onclick="togglePassword(this)" tabindex="-1"><i class="fas fa-eye"></i></button>
                            </div>
                        </div>
                    </div>
                    <div style="text-align:right">
                        <button class="btn btn-warning" id="btn-save-pass"><i class="fas fa-key"></i> Actualizar Contraseña</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-save-perfil').onclick = async () => {
        const body = {
            nombre: document.getElementById('perfil-nombre').value,
            email: document.getElementById('perfil-email').value,
            telefono: document.getElementById('perfil-tel').value,
        };
        if (!body.nombre || !body.email) { toast('Nombre y email son requeridos', 'warning'); return; }

        const resp = await api('/auth/perfil', { method: 'PUT', body: JSON.stringify(body) });
        if (resp && !resp.error) {
            toast('Perfil actualizado');
            // Update session user info
            state.usuario = { ...state.usuario, ...resp.usuario };
            localStorage.setItem('pc_usuario', JSON.stringify(state.usuario));
            document.getElementById('user-name').textContent = state.usuario.nombre;
            document.getElementById('user-avatar').textContent = state.usuario.nombre.charAt(0).toUpperCase();
        } else {
            toast(resp?.mensaje || 'Error al actualizar', 'error');
        }
    };

    document.getElementById('btn-save-pass').onclick = async () => {
        const actual = document.getElementById('perfil-pass-actual').value;
        const nueva = document.getElementById('perfil-pass-nueva').value;
        const confirm = document.getElementById('perfil-pass-confirm').value;

        if (!actual || !nueva || !confirm) { toast('Completa todos los campos de contraseña', 'warning'); return; }
        if (nueva.length < 6) { toast('La nueva contraseña debe tener al menos 6 caracteres', 'warning'); return; }
        if (nueva !== confirm) { toast('Las contraseñas no coinciden', 'error'); return; }

        const resp = await api('/auth/perfil', {
            method: 'PUT',
            body: JSON.stringify({ password_actual: actual, password: nueva })
        });
        if (resp && !resp.error) {
            toast('Contraseña actualizada correctamente');
            document.getElementById('perfil-pass-actual').value = '';
            document.getElementById('perfil-pass-nueva').value = '';
            document.getElementById('perfil-pass-confirm').value = '';
        } else {
            toast(resp?.mensaje || 'Error al cambiar contraseña', 'error');
        }
    };
}

function openCategoriaModal() {
    openModal('Nueva Categoría', `
        <div class="form-group"><label>Nombre *</label><input type="text" id="m-cat-nombre"></div>
        <div class="form-group"><label>Descripción</label><input type="text" id="m-cat-desc"></div>
    `, `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="m-cat-save">Guardar</button>
    `);

    document.getElementById('m-cat-save').onclick = async () => {
        const body = {
            nombre: document.getElementById('m-cat-nombre').value,
            descripcion: document.getElementById('m-cat-desc').value,
        };
        if (!body.nombre) { toast('El nombre es requerido', 'warning'); return; }

        const data = await api('/categorias', { method: 'POST', body: JSON.stringify(body) });
        if (data && !data.error) {
            toast('Categoría creada');
            closeModal();
            renderCategorias();
        } else {
            toast(data?.mensaje || 'Error', 'error');
        }
    };
}

// ========================================
// PLUGIN PARZIBYTE - IMPRESIÓN DIRECTA A IMPRESORA TÉRMICA
// http://localhost:8000
// ========================================
const PARZIBYTE_URL = 'http://localhost:8000';
const LINE_WIDTH = 48;

function _norm(s) {
    // Reemplaza acentos y caracteres especiales para impresión segura
    return String(s || '')
        .replace(/[áàä]/g, 'a').replace(/[ÁÀÄ]/g, 'A')
        .replace(/[éèë]/g, 'e').replace(/[ÉÈË]/g, 'E')
        .replace(/[íìï]/g, 'i').replace(/[ÍÌÏ]/g, 'I')
        .replace(/[óòö]/g, 'o').replace(/[ÓÒÖ]/g, 'O')
        .replace(/[úùü]/g, 'u').replace(/[ÚÙÜ]/g, 'U')
        .replace(/ñ/g, 'n').replace(/Ñ/g, 'N');
}

function _row(left, right, width = LINE_WIDTH) {
    const l = _norm(left);
    const r = _norm(right);
    const sp = Math.max(1, width - l.length - r.length);
    return l + ' '.repeat(sp) + r;
}

function _cols(values, widths) {
    let s = '';
    values.forEach((v, i) => {
        const w = widths[i];
        const text = _norm(String(v));
        s += text.substring(0, w).padEnd(w, ' ');
    });
    return s;
}

function parzibyteOpsBuilder() {
    const ops = [];
    return {
        align(mode) { ops.push({ nombre: 'EstablecerAlineacion', argumentos: [mode] }); return this; }, // 0 izq, 1 centro, 2 der
        bold(on = true) { ops.push({ nombre: 'EstablecerEnfatizado', argumentos: [on] }); return this; },
        size(w, h) { ops.push({ nombre: 'EstablecerTamañoFuente', argumentos: [w, h] }); return this; },
        text(s) { ops.push({ nombre: 'EscribirTexto', argumentos: [_norm(s)] }); return this; },
        line(s = '') { ops.push({ nombre: 'EscribirTexto', argumentos: [_norm(s) + '\n'] }); return this; },
        feed(n = 1) { ops.push({ nombre: 'Feed', argumentos: [n] }); return this; },
        divider(char = '-') { return this.line(char.repeat(LINE_WIDTH)); },
        row(l, r, width = LINE_WIDTH) { return this.line(_row(l, r, width)); },
        cols(values, widths) { return this.line(_cols(values, widths)); },
        cut() { ops.push({ nombre: 'Corte', argumentos: [1] }); return this; },
        build() { return ops; },
    };
}

async function pluginVerificarActivo() {
    try {
        const resp = await fetch(PARZIBYTE_URL + '/impresoras', { method: 'GET' });
        if (!resp.ok) return false;
        const data = await resp.json();
        return Array.isArray(data) ? data : [];
    } catch (err) {
        return false;
    }
}

async function imprimirParzibyte(operaciones) {
    const nombreImpresora = localStorage.getItem('pc_impresora_termica');
    if (!nombreImpresora) {
        throw new Error('NO_PRINTER_SELECTED');
    }
    const resp = await fetch(PARZIBYTE_URL + '/imprimir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            serial: '',
            nombreImpresora: nombreImpresora,
            operaciones: operaciones,
        }),
    });
    if (!resp.ok) {
        const txt = await resp.text();
        throw new Error('Error del plugin: ' + txt);
    }
    const data = await resp.json();
    if (data && data.ok === false) {
        throw new Error(data.message || 'Error al imprimir');
    }
    return data;
}

async function seleccionarImpresoraTermica() {
    const impresoras = await pluginVerificarActivo();
    if (impresoras === false) {
        throw new Error('PLUGIN_NO_INSTALADO');
    }
    if (impresoras.length === 0) {
        throw new Error('No hay impresoras instaladas en Windows');
    }

    return new Promise((resolve) => {
        const actual = localStorage.getItem('pc_impresora_termica') || '';
        openModal('Seleccionar Impresora Térmica', `
            <p style="color:var(--text-secondary);font-size:14px;margin-bottom:14px">Elige la impresora térmica donde imprimir los tickets:</p>
            <div style="display:flex;flex-direction:column;gap:8px">
                ${impresoras.map(imp => `
                    <label style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid ${imp === actual ? 'var(--primary)' : 'var(--border)'};border-radius:var(--radius);cursor:pointer">
                        <input type="radio" name="imp-elegir" value="${imp}" ${imp === actual ? 'checked' : ''}>
                        <div style="flex:1">
                            <i class="fas fa-print" style="color:var(--primary);margin-right:8px"></i>
                            <strong>${imp}</strong>
                        </div>
                    </label>
                `).join('')}
            </div>
        `, `
            <button class="btn btn-outline" onclick="closeModal();window._impCancel()">Cancelar</button>
            <button class="btn btn-primary" onclick="window._impGuardar()"><i class="fas fa-check"></i> Guardar</button>
        `);
        window._impGuardar = () => {
            const r = document.querySelector('input[name="imp-elegir"]:checked');
            if (!r) { toast('Selecciona una impresora', 'warning'); return; }
            localStorage.setItem('pc_impresora_termica', r.value);
            closeModal();
            toast('Impresora guardada: ' + r.value, 'success');
            resolve(r.value);
        };
        window._impCancel = () => resolve(null);
    });
}

// ========================================
// UTILITIES
// ========================================
function printHTML(bodyContent) {
    const win = window.open('', '_blank', 'width=800,height=600');
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Pedidos Cruz - Impresión</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1a1a1a; font-size: 13px; }
                h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
                h3 { font-size: 12px; }
                p { line-height: 1.5; }
                table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                th { background: #f5f5f5; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 2px solid #ddd; }
                td { padding: 8px 12px; border-bottom: 1px solid #eee; }
                tr:hover { background: #fafafa; }
                .print-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #333; }
                .print-header h2 { font-size: 18px; font-weight: 800; }
                .print-header span { font-size: 12px; color: #666; }
                @media print {
                    body { padding: 0; }
                    @page { margin: 15mm; }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h2>Pedidos Cruz</h2>
                <span>${new Date().toLocaleDateString('es-CO')}</span>
            </div>
            ${bodyContent}
            <script>window.onload = function() { window.print(); }<\/script>
        </body>
        </html>
    `);
    win.document.close();
}

function formatNumber(num) {
    return parseFloat(num || 0).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

window.togglePassword = (btn) => {
    const input = btn.previousElementSibling;
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
};

function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ========================================
// INIT APP
// ========================================
function initApp() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // User info
    const u = state.usuario;
    document.getElementById('user-name').textContent = u.nombre;
    document.getElementById('user-role').textContent = u.rol;
    document.getElementById('user-avatar').textContent = u.nombre.charAt(0).toUpperCase();

    // Admin sections visibility
    const isAdmin = u.rol === 'admin';
    document.getElementById('nav-admin').style.display = isAdmin ? '' : 'none';
    document.querySelectorAll('.nav-admin-only').forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
    });

    // Route from URL hash, or resume cart, or default by role
    const routed = handleHashRoute();
    if (!routed) {
        if (state.cart.length > 0 || state.selectedClient) {
            navigateTo('nuevo-pedido');
        } else {
            navigateTo(state.usuario?.rol === 'admin' ? 'dashboard' : 'pedidos');
        }
    }
}

function handleHashRoute() {
    const hash = location.hash.replace(/^#\/?/, '');
    if (!hash) return false;

    const parts = hash.split('/').filter(Boolean);
    const page = parts[0];

    // Detail pedido: #/pedidos/123
    if (page === 'pedidos' && parts[1] && /^\d+$/.test(parts[1])) {
        viewPedido(parseInt(parts[1]), true);
        return true;
    }

    // Detail factura: #/facturas/123
    if (page === 'facturas' && parts[1] && /^\d+$/.test(parts[1])) {
        viewFactura(parseInt(parts[1]), true);
        return true;
    }

    const validPages = ['dashboard', 'pedidos', 'nuevo-pedido', 'clientes', 'productos', 'reportes', 'usuarios', 'categorias', 'perfil', 'rutas', 'despacho', 'facturas', 'config-fe'];
    if (validPages.includes(page)) {
        navigateTo(page, { skipHash: true });
        return true;
    }

    return false;
}

// ========================================
// EVENT LISTENERS
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Loading screen
    setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hide');
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
            if (state.token && state.usuario) {
                initApp();
            } else {
                document.getElementById('login-page').classList.remove('hidden');
            }
        }, 500);
    }, 1200);

    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Navigation
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.page));
    });

    // Mobile menu
    document.getElementById('menu-btn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebar-overlay').classList.toggle('show');
    });

    document.getElementById('sidebar-overlay').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('show');
    });

    // Modal close - only with X button or Cancel, not clicking outside
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);

    // Close dropdowns on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#print-dropdown')) {
            const menu = document.getElementById('print-menu');
            if (menu) menu.classList.remove('show');
        }
    });

    // Sidebar user btn -> perfil
    document.getElementById('sidebar-user-btn').addEventListener('click', () => {
        navigateTo('perfil');
    });

    // Logout
    document.getElementById('sidebar-logout-btn').addEventListener('click', () => {
        if (confirm('¿Cerrar sesión?')) logout();
    });

    // Browser back/forward buttons
    window.addEventListener('popstate', () => {
        if (state.token) handleHashRoute();
    });
});
