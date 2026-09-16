/**
 * Orquestador Principal de la Aplicación (FundaciónCRM)
 * Inicialización, enrutamiento/vistas, ciclo de vida de sesión y eventos globales.
 */
import {
    supabaseClient,
    isSupabaseConfigured,
    isMockActive,
    supabaseInitError,
    verificarConexionSupabase
} from './services/supabase.js';
import {
    mostrarErrorConexionDB,
    ocultarErrorConexionDB,
    actualizarIndicadorMockUI
} from './components/dbErrorScreen.js';
import * as donantesService from './services/donantesService.js';
import * as donacionesService from './services/donacionesService.js';
import * as recordatoriosService from './services/recordatoriosService.js';
import * as destinacionesService from './services/destinacionesService.js';
import {
    iniciarSesionConDocumento,
    cargarPerfilUsuario,
    cerrarSesion as cerrarSesionAuth,
    tienePermiso
} from './services/auth.js';

import { store } from './state/store.js';

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

import {
    mostrarNotificacion,
    cerrarNotificacion
} from './components/toast.js';

import { cerrarModal } from './components/modal.js';

// Módulos de Negocio
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

import { gestionarBoton } from './utils/ui.js';

// Estado de navegación
let currentView = 'dashboard';
let subTabAlertasActiva = 'alertas';

// Inactividad
const TIEMPO_INACTIVIDAD_MS = 15 * 60 * 1000; // 15 minutos
let temporizadorInactividad = null;
let ultimaHoraActividad = Date.now();
const EVENTOS_ACTIVIDAD = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
let listenersInactividadRegistrados = false;

// ==================== CARGA DE DATOS SUPABASE ====================
export async function cargarDatosSupabase() {
    try {
        if (supabaseInitError) {
            mostrarErrorConexionDB({
                titulo: supabaseInitError.message,
                mensaje: 'La aplicación no puede sincronizar datos porque no se detectó una conexión válida con Supabase en producción.',
                detalle: supabaseInitError.details,
                onReintentar: () => window.location.reload()
            });
            return;
        }

        actualizarIndicadorMockUI(isMockActive);

        const statusEl = document.getElementById('status-db');
        if (!isMockActive && statusEl) {
            statusEl.innerText = 'Sincronizando DB...';
        }

        const { data: donantes, error: errDonantes } = await donantesService.listar();
        if (errDonantes) throw errDonantes;
        store.globalDonantes = donantes || [];

        const { data: donaciones, error: errDonaciones } = await donacionesService.listar();
        if (errDonaciones) throw errDonaciones;
        store.globalDonaciones = donaciones || [];

        const { data: recordatorios, error: errRecordatorios } = await recordatoriosService.obtenerRecordatorios();
        if (errRecordatorios) {
            console.warn('Advertencia al cargar recordatorios:', errRecordatorios);
        } else {
            store.globalRecordatorios = recordatorios || [];
        }

        actualizarIndicadorMockUI(isMockActive);

        actualizarKPIs();
        renderizarGraficos();
        poblarSelectDonantes();

        const tabDonantes = document.getElementById('tab-donantes');
        const tabDonaciones = document.getElementById('tab-donaciones');
        const tabSeguimiento = document.getElementById('tab-seguimiento');
        const tabCumpleanos = document.getElementById('tab-cumpleanos');
        const tabAlertas = document.getElementById('tab-alertas');

        if (tabDonantes && !tabDonantes.classList.contains('hidden')) renderizarTablaDonantes();
        if (tabDonaciones && !tabDonaciones.classList.contains('hidden')) renderizarTablaDonaciones();
        if (tabSeguimiento && !tabSeguimiento.classList.contains('hidden')) renderizarModuloSeguimiento();
        if (tabCumpleanos && !tabCumpleanos.classList.contains('hidden')) renderizarModuloCumpleanos();
        if (tabAlertas && !tabAlertas.classList.contains('hidden')) {
            if (subTabAlertasActiva === 'alertas') renderizarTablaAlertas();
            else renderizarTablaRecordatorios();
        }
    } catch (err) {
        console.error('Error al sincronizar Supabase:', err);
        const statusEl = document.getElementById('status-db');
        if (statusEl) {
            statusEl.innerText = 'Error Conexión';
            statusEl.className = 'text-xs font-semibold text-rose-700';
            if (statusEl.previousElementSibling) {
                statusEl.previousElementSibling.className = 'w-2 h-2 rounded-full bg-rose-500';
            }
        }
        const infoError = clasificarErrorSupabase(err);
        mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
    }
}

