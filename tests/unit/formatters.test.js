import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    escaparHTML,
    normalizarDocumento,
    formatearMoneda,
    normalizarACOP,
    sanitizarValorExcel,
    sanitizarFilaExcel
} from '../../src/utils/formatters.js';

describe('Utilidades de Formateo y Sanitización (src/utils/formatters.js)', () => {
    describe('escaparHTML (Prevención de XSS)', () => {
        it('debe neutralizar caracteres especiales HTML peligrosos', () => {
            const input = '<script>alert("xss")</script> & "hello" \'world\'';
            const output = escaparHTML(input);
            assert.equal(output, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;hello&quot; &#39;world&#39;');
        });

        it('debe manejar nulos, indefinidos y números', () => {
            assert.equal(escaparHTML(null), '');
            assert.equal(escaparHTML(undefined), '');
            assert.equal(escaparHTML(12345), '12345');
        });
    });

    describe('normalizarDocumento', () => {
        it('debe eliminar tildes, espacios y caracteres especiales en documentos', () => {
            assert.equal(normalizarDocumento('C.C. 1.020.304-5'), 'cc10203045');
            assert.equal(normalizarDocumento('  N.I.T. 900.123.456-1 '), 'nit9001234561');
        });

        it('debe preservar correos electrónicos en minúsculas', () => {
            assert.equal(normalizarDocumento(' Usuario.Prueba@Dominio.COM '), 'usuario.prueba@dominio.com');
        });
    });

    describe('formatearMoneda y normalizarACOP', () => {
        const tasas = { COP: 1, USD: 4000, EUR: 4400 };

        it('debe normalizar aportes en moneda extranjera a COP', () => {
            assert.equal(normalizarACOP(100, 'USD', tasas), 400000);
            assert.equal(normalizarACOP(50, 'EUR', tasas), 220000);
            assert.equal(normalizarACOP(50000, 'COP', tasas), 50000);
        });

        it('debe formatear monedas con formato localizado', () => {
            const resCOP = formatearMoneda(50000, 'COP', tasas);
            assert.ok(resCOP.includes('50.000') || resCOP.includes('50,000'));
        });
    });

    describe('sanitizarValorExcel y sanitizarFilaExcel (Prevención de Inyección de Fórmulas)', () => {
        it('debe anteponer comilla simple a caracteres de fórmula (=, +, -, @, \\t)', () => {
            assert.equal(sanitizarValorExcel('=SUM(A1:A10)'), "'=SUM(A1:A10)");
            assert.equal(sanitizarValorExcel('+cmd|'), "'+cmd|");
            assert.equal(sanitizarValorExcel('-20'), "'-20");
            assert.equal(sanitizarValorExcel('@admin'), "'@admin");
        });

        it('debe mantener intactos números y texto regular', () => {
            assert.equal(sanitizarValorExcel(12345), 12345);
            assert.equal(sanitizarValorExcel('Carlos Pérez'), 'Carlos Pérez');
        });

        it('debe sanitizar recursivamente objetos de fila', () => {
            const fila = {
                nombre: '=HYPERLINK("malicious")',
                monto: 50000,
                codigo: '-999'
            };
            const filaSanitizada = sanitizarFilaExcel(fila);
            assert.equal(filaSanitizada.nombre, "'=HYPERLINK(\"malicious\")");
            assert.equal(filaSanitizada.monto, 50000);
            assert.equal(filaSanitizada.codigo, "'-999");
        });
    });
});
