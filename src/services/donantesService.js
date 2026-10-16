import { supabaseClient } from './supabase.js';

const COLUMNAS_PERMITIDAS_DONANTES = [
    'id',
    'nombre',
    'documento',
    'tipo',
    'fecha_nac',
    'telefono',
    'correo',
    'periodicidad',
    'estado',
    'nota',
    'fecha_registro',
    'created_at'
];

function sanearDatosDonante(item) {
    if (!item || typeof item !== 'object') return item;
    const saneado = {};
    for (const col of COLUMNAS_PERMITIDAS_DONANTES) {
        if (item[col] !== undefined) saneado[col] = item[col];
    }
    return saneado;
}

export const listar = () => supabaseClient.from('donantes').select('*');

export const insertar = (payload) => {
    const datosSaneados = Array.isArray(payload) ? payload.map(sanearDatosDonante) : sanearDatosDonante(payload);
    return supabaseClient.from('donantes').insert(datosSaneados);
};

export const actualizar = (id, payload) => {
    const saneado = sanearDatosDonante(payload);
    return supabaseClient.from('donantes').update(saneado).eq('id', id);
};

export const eliminar = (id) => supabaseClient.from('donantes').delete().eq('id', id);

export const buscarPorDocumento = (documento) => {
    const docEscapado = String(documento || '').replace(/[%_]/g, '\\$&');
    return supabaseClient.from('donantes').select('id, documento').ilike('documento', docEscapado);
};