// ==================== CAMBIO DE MONEDA GLOBAL ====================
export function cambiarMonedaGlobal() {
    const sel = document.getElementById('selector-moneda');
    if (sel) {
        store.monedaActual = sel.value;
    }
    actualizarKPIs();
    renderizarGraficos();
    renderizarTablaDonaciones();
    renderizarModuloSeguimiento();
    renderizarTablaOcasionales();
}

// ==================== SIDEBAR Y NAVEGACIÓN ====================
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

export function renderView(view = 'dashboard') {
    currentView = view;
    cambiarTab(view);
}

export function cambiarTab(tabId) {
    currentView = tabId || 'dashboard';
    if (tabId === 'usuarios') {
        if (!tienePermiso('administrar_usuarios')) {
            mostrarNotificacion('peligro', 'Acceso Restringido', 'El módulo de gestión de usuarios es exclusivo para administradores.');
            return;
        }
    }
    if (tabId === 'auditoria') {
        if (!tienePermiso('ver_auditoria')) {
            mostrarNotificacion('peligro', 'Acceso Restringido', 'El módulo de auditoría es exclusivo para administradores.');
            return;
        }
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('aside nav button').forEach(el => el.className = 'sidebar-link w-full flex items-center space-x-3 px-4 py-3 text-sm transition-all rounded-r-lg border-l-4 border-transparent font-medium');

    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) {
        targetTab.classList.remove('hidden');
        targetTab.classList.add('block');
    }

    const targetBtn = document.getElementById(`btn-tab-${tabId}`);
    if (targetBtn) {
        targetBtn.className = 'sidebar-link sidebar-link-active w-full flex items-center space-x-3 px-4 py-3 text-sm transition-all rounded-r-lg border-l-4 font-semibold';
    }

    const titulos = {
        'dashboard': 'Panel General',
        'donantes': 'Directorio',
        'donaciones': 'Registro',
        'seguimiento': 'Seguimiento de Donaciones',
        'cumpleanos': 'Cumpleaños de Donantes',
        'alertas': 'Centro de Retención',
        'herramientas': 'Ajustes',
        'usuarios': 'Gestión de Usuarios',
        'auditoria': 'Registro de Auditoría'
    };
    const headerTitle = document.getElementById('header-titulo-vista');
    if (headerTitle) headerTitle.innerText = titulos[tabId] || 'Panel';

    if (tabId === 'donantes') renderizarTablaDonantes();
    if (tabId === 'donaciones') renderizarTablaDonaciones();
    if (tabId === 'seguimiento') renderizarModuloSeguimiento();
    if (tabId === 'cumpleanos') renderizarModuloCumpleanos();
    if (tabId === 'alertas') {
        if (headerTitle) {
            headerTitle.innerText = subTabAlertasActiva === 'alertas' ? 'Centro de Retención' : 'Recordatorios de Donación';
        }
        if (subTabAlertasActiva === 'alertas') {
            renderizarTablaAlertas();
        } else {
            renderizarTablaRecordatorios();
        }
    }
    if (tabId === 'herramientas') renderizarDestinaciones();
    if (tabId === 'usuarios') cargarYRenderizarUsuarios();
    if (tabId === 'auditoria') cargarYRenderizarAuditoria();

    toggleSidebar(false);
}

// ==================== DESTINACIONES ====================
export async function cargarDestinaciones() {
    const { data } = await destinacionesService.listar();
    store.globalDestinacionesRegistros = data || [];
    store.globalDestinaciones = (data || []).map(d => d.nombre);
}

export function renderizarDestinaciones() {
    const cont = document.getElementById('lista-destinaciones');
    if (!cont) return;
    cont.innerHTML = '';

    store.globalDestinaciones.forEach((d, i) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl';

        const span = document.createElement('span');
        span.className = 'text-sm font-semibold text-slate-700';
        span.textContent = d;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'text-slate-400 hover:text-rose-600 transition-colors p-1';
        btn.title = 'Eliminar Destinación';
        btn.onclick = () => eliminarDestinacion(i);
        btn.innerHTML = '<i class="fa-solid fa-times"></i>';

        item.appendChild(span);
        item.appendChild(btn);
        cont.appendChild(item);
    });

    const selF = document.getElementById('donacion-destinacion');
    const selT = document.getElementById('filtro-destinacion-donacion');
    if (selF) {
        selF.innerHTML = '';
        store.globalDestinaciones.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            selF.appendChild(opt);
        });
    }
    if (selT) {
        selT.innerHTML = '<option value="">Cualquier Destinación</option>';
        store.globalDestinaciones.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            selT.appendChild(opt);
        });
    }
}

