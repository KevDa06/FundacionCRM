import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanearDatosDonante } from '../../src/services/donantesService.js';

describe('Sanitización de Datos de Donantes (src/services/donantesService.js)', () => {
    it('debe transformar documento string vacío en null para respetar restricción UNIQUE de PostgreSQL', () => {
        const payload = {
            nombre: 'Donante Anónimo',
            documento: '',
            tipo: 'Natural'
        };
        const saneado = sanearDatosDonante(payload);
        assert.equal(saneado.documento, null);
    });

    it('debe transformar documento de solo espacios en null', () => {
        const payload = {
            nombre: 'Empresa Test',
            documento: '    ',
            tipo: 'Juridica'
        };
        const saneado = sanearDatosDonante(payload);
        assert.equal(saneado.documento, null);
    });

    it('debe preservar y recortar documentos válidos', () => {
        const payload = {
            nombre: 'María Camila',
            documento: '  1020304050  ',
            tipo: 'Natural'
        };
        const saneado = sanearDatosDonante(payload);
        assert.equal(saneado.documento, '1020304050');
    });

    it('debe asignar "Sin registrar" si el nombre viene vacío', () => {
        const payload = {
            nombre: '   ',
            documento: '12345'
        };
        const saneado = sanearDatosDonante(payload);
        assert.equal(saneado.nombre, 'Sin registrar');
    });

    it('debe filtrar columnas no permitidas en la base de datos', () => {
        const payload = {
            nombre: 'Carlos',
            documento: '98765',
            columna_fantasma: 'inyeccion',
            monto_habitual: 50000 // Columna no existente en esquema actual
        };
        const saneado = sanearDatosDonante(payload);
        assert.equal(saneado.columna_fantasma, undefined);
        assert.equal(saneado.monto_habitual, undefined);
        assert.equal(saneado.nombre, 'Carlos');
    });
});
