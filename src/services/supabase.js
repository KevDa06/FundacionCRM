import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
// Strip any accidental trailing slashes or /rest/v1 paths
const SUPABASE_URL = rawUrl
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1\/?$/i, '')
  .replace(/\/rest\/?$/i, '')
  .replace(/\/+$/, '');

const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const AUTH_SYSTEM_EMAIL = (import.meta.env.VITE_AUTH_SYSTEM_EMAIL || 'admin@fundacion.local').trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  console.warn('[Supabase Config] Faltan las variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. La aplicación no podrá conectarse a la base de datos hasta que se configuren.');
}

export const supabaseClient = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : {
      from: () => ({
        select: async () => ({ data: null, error: new Error('Faltan las variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY.') }),
        insert: async () => ({ data: null, error: new Error('Faltan las variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY.') }),
        update: () => ({ eq: async () => ({ data: null, error: new Error('Faltan las variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY.') }) }),
        delete: () => ({ eq: async () => ({ data: null, error: new Error('Faltan las variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY.') }) })
      })
    };