export async function agregarDestinacion() {
    const input = document.getElementById('nueva-destinacion');
    if (!input) return;
    const val = input.value.trim();

    if (!val) return;
    if (store.globalDestinaciones.some(d => d.localeCompare(val, 'es', { sensitivity: 'base' }) === 0)) {
        return mostrarNotificacion('alerta', 'Destinación existente', 'Ya existe una destinación con ese nombre.');
    }

    const { error } = await destinacionesService.crear(val);
    if (error) return mostrarNotificacion('error', error.titulo || 'No se pudo guardar', error.mensaje || 'No fue posible guardar la destinación.');

    input.value = '';
    await cargarDestinaciones();
    renderizarDestinaciones();
}

export async function eliminarDestinacion(i) {
    if (store.globalDestinaciones.length <= 1) return mostrarNotificacion('alerta', 'No permitido', 'Mínimo 1 destinación.');

    const registro = store.globalDestinacionesRegistros[i];
    if (!registro) {
        return mostrarNotificacion('alerta', 'Migración pendiente', 'Aplica la migración de Supabase para administrar las destinaciones compartidas.');
    }

    const { error } = await destinacionesService.eliminar(registro.id);
    if (error) return mostrarNotificacion('error', error.titulo || 'No se pudo eliminar', error.mensaje || 'No fue posible eliminar la destinación.');

    await cargarDestinaciones();
    renderizarDestinaciones();
}

// ==================== AUTENTICACIÓN Y SESIÓN ====================
export async function verificarPassword() {
    if (supabaseInitError) {
        mostrarErrorConexionDB({
            titulo: supabaseInitError.message,
            mensaje: 'Acceso bloqueado: No se pudo conectar con el servidor de base de datos en producción.',
            detalle: supabaseInitError.details
        });
        return;
    }

    const inputDoc = document.getElementById('input-documento');
    const inputPwd = document.getElementById('input-password');
    const btnSubmit = document.getElementById('btn-desbloquear-crm');
    const errorMsgEl = document.getElementById('login-error-msg');

    const doc = inputDoc ? inputDoc.value.trim() : '';
    const pass = inputPwd ? inputPwd.value.trim() : '';

    if (errorMsgEl) {
        errorMsgEl.classList.add('hidden');
        errorMsgEl.innerText = '';
    }

    if (!doc) {
        if (errorMsgEl) {
            errorMsgEl.innerText = 'Por favor ingresa tu documento de identidad.';
            errorMsgEl.classList.remove('hidden');
        } else {
            mostrarNotificacion('alerta', 'Campo requerido', 'Por favor ingresa tu documento de identidad.');
        }
        if (inputDoc) inputDoc.focus();
        return;
    }

    if (!pass) {
        if (errorMsgEl) {
            errorMsgEl.innerText = 'Por favor ingresa tu contraseña.';
            errorMsgEl.classList.remove('hidden');
        } else {
            mostrarNotificacion('alerta', 'Campo requerido', 'Por favor ingresa tu contraseña.');
        }
        if (inputPwd) inputPwd.focus();
        return;
    }

    let textoOriginal = '';
    if (btnSubmit) {
        textoOriginal = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Verificando credenciales...';
    }

    try {
        const resultado = await iniciarSesionConDocumento(doc, pass);

        if (!resultado.exito) {
            if (errorMsgEl) {
                errorMsgEl.innerText = resultado.mensaje || 'Documento o contraseña incorrectos.';
                errorMsgEl.classList.remove('hidden');
            } else {
                mostrarNotificacion('peligro', resultado.titulo || 'Acceso Denegado', resultado.mensaje);
            }
            if (inputPwd) {
                inputPwd.value = '';
                inputPwd.focus();
            }
            return;
        }

        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen) lockScreen.classList.add('hidden');
        if (inputPwd) inputPwd.value = '';
        if (errorMsgEl) errorMsgEl.classList.add('hidden');

        currentView = 'dashboard';
        renderView('dashboard');

        actualizarUIPerfilUsuario(resultado.usuario);
        await iniciarApp();

    } catch (err) {
        console.error('Error inesperado de inicio de sesión:', err);
        if (errorMsgEl) {
            errorMsgEl.innerText = 'Ocurrió un error inesperado al iniciar sesión. Intenta nuevamente.';
            errorMsgEl.classList.remove('hidden');
        } else {
            mostrarNotificacion('peligro', 'Error de Red', 'No se pudo conectar con el servidor.');
        }
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = textoOriginal;
        }
    }
}

