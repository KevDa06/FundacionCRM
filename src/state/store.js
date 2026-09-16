/**
 * Almacén de Estado Centralizado (Central Store) de FundaciónCRM
 * Mantiene la reactividad y sincronización limpia entre todos los módulos sin acoplamientos circulares.
 */

export const store = {
    // Monedas y conversión
    monedaActual: 'COP',
    tasasCambio: { 'COP': 1, 'USD': 4000, 'EUR': 4400 },
    locMoneda: { 'COP': 'es-CO', 'USD': 'en-US', 'EUR': 'es-ES' },

    // Datos principales sincronizados con Supabase
    globalDonantes: [],
    globalDonaciones: [],
    globalRecordatorios: [],
    globalDestinaciones: [],
    globalDestinacionesRegistros: [],

    // Listas administrativas
    listaUsuariosGlobal: [],
    listaAuditoriaGlobal: [],
    erroresImportacionActuales: [],

    // Instancias de Chart.js
    chartRecaudacionInstance: null,
    chartMediosPagoInstance: null,

    // Estados de edición y flags de guardado
    editandoDonanteId: null,
    editandoDonacionId: null,
    editandoRecordatorioId: null,
    guardandoDonante: false,
    guardandoDonacion: false,
    guardandoRecordatorio: false,
    eliminandoDonante: false,
    eliminandoDonacion: false,

    // Vistas y navegación interna
    currentView: 'dashboard',
    subTabAlertasActiva: 'alertas',
    subTabSeguimientoActiva: 'recurrentes',
    filtroVistaSeguimientoActual: 'todos'
};

// Setters reactivos
export function setGlobalDonantes(data) { store.globalDonantes = Array.isArray(data) ? data : []; }
export function getGlobalDonantes() { return store.globalDonantes; }

export function setGlobalDonaciones(data) { store.globalDonaciones = Array.isArray(data) ? data : []; }
export function getGlobalDonaciones() { return store.globalDonaciones; }

export function setGlobalRecordatorios(data) { store.globalRecordatorios = Array.isArray(data) ? data : []; }
export function getGlobalRecordatorios() { return store.globalRecordatorios; }

export function setGlobalDestinaciones(nombres, registros = []) {
    store.globalDestinaciones = Array.isArray(nombres) ? nombres : [];
    store.globalDestinacionesRegistros = Array.isArray(registros) ? registros : [];
}

export function setMonedaActual(m) { store.monedaActual = m; }
export function getMonedaActual() { return store.monedaActual; }

export function setCurrentView(v) { store.currentView = v; }
export function getCurrentView() { return store.currentView; }

export function setEditandoDonanteId(id) { store.editandoDonanteId = id; }
export function setEditandoDonacionId(id) { store.editandoDonacionId = id; }
export function setEditandoRecordatorioId(id) { store.editandoRecordatorioId = id; }

export function limpiarEstadoSesion() {
    store.globalDonantes = [];
    store.globalDonaciones = [];
    store.globalRecordatorios = [];
    store.listaUsuariosGlobal = [];
    store.listaAuditoriaGlobal = [];
    store.erroresImportacionActuales = [];
    store.editandoDonanteId = null;
    store.editandoDonacionId = null;
    store.editandoRecordatorioId = null;

    if (store.chartRecaudacionInstance) {
        try { store.chartRecaudacionInstance.destroy(); } catch (_) {}
        store.chartRecaudacionInstance = null;
    }
    if (store.chartMediosPagoInstance) {
        try { store.chartMediosPagoInstance.destroy(); } catch (_) {}
        store.chartMediosPagoInstance = null;
    }
}
