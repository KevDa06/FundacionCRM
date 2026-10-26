/**
 * Módulo de Retención y Recordatorios de Donación (FundaciónCRM)
 * Orquestador principal del módulo de fidelización, alertas predictivas de inactividad,
 * semáforos de plazos y seguimiento multicanal.
 */

// Submódulos especializados
export {
    MESES_POR_PERIODICIDAD,
    evaluarAlertaRetencionDonante,
    renderizarTablaAlertas,
    cambiarSubTabAlertas
} from './alertas.js';

export {
    generarEnlaceWhatsApp
} from './whatsapp.js';

export {
    calcularInfoPlazoRecordatorio,
    renderizarTablaRecordatorios,
    alEnviarWhatsApp,
    poblarSelectDonantesRecordatorio,
    abrirModalProgramarRecordatorio,
    guardarRecordatorio,
    cambiarEstadoRecordatorio,
    confirmarEliminarRecordatorio
} from './recordatorios.js';

export {
    mostrarModalResumenInicio,
    cerrarModalResumenInicio,
    cambiarTabResumen,
    renderizarHistorialNotificacionesResumen,
    limpiarHistorialNotificacionesDesdeUI,
    irAAlertasDesdeResumen,
    irACumpleanosDesdeResumen,
    irADonantesDesdeResumen
} from './resumenModal.js';