export function limpiarDatosSesion() {
    detenerControlInactividad();

    store.globalDonantes = [];
    store.globalDonaciones = [];
    store.globalRecordatorios = [];
    store.editandoDonanteId = null;
    store.editandoDonacionId = null;

    if (store.chartRecaudacionInstance) {
        store.chartRecaudacionInstance.destroy();
        store.chartRecaudacionInstance = null;
    }
    if (store.chartMediosPagoInstance) {
        store.chartMediosPagoInstance.destroy();
        store.chartMediosPagoInstance = null;
    }

    const tablas = [
        'tabla-donantes',
        'tabla-donaciones',
        'tabla-alertas-retencion',
        'tabla-cumpleanos',
        'tabla-seguimiento-periodicos',
        'tabla-seguimiento-ocasionales'
    ];
    tablas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    const selectDonante = document.getElementById('donacion-donante-id');
    if (selectDonante) selectDonante.innerHTML = '<option value="">-- Seleccione donante activo --</option>';
    const filtroDonanteSeg = document.getElementById('filtro-donante-seguimiento');
    if (filtroDonanteSeg) filtroDonanteSeg.innerHTML = '<option value="">Todos los donantes periódicos</option>';

    const kpisMoneda = ['kpi-total-recaudado', 'kpi-recaudado-mes'];
    kpisMoneda.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = '$ 0';
    });
    const kpisConteo = ['kpi-donantes-activos', 'kpi-total-donaciones', 'badge-alertas-count', 'badge-cumpleanos-count'];
    kpisConteo.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = '0';
    });

    const modales = ['modal-donante', 'modal-donacion', 'modal-detalle-donante', 'modal-reporte-errores', 'modal-recordatorio-donacion', 'modal-resumen-inicio'];
    modales.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden');
    });

    const camposRecibo = ['recibo-comp', 'recibo-fecha', 'recibo-donante-nombre', 'recibo-donante-doc', 'recibo-destinacion', 'recibo-medio', 'recibo-monto'];
    camposRecibo.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = '';
    });

    try {
        localStorage.removeItem('activeView');
        localStorage.removeItem('currentView');
        sessionStorage.removeItem('activeView');
        sessionStorage.removeItem('currentView');
        sessionStorage.removeItem('crm_resumen_mostrado');
    } catch (_e) { /* ignore */ }

    currentView = 'dashboard';
    subTabAlertasActiva = 'alertas';
    renderView('dashboard');
}

export async function cerrarSesion(porInactividad = false) {
    detenerControlInactividad();
    try {
        await cerrarSesionAuth();
    } catch (e) {
        console.error('Error al cerrar sesión:', e);
    }

    try {
        localStorage.removeItem('activeView');
        localStorage.removeItem('currentView');
        sessionStorage.removeItem('activeView');
        sessionStorage.removeItem('currentView');
        sessionStorage.removeItem('crm_resumen_mostrado');
    } catch (_e) { /* ignore */ }

    currentView = 'dashboard';
    subTabAlertasActiva = 'alertas';
    renderView('dashboard');

    limpiarDatosSesion();
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen) lockScreen.classList.remove('hidden');
    const inputPwd = document.getElementById('input-password');
    if (inputPwd) {
        inputPwd.value = '';
        inputPwd.focus();
    }
    toggleSidebar(false);
    if (porInactividad) {
        mostrarNotificacion('alerta', 'Sesión cerrada por inactividad', 'Tu sesión se ha cerrado automáticamente tras 15 minutos de inactividad.');
    } else {
        mostrarNotificacion('informacion', 'Sesión cerrada', 'El CRM ha sido bloqueado correctamente.');
    }
}

// ==================== CONTROL DE INACTIVIDAD ====================
function manejarActividadUsuario() {
    ultimaHoraActividad = Date.now();
    reiniciarTemporizadorInactividad();
}

