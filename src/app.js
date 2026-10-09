/**
 * Orquestador Principal de la Aplicación (FundaciónCRM)
 * Arquitectura modular: ensamblado de controladores, ciclo de vida de sesión y eventos globales.
 */
import {
    supabaseClient,
    isMockActive,
    supabaseInitError,
    verificarConexionSupabase
} from './services/supabase.js';

import {
    mostrarErrorConexionDB,
    ocultarErrorConexionDB,
    actualizarIndicadorMockUI
} from './components/dbErrorScreen.js';

import {
    cargarPerfilUsuario,
    cerrarSesion as cerrarSesionAuth
} from './services/auth.js';

import { store } from './state/store.js';
import { STORAGE_KEYS, VISTAS } from './config/constants.js';

import {
    escaparHTML,
    normalizarDocumento,
    formatearMoneda,
    formatearMonedaEstatica,
    normalizarACOP
} from './utils/formatters.js';

import {
    obtenerFechaActualLocal,
    esFechaValida,
    esFechaFutura
} from './utils/dates.js';

import {
    validarEmail,
    validarTelefono
} from './utils/validation.js';

import { clasificarErrorSupabase } from './utils/supabaseErrors.js';
import { mostrarNotificacion, cerrarNotificacion, limpiarTodosLosToasts } from './components/toast.js';
import { cerrarModal } from './components/modal.js';
import { gestionarBoton } from './utils/ui.js';
import { ejecutarBotonIdempotente } from './components/ui/button.js';

// Controladores desacoplados
import {
    getCurrentView,
    renderView,
    cambiarTab,
    toggleSidebar
} from './controllers/navigation.js';

import {
    verificarPassword,
    cerrarSesion,
    limpiarDatosSesion,
    iniciarControlInactividad,
    registrarCallbackIniciarApp
} from './controllers/session.js';

import {
    cargarDatosSupabase,
    cambiarMonedaGlobal
} from './controllers/dataSync.js';

// Módulos de Dominio
import {
    actualizarKPIs,
    renderizarGraficos,
    actualizarControlesFiltro
} from './modules/dashboard/index.js';

import {
    abrirModalDonante,
    guardarDonante,
    confirmarEliminarDonante,
    filtrarTablaDonantes,
    renderizarTablaDonantes,
    verDetalleDonante,
    actualizarMetricasDetalle
} from './modules/donantes/index.js';

import {
    abrirModalDonacion,
    guardarDonacion,
    confirmarEliminarDonacion,
    poblarSelectDonantes,
    filtrarTablaDonaciones,
    renderizarTablaDonaciones,
    imprimirRecibo
} from './modules/donaciones/index.js';

import {
    renderizarTablaAlertas,
    cambiarSubTabAlertas,
    renderizarTablaRecordatorios,
    alEnviarWhatsApp,
    poblarSelectDonantesRecordatorio,
    abrirModalProgramarRecordatorio,
    guardarRecordatorio,
    cambiarEstadoRecordatorio,
    confirmarEliminarRecordatorio,
    mostrarModalResumenInicio,
    cerrarModalResumenInicio,
    cambiarTabResumen,
    renderizarHistorialNotificacionesResumen,
    limpiarHistorialNotificacionesDesdeUI,
    irAAlertasDesdeResumen,
    irACumpleanosDesdeResumen
} from './modules/retencion/index.js';

import {
    renderizarModuloCumpleanos
} from './modules/cumpleanos/index.js';

import {
    renderizarModuloSeguimiento,
    renderizarTablaSeguimientoDonaron,
    renderizarTablaOcasionales,
    alCambiarAnioSeguimiento,
    alCambiarMesSeguimiento,
    alCambiarTipoPeriodoSeguimiento,
    cambiarFiltroVistaSeguimiento,
    cambiarSubTabSeguimiento,
    exportarInformeSeguimiento,
    exportarInformeTrimestral
} from './modules/seguimiento/index.js';

import {
    cargarDestinaciones,
    renderizarDestinaciones,
    agregarDestinacion,
    eliminarDestinacion
} from './modules/destinaciones/index.js';

