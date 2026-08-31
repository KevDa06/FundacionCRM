import { supabaseClient } from './supabase.js';

export const listar = () => supabaseClient.from('donaciones').select('*');
export const insertar = (payload) => supabaseClient.from('donaciones').insert(payload);
export const eliminar = (id) => supabaseClient.from('donaciones').delete().eq('id', id);
export const eliminarPorDonante = (donanteId) => supabaseClient.from('donaciones').delete().eq('donante_id', donanteId);