function verificarExpiracionInactividad() {
    const tiempoTranscurrido = Date.now() - ultimaHoraActividad;
    if (tiempoTranscurrido >= TIEMPO_INACTIVIDAD_MS) {
        cerrarSesion(true);
    } else {
        const tiempoRestante = TIEMPO_INACTIVIDAD_MS - tiempoTranscurrido;
        temporizadorInactividad = setTimeout(verificarExpiracionInactividad, Math.max(tiempoRestante, 1000));
    }
}

function reiniciarTemporizadorInactividad() {
    if (temporizadorInactividad) {
        clearTimeout(temporizadorInactividad);
        temporizadorInactividad = null;
    }
    temporizadorInactividad = setTimeout(verificarExpiracionInactividad, TIEMPO_INACTIVIDAD_MS);
}

function manejarCambioVisibilidad() {
    if (document.visibilityState === 'visible' && listenersInactividadRegistrados) {
        const tiempoTranscurrido = Date.now() - ultimaHoraActividad;
        if (tiempoTranscurrido >= TIEMPO_INACTIVIDAD_MS) {
            cerrarSesion(true);
        }
    }
}

function iniciarControlInactividad() {
    detenerControlInactividad();
    EVENTOS_ACTIVIDAD.forEach(evento => {
        window.addEventListener(evento, manejarActividadUsuario, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', manejarCambioVisibilidad);
    listenersInactividadRegistrados = true;
    ultimaHoraActividad = Date.now();
    reiniciarTemporizadorInactividad();
}

function detenerControlInactividad() {
    if (temporizadorInactividad) {
        clearTimeout(temporizadorInactividad);
        temporizadorInactividad = null;
    }
    if (listenersInactividadRegistrados) {
        EVENTOS_ACTIVIDAD.forEach(evento => {
            window.removeEventListener(evento, manejarActividadUsuario, { capture: true });
        });
        document.removeEventListener('visibilitychange', manejarCambioVisibilidad);
        listenersInactividadRegistrados = false;
    }
}

// ==================== INICIALIZACIÓN DE APP ====================
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

    if (!sessionStorage.getItem('crm_resumen_mostrado')) {
        sessionStorage.setItem('crm_resumen_mostrado', 'true');
        setTimeout(() => {
            mostrarModalResumenInicio();
        }, 500);
    }
}

// Tecla Escape para cerrar modales o sidebar
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarModalReporteErrores();
        cerrarNotificacion();
        toggleSidebar(false);
    }
});

// Eventos de conectividad de red
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

// ==================== WINDOW ONLOAD ====================
window.onload = async () => {
    // 1. Verificación Crítica: Fallo Explícito si Supabase no está configurado en producción
    if (supabaseInitError) {
        mostrarErrorConexionDB({
            titulo: supabaseInitError.message,
            mensaje: 'No fue posible iniciar la aplicación en entorno de producción debido a la falta de credenciales de Supabase.',
            detalle: supabaseInitError.details,
            onReintentar: () => window.location.reload()
        });
        return; // Detiene completamente el arranque de la aplicación
    }

    // 2. Indicadores Visuales de Modo Mock vs Producción
    actualizarIndicadorMockUI(isMockActive);

    // 3. Verificación de Conectividad con Servidor si no estamos en Mock
    if (!isMockActive) {
        const checkConn = await verificarConexionSupabase();
        if (!checkConn.ok) {
            mostrarErrorConexionDB({
                titulo: checkConn.error?.message || 'Error de Conexión: No se pudo conectar con el servidor de base de datos.',
                mensaje: 'No se pudo establecer comunicación con el servidor de base de datos en producción.',
                detalle: checkConn.error?.details || 'Error de red o credenciales no autorizadas.',
                onReintentar: () => window.location.reload()
            });
            return; // Detiene el arranque
        }
    }

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
                localStorage.removeItem('activeView');
                localStorage.removeItem('currentView');
                sessionStorage.removeItem('activeView');
                sessionStorage.removeItem('currentView');
            } catch (_e) { /* ignore */ }
            currentView = 'dashboard';
            renderView('dashboard');
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
            currentView = 'dashboard';
            renderView('dashboard');
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

// ==================== DEBOUNCE Y EXPORTACIÓN A WINDOW ====================
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
    get currentView() { return currentView; },
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
    agregarDestinacion,
    gestionarBoton,
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

    // Gestión de Usuarios y Auditoría (Admin)
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
