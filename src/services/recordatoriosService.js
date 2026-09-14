import { supabaseClient, isSupabaseConfigured, crearEntidadService } from './supabase.js';

// Servicio para la tabla independiente recordatorios_donacion
export const recordatoriosService = crearEntidadService('recordatorios_donacion', {
    permitirOffline: true,
    columnaOrden: 'fecha_recordatorio',
    ordenAscendente: true
});
