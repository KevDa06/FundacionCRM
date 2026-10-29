import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcularProximaDonacionEsperada } from '../../src/services/backgroundCheckService.js';

describe('Verificación en Segundo Plano (src/services/backgroundCheckService.js)', () => {
    it('debe retornar null para donantes inactivos o retirados', () => {
        const donante = { id: 'd-inactivo', estado: 'Inactivo', periodicidad: 'Mensual' };
        const res = calcularProximaDonacionEsperada(donante, [], []);
        assert.equal(res, null);
    });

    it('debe detectar recordatorios próximos a vencer dentro de los siguientes 3 días', () => {
        const hoy = new Date();
        const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
        const y = manana.getFullYear();
        const m = String(manana.getMonth() + 1).padStart(2, '0');
        const d = String(manana.getDate()).padStart(2, '0');
        const fechaMananaStr = `${y}-${m}-${d}`;

        const donante = { id: 'd-alerta', nombre: 'Ana Gómez', estado: 'Activo', periodicidad: 'Mensual' };
        const recordatorios = [
            {
                id: 'rec-1',
                donante_id: 'd-alerta',
                fecha_recordatorio: fechaMananaStr,
                estado_recordatorio: 'Pendiente',
                monto_recordatorio: 100000
            }
        ];

        const res = calcularProximaDonacionEsperada(donante, [], recordatorios);
        assert.ok(res);
        assert.equal(res.diasFaltantes, 1);
        assert.equal(res.origen, 'recordatorio');
        assert.equal(res.montoEstimado, 100000);
    });

    it('debe ignorar recordatorios que vencen en más de 3 días', () => {
        const hoy = new Date();
        const fechaFutura = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 10);
        const y = fechaFutura.getFullYear();
        const m = String(fechaFutura.getMonth() + 1).padStart(2, '0');
        const d = String(fechaFutura.getDate()).padStart(2, '0');
        const fechaFuturaStr = `${y}-${m}-${d}`;

        const donante = { id: 'd-lejos', nombre: 'Pedro', estado: 'Activo', periodicidad: 'Ocasional' };
        const recordatorios = [
            {
                id: 'rec-2',
                donante_id: 'd-lejos',
                fecha_recordatorio: fechaFuturaStr,
                estado_recordatorio: 'Pendiente'
            }
        ];

        const res = calcularProximaDonacionEsperada(donante, [], recordatorios);
        assert.equal(res, null);
    });
});
