import { supabaseClient } from './supabase.js';

export const listar = () => supabaseClient.from('donaciones').select('*');
export const insertar = (payload) => supabaseClient.from('donaciones').insert(payload);
export const actualizar = (id, payload) => supabaseClient.from('donaciones').update(payload).eq('id', id);
export const eliminar = (id) => supabaseClient.from('donaciones').delete().eq('id', id);
export const eliminarPorDonante = (donanteId) => supabaseClient.from('donaciones').delete().eq('donante_id', donanteId);
