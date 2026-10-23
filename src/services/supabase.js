/**
 * Servicio Central de Supabase
 * Validación rigurosa de credenciales reales vs placeholders.
 * Desacople limpio entre cliente remoto y cliente Mock local de alta fidelidad.
 */
import { createClient } from '@supabase/supabase-js';
import { createMockSupabaseClient } from './mockSupabaseClient.js';

/**
 * Determina si una URL y una Anon Key corresponden a un proyecto real de Supabase
 * o si son valores de ejemplo/placeholder (como https://tu-proyecto.supabase.co o tu-anon-key-aqui).
 */
export function esCredencialSupabaseReal(url, key) {
  if (!url || !key) return false;
  const cleanUrl = String(url).trim().toLowerCase();
  const cleanKey = String(key).trim().toLowerCase();

  if (!cleanUrl.startsWith('https://') && !cleanUrl.startsWith('http://')) {
    return false;
  }

  const placeholdersUrl = [
    'tu-proyecto',
    'your-project',
    'ejemplo',
    'example.com',
    'placeholder',
    'tu_proyecto',
    'my-project'
  ];
  if (placeholdersUrl.some(p => cleanUrl.includes(p))) {
    return false;
  }

  const placeholdersKey = [
    'tu-anon-key',
    'your-anon-key',
    'anon-key-aqui',
    'placeholder',
    'tu_anon_key',
    'key-aqui'
  ];
  if (placeholdersKey.some(p => cleanKey.includes(p))) {
    return false;
  }

  if (cleanKey.length < 20) {
    return false;
  }

  try {
    const parsed = new URL(cleanUrl);
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return false;
    }
  } catch (_e) {
    return false;
  }

  return true;
}

/**
 * Resuelve la configuración activa comprobando primero variables personalizadas en localStorage,
 * luego variables de entorno de Vite, y verificando si el usuario forzó el modo mock.
 */
function resolverConfiguracion() {
  let customUrl = '';
  let customKey = '';
  let forceMock = false;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      customUrl = (window.localStorage.getItem('fundacion_custom_supabase_url') || '').trim();
      customKey = (window.localStorage.getItem('fundacion_custom_supabase_key') || '').trim();
      forceMock = window.localStorage.getItem('fundacion_force_mock') === 'true';
    }
  } catch (_e) { /* ignore */ }

  if (forceMock) {
    return { url: '', key: '', isReal: false, source: 'force_mock' };
  }

  if (esCredencialSupabaseReal(customUrl, customKey)) {
    const normalizedUrl = customUrl
      .replace(/\/+$/, '')
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/rest\/?$/i, '')
      .replace(/\/+$/, '');
    return { url: normalizedUrl, key: customKey, isReal: true, source: 'custom' };
  }

  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (esCredencialSupabaseReal(envUrl, envKey)) {
    const normalizedUrl = envUrl
      .replace(/\/+$/, '')
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/rest\/?$/i, '')
      .replace(/\/+$/, '');
    return { url: normalizedUrl, key: envKey, isReal: true, source: 'env' };
  }

  return { url: '', key: '', isReal: false, source: 'none' };
}

const configActiva = resolverConfiguracion();

export const SUPABASE_URL = configActiva.url;
export const SUPABASE_ANON_KEY = configActiva.key;
export const AUTH_SYSTEM_EMAIL = (import.meta.env.VITE_AUTH_SYSTEM_EMAIL || 'admin@fundacion.local').trim();

// Indica si hay credenciales reales de Supabase validadas
export const isSupabaseConfigured = configActiva.isReal;

let activeClient = null;
let activeMockState = false;
let initErrorState = null;

if (isSupabaseConfigured) {
  try {
    activeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    activeMockState = false;
    initErrorState = null;
  } catch (err) {
    console.warn('[Supabase Config] Error al inicializar cliente real, activando Mock Client de respaldo:', err);
    activeClient = createMockSupabaseClient();
    activeMockState = true;
    initErrorState = null;
  }
} else {
  // Inicialización inmediata del Mock Client local de alta fidelidad:
  // Carga instantánea, sin latencia ni cuelgues de red por dominios de prueba.
  activeClient = createMockSupabaseClient();
  activeMockState = true;
  initErrorState = null;
}

export const supabaseClient = activeClient;
export const isMockActive = activeMockState;
export const supabaseInitError = initErrorState;

/**
 * Valida la conectividad activa con el servidor de Supabase.
 * En modo Mock responde inmediatamente con éxito en 0ms.
 * En modo Real ejecuta una consulta ligera con un timeout estricto de 5s para evitar cuelgues.
 */
export async function verificarConexionSupabase(timeoutMs = 5000) {
  if (isMockActive) {
    return { ok: true, isMock: true };
  }

  if (supabaseInitError) {
    return { ok: false, error: supabaseInitError };
  }

  try {
    const consultaConTimeout = Promise.race([
      supabaseClient.from('profiles').select('id').limit(1),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar con Supabase (timeout 5s)')), timeoutMs)
      )
    ]);

    const { error } = await consultaConTimeout;

    if (error) {
      return {
        ok: false,
        error: {
          message: 'Error de Conexión: No se pudo conectar con el servidor de base de datos.',
          details: error.message || 'Error en respuesta de Supabase'
        }
      };
    }

    return { ok: true, isMock: false };
  } catch (err) {
    return {
      ok: false,
      error: {
        message: 'Error de Conexión: No se pudo conectar con el servidor de base de datos.',
        details: err?.message || String(err)
      }
    };
  }
}

/**
 * Guarda credenciales personalizadas de Supabase en localStorage y recarga la aplicación.
 */
export async function guardarCredencialesSupabase(url, key) {
  if (!esCredencialSupabaseReal(url, key)) {
    throw new Error('La URL o la Anon Key proporcionada no tienen un formato válido de Supabase.');
  }

  try {
    localStorage.removeItem('fundacion_force_mock');
    localStorage.setItem('fundacion_custom_supabase_url', url.trim());
    localStorage.setItem('fundacion_custom_supabase_key', key.trim());
    window.location.reload();
  } catch (err) {
    console.error('Error al guardar credenciales:', err);
    throw err;
  }
}

/**
 * Activa el modo local (Mock) de persistencia inmediata y recarga la aplicación.
 */
export function activarModoLocalMock() {
  try {
    localStorage.setItem('fundacion_force_mock', 'true');
    window.location.reload();
  } catch (err) {
    console.error('Error al activar modo local:', err);
    window.location.reload();
  }
}

/**
 * Restablece cualquier credencial personalizada almacenada y recarga.
 */
export function restablecerConfiguracionDB() {
  try {
    localStorage.removeItem('fundacion_custom_supabase_url');
    localStorage.removeItem('fundacion_custom_supabase_key');
    localStorage.removeItem('fundacion_force_mock');
    window.location.reload();
  } catch (err) {
    console.error('Error al restablecer configuración:', err);
    window.location.reload();
  }
}

/**
 * Retorna el estado actual de configuración para la interfaz de usuario.
 */
export function obtenerEstadoConexionActual() {
  return {
    isMock: isMockActive,
    url: SUPABASE_URL,
    source: configActiva.source,
    isConfigured: isSupabaseConfigured
  };
}