import {
    cargarYRenderizarUsuarios,
    filtrarTablaUsuarios,
    abrirModalNuevoUsuario,
    guardarUsuario,
    abrirModalCambiarRol,
    confirmarCambiarRol,
    abrirModalCambiarPassword,
    confirmarCambiarPassword,
    alternarEstadoUsuario,
    togglePasswordVisibility,
    toggleVisibilidadPasswordUsuario,
    actualizarUIPerfilUsuario
} from './modules/usuarios/index.js';

import {
    cargarYRenderizarAuditoria,
    filtrarTablaAuditoria,
    verDetalleAuditoria
} from './modules/auditoria/index.js';

import {
    exportarExcel,
    descargarPlantillaImportacion,
    descargarPlantillaDonaciones,
    procesarImportacionArchivo,
    cerrarModalReporteErrores,
    descargarReporteErroresTXT,
    abrirReporteEnNuevaVentana,
    filtrarErroresReporte,
    initImportacionDonaciones
} from './modules/importacion/index.js';

// ==================== INICIALIZACIÓN DE LA APLICACIÓN ====================
export async function iniciarApp() {
    const hoy = new Date();
    const filtroAnio = document.getElementById('filtro-anio');
    const filtroMes = document.getElementById('filtro-mes-select');
    const filtroTrimestre = document.getElementById('filtro-trimestre-select');

    if (filtroAnio) filtroAnio.value = hoy.getFullYear();
    if (filtroMes) filtroMes.value = hoy.getMonth() + 1;
    if (filtroTrimestre) filtroTrimestre.value = Math.floor(hoy.getMonth() / 3) + 1;

    actualizarControlesFiltro();

    await cargarDestinaciones();
    renderizarDestinaciones();

    await cargarDatosSupabase();

    window.addEventListener('resize', () => {
        if (store.chartRecaudacionInstance) store.chartRecaudacionInstance.resize();
        if (store.chartMediosPagoInstance) store.chartMediosPagoInstance.resize();
    });

    iniciarControlInactividad();

    if (!sessionStorage.getItem(STORAGE_KEYS.RESUMEN_MOSTRADO)) {
        sessionStorage.setItem(STORAGE_KEYS.RESUMEN_MOSTRADO, 'true');
        setTimeout(() => {
            mostrarModalResumenInicio();
        }, 500);
    }
}

// Registro del callback en el controlador de sesión
registrarCallbackIniciarApp(iniciarApp);

// Tecla Escape para accesibilidad
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarModalReporteErrores();
        cerrarNotificacion();
        cerrarModalResumenInicio();
        toggleSidebar(false);
    }
});

// Eventos de red y conectividad
window.addEventListener('online', () => {
    const statusEl = document.getElementById('status-db');
    if (statusEl) {
        statusEl.innerText = 'Sistema en línea';
        statusEl.classList.remove('text-rose-700');
        statusEl.classList.add('text-emerald-700');
        if (statusEl.previousElementSibling) {
            statusEl.previousElementSibling.classList.remove('bg-rose-500');
            statusEl.previousElementSibling.classList.add('bg-emerald-500');
        }
    }
    cargarDatosSupabase();
});

window.addEventListener('offline', () => {
    const statusEl = document.getElementById('status-db');
    if (statusEl) {
        statusEl.innerText = 'Sin Conexión';
        statusEl.classList.remove('text-emerald-700');
        statusEl.classList.add('text-rose-700');
        if (statusEl.previousElementSibling) {
            statusEl.previousElementSibling.classList.remove('bg-emerald-500');
            statusEl.previousElementSibling.classList.add('bg-rose-500');
        }
    }
    mostrarNotificacion('alerta', 'Sin Conexión', 'Se ha perdido la conexión a Internet. Verifica tu red antes de guardar o modificar registros.');
});

