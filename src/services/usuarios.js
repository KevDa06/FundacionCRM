import { supabaseClient } from './supabase.js';
import { clasificarErrorSupabase } from '../utils/supabaseErrors.js';
import { normalizarDocumento, getUsuarioActual } from './auth.js';

/**
 * Consulta la lista completa de perfiles de usuario.
 * Solo disponible para administradores activos protegidos por RLS.
 * Retorna siempre { data, error } de manera estándar.
 */
export async function listarUsuarios() {
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('id, email, documento, nombre, rol, activo, created_at, updated_at')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error al listar usuarios:', error);
            return { data: [], error: clasificarErrorSupabase(error) };
        }

        return { data: data || [], error: null };
    } catch (err) {
        console.error('Error inesperado al listar usuarios:', err);
        return { data: [], error: clasificarErrorSupabase(err) };
    }
}

/**
 * Crea un nuevo usuario en el sistema.
 * Envía la contraseña en TEXTO PLANO directo a la API Admin de Supabase (auth.admin.createUser)
 * a través de la Edge Function 'gestion-usuarios'.
 * NUNCA se aplica md5, bcrypt, crypt, sha256 ni ninguna transformación previa a la contraseña
 * para evitar el doble hash, permitiendo que GoTrue realice su encriptación nativa.
 * Retorna siempre { data, error }.
 */
export async function crearUsuario({ nombre, documento, password, rol }) {
    const docNormalizado = normalizarDocumento(documento);
    const nomNormalizado = (nombre || '').trim();
    const rolNormalizado = (rol || 'operador').trim().toLowerCase();
    // Contraseña en texto plano tal cual la escribe el usuario en el formulario
    const passwordLimpia = String(password || '');

    if (!nomNormalizado) {
        return { data: null, error: { titulo: 'Campo Requerido', mensaje: 'El nombre del usuario es obligatorio.' } };
    }
    if (!docNormalizado) {
        return { data: null, error: { titulo: 'Campo Requerido', mensaje: 'El documento del usuario es obligatorio.' } };
    }
    if (!passwordLimpia || passwordLimpia.length < 6) {
        return { data: null, error: { titulo: 'Contraseña Inválida', mensaje: 'La contraseña inicial debe tener al menos 6 caracteres.' } };
    }
    if (!['admin', 'operador', 'lector'].includes(rolNormalizado)) {
        return { data: null, error: { titulo: 'Rol Inválido', mensaje: 'El rol seleccionado no es válido.' } };
    }

    // 1. Invocar Edge Function 'gestion-usuarios' con la contraseña en texto plano directo
    // La Edge Function ejecuta adminClient.auth.admin.createUser({ password: passwordLimpia, ... })
    // GoTrue se encarga internamente de encriptar la contraseña de forma nativa sin doble hash.
    try {
        const { data, error } = await supabaseClient.functions.invoke('gestion-usuarios', {
            body: {
                accion: 'crear',
                nombre: nomNormalizado,
                documento: docNormalizado,
                password: passwordLimpia,
                rol: rolNormalizado
            }
        });

        if (!error && data && data.success) {
            return { data, error: null };
        }

        if (error) {
            const status = error.context?.status || error.status || error.statusCode;
            const msg = (error.message || '').toLowerCase();
            const name = error.name || '';

            // Si la función no existe (404), dar indicación clara de despliegue
            const noDisponible = status === 404 ||
                                 name === 'FunctionsFetchError' ||
                                 name === 'FunctionsRelayError' ||
                                 msg.includes('not found') ||
                                 msg.includes('failed to send') ||
                                 msg.includes('fetch');

            if (noDisponible) {
                return {
                    data: null,
                    error: {
                        titulo: 'Edge Function No Desplegada',
                        mensaje: 'La función "gestion-usuarios" no está desplegada en tu proyecto de Supabase. Despliégala con: "supabase functions deploy gestion-usuarios" para que auth.admin.createUser gestione la contraseña en texto plano nativamente.'
                    }
                };
            }

            let detalle = error.message || 'No se pudo crear el usuario en Supabase Auth.';
            if (data && data.error) {
                detalle = data.error;
            }
            return { data: null, error: { titulo: 'Error al crear usuario', mensaje: detalle, status } };
        }

        return { data: data || { success: true }, error: null };
    } catch (edgeErr) {
        console.error('Error al invocar Edge Function gestion-usuarios:', edgeErr);
        return {
            data: null,
            error: {
                titulo: 'Error de Comunicación',
                mensaje: edgeErr?.message || 'No se pudo conectar con la Edge Function gestion-usuarios.'
            }
        };
    }
}

/**
 * Cambia el rol de un usuario.
 * Solo administradores pueden ejecutar esta acción.
 * Retorna { data, error }.
 */
