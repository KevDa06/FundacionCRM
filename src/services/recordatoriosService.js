import { supabaseClient } from './supabase.js';

/**
 * Servicio para gestión de la tabla independiente 'recordatorios_donacion'.
 * Incluye relación con 'donantes(nombre, documento, telefono, correo)'.
 */

// 1. Obtener todos los recordatorios con los datos del donante asociado
export const obtenerRecordatorios = async () => {
    try {
        // Intentar primero select con relación a donantes
        const resConRelacion = await supabaseClient
            .from('recordatorios_donacion')
            .select('*, donantes(nombre, documento, telefono, correo)')
            .order('fecha_recordatorio', { ascending: true });

        if (!resConRelacion.error && Array.isArray(resConRelacion.data)) {
            return resConRelacion;
        }

        // Si falló por falta de clave foránea en schema cache (código PGRST200) u otro error de join,
        // realizar consulta directa garantizada a la tabla
        console.warn('Consulta con relación a donantes falló o devolvió error. Reintentando consulta directa:', resConRelacion.error);
        const resDirecta = await supabaseClient
            .from('recordatorios_donacion')
            .select('*')
            .order('fecha_recordatorio', { ascending: true });

        return resDirecta;
    } catch (e) {
        console.error('Excepción al obtener recordatorios:', e);
        return await supabaseClient
            .from('recordatorios_donacion')
            .select('*');
    }
};

// Alias para compatibilidad
export const listar = () => obtenerRecordatorios();

// 2. Crear un nuevo recordatorio
export const crearRecordatorio = async (payload) => {
    const data = Array.isArray(payload) ? payload : [payload];
    try {
        // Usar select('*') directo para no depender de la relación en el schema cache de PostgREST
        const res = await supabaseClient
            .from('recordatorios_donacion')
            .insert(data)
            .select('*');

        return res;
    } catch (e) {
        console.error('Error en crearRecordatorio:', e);
        return { data: null, error: e };
    }
};

// Alias para compatibilidad
export const insertar = (payload) => crearRecordatorio(payload);

// 3. Actualizar campos de un recordatorio
export const actualizarRecordatorio = (id, payload) => {
    const payloadConFecha = {
        ...payload,
        updated_at: new Date().toISOString()
    };
    return supabaseClient
        .from('recordatorios_donacion')
        .update(payloadConFecha)
        .eq('id', id);
};

// Alias para compatibilidad
export const actualizar = (id, payload) => actualizarRecordatorio(id, payload);

// 4. Actualizar únicamente el estado del recordatorio ('Pendiente', 'Mensaje enviado', 'Gestionado')
export const actualizarEstadoRecordatorio = (id, nuevoEstado) => {
    return supabaseClient
        .from('recordatorios_donacion')
        .update({
            estado_recordatorio: nuevoEstado,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);
};

// 5. Eliminar un recordatorio por su ID
export const eliminarRecordatorio = (id) => {
    return supabaseClient
        .from('recordatorios_donacion')
        .delete()
        .eq('id', id);
};

// Alias para compatibilidad
export const eliminar = (id) => eliminarRecordatorio(id);
