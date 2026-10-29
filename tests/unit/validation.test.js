import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    validarEmail,
    validarTelefono,
    validarDocumentoIdentidad
} from '../../src/utils/validation.js';

describe('Utilidades de Validación (src/utils/validation.js)', () => {
    describe('validarEmail', () => {
        it('debe validar correos válidos', () => {
            assert.equal(validarEmail('donaciones@fundacion.org'), true);
            assert.equal(validarEmail('juan.perez+crm@empresa.co'), true);
            assert.equal(validarEmail(''), true); // Vacío es opcional
            assert.equal(validarEmail(null), true);
        });

        it('debe rechazar correos con errores de sintaxis', () => {
            assert.equal(validarEmail('correo sin arroba'), false);
            assert.equal(validarEmail('usuario@dominio..com'), false); // Puntos consecutivos
            assert.equal(validarEmail('usuario@dominio'), false); // Sin TLD
            assert.equal(validarEmail('usuario con espacios@dominio.com'), false);
        });
    });

    describe('validarTelefono', () => {
        it('debe validar números de teléfono válidos (locales e internacionales)', () => {
            assert.equal(validarTelefono('3101234567'), true);
            assert.equal(validarTelefono('+57 310 123 4567'), true);
            assert.equal(validarTelefono('(601) 2345678'), true);
            assert.equal(validarTelefono(''), true); // Opcional
            assert.equal(validarTelefono(null), true);
        });

        it('debe rechazar números con longitud insuficiente o caracteres inválidos', () => {
            assert.equal(validarTelefono('123'), false); // Menos de 7 dígitos
            assert.equal(validarTelefono('310123456789012345'), false); // Más de 15 dígitos
            assert.equal(validarTelefono('310-ABCD-567'), false); // Letras
            assert.equal(validarTelefono('(310) (123)'), false); // Paréntesis desbalanceados/múltiples
        });
    });

    describe('validarDocumentoIdentidad', () => {
        it('debe validar documentos válidos', () => {
            assert.equal(validarDocumentoIdentidad('1020304050'), true);
            assert.equal(validarDocumentoIdentidad('900.123.456-1'), true);
        });

        it('debe rechazar documentos vacíos o demasiado cortos/largos', () => {
            assert.equal(validarDocumentoIdentidad(''), false);
            assert.equal(validarDocumentoIdentidad('1'), false);
            assert.equal(validarDocumentoIdentidad('123456789012345678901234567890'), false);
        });
    });
});
