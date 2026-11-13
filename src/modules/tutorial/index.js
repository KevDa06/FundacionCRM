/**
 * Orquestador del Sistema de Tutoriales y Guía Interactiva (FundaciónCRM)
 * Coordina el centro de ayuda por roles, la navegación automática entre módulos
 * y el ciclo de vida de los recorridos guiados (iniciar, avanzar, retroceder, pausar, salir).
 */
import { VISTAS } from '../../config/constants.js';
import { getUsuarioActual, tienePermiso } from '../../utils/permissions.js';
import { getCurrentView, cambiarTab, toggleSidebar } from '../../controllers/navigation.js';
import { cambiarSubTabSeguimiento } from '../seguimiento/index.js';
import { cambiarSubTabAlertas } from '../retencion/index.js';
import { mostrarNotificacion } from '../../components/toast.js';
import {
    obtenerTutorialesDisponibles,
    construirRecorridoGeneral,
    obtenerTutorialPorVista
} from './tutorialCatalog.js';
import {
    mostrarPasoSpotlight,
    mostrarBarraPausaTutorial,
    limpiarVistaSpotlight
} from './tutorialSpotlight.js';
import {
    renderizarHubTutoriales,
    cerrarHubTutorialesDOM
} from './tutorialHubModal.js';

const estadoTutorial = {
    modo: 'idle', // 'idle' | 'hub' | 'running' | 'paused'
    tipo: null,   // 'completo' | 'seccion'
    seccionId: null,
    tituloRecorrido: '',
    pasos: [],
    indice: 0
};

function estaUsuarioAutenticadoEnUI() {
    const usuario = getUsuarioActual();
    if (!usuario || usuario.activo === false) return false;
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen && !lockScreen.classList.contains('hidden')) return false;
    return true;
}

function getStorageKeyCompletados() {
    const usuario = getUsuarioActual();
    const id = usuario?.id || usuario?.documento || 'anon';
    return `crm_tutorial_completados_${id}`;
}

function obtenerCompletadosSet() {
    try {
        const raw = localStorage.getItem(getStorageKeyCompletados());
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr : []);
    } catch (_e) {
        return new Set();
    }
}

function marcarSeccionCompletada(seccionId) {
    if (!seccionId) return;
    try {
        const set = obtenerCompletadosSet();
        set.add(seccionId);
        localStorage.setItem(getStorageKeyCompletados(), JSON.stringify([...set]));
    } catch (_e) {
        // Ignorar errores de cuota/almacenamiento
    }
}

function prepararEntornoPaso(paso) {
    if (!paso) return;

    if (paso.vista && getCurrentView() !== paso.vista) {
        cambiarTab(paso.vista);
    }

    if (paso.vista === VISTAS.SEGUIMIENTO && paso.subtab) {
        cambiarSubTabSeguimiento(paso.subtab);
    }

    if (paso.vista === VISTAS.ALERTAS && paso.subtab) {
        cambiarSubTabAlertas(paso.subtab);
    }

    if (paso.setup === 'openSidebar') {
        toggleSidebar(true);
    } else if (paso.setup === 'closeSidebar') {
        toggleSidebar(false);
    } else if (!paso.setup) {
        // Por defecto mantener menú cerrado para no tapar el contenido
        toggleSidebar(false);
    }
}

function esperarRenderizado(callback) {
    requestAnimationFrame(() => {
        setTimeout(callback, 120);
    });
}

function mostrarPasoActual() {
    if (estadoTutorial.modo !== 'running') return;
    if (!estaUsuarioAutenticadoEnUI()) {
        limpiarEstadoTutorial();
        return;
    }

    const paso = estadoTutorial.pasos[estadoTutorial.indice];
    if (!paso) {
        finalizarTutorial();
        return;
    }

    prepararEntornoPaso(paso);

    esperarRenderizado(() => {
        if (estadoTutorial.modo !== 'running') return;
        mostrarPasoSpotlight({
            paso,
            indice: estadoTutorial.indice,
            total: estadoTutorial.pasos.length,
            tituloRecorrido: estadoTutorial.tituloRecorrido,
            callbacks: {
                onAnterior: pasoAnteriorTutorial,
                onSiguiente: siguientePasoTutorial,
                onPausar: pausarTutorial,
                onSalir: salirTutorial
            }
        });
    });
}

function finalizarTutorial() {
    const tipo = estadoTutorial.tipo;
    const seccionId = estadoTutorial.seccionId;
    const titulo = estadoTutorial.tituloRecorrido;
    const usuario = getUsuarioActual();

    if (tipo === 'seccion' && seccionId) {
        marcarSeccionCompletada(seccionId);
    } else if (tipo === 'completo' && usuario) {
        const disponibles = obtenerTutorialesDisponibles(tienePermiso, usuario);
        disponibles.forEach(s => marcarSeccionCompletada(s.id));
    }

    limpiarEstadoTutorial();
    mostrarNotificacion(
        'exito',
        'Tutorial completado',
        `Finalizaste la guía "${titulo}". Puedes volver a abrirla cuando la necesites desde Guía de uso.`
    );
}

/**
 * Abre el Centro de Ayuda / Hub de Tutoriales (solo usuarios autenticados).
 */
