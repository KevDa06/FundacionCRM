import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    PERMISOS,
    tienePermiso,
    getUsuarioActual,
    setUsuarioActual,
    limpiarUsuarioActual
} from '../../src/services/auth.js';
import { esAdministrador, tieneAlgunPermiso } from '../../src/utils/permissions.js';

describe('Seguridad y Matriz RBAC (src/services/auth.js & src/utils/permissions.js)', () => {
    beforeEach(() => {
        limpiarUsuarioActual();
    });

    it('debe denegar acceso por defecto cuando no hay usuario autenticado', () => {
        assert.equal(getUsuarioActual(), null);
        assert.equal(tienePermiso('ver_donantes'), false);
        assert.equal(tienePermiso('crear_donaciones'), false);
        assert.equal(esAdministrador(), false);
    });

    it('debe denegar acceso a usuarios inactivos aunque tengan rol de admin', () => {
        setUsuarioActual({ id: 'u1', rol: 'admin', activo: false });
        assert.equal(tienePermiso('ver_donantes'), false);
        assert.equal(tienePermiso('administrar_usuarios'), false);
    });

    it('debe conceder permisos de administración exclusivamente al rol admin', () => {
        setUsuarioActual({ id: 'admin-1', rol: 'admin', activo: true });
        assert.equal(tienePermiso('administrar_usuarios'), true);
        assert.equal(tienePermiso('crear_usuarios'), true);
        assert.equal(tienePermiso('ver_auditoria'), true);
        assert.equal(tienePermiso('configurar_db'), true);
        assert.equal(tienePermiso('crear_donantes'), true);
        assert.equal(tienePermiso('crear_recordatorios'), true);
        assert.equal(tienePermiso('administrar_destinaciones'), true);
        assert.equal(esAdministrador(), true);
    });

    it('debe permitir operaciones de donantes, donaciones, recordatorios y herramientas a operadores pero restringir administración y auditoría', () => {
        setUsuarioActual({ id: 'op-1', rol: 'operador', activo: true });
        assert.equal(tienePermiso('ver_donantes'), true);
        assert.equal(tienePermiso('crear_donantes'), true);
        assert.equal(tienePermiso('editar_donantes'), true);
        assert.equal(tienePermiso('eliminar_donantes'), true);
        assert.equal(tienePermiso('crear_donaciones'), true);
        assert.equal(tienePermiso('editar_donaciones'), true);
        assert.equal(tienePermiso('eliminar_donaciones'), true);
        assert.equal(tienePermiso('crear_recordatorios'), true);
        assert.equal(tienePermiso('editar_recordatorios'), true);
        assert.equal(tienePermiso('eliminar_recordatorios'), true);
        assert.equal(tienePermiso('administrar_destinaciones'), true);
        assert.equal(tienePermiso('importar_donaciones'), true);
        assert.equal(tienePermiso('exportar_excel'), true);
        assert.equal(tienePermiso('administrar_usuarios'), false);
        assert.equal(tienePermiso('ver_auditoria'), false);
        assert.equal(tienePermiso('configurar_db'), false);
        assert.equal(esAdministrador(), false);
    });

    it('debe restringir a solo lectura al rol lector y ocultar herramientas, auditoría, usuarios y acciones de escritura', () => {
        setUsuarioActual({ id: 'lec-1', rol: 'lector', activo: true });
        assert.equal(tienePermiso('ver_donantes'), true);
        assert.equal(tienePermiso('ver_donaciones'), true);
        assert.equal(tienePermiso('ver_seguimiento'), true);
        assert.equal(tienePermiso('ver_cumpleanos'), true);
        assert.equal(tienePermiso('ver_retencion'), true);
        assert.equal(tienePermiso('crear_donantes'), false);
        assert.equal(tienePermiso('editar_donantes'), false);
        assert.equal(tienePermiso('eliminar_donantes'), false);
        assert.equal(tienePermiso('crear_donaciones'), false);
        assert.equal(tienePermiso('editar_donaciones'), false);
        assert.equal(tienePermiso('eliminar_donaciones'), false);
        assert.equal(tienePermiso('crear_recordatorios'), false);
        assert.equal(tienePermiso('editar_recordatorios'), false);
        assert.equal(tienePermiso('eliminar_recordatorios'), false);
        assert.equal(tienePermiso('administrar_destinaciones'), false);
        assert.equal(tienePermiso('importar_donaciones'), false);
        assert.equal(tienePermiso('exportar_excel'), false);
        assert.equal(tienePermiso('administrar_usuarios'), false);
        assert.equal(tienePermiso('ver_auditoria'), false);
        assert.equal(tienePermiso('configurar_db'), false);
        assert.equal(esAdministrador(), false);
    });

    it('tieneAlgunPermiso debe comprobar lista de acciones', () => {
        setUsuarioActual({ id: 'op-1', rol: 'operador', activo: true });
        assert.equal(tieneAlgunPermiso(['administrar_usuarios', 'crear_donantes']), true);
        assert.equal(tieneAlgunPermiso(['administrar_usuarios', 'cambiar_roles']), false);
    });
});
