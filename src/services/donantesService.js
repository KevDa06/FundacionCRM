import { supabaseClient } from './supabase.js';

export const listar = () => supabaseClient.from('donantes').select('*');
export const insertar = (payload) => supabaseClient.from('donantes').insert(payload);
export const actualizar = (id, payload) => supabaseClient.from('donantes').update(payload).eq('id', id);
export const eliminar = (id) => supabaseClient.from('donantes').delete().eq('id', id);