export function abrirCentroTutoriales() {
    if (!estaUsuarioAutenticadoEnUI()) return;

    const usuario = getUsuarioActual();
    const disponibles = obtenerTutorialesDisponibles(tienePermiso, usuario);
    if (!disponibles.length) {
        mostrarNotificacion('informacion', 'Sin guías disponibles', 'No hay tutoriales habilitados para tu perfil actual.');
        return;
    }

    const totalPasosGenerales = construirRecorridoGeneral(tienePermiso, usuario).length;
    const vistaActual = getCurrentView();
    const seccionActual = obtenerTutorialPorVista(vistaActual, tienePermiso, usuario);
    const completadosSet = obtenerCompletadosSet();

    toggleSidebar(false);
    limpiarVistaSpotlight();
    estadoTutorial.modo = 'hub';

    renderizarHubTutoriales({
        usuario,
        seccionesDisponibles: disponibles,
        totalPasosGenerales,
        seccionActual,
        completadosSet,
        callbacks: {
            onCerrar: cerrarCentroTutoriales,
            onIniciarCompleto: iniciarRecorridoCompleto,
            onIniciarSeccion: iniciarTutorialSeccion
        }
    });
}

export function cerrarCentroTutoriales() {
    cerrarHubTutorialesDOM();
    if (estadoTutorial.modo === 'hub') {
        estadoTutorial.modo = 'idle';
    }
}

/**
 * Inicia el recorrido guiado completo adaptado al rol actual.
 */
export function iniciarRecorridoCompleto() {
    if (!estaUsuarioAutenticadoEnUI()) return;
    const usuario = getUsuarioActual();
    const pasos = construirRecorridoGeneral(tienePermiso, usuario);
    if (!pasos.length) return;

    cerrarHubTutorialesDOM();
    estadoTutorial.modo = 'running';
    estadoTutorial.tipo = 'completo';
    estadoTutorial.seccionId = null;
    estadoTutorial.tituloRecorrido = 'Recorrido completo de la aplicación';
    estadoTutorial.pasos = pasos;
    estadoTutorial.indice = 0;

    mostrarPasoActual();
}

/**
 * Inicia un tutorial independiente para una sección específica.
 */
export function iniciarTutorialSeccion(seccionId) {
    if (!estaUsuarioAutenticadoEnUI()) return;
    const usuario = getUsuarioActual();
    const disponibles = obtenerTutorialesDisponibles(tienePermiso, usuario);
    const seccion = disponibles.find(s => s.id === seccionId);
    if (!seccion || !seccion.pasos.length) {
        mostrarNotificacion('alerta', 'Guía no disponible', 'Esta sección no está habilitada para tu rol actual.');
        return;
    }

    cerrarHubTutorialesDOM();
    estadoTutorial.modo = 'running';
    estadoTutorial.tipo = 'seccion';
    estadoTutorial.seccionId = seccion.id;
    estadoTutorial.tituloRecorrido = seccion.titulo;
    estadoTutorial.pasos = seccion.pasos;
    estadoTutorial.indice = 0;

    mostrarPasoActual();
}

/**
 * Inicia directamente el tutorial de la vista en la que se encuentra el usuario.
 */
export function iniciarTutorialActual() {
    if (!estaUsuarioAutenticadoEnUI()) return;
    const usuario = getUsuarioActual();
    const seccion = obtenerTutorialPorVista(getCurrentView(), tienePermiso, usuario);
    if (seccion) {
        iniciarTutorialSeccion(seccion.id);
    } else {
        abrirCentroTutoriales();
    }
}

export function siguientePasoTutorial() {
    if (estadoTutorial.modo !== 'running') return;
    if (estadoTutorial.indice < estadoTutorial.pasos.length - 1) {
        estadoTutorial.indice += 1;
        mostrarPasoActual();
    } else {
        finalizarTutorial();
    }
}

export function pasoAnteriorTutorial() {
    if (estadoTutorial.modo !== 'running') return;
    if (estadoTutorial.indice > 0) {
        estadoTutorial.indice -= 1;
        mostrarPasoActual();
    }
}

export function pausarTutorial() {
    if (estadoTutorial.modo !== 'running') return;
    estadoTutorial.modo = 'paused';
    toggleSidebar(false);
    mostrarBarraPausaTutorial({
        tituloRecorrido: estadoTutorial.tituloRecorrido,
        indice: estadoTutorial.indice,
        total: estadoTutorial.pasos.length,
        onReanudar: reanudarTutorial,
        onSalir: salirTutorial
    });
}

export function reanudarTutorial() {
    if (estadoTutorial.modo !== 'paused') return;
    if (!estaUsuarioAutenticadoEnUI()) {
        limpiarEstadoTutorial();
        return;
    }
    estadoTutorial.modo = 'running';
    mostrarPasoActual();
}

export function salirTutorial() {
    limpiarEstadoTutorial();
}

/**
 * Restablece completamente el sistema de tutoriales (usado al salir o cerrar sesión).
 */
export function limpiarEstadoTutorial() {
    estadoTutorial.modo = 'idle';
    estadoTutorial.tipo = null;
    estadoTutorial.seccionId = null;
    estadoTutorial.tituloRecorrido = '';
    estadoTutorial.pasos = [];
    estadoTutorial.indice = 0;
    cerrarHubTutorialesDOM();
    limpiarVistaSpotlight();
    toggleSidebar(false);
}

/**
 * Maneja la tecla Escape si el Hub o un tutorial está abierto.
 * Retorna true si consumió el evento.
 */
export function manejarEscapeTutorial() {
    if (estadoTutorial.modo === 'hub') {
        cerrarCentroTutoriales();
        return true;
    }
    if (estadoTutorial.modo === 'running' || estadoTutorial.modo === 'paused') {
        salirTutorial();
        return true;
    }
    return false;
}

export function getEstadoTutorial() {
    return { ...estadoTutorial };
}
