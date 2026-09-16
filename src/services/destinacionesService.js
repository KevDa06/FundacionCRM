import { supabaseClient } from './supabase.js';
import { clasificarErrorSupabase } from '../utils/supabaseErrors.js';

export async function listar() {
    try {
        const { data, error } = await supabaseClient
            .from('destinaciones')
            .select('id, nombre')
            .order('nombre', { ascending: true });

        return { data: data || [], error: error ? clasificarErrorSupabase(error) : null };
    } catch (error) {
        return { data: [], error: clasificarErrorSupabase(error) };
    }
}

export async function crear(nombre) {
    try {
        const { data, error } = await supabaseClient
            .from('destinaciones')
            .insert({ nombre: nombre.trim() })
            .select('id, nombre')
            .single();

        return { data, error: error ? clasificarErrorSupabase(error) : null };
    } catch (error) {
        return { data: null, error: clasificarErrorSupabase(error) };
    }
}

export async function eliminar(id) {
    try {
        const { error } = await supabaseClient
            .from('destinaciones')
            .delete()
            .eq('id', id);

        return { error: error ? clasificarErrorSupabase(error) : null };
    } catch (error) {
        return { error: clasificarErrorSupabase(error) };
    }
}
