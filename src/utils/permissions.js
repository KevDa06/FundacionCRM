/**
 * Utilidades para verificación de permisos y jerarquías de roles en frontend.
 */
import { PERMISOS, tienePermiso, getUsuarioActual } from '../services/auth.js';
import { puedeModificarUsuario } from '../services/usuarios.js';

export { PERMISOS, tienePermiso, getUsuarioActual, puedeModificarUsuario };

/**
 * Comprueba si el usuario autenticado tiene al menos uno de los permisos provistos.
 */
export function tieneAlgunPermiso(listaPermisos) {
    if (!Array.isArray(listaPermisos) || listaPermisos.length === 0) return true;
    return listaPermisos.some(permiso => tienePermiso(permiso));
}

/**
 * Determina si el usuario autenticado es Administrador.
 */
export function esAdministrador() {
    const usuario = getUsuarioActual();
    return usuario && usuario.rol === 'admin';
}
