import { supabaseClient } from './supabase.js';

const COLUMNAS_PERMITIDAS_DONACIONES = [
    'id',
    'donante_id',
    'monto',
    'moneda_aporte',
    'fecha',
    'medio',
    'comprobante',
    'destinacion',
    'nota',
    'created_at'
];

function sanearDatosDonacion(item) {
    if (!item || typeof item !== 'object') return item;
    const saneado = {};
    for (const col of COLUMNAS_PERMITIDAS_DONACIONES) {
        if (item[col] !== undefined) saneado[col] = item[col];
    }
    return saneado;
}

export const listar = () => supabaseClient.from('donaciones').select('*');

export const insertar = (payload) => {
    const datosSaneados = Array.isArray(payload) ? payload.map(sanearDatosDonacion) : sanearDatosDonacion(payload);
    return supabaseClient.from('donaciones').insert(datosSaneados);
};

export const actualizar = (id, payload) => {
    const saneado = sanearDatosDonacion(payload);
    return supabaseClient.from('donaciones').update(saneado).eq('id', id);
};

export const eliminar = (id) => supabaseClient.from('donaciones').delete().eq('id', id);
export const eliminarPorDonante = (donanteId) => supabaseClient.from('donaciones').delete().eq('donante_id', donanteId);
