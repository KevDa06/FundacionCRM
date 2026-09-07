import { supabaseClient, AUTH_SYSTEM_EMAIL } from './supabase.js';
import { clasificarErrorSupabase } from '../utils/supabaseErrors.js';

// Estado del usuario actualmente autenticado en memoria
let usuarioActual = null;

export const PERMISOS = {
    // Lectura de módulos operativos
    ver_donantes: ['admin', 'operador', 'lector'],
    ver_donaciones: ['admin', 'operador', 'lector'],
    ver_retencion: ['admin', 'operador', 'lector'],
    ver_donaron_no_donaron: ['admin', 'operador', 'lector'],
    ver_seguimiento: ['admin', 'operador', 'lector'],
    ver_cumpleanos: ['admin', 'operador', 'lector'],
    ver_informes: ['admin', 'operador', 'lector'],

    // Escritura y modificaciones operativas (Admin y Operador)
    crear_donantes: ['admin', 'operador'],
    editar_donantes: ['admin', 'operador'],
    eliminar_donantes: ['admin', 'operador'], // Permitido para Operador según Matriz Definitiva

    crear_donaciones: ['admin', 'operador'],
    editar_donaciones: ['admin', 'operador'],
    eliminar_donaciones: ['admin', 'operador'], // Permitido para Operador según Matriz Definitiva

    importar_donaciones: ['admin', 'operador'],
    exportar_excel: ['admin', 'operador'],

    // Exclusivo Administrador
    administrar_usuarios: ['admin'],
    ver_auditoria: ['admin'],
    crear_usuarios: ['admin'],
    editar_usuarios: ['admin'],
    desactivar_usuarios: ['admin'],
    activar_usuarios: ['admin'],
    cambiar_roles: ['admin']
};

/**
 * Normaliza el documento eliminando espacios y caracteres no alfanuméricos.
 * Preserva emails si contienen '@'.
 */
export function normalizarDocumento(doc) {
    if (!doc) return '';
    const str = String(doc).trim();
    if (str.includes('@')) {
        return str.toLowerCase();
    }
    return str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Obtiene el usuario actual en memoria
 */
export function getUsuarioActual() {
    return usuarioActual;
}

/**
 * Establece el usuario actual en memoria
 */
export function setUsuarioActual(perfil) {
    usuarioActual = perfil;
}

/**
 * Limpia el usuario actual en memoria
 */
export function limpiarUsuarioActual() {
    usuarioActual = null;
}

/**
 * Verifica si el usuario actual tiene un permiso determinado
 */
export function tienePermiso(accion) {
    if (!usuarioActual || !usuarioActual.rol) return false;
    if (usuarioActual.activo !== true) return false;

    const rolesPermitidos = PERMISOS[accion];
    if (!rolesPermitidos) return false;

    return rolesPermitidos.includes(usuarioActual.rol);
}

/**
 * Carga el perfil completo desde public.profiles asociado al usuario autenticado de Supabase Auth
 */
export async function cargarPerfilUsuario(authUserId) {
    if (!authUserId) return null;

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('id, email, documento, nombre, rol, activo, created_at, updated_at')
            .eq('id', authUserId)
            .maybeSingle();

        if (error) {
            console.error('Error al cargar perfil de usuario:', error);
            return null;
        }

        if (data) {
            // Si el nombre viene vacío, formatear a partir del email
            if (!data.nombre && data.email) {
                data.nombre = data.email.split('@')[0];
            }
            usuarioActual = data;
            return data;
        }

        return null;
    } catch (e) {
        console.error('Error inesperado al obtener perfil:', e);
        return null;
    }
}

/**
 * Inicia sesión utilizando Documento + Contraseña.
 * 1. Normaliza el documento.
 * 2. Consulta de forma segura la función RPC obtener_login_info para identificar el email sintético/real y verificar que esté activo.
 * 3. Ejecuta signInWithPassword contra Supabase Auth enviando la contraseña en TEXTO PLANO directo tal como la escribió el usuario (sin hash, sin crypt, sin md5 ni sha).
 * 4. Obtiene el perfil desde public.profiles y verifica su rol y estado.
 */
