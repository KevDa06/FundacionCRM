/**
 * Controlador del Ciclo de Vida de Sesión y Seguridad (FundaciónCRM)
 * Administra el temporizador de inactividad, inicio de sesión, bloqueo y limpieza de estado.
 */
import { store } from '../state/store.js';
import { TIEMPO_INACTIVIDAD_MS, EVENTOS_ACTIVIDAD, STORAGE_KEYS, VISTAS } from '../config/constants.js';
import { supabaseInitError } from '../services/supabase.js';
import { iniciarSesionConDocumento, cerrarSesion as cerrarSesionAuth } from '../services/auth.js';
import { mostrarErrorConexionDB } from '../components/dbErrorScreen.js';
import { mostrarNotificacion } from '../components/toast.js';
import { actualizarUIPerfilUsuario } from '../modules/usuarios/index.js';
import { renderView, setCurrentView, setSubTabAlertasActiva, toggleSidebar } from './navigation.js';

let temporizadorInactividad = null;
let ultimaHoraActividad = Date.now();
let listenersInactividadRegistrados = false;

// Callback asignado externamente para evitar dependencias circulares con dataSync
let onIniciarAppCallback = null;

export function registrarCallbackIniciarApp(cb) {
    onIniciarAppCallback = cb;
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

export function iniciarControlInactividad() {
    detenerControlInactividad();
    EVENTOS_ACTIVIDAD.forEach(evento => {
        window.addEventListener(evento, manejarActividadUsuario, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', manejarCambioVisibilidad);
    listenersInactividadRegistrados = true;
    ultimaHoraActividad = Date.now();
    reiniciarTemporizadorInactividad();
}

export function detenerControlInactividad() {
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
        btnSubmit.classList.add('opacity-70', 'cursor-not-allowed');
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

        const vistaGuardada = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_VIEW) || VISTAS.DASHBOARD;
        setCurrentView(vistaGuardada);
        renderView(vistaGuardada);

        actualizarUIPerfilUsuario(resultado.usuario);
        if (typeof onIniciarAppCallback === 'function') {
            await onIniciarAppCallback();
        }

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
            btnSubmit.classList.remove('opacity-70', 'cursor-not-allowed');
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
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_VIEW);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_VIEW);
        sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_VIEW);
        sessionStorage.removeItem(STORAGE_KEYS.CURRENT_VIEW);
        sessionStorage.removeItem(STORAGE_KEYS.RESUMEN_MOSTRADO);
    } catch (_e) { /* ignore */ }

    setCurrentView(VISTAS.DASHBOARD);
    setSubTabAlertasActiva('alertas');
    renderView(VISTAS.DASHBOARD);
}

export async function cerrarSesion(porInactividad = false) {
    detenerControlInactividad();
    try {
        await cerrarSesionAuth();
    } catch (e) {
        console.error('Error al cerrar sesión:', e);
    }

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
