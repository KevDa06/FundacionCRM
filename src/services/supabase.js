/**
 * Servicio Central de Supabase
 * Validación estricta de variables de entorno y separación rigurosa de modos de ejecución.
 * 
 * Reglas de Arquitectura:
 * 1. El cliente Mock SOLO se inicializa si VITE_ENABLE_MOCK=true o NODE_ENV=development está explícitamente activo.
 * 2. En producción (NODE_ENV=production o sin flag de mock explícito), si faltan credenciales VITE_SUPABASE_URL
 *    o VITE_SUPABASE_ANON_KEY, la aplicación bloquea el arranque con un error crítico y NUNCA recurre a localStorage.
 */
import { createClient } from '@supabase/supabase-js';
import { createMockSupabaseClient } from './mockSupabaseClient.js';

// Lectura y normalización de variables de entorno
const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_URL = rawUrl
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1\/?$/i, '')
  .replace(/\/rest\/?$/i, '')
  .replace(/\/+$/, '');

export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
export const AUTH_SYSTEM_EMAIL = (import.meta.env.VITE_AUTH_SYSTEM_EMAIL || 'admin@fundacion.local').trim();

// Indica si las credenciales mínimas de Supabase están provistas
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Detección de entorno
const rawMode = String(import.meta.env.MODE || '').trim().toLowerCase();
const rawNodeEnv = typeof process !== 'undefined' && process.env && process.env.NODE_ENV
  ? String(process.env.NODE_ENV).trim().toLowerCase()
  : '';

export const isExplicitMockEnabled = String(import.meta.env.VITE_ENABLE_MOCK || '').trim().toLowerCase() === 'true';
export const isDevelopmentMode = Boolean(import.meta.env.DEV) || rawMode === 'development' || rawNodeEnv === 'development';
export const isProductionMode = Boolean(import.meta.env.PROD) || rawMode === 'production' || rawNodeEnv === 'production';

// Separación Estricta: El cliente Mock solo puede inicializarse si VITE_ENABLE_MOCK=true o NODE_ENV=development está activo
export const isMockAllowed = isExplicitMockEnabled || isDevelopmentMode;

/**
 * Cliente fallido que bloquea todas las operaciones si Supabase no está configurado en producción.
 * Garantiza que bajo ninguna circunstancia se alternará silenciosamente hacia localStorage.
 */
function createFailingSupabaseClient(errorMessage, errorDetails) {
  const errorObj = {
    data: null,
    error: {
      message: errorMessage || 'Error de Conexión: No se pudo conectar con el servidor de base de datos.',
      details: errorDetails || 'Credenciales de Supabase no configuradas en entorno de producción. Mock Client bloqueado.',
      code: 'CONNECTION_ERROR'
    }
  };

  const chainable = {
    select: () => chainable,
    insert: () => chainable,
    update: () => chainable,
    delete: () => chainable,
    eq: () => chainable,
    neq: () => chainable,
    order: () => chainable,
    limit: () => chainable,
    ilike: () => chainable,
    single: () => Promise.resolve(errorObj),
    maybeSingle: () => Promise.resolve(errorObj),
    then: (resolve) => resolve(errorObj)
  };

  return {
    from: () => chainable,
    rpc: () => Promise.resolve(errorObj),
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: errorObj.error }),
      getUser: () => Promise.resolve({ data: { user: null }, error: errorObj.error }),
      signInWithPassword: () => Promise.resolve(errorObj),
      signOut: () => Promise.resolve(errorObj),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      admin: {
        createUser: () => Promise.resolve(errorObj),
        updateUserById: () => Promise.resolve(errorObj)
      }
    },
    functions: {
      invoke: () => Promise.resolve(errorObj)
    }
  };
}

let activeClient = null;
let activeMockState = false;
let initErrorState = null;

if (isSupabaseConfigured && !isExplicitMockEnabled) {
  // Configuración de producción o desarrollo con credenciales reales válidas
  try {
    activeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    activeMockState = false;
    initErrorState = null;
  } catch (err) {
    console.error('[Supabase Config] Error al inicializar cliente real:', err);
    initErrorState = {
      isError: true,
      message: 'Error de Conexión: No se pudo conectar con el servidor de base de datos.',
      details: err?.message || 'Error en formato de URL o Llave de Supabase.'
    };
    activeClient = createFailingSupabaseClient(initErrorState.message, initErrorState.details);
  }
} else if (isMockAllowed) {
  // Inicialización explícita del Mock Client solo en desarrollo o con VITE_ENABLE_MOCK=true
  console.info('[Supabase Config] Modo Mock Activo para desarrollo (VITE_ENABLE_MOCK=true o NODE_ENV=development).');
  activeClient = createMockSupabaseClient();
  activeMockState = true;
  initErrorState = null;
} else {
  // Fallo Explícito en Producción: Faltan credenciales y el modo mock no está autorizado
  const msg = 'Error de Conexión: No se pudo conectar con el servidor de base de datos.';
  const details = 'La aplicación se ejecuta en producción pero faltan las variables VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. El modo Mock ha sido bloqueado estrictamente.';
  console.error(`[Supabase Config CRÍTICO] ${msg} ${details}`);
  
  initErrorState = {
    isError: true,
    message: msg,
    details: details
  };
  activeMockState = false;
  activeClient = createFailingSupabaseClient(msg, details);
}

export const supabaseClient = activeClient;
export const isMockActive = activeMockState;
export const supabaseInitError = initErrorState;

/**
 * Valida la conectividad activa con el servidor de Supabase.
 * En modo real, ejecuta una consulta ligera para verificar el estado de la conexión.
 */
export async function verificarConexionSupabase() {
  if (supabaseInitError) {
    return { ok: false, error: supabaseInitError };
  }

  if (isMockActive) {
    return { ok: true, isMock: true };
  }

  try {
    const { error } = await supabaseClient.from('profiles').select('id').limit(1);

    if (error) {
      const errorMsg = String(error.message || '').toLowerCase();
      const esErrorDeRed = errorMsg.includes('failed to fetch') ||
        errorMsg.includes('network') ||
        errorMsg.includes('connection refused') ||
        error.code === 'ECONNREFUSED';

      if (esErrorDeRed) {
        return {
          ok: false,
          error: {
            message: 'Error de Conexión: No se pudo conectar con el servidor de base de datos.',
            details: error.message
          }
        };
      }
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