export async function iniciarSesionConDocumento(documento, password) {
    const docNormalizado = normalizarDocumento(documento);
    // Contraseña en texto plano tal cual la escribe el usuario en el input (sin hash ni transformaciones)
    const passwordLimpia = String(password || '').trim();

    // 1. Validar campos vacíos
    if (!docNormalizado || !passwordLimpia) {
        return {
            exito: false,
            tipo: 'validacion',
            titulo: 'Campos Requeridos',
            mensaje: 'Por favor ingresa tanto tu documento como tu contraseña.'
        };
    }

    // 2. Determinar email para autenticación
    let emailParaAuth;
    if (docNormalizado.toLowerCase() === 'admin') {
        emailParaAuth = AUTH_SYSTEM_EMAIL;
    } else if (docNormalizado.includes('@')) {
        emailParaAuth = docNormalizado;
    } else {
        emailParaAuth = `${docNormalizado}@auth.fundacion.local`;
    }

    // 3. Intentar consultar RPC obtener_login_info si está disponible en BD
    try {
        const { data: infoLogin, error: rpcError } = await supabaseClient
            .rpc('obtener_login_info', { p_documento: docNormalizado });

        if (!rpcError && infoLogin) {
            if (infoLogin.encontrado === true) {
                if (infoLogin.activo === false) {
                    return {
                        exito: false,
                        tipo: 'desactivado',
                        titulo: 'Cuenta Inactiva',
                        mensaje: 'Tu cuenta ha sido desactivada por el administrador. Contacta a la coordinación para más información.'
                    };
                }
                if (infoLogin.email) {
                    emailParaAuth = infoLogin.email;
                }
            } else {
                // Si el RPC no lo encontró en profiles, continuamos con el email sintético calculado
                console.warn('Documento no encontrado por RPC obtener_login_info, usando fallback determinístico:', emailParaAuth);
            }
        }
    } catch (_ignoreRpc) {
        // Si el RPC aún no fue ejecutado en BD, continuar con el fallback determinístico
    }

    // 4. Autenticar con Supabase Auth (GoTrue recibe la contraseña en texto plano directo)
    try {
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: emailParaAuth,
            password: passwordLimpia
        });

        if (authError) {
            console.warn('Fallo de autenticación Supabase:', authError.message);
            const errInfo = clasificarErrorSupabase(authError);
            if (errInfo.esRed) {
                return {
                    exito: false,
                    tipo: 'red',
                    titulo: errInfo.titulo,
                    mensaje: errInfo.mensaje
                };
            }

            return {
                exito: false,
                tipo: 'credenciales',
                titulo: 'Acceso Denegado',
                mensaje: 'El documento o la contraseña ingresados son incorrectos.'
            };
        }

        if (!authData?.user) {
            return {
                exito: false,
                tipo: 'servidor',
                titulo: 'Error de Autenticación',
                mensaje: 'No se pudo obtener la sesión de usuario desde el servidor.'
            };
        }

        // 5. Cargar perfil desde public.profiles
        const perfil = await cargarPerfilUsuario(authData.user.id);

        if (!perfil) {
            // Si por alguna razón el perfil no existe aún, crearlo con fallback seguro
            console.warn('Perfil no encontrado en profiles para id:', authData.user.id);
            return {
                exito: false,
                tipo: 'perfil',
                titulo: 'Perfil no configurado',
                mensaje: 'Tu usuario está autenticado pero no tiene un perfil configurado en el sistema.'
            };
        }

        // 6. Verificar si el usuario está activo
        if (perfil.activo === false) {
            await supabaseClient.auth.signOut();
            limpiarUsuarioActual();
            return {
                exito: false,
                tipo: 'desactivado',
                titulo: 'Cuenta Inactiva',
                mensaje: 'Tu cuenta ha sido desactivada por el administrador. Contacta a la coordinación para más información.'
            };
        }

        setUsuarioActual(perfil);

        return {
            exito: true,
            usuario: perfil,
            session: authData.session
        };

    } catch (err) {
        console.error('Error inesperado durante login:', err);
        return {
            exito: false,
            tipo: 'red',
            titulo: 'Error de Conexión',
            mensaje: 'No se pudo conectar con el servidor. Verifica tu conexión a Internet.'
        };
    }
}

/**
 * Cierra la sesión en Supabase Auth y limpia el estado del usuario en memoria y almacenamiento local
 */
export async function cerrarSesion() {
    try {
        await supabaseClient.auth.signOut();
    } catch (e) {
        console.error('Error al cerrar sesión:', e);
    }
    limpiarUsuarioActual();
}