// ==================== CICLO DE ARRANQUE (WINDOW.ONLOAD) ====================
window.onload = async () => {
    // 1. Verificación Crítica: Fallo Explícito si Supabase no está configurado en producción
    if (supabaseInitError) {
        mostrarErrorConexionDB({
            titulo: supabaseInitError.message,
            mensaje: 'No fue posible iniciar la aplicación en entorno de producción debido a la falta de credenciales de Supabase.',
            detalle: supabaseInitError.details,
            onReintentar: () => window.location.reload()
        });
        return;
    }

    // 2. Indicadores Visuales de Modo Mock vs Producción
    actualizarIndicadorMockUI(isMockActive);

    // 3. Verificación de Conectividad con Servidor
    if (!isMockActive) {
        const checkConn = await verificarConexionSupabase();
        if (!checkConn.ok) {
            mostrarErrorConexionDB({
                titulo: checkConn.error?.message || 'Error de Conexión: No se pudo conectar con el servidor de base de datos.',
                mensaje: 'No se pudo establecer comunicación con el servidor de base de datos en producción.',
                detalle: checkConn.error?.details || 'Error de red o credenciales no autorizadas.',
                onReintentar: () => window.location.reload()
            });
            return;
        }
    }

    // 4. Inicializador de módulo de importación
    initImportacionDonaciones({
        supabaseClient,
        getDonantes: () => store.globalDonantes,
        getDonaciones: () => store.globalDonaciones,
        getDestinaciones: () => store.globalDestinaciones,
        mostrarNotificacion,
        cargarDatosSupabase
    });

    const inputPwd = document.getElementById('input-password');
    if (inputPwd) {
        inputPwd.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') verificarPassword();
        });
    }

    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            try {
                localStorage.removeItem(STORAGE_KEYS.ACTIVE_VIEW);
                localStorage.removeItem(STORAGE_KEYS.CURRENT_VIEW);
                sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_VIEW);
                sessionStorage.removeItem(STORAGE_KEYS.CURRENT_VIEW);
            } catch (_e) { /* ignore */ }
            renderView(VISTAS.DASHBOARD);
            limpiarDatosSesion();
            const lockScreen = document.getElementById('lock-screen');
            if (lockScreen) lockScreen.classList.remove('hidden');
        }
    });

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
            const perfil = await cargarPerfilUsuario(session.user.id);
            if (!perfil || perfil.activo === false) {
                await cerrarSesionAuth();
                limpiarDatosSesion();
                const lockScreen = document.getElementById('lock-screen');
                if (lockScreen) lockScreen.classList.remove('hidden');
                mostrarNotificacion('peligro', 'Cuenta Inactiva', 'Tu cuenta de usuario ha sido desactivada. Contacta al administrador.');
                return;
            }
            actualizarUIPerfilUsuario(perfil);
            const lockScreen = document.getElementById('lock-screen');
            if (lockScreen) lockScreen.classList.add('hidden');
            const vistaGuardada = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_VIEW) || VISTAS.DASHBOARD;
            renderView(vistaGuardada);
            await iniciarApp();
        } else {
            const lockScreen = document.getElementById('lock-screen');
            if (lockScreen) lockScreen.classList.remove('hidden');
            if (inputPwd) inputPwd.focus();
        }
    } catch (e) {
        console.error('Error al verificar sesión inicial:', e);
        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen) lockScreen.classList.remove('hidden');
        if (inputPwd) inputPwd.focus();
    }
};

// ==================== DEBOUNCE Y PUENTE WINDOW GLOBAL ====================
function debounce(fn, espera = 200) {
    let temporizador;
    return (...args) => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => fn(...args), espera);
    };
}

const filtrarTablaDonantesDebounced = debounce(filtrarTablaDonantes);
const filtrarTablaDonacionesDebounced = debounce(filtrarTablaDonaciones);
const renderizarTablaSeguimientoDonaronDebounced = debounce(renderizarTablaSeguimientoDonaron);
const renderizarTablaOcasionalesDebounced = debounce(renderizarTablaOcasionales);
const renderizarModuloCumpleanosDebounced = debounce(renderizarModuloCumpleanos);
const renderizarTablaRecordatoriosDebounced = debounce(renderizarTablaRecordatorios);
const filtrarTablaUsuariosDebounced = debounce(filtrarTablaUsuarios);
const filtrarTablaAuditoriaDebounced = debounce(filtrarTablaAuditoria);

