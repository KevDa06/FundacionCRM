/**
 * Módulo de Gestión de Usuarios y Reglas de Jerarquía
 * Re-exporta y proporciona utilidades de validación jerárquica para la administración de usuarios.
 */
export {
    listarUsuarios,
    crearUsuario,
    cambiarRolUsuario,
    cambiarEstadoUsuario,
    cambiarPasswordUsuario,
    listarAuditoria,
    puedeModificarUsuario
} from '../services/usuarios.js';
