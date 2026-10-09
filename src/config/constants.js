/**
 * Configuración Centralizada y Constantes del Sistema (FundaciónCRM)
 * Arquitectura modular y gestión de constantes de negocio.
 */

export const TIEMPO_INACTIVIDAD_MS = 15 * 60 * 1000; // 15 minutos

export const EVENTOS_ACTIVIDAD = [
    'mousemove',
    'mousedown',
    'keydown',
    'touchstart',
    'scroll',
    'click'
];

export const STORAGE_KEYS = {
    ACTIVE_VIEW: 'activeView',
    CURRENT_VIEW: 'currentView',
    SUBTAB_RETENCION: 'crm_subtab_retencion',
    RESUMEN_MOSTRADO: 'crm_resumen_mostrado',
    TOKEN: 'sb-auth-token'
};

export const VISTAS = {
    DASHBOARD: 'dashboard',
    DONANTES: 'donantes',
    DONACIONES: 'donaciones',
    SEGUIMIENTO: 'seguimiento',
    CUMPLEANOS: 'cumpleanos',
    ALERTAS: 'alertas',
    HERRAMIENTAS: 'herramientas',
    USUARIOS: 'usuarios',
    AUDITORIA: 'auditoria'
};

export const TITULOS_VISTAS = {
    [VISTAS.DASHBOARD]: 'Panel General',
    [VISTAS.DONANTES]: 'Directorio de Donantes',
    [VISTAS.DONACIONES]: 'Registro de Donaciones',
    [VISTAS.SEGUIMIENTO]: 'Seguimiento de Donaciones',
    [VISTAS.CUMPLEANOS]: 'Cumpleaños de Donantes',
    [VISTAS.ALERTAS]: 'Centro de Retención',
    [VISTAS.HERRAMIENTAS]: 'Ajustes y Configuración',
    [VISTAS.USUARIOS]: 'Gestión de Usuarios',
    [VISTAS.AUDITORIA]: 'Registro de Auditoría'
};

export const ROLES = {
    ADMIN: 'admin',
    OPERADOR: 'operador',
    LECTOR: 'lector'
};

export const PERIODICIDADES = [
    'Mensual',
    'Trimestral',
    'Semestral',
    'Anual',
    'Ocasional'
];

export const MEDIOS_PAGO = [
    'Transferencia Bancaria',
    'Efectivo',
    'Tarjeta de Crédito',
    'Tarjeta de Débito',
    'PSE / Nequi / Daviplata',
    'Cheque',
    'Otro'
];

export const MONEDAS = {
    COP: 'COP',
    USD: 'USD',
    EUR: 'EUR'
};
