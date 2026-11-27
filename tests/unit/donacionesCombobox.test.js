import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizarTextoBusqueda,
    formatearEtiquetaDonante,
    obtenerOpcionesDonantesParaDonacion,
    filtrarDonantesCombobox,
    resolverCoincidenciaExactaDonante
} from '../../src/modules/donaciones/index.js';
import { crearBotonNombreDonanteHTML } from '../../src/utils/ui.js';

const DONANTES_MUESTRA = [
    { id: 'd1', nombre: 'María Camila Restrepo', documento: '1013459819', correo: 'maria@ejemplo.org', estado: 'Activo' },
    { id: 'd2', nombre: 'Fundación Aliada S.A.S.', documento: '900123456-7', correo: 'contacto@aliada.co', estado: 'Activo' },
    { id: 'd3', nombre: 'Carlos Andrés Pérez', documento: '79888111', correo: 'carlos@ejemplo.org', estado: 'Inactivo' },
    { id: 'd4', nombre: 'Ana Gómez', documento: '52111222', correo: 'ana1@ejemplo.org', estado: 'Activo' },
    { id: 'd5', nombre: 'Ana Gómez', documento: '52999888', correo: 'ana2@ejemplo.org', estado: 'Activo' }
];

describe('Buscador de Donantes en Donaciones y Nombres Clicables', () => {
    it('normalizarTextoBusqueda debe ignorar tildes, mayúsculas y espacios externos', () => {
        assert.equal(normalizarTextoBusqueda('  María José Peña  '), 'maria jose pena');
    });

    it('obtenerOpcionesDonantesParaDonacion debe filtrar activos e incluir donante inactivo solo si está preseleccionado', () => {
        const soloActivos = obtenerOpcionesDonantesParaDonacion(DONANTES_MUESTRA, null);
        assert.deepEqual(soloActivos.map(d => d.id), ['d1', 'd2', 'd4', 'd5']);

        const conInactivoEditado = obtenerOpcionesDonantesParaDonacion(DONANTES_MUESTRA, 'd3');
        assert.deepEqual(conInactivoEditado.map(d => d.id), ['d1', 'd2', 'd4', 'd5', 'd3']);
    });

    it('filtrarDonantesCombobox debe buscar por nombre sin tildes, documento y múltiples tokens', () => {
        const activos = obtenerOpcionesDonantesParaDonacion(DONANTES_MUESTRA);

        assert.equal(filtrarDonantesCombobox(activos, '').length, 4);
        assert.deepEqual(filtrarDonantesCombobox(activos, 'maria').map(d => d.id), ['d1']);
        assert.deepEqual(filtrarDonantesCombobox(activos, '900123').map(d => d.id), ['d2']);
        assert.deepEqual(filtrarDonantesCombobox(activos, 'camila 1013').map(d => d.id), ['d1']);
        assert.deepEqual(filtrarDonantesCombobox(activos, 'inexistente'), []);
    });

    it('resolverCoincidenciaExactaDonante debe resolver coincidencia única por documento o etiqueta sin falsos positivos en homónimos', () => {
        const activos = obtenerOpcionesDonantesParaDonacion(DONANTES_MUESTRA);

        const porDoc = resolverCoincidenciaExactaDonante(activos, '1.013.459.819');
        assert.equal(porDoc?.id, 'd1');

        const porEtiqueta = resolverCoincidenciaExactaDonante(activos, formatearEtiquetaDonante(DONANTES_MUESTRA[3]));
        assert.equal(porEtiqueta?.id, 'd4');

        // Homónimo "Ana Gómez" no debe resolverse automáticamente por nombre ambiguo
        const ambiguo = resolverCoincidenciaExactaDonante(activos, 'Ana Gómez');
        assert.equal(ambiguo, null);
    });

    it('crearBotonNombreDonanteHTML debe generar botón accesible que abre verDetalleDonante y escapar HTML', () => {
        const html = crearBotonNombreDonanteHTML('don-123', 'María <Test>', {
            onClickPrefix: 'cerrarModalResumenInicio();'
        });

        assert.equal(html.includes('type="button"'), true);
        assert.equal(html.includes("cerrarModalResumenInicio(); verDetalleDonante('don-123')"), true);
        assert.equal(html.includes('María &lt;Test&gt;'), true);

        const sinId = crearBotonNombreDonanteHTML('', 'Sin vínculo');
        assert.equal(sinId.startsWith('<div '), true);
        assert.equal(sinId.includes('verDetalleDonante'), false);
    });
});
