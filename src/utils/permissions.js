/**
 * Utilidades para verificación de permisos y jerarquías de roles en frontend.
 */
import { PERMISOS, tienePermiso, getUsuarioActual, esUsuarioOcultoCRM } from '../services/auth.js';
import { puedeModificarUsuario } from '../services/usuariosService.js';

export { PERMISOS, tienePermiso, getUsuarioActual, puedeModificarUsuario, esUsuarioOcultoCRM };

/**
 * Comprueba si el usuario autenticado tiene al menos uno de los permisos provistos.
 */
export function tieneAlgunPermiso(listaPermisos) {
    if (!Array.isArray(listaPermisos) || listaPermisos.length === 0) return true;
    return listaPermisos.some(permiso => tienePermiso(permiso));
}

/**
 * Determina si el usuario autenticado tiene rol Desarrollador.
 */
export function esDesarrollador() {
    const usuario = getUsuarioActual();
    return Boolean(usuario && usuario.rol === 'desarrollador');
}

/**
 * Determina si el usuario autenticado es Administrador (o Desarrollador con privilegios equivalentes).
 */
export function esAdministrador() {
    const usuario = getUsuarioActual();
    return Boolean(usuario && (usuario.rol === 'admin' || usuario.rol === 'desarrollador'));
}