export async function cambiarRolUsuario(userId, nuevoRol) {
    const rolNorm = (nuevoRol || '').trim().toLowerCase();
    if (!['admin', 'operador', 'lector'].includes(rolNorm)) {
        return { data: null, error: { titulo: 'Rol Inválido', mensaje: 'El rol debe ser admin, operador o lector.' } };
    }

    // 1. Intentar Edge Function
    try {
        const { data, error } = await supabaseClient.functions.invoke('gestion-usuarios', {
            body: { accion: 'cambiar_rol', userId, nuevoRol: rolNorm }
        });

        if (!error && data && data.success) {
            return { data, error: null };
        }
    } catch (_ignore) {}

    // 2. Intentar función RPC
    try {
        const { data, error: rpcErr } = await supabaseClient.rpc('admin_cambiar_rol', {
            p_user_id: userId,
            p_nuevo_rol: rolNorm
        });

        if (!rpcErr && data) {
            return { data, error: null };
        }
    } catch (_ignoreRpc) {}

    // 3. Update directo en profiles si la policy lo permite
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .update({ rol: rolNorm, updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            return { data: null, error: clasificarErrorSupabase(error) };
        }
        return { data, error: null };
    } catch (err) {
        return { data: null, error: clasificarErrorSupabase(err) };
    }
}

/**
 * Activa o desactiva a un usuario.
 * Solo administradores pueden ejecutar esta acción.
 * Retorna { data, error }.
 */
export async function cambiarEstadoUsuario(userId, activo) {
    const currentUser = getUsuarioActual();
    if (currentUser && currentUser.id === userId && activo === false) {
        return { data: null, error: { titulo: 'Acción No Permitida', mensaje: 'No puedes desactivar tu propia cuenta de administrador.' } };
    }

    // 1. Intentar Edge Function
    try {
        const { data, error } = await supabaseClient.functions.invoke('gestion-usuarios', {
            body: { accion: 'cambiar_estado', userId, activo: Boolean(activo) }
        });

        if (!error && data && data.success) {
            return { data, error: null };
        }
    } catch (_ignore) {}

    // 2. Intentar función RPC
    try {
        const { data, error: rpcErr } = await supabaseClient.rpc('admin_cambiar_estado', {
            p_user_id: userId,
            p_activo: Boolean(activo)
        });

        if (!rpcErr && data) {
            return { data, error: null };
        }
    } catch (_ignoreRpc) {}

    // 3. Update directo en profiles
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .update({ activo: Boolean(activo), updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            return { data: null, error: clasificarErrorSupabase(error) };
        }
        return { data, error: null };
    } catch (err) {
        return { data: null, error: clasificarErrorSupabase(err) };
    }
}

/**
 * Restablece la contraseña de un usuario (solo administrador).
 * Envía la contraseña en TEXTO PLANO directo a la API Admin de Supabase (auth.admin.updateUserById)
 * sin transformaciones ni hashing previo.
 * Retorna { data, error }.
 */
export async function cambiarPasswordUsuario(userId, nuevaPassword) {
    const passwordLimpia = String(nuevaPassword || '');
    if (!passwordLimpia || passwordLimpia.length < 6) {
        return { data: null, error: { titulo: 'Contraseña Inválida', mensaje: 'La contraseña debe tener al menos 6 caracteres.' } };
    }

    // 1. Enviar la contraseña en texto plano a la Edge Function gestion-usuarios
    // auth.admin.updateUserById se encarga internamente de encriptar la contraseña de forma nativa sin doble hash.
    try {
        const { data, error } = await supabaseClient.functions.invoke('gestion-usuarios', {
            body: { accion: 'cambiar_password', userId, nuevaPassword: passwordLimpia }
        });

        if (!error && data && data.success) {
            return { data, error: null };
        }

        if (error) {
            return { data: null, error: clasificarErrorSupabase(error) };
        }
    } catch (err) {
        return { data: null, error: clasificarErrorSupabase(err) };
    }

    return { data: { success: true }, error: null };
}

/**
 * Consulta los registros de auditoría con filtros.
 * Solo disponible para administradores protegidos por RLS.
 * Retorna { data, error }.
 */
export async function listarAuditoria({ tabla, operacion, limite = 100 } = {}) {
    try {
        let query = supabaseClient
            .from('auditoria_operaciones')
            .select('id, tabla, operacion, registro_id, usuario_id, usuario_email, usuario_nombre, usuario_documento, datos_anteriores, datos_nuevos, fecha')
            .order('fecha', { ascending: false })
            .limit(limite);

        if (tabla && tabla !== 'todas') {
            query = query.eq('tabla', tabla);
        }
        if (operacion && operacion !== 'todas') {
            query = query.eq('operacion', operacion);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Error al listar auditoría:', error);
            return { data: [], error: clasificarErrorSupabase(error) };
        }

        return { data: data || [], error: null };
    } catch (err) {
        console.error('Error inesperado al listar auditoría:', err);
        return { data: [], error: clasificarErrorSupabase(err) };
    }
}
