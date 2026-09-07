import { supabaseClient } from './supabase.js';
import { clasificarErrorSupabase } from '../utils/supabaseErrors.js';
import { normalizarDocumento, getUsuarioActual } from './auth.js';

/**
 * Consulta la lista completa de perfiles de usuario.
 * Solo disponible para administradores activos protegidos por RLS.
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
 * 1. Intenta invocar la Edge Function 'gestion-usuarios' (mecanismo seguro del lado servidor).
 * 2. Si la Edge Function no está desplegada en el entorno, utiliza la función RPC 'admin_crear_usuario' en PostgreSQL.
 * Ningún secreto o service_role key se expone en el cliente.
 */
export async function crearUsuario({ nombre, documento, password, rol }) {
    const docNormalizado = normalizarDocumento(documento);
    const nomNormalizado = (nombre || '').trim();
    const rolNormalizado = (rol || 'operador').trim().toLowerCase();
    const pass = (password || '').trim();

    if (!nomNormalizado) {
        throw { titulo: 'Campo Requerido', mensaje: 'El nombre del usuario es obligatorio.' };
    }
    if (!docNormalizado) {
        throw { titulo: 'Campo Requerido', mensaje: 'El documento del usuario es obligatorio.' };
    }
    if (!pass || pass.length < 6) {
        throw { titulo: 'Contraseña Inválida', mensaje: 'La contraseña inicial debe tener al menos 6 caracteres.' };
    }
    if (!['admin', 'operador', 'lector'].includes(rolNormalizado)) {
        throw { titulo: 'Rol Inválido', mensaje: 'El rol seleccionado no es válido.' };
    }

    // 1. Intentar Edge Function
    try {
        const { data, error } = await supabaseClient.functions.invoke('gestion-usuarios', {
            body: {
                accion: 'crear',
                nombre: nomNormalizado,
                documento: docNormalizado,
                password: pass,
                rol: rolNormalizado
            }
        });

        if (!error && data && data.success) {
            return data;
        }

        if (error) {
            const status = error.context?.status || error.status || error.statusCode;
            const msg = (error.message || '').toLowerCase();
            const name = error.name || '';

            // Si la función no existe (404), no está disponible o no se puede conectar, procedemos con RPC fallback
            const noDisponible = status === 404 ||
                                 name === 'FunctionsFetchError' ||
                                 name === 'FunctionsRelayError' ||
                                 msg.includes('not found') ||
                                 msg.includes('failed to send') ||
                                 msg.includes('fetch');

            if (!noDisponible) {
                // Si la función sí respondió pero con error de validación o conflicto (ej. 400, 409)
                let detalle = error.message || 'No se pudo crear el usuario.';
                if (data && data.error) {
                    detalle = data.error;
                }
                throw { titulo: 'Error al crear usuario', mensaje: detalle, status };
            }
        }
    } catch (edgeErr) {
        const status = edgeErr?.context?.status || edgeErr?.status || edgeErr?.statusCode;
        // Si fue un error de negocio reportado intencionalmente por la Edge Function desplegada
        if (edgeErr?.titulo && status && status !== 404) {
            throw edgeErr;
        }
        console.warn('Edge Function no disponible, procediendo con RPC admin_crear_usuario');
    }

    // 2. Fallback a función RPC en PostgreSQL
    try {
        const { data, error } = await supabaseClient.rpc('admin_crear_usuario', {
            p_nombre: nomNormalizado,
            p_documento: docNormalizado,
            p_password: pass,
            p_rol: rolNormalizado
        });

        if (error) {
            console.error('Error en admin_crear_usuario RPC:', error);
            throw clasificarErrorSupabase(error);
        }

        return data;
    } catch (rpcErr) {
        throw clasificarErrorSupabase(rpcErr);
    }
}

/**
 * Cambia el rol de un usuario.
 * Solo administradores pueden ejecutar esta acción.
 */
export async function cambiarRolUsuario(userId, nuevoRol) {
    const rolNorm = (nuevoRol || '').trim().toLowerCase();
    if (!['admin', 'operador', 'lector'].includes(rolNorm)) {
        throw { titulo: 'Rol Inválido', mensaje: 'El rol debe ser admin, operador o lector.' };
    }

    // 1. Intentar Edge Function
    try {
        const { data, error } = await supabaseClient.functions.invoke('gestion-usuarios', {
            body: { accion: 'cambiar_rol', userId, nuevoRol: rolNorm }
        });

        if (!error && data && data.success) {
            return data;
        }
    } catch (_ignore) {}

    // 2. Intentar función RPC o update directo (protegido por RLS en profiles)
    try {
        const { data, error: rpcErr } = await supabaseClient.rpc('admin_cambiar_rol', {
            p_user_id: userId,
            p_nuevo_rol: rolNorm
        });

        if (!rpcErr && data) {
            return data;
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

        if (error) throw error;
        return data;
    } catch (err) {
        throw clasificarErrorSupabase(err);
    }
}

/**
 * Activa o desactiva a un usuario.
 * Solo administradores pueden ejecutar esta acción.
 */
export async function cambiarEstadoUsuario(userId, activo) {
    const currentUser = getUsuarioActual();
    if (currentUser && currentUser.id === userId && activo === false) {
        throw { titulo: 'Acción No Permitida', mensaje: 'No puedes desactivar tu propia cuenta de administrador.' };
    }

    // 1. Intentar Edge Function
    try {
        const { data, error } = await supabaseClient.functions.invoke('gestion-usuarios', {
            body: { accion: 'cambiar_estado', userId, activo: Boolean(activo) }
        });

        if (!error && data && data.success) {
            return data;
        }
    } catch (_ignore) {}

    // 2. Intentar función RPC
    try {
        const { data, error: rpcErr } = await supabaseClient.rpc('admin_cambiar_estado', {
            p_user_id: userId,
            p_activo: Boolean(activo)
        });

        if (!rpcErr && data) {
            return data;
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

        if (error) throw error;
        return data;
    } catch (err) {
        throw clasificarErrorSupabase(err);
    }
}

/**
 * Restablece la contraseña de un usuario (solo administrador).
 */
export async function cambiarPasswordUsuario(userId, nuevaPassword) {
    const pass = (nuevaPassword || '').trim();
    if (!pass || pass.length < 6) {
        throw { titulo: 'Contraseña Inválida', mensaje: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    // 1. Intentar Edge Function
    try {
        const { data, error } = await supabaseClient.functions.invoke('gestion-usuarios', {
            body: { accion: 'cambiar_password', userId, nuevaPassword: pass }
        });

        if (!error && data && data.success) {
            return data;
        }
    } catch (_ignore) {}

    // 2. Intentar función RPC
    try {
        const { data, error: rpcErr } = await supabaseClient.rpc('admin_cambiar_password', {
            p_user_id: userId,
            p_nueva_password: pass
        });

        if (!rpcErr && data) {
            return data;
        }
        if (rpcErr) throw rpcErr;
    } catch (err) {
        throw clasificarErrorSupabase(err);
    }
}

/**
 * Consulta los registros de auditoría con filtros.
 * Solo disponible para administradores protegidos por RLS.
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