Object.assign(window, {
    // Interacción y Navegación
    get currentView() { return getCurrentView(); },
    renderView,
    cambiarTab,
    toggleSidebar,
    togglePasswordVisibility,
    verificarPassword,
    cerrarSesion,
    cambiarMonedaGlobal,

    // Modales y Notificaciones
    abrirModalDonante,
    abrirModalDonacion,
    cerrarModal,
    mostrarNotificacion,
    cerrarNotificacion,
    limpiarTodosLosToasts,
    mostrarErrorConexionDB,
    ocultarErrorConexionDB,
    actualizarIndicadorMockUI,

    // Operaciones CRUD Donantes y Donaciones
    guardarDonante,
    guardarDonacion,
    confirmarEliminarDonante,
    confirmarEliminarDonacion,
    verDetalleDonante,
    actualizarMetricasDetalle,

    // Filtros y Renderizado de Tablas
    filtrarTablaDonantes,
    filtrarTablaDonaciones,
    filtrarTablaDonantesDebounced,
    filtrarTablaDonacionesDebounced,
    renderizarTablaSeguimientoDonaronDebounced,
    renderizarTablaOcasionalesDebounced,
    renderizarModuloCumpleanosDebounced,
    renderizarTablaRecordatoriosDebounced,
    filtrarTablaUsuariosDebounced,
    filtrarTablaAuditoriaDebounced,
    actualizarKPIs,
    renderizarGraficos,
    renderizarTablaAlertas,
    cambiarSubTabAlertas,
    renderizarTablaRecordatorios,
    alEnviarWhatsApp,
    poblarSelectDonantesRecordatorio,
    abrirModalProgramarRecordatorio,
    guardarRecordatorio,
    cambiarEstadoRecordatorio,
    confirmarEliminarRecordatorio,
    mostrarModalResumenInicio,
    cerrarModalResumenInicio,
    cambiarTabResumen,
    renderizarHistorialNotificacionesResumen,
    limpiarHistorialNotificacionesDesdeUI,
    irAAlertasDesdeResumen,
    irACumpleanosDesdeResumen,
    renderizarTablaOcasionales,
    renderizarModuloCumpleanos,
    renderizarModuloSeguimiento,
    renderizarTablaSeguimientoDonaron,

    // Seguimiento Periódico
    alCambiarAnioSeguimiento,
    alCambiarMesSeguimiento,
    alCambiarTipoPeriodoSeguimiento,
    cambiarFiltroVistaSeguimiento,
    cambiarSubTabSeguimiento,
    actualizarControlesFiltro,

    // Herramientas y Destinaciones
    cargarDestinaciones,
    renderizarDestinaciones,
    agregarDestinacion,
    gestionarBoton,
    ejecutarBotonIdempotente,
    eliminarDestinacion,

    // Importación y Exportación
    procesarImportacionArchivo,
    descargarPlantillaImportacion,
    descargarPlantillaDonaciones,
    exportarExcel,
    exportarInformeSeguimiento,
    exportarInformeTrimestral,
    imprimirRecibo,

    // Reporte de Errores
    abrirReporteEnNuevaVentana,
    cerrarModalReporteErrores,
    descargarReporteErroresTXT,
    filtrarErroresReporte,

    // Gestión de Usuarios y Auditoría
    cargarYRenderizarUsuarios,
    filtrarTablaUsuarios,
    abrirModalNuevoUsuario,
    guardarUsuario,
    abrirModalCambiarRol,
    confirmarCambiarRol,
    abrirModalCambiarPassword,
    confirmarCambiarPassword,
    alternarEstadoUsuario,
    cargarYRenderizarAuditoria,
    filtrarTablaAuditoria,
    verDetalleAuditoria,
    toggleVisibilidadPasswordUsuario,

    // Utilidades públicas y sincronización
    cargarDatosSupabase,
    obtenerFechaActualLocal,
    esFechaValida,
    esFechaFutura,
    validarEmail,
    validarTelefono,
    clasificarErrorSupabase
});
