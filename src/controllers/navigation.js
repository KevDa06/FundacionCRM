/**
 * Controlador de Navegación y Enrutamiento (FundaciónCRM)
 * Gestiona el intercambio de vistas, pestañas, subpestañas y estado del menú lateral.
 */
import { store } from '../state/store.js';
import { STORAGE_KEYS, TITULOS_VISTAS, VISTAS } from '../config/constants.js';
import { tienePermiso } from '../services/auth.js';
import { mostrarNotificacion } from '../components/toast.js';

// Módulos para renderizado bajo demanda
import { renderizarTablaDonantes } from '../modules/donantes/index.js';
import { renderizarTablaDonaciones } from '../modules/donaciones/index.js';
import { renderizarModuloSeguimiento } from '../modules/seguimiento/index.js';
import { renderizarModuloCumpleanos } from '../modules/cumpleanos/index.js';
import { renderizarTablaAlertas, cambiarSubTabAlertas } from '../modules/retencion/index.js';
import { renderizarDestinaciones } from '../modules/destinaciones/index.js';
import { cargarYRenderizarUsuarios } from '../modules/usuarios/index.js';
import { cargarYRenderizarAuditoria } from '../modules/auditoria/index.js';

let currentView = VISTAS.DASHBOARD;
let subTabAlertasActiva = 'alertas';

export function getCurrentView() {
    return currentView;
}

export function setCurrentView(vista) {
    currentView = vista;
}

export function getSubTabAlertasActiva() {
    return subTabAlertasActiva;
}

export function setSubTabAlertasActiva(subtab) {
    subTabAlertasActiva = subtab;
}

/**
 * Abre o cierra el menú lateral responsivo
 */
export function toggleSidebar(forzarEstado = null) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!sidebar) return;

    const estaAbierto = !sidebar.classList.contains('-translate-x-full');
    const abrir = forzarEstado !== null ? forzarEstado : !estaAbierto;

    if (abrir) {
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        if (overlay) overlay.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        sidebar.classList.remove('translate-x-0');
        if (overlay) overlay.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

/**
 * Enruta y renderiza la vista especificada
 */
export function renderView(view = VISTAS.DASHBOARD) {
    currentView = view;
    cambiarTab(view);
}

/**
 * Cambia la pestaña activa aplicando verificaciones de permisos RBAC
 */
export function cambiarTab(tabId) {
    currentView = tabId || VISTAS.DASHBOARD;
    try {
        sessionStorage.setItem(STORAGE_KEYS.ACTIVE_VIEW, currentView);
    } catch (_e) {
        // Ignorar excepciones de almacenamiento en iframe restrictivo
    }

    if (tabId === VISTAS.USUARIOS) {
        if (!tienePermiso('administrar_usuarios')) {
            mostrarNotificacion('peligro', 'Acceso Restringido', 'El módulo de gestión de usuarios es exclusivo para administradores.');
            return;
        }
    }
    if (tabId === VISTAS.AUDITORIA) {
        if (!tienePermiso('ver_auditoria')) {
            mostrarNotificacion('peligro', 'Acceso Restringido', 'El módulo de auditoría es exclusivo para administradores.');
            return;
        }
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('aside nav button').forEach(el => {
        el.className = 'sidebar-link w-full flex items-center space-x-3 px-4 py-3 text-sm transition-all rounded-r-lg border-l-4 border-transparent font-medium';
    });

    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) {
        targetTab.classList.remove('hidden');
        targetTab.classList.add('block');
    }

    const targetBtn = document.getElementById(`btn-tab-${tabId}`);
    if (targetBtn) {
        targetBtn.className = 'sidebar-link sidebar-link-active w-full flex items-center space-x-3 px-4 py-3 text-sm transition-all rounded-r-lg border-l-4 font-semibold';
    }

    const headerTitle = document.getElementById('header-titulo-vista');
    if (headerTitle) {
        headerTitle.innerText = TITULOS_VISTAS[tabId] || 'Panel';
    }

    // Despacho de renderizadores específicos de módulo
    if (tabId === VISTAS.DONANTES) renderizarTablaDonantes();
    if (tabId === VISTAS.DONACIONES) renderizarTablaDonaciones();
    if (tabId === VISTAS.SEGUIMIENTO) renderizarModuloSeguimiento();
    if (tabId === VISTAS.CUMPLEANOS) renderizarModuloCumpleanos();
    if (tabId === VISTAS.ALERTAS) {
        const subtabActual = store.subTabAlertasActiva || localStorage.getItem(STORAGE_KEYS.SUBTAB_RETENCION) || 'alertas';
        cambiarSubTabAlertas(subtabActual);
    }
    if (tabId === VISTAS.HERRAMIENTAS) renderizarDestinaciones();
    if (tabId === VISTAS.USUARIOS) cargarYRenderizarUsuarios();
    if (tabId === VISTAS.AUDITORIA) cargarYRenderizarAuditoria();

    toggleSidebar(false);
}
