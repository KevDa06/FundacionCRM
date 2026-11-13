import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    setUsuarioActual,
    limpiarUsuarioActual,
    tienePermiso
} from '../../src/services/auth.js';
import { VISTAS } from '../../src/config/constants.js';
import {
    TUTORIAL_SECCIONES,
    obtenerTutorialesDisponibles,
    construirRecorridoGeneral,
    obtenerTutorialPorVista
} from '../../src/modules/tutorial/tutorialCatalog.js';

describe('Sistema de Tutoriales Interactivos y Adaptación RBAC', () => {
    beforeEach(() => {
        limpiarUsuarioActual();
    });

    it('debe devolver 0 tutoriales si no hay sesión o el usuario está inactivo', () => {
        assert.deepEqual(obtenerTutorialesDisponibles(tienePermiso, null), []);
        assert.deepEqual(construirRecorridoGeneral(tienePermiso, null), []);

        const inactivo = { id: 'u1', rol: 'admin', activo: false };
        setUsuarioActual(inactivo);
        assert.deepEqual(obtenerTutorialesDisponibles(tienePermiso, inactivo), []);
    });

    it('debe mostrar todas las secciones (incluyendo usuarios y auditoría) al rol admin', () => {
        const admin = { id: 'adm-1', rol: 'admin', activo: true };
        setUsuarioActual(admin);

        const disponibles = obtenerTutorialesDisponibles(tienePermiso, admin);
        const ids = disponibles.map(s => s.id);

        assert.deepEqual(ids, [
            'navegacion',
            'dashboard',
            'donantes',
            'donaciones',
            'seguimiento',
            'cumpleanos',
            'alertas',
            'herramientas',
            'usuarios',
            'auditoria'
        ]);

        const recorrido = construirRecorridoGeneral(tienePermiso, admin);
        const pasoIds = recorrido.map(p => p.id);
        assert.equal(pasoIds.includes('usr-nuevo'), true);
        assert.equal(pasoIds.includes('audit-tabla'), true);
        assert.equal(pasoIds.includes('donantes-tabla-crud'), true);
        assert.equal(pasoIds.includes('donantes-tabla-lector'), false);
        assert.equal(pasoIds.includes('donaciones-tabla-lector'), false);
    });

    it('debe ocultar usuarios y auditoría al rol operador pero mantener gestión operativa y herramientas', () => {
        const operador = { id: 'op-1', rol: 'operador', activo: true };
        setUsuarioActual(operador);

        const disponibles = obtenerTutorialesDisponibles(tienePermiso, operador);
        const ids = disponibles.map(s => s.id);

        assert.equal(ids.includes('usuarios'), false);
        assert.equal(ids.includes('auditoria'), false);
        assert.equal(ids.includes('herramientas'), true);
        assert.equal(ids.includes('donantes'), true);

        const recorrido = construirRecorridoGeneral(tienePermiso, operador);
        const pasoIds = recorrido.map(p => p.id);
        assert.equal(pasoIds.includes('donantes-crear'), true);
        assert.equal(pasoIds.includes('donaciones-crear'), true);
        assert.equal(pasoIds.includes('seg-exportar'), true);
        assert.equal(pasoIds.includes('alertas-rec-programar'), true);
        assert.equal(pasoIds.includes('herr-exportar'), true);
        assert.equal(pasoIds.includes('donantes-tabla-lector'), false);
    });

    it('debe restringir al rol lector únicamente a guías de consulta y ocultar creación/edición/importación/exportación', () => {
        const lector = { id: 'lec-1', rol: 'lector', activo: true };
        setUsuarioActual(lector);

        const disponibles = obtenerTutorialesDisponibles(tienePermiso, lector);
        const ids = disponibles.map(s => s.id);

        assert.equal(ids.includes('herramientas'), false);
        assert.equal(ids.includes('usuarios'), false);
        assert.equal(ids.includes('auditoria'), false);
        assert.deepEqual(ids, [
            'navegacion',
            'dashboard',
            'donantes',
            'donaciones',
            'seguimiento',
            'cumpleanos',
            'alertas'
        ]);

        const recorrido = construirRecorridoGeneral(tienePermiso, lector);
        const pasoIds = recorrido.map(p => p.id);

        const pasosProhibidos = [
            'dash-acciones',
            'donantes-crear',
            'donantes-tabla-crud',
            'donaciones-crear',
            'donaciones-tabla-crud',
            'seg-exportar',
            'alertas-rec-programar'
        ];
        pasosProhibidos.forEach(pid => {
            assert.equal(pasoIds.includes(pid), false, `El rol lector no debe ver el paso ${pid}`);
        });

        assert.equal(pasoIds.includes('donantes-tabla-lector'), true);
        assert.equal(pasoIds.includes('donaciones-tabla-lector'), true);
    });

    it('obtenerTutorialPorVista debe resolver la sección de la vista activa y respetar permisos', () => {
        const lector = { id: 'lec-1', rol: 'lector', activo: true };
        setUsuarioActual(lector);

        const secDonantes = obtenerTutorialPorVista(VISTAS.DONANTES, tienePermiso, lector);
        assert.equal(secDonantes?.id, 'donantes');

        // Si por error se consulta una vista no autorizada, no devuelve usuarios
        const fallback = obtenerTutorialPorVista(VISTAS.USUARIOS, tienePermiso, lector);
        assert.notEqual(fallback?.id, 'usuarios');
    });

    it('todos los selectores #id referenciados en tutorialCatalog deben existir en index.html y los disparadores deben estar fuera de lock-screen', () => {
        const htmlPath = path.join(process.cwd(), 'index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');

        for (const seccion of TUTORIAL_SECCIONES) {
            for (const paso of seccion.pasos) {
                assert.ok(paso.titulo && paso.titulo.trim().length > 0, `Paso ${paso.id} sin título`);
                assert.ok(paso.queEs && paso.queEs.trim().length > 0, `Paso ${paso.id} sin explicación`);
                assert.ok(Array.isArray(paso.comoUsar) && paso.comoUsar.length > 0, `Paso ${paso.id} sin pasos cómo usar`);
                assert.ok(paso.ejemplo && paso.ejemplo.trim().length > 0, `Paso ${paso.id} sin ejemplo`);

                if (paso.target && paso.target.startsWith('#')) {
                    const idName = paso.target.slice(1);
                    assert.ok(
                        html.includes(`id="${idName}"`),
                        `El selector ${paso.target} del paso "${paso.id}" no existe en index.html`
                    );
                }
            }
        }

        // Verificar que los botones de tutorial existen en index.html y están fuera de #lock-screen
        const lockStart = html.indexOf('<div id="lock-screen"');
        const sidebarOverlayStart = html.indexOf('<div id="sidebar-overlay"');
        assert.ok(lockStart !== -1 && sidebarOverlayStart > lockStart);

        const lockScreenHtml = html.slice(lockStart, sidebarOverlayStart);
        assert.equal(lockScreenHtml.includes('abrirCentroTutoriales'), false);
        assert.equal(html.includes('id="btn-abrir-tutorial"'), true);
        assert.equal(html.includes('id="btn-abrir-tutorial-sidebar"'), true);
    });
});
