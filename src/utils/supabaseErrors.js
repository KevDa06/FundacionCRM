/**
 * Clasifica de forma consistente y amigable los errores originados en Supabase,
 * diferenciando fallas de conectividad/red, permisos/RLS, duplicados, integridad referencial y errores generales.
 */
export function clasificarErrorSupabase(error) {
    if (!error) {
        return {
            tipo: 'desconocido',
            esRed: false,
            titulo: 'Error Inesperado',
            mensaje: 'Ocurrió un error inesperado al procesar la solicitud.'
        };
    }

    const msg = String(error.message || error.details || error || '').toLowerCase();
    const code = String(error.code || '');

    // 1. Detección de pérdida de conexión / error de red
    const esOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const esErrorRed = esOffline ||
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('fetch failed') ||
        msg.includes('network request failed') ||
        msg.includes('load failed') ||
        msg.includes('abort') ||
        msg.includes('timeout') ||
        msg.includes('connection refused') ||
        msg.includes('net::err_') ||
        code === 'ECONNABORTED';

    if (esErrorRed) {
        return {
            tipo: 'red',
            esRed: true,
            titulo: 'Sin Conexión con el Servidor',
            mensaje: 'No se pudo conectar con el servidor. Verifica tu conexión a Internet e inténtalo nuevamente.'
        };
    }

    // 2. Permisos, RLS y Sesión expirada
    if (
        code === '42501' ||
        code === 'PGRST301' ||
        msg.includes('violates row-level security policy') ||
        msg.includes('jwt expired') ||
        msg.includes('unauthorized') ||
        msg.includes('permission denied')
    ) {
        return {
            tipo: 'permisos',
            esRed: false,
            titulo: 'Acceso Denegado',
            mensaje: 'No tienes los permisos necesarios o tu sesión ha expirado. Por favor, vuelve a iniciar sesión.'
        };
    }

    // 3. Documento o registro duplicado (PostgreSQL 23505)
    if (code === '23505' || msg.includes('unique') || msg.includes('duplicado')) {
        return {
            tipo: 'duplicado',
            esRed: false,
            titulo: 'Documento Duplicado',
            mensaje: 'Ya existe un registro con este documento en la base de datos.'
        };
    }

    // 4. Clave foránea / Integridad referencial (PostgreSQL 23503)
    if (code === '23503' || msg.includes('foreign key') || msg.includes('violates foreign key constraint')) {
        return {
            tipo: 'integridad',
            esRed: false,
            titulo: 'Referencia Inválida',
            mensaje: 'El registro asociado no existe o no se puede procesar en este momento.'
        };
    }

    // 5. Restricción CHECK o formato de datos (PostgreSQL 23514 / 22P02)
    if (code === '23514' || code === '22P02' || msg.includes('check constraint') || msg.includes('invalid input syntax')) {
        return {
            tipo: 'datos',
            esRed: false,
            titulo: 'Datos Inválidos',
            mensaje: 'Uno o más datos ingresados tienen un formato o valor no permitido por el sistema.'
        };
    }

    // 6. Error general o mensaje directo de Supabase
    return {
        tipo: 'servidor',
        esRed: false,
        titulo: 'Error del Servidor',
        mensaje: error.message || 'Ocurrió un error al procesar la solicitud en Supabase.'
    };
}
