import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    esFechaValida,
    esFechaFutura,
    calcularDiasDesdeFecha,
    sumarMesesCalendario,
    calcularDiasProximoCumple,
    ANIO_CENTINELA_SIN_ANIO,
    esCumpleSinAnio,
    normalizarFechaNacimiento,
    calcularEdadProxima,
    formatearFechaCumple,
    formatearFechaNacimientoCompleta,
    esDonacionEnTrimestre
} from '../../src/utils/dates.js';

describe('Utilidades de Fechas (src/utils/dates.js)', () => {
    describe('esFechaValida', () => {
        it('debe validar formatos YYYY-MM-DD correctos', () => {
            assert.equal(esFechaValida('2025-05-14'), true);
            assert.equal(esFechaValida('2024-02-29'), true); // Año bisiesto
        });

        it('debe rechazar fechas inválidas o imposibles', () => {
            assert.equal(esFechaValida('2025-02-29'), false); // No bisiesto
            assert.equal(esFechaValida('2025-13-01'), false);
            assert.equal(esFechaValida(''), false);
            assert.equal(esFechaValida(null), false);
            assert.equal(esFechaValida('fecha-invalida'), false);
        });
    });

    describe('esCumpleSinAnio y normalizarFechaNacimiento', () => {
        it('debe reconocer prefijo ---- o -- como fecha sin año', () => {
            assert.equal(esCumpleSinAnio('----01-18'), true);
            assert.equal(esCumpleSinAnio('--01-18'), true);
            assert.equal(esCumpleSinAnio(`${ANIO_CENTINELA_SIN_ANIO}-01-18`), true);
            assert.equal(esCumpleSinAnio('1990-01-18'), false);
        });

        it('debe normalizar fechas sin año al año centinela 1904', () => {
            const normalizado = normalizarFechaNacimiento('----01-18');
            assert.equal(normalizado, '1904-01-18');
        });

        it('debe normalizar fechas estándar YYYY-MM-DD y DD/MM/YYYY', () => {
            assert.equal(normalizarFechaNacimiento('1995-12-25'), '1995-12-25');
            assert.equal(normalizarFechaNacimiento('25/12/1995'), '1995-12-25');
        });

        it('debe calcular edad para fechas reales y retornar null para fechas sin año', () => {
            assert.equal(calcularEdadProxima('1904-01-18'), null);
            assert.equal(calcularEdadProxima('----01-18'), null);
            const edad = calcularEdadProxima('2000-01-01');
            assert.ok(typeof edad === 'number' && edad > 20);
        });

        it('debe formatear texto de cumpleaños adecuadamente', () => {
            assert.equal(formatearFechaCumple('1990-03-15'), '15 de Marzo');
            assert.equal(formatearFechaCumple('1904-01-18'), '18 de Enero');
            assert.ok(formatearFechaNacimientoCompleta('1904-01-18').includes('Año no registrado'));
        });
    });

    describe('sumarMesesCalendario y cálculos de ciclos', () => {
        it('debe sumar meses preservando el fin de mes correctamente', () => {
            const fecha = sumarMesesCalendario(2025, 0, 31, 1); // 31 de Enero + 1 mes
            assert.equal(fecha.getFullYear(), 2025);
            assert.equal(fecha.getMonth(), 1); // Febrero
            assert.equal(fecha.getDate(), 28); // Máximo 28 en 2025
        });

        it('debe detectar donaciones en trimestre', () => {
            assert.equal(esDonacionEnTrimestre('2025-01-15', 2025, 1), true);
            assert.equal(esDonacionEnTrimestre('2025-04-10', 2025, 2), true);
            assert.equal(esDonacionEnTrimestre('2025-04-10', 2025, 1), false);
        });
    });
});
