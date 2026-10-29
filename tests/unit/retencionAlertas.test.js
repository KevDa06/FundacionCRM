import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    evaluarAlertaRetencionDonante,
    MESES_POR_PERIODICIDAD
} from '../../src/modules/retencion/alertas.js';

describe('Alertas de Retención (src/modules/retencion/alertas.js)', () => {
    it('debe contener las periodicidades estándar', () => {
        assert.equal(MESES_POR_PERIODICIDAD['mensual'], 1);
        assert.equal(MESES_POR_PERIODICIDAD['trimestral'], 3);
        assert.equal(MESES_POR_PERIODICIDAD['semestral'], 6);
        assert.equal(MESES_POR_PERIODICIDAD['anual'], 12);
    });

    it('debe ignorar donantes inactivos o retirados', () => {
        const donante = { id: 'd1', estado: 'Inactivo', periodicidad: 'Mensual', fecha_registro: '2024-01-01' };
        const alerta = evaluarAlertaRetencionDonante(donante, [], 30);
        assert.equal(alerta, null);
    });

    it('debe ignorar donantes con periodicidad Ocasional', () => {
        const donante = { id: 'd2', estado: 'Activo', periodicidad: 'Ocasional', fecha_registro: '2024-01-01' };
        const alerta = evaluarAlertaRetencionDonante(donante, [], 30);
        assert.equal(alerta, null);
    });

    it('debe generar alerta si la última donación más el ciclo y umbral ya venció', () => {
        const donante = { id: 'd3', estado: 'Activo', periodicidad: 'Mensual', fecha_registro: '2024-01-01' };
        const donaciones = [
            { id: 'don-1', donante_id: 'd3', fecha: '2024-01-15' }
        ];
        const alerta = evaluarAlertaRetencionDonante(donante, donaciones, 30);
        assert.ok(alerta);
        assert.equal(alerta.estaEnAlerta, true);
        assert.ok(alerta.dias_ausencia > 60);
    });

    it('no debe generar alerta si el donante está dentro del ciclo y margen de tolerancia', () => {
        const hoy = new Date();
        const y = hoy.getFullYear();
        const m = String(hoy.getMonth() + 1).padStart(2, '0');
        const d = String(hoy.getDate()).padStart(2, '0');
        const fechaHoyStr = `${y}-${m}-${d}`;

        const donante = { id: 'd4', estado: 'Activo', periodicidad: 'Mensual', fecha_registro: fechaHoyStr };
        const donaciones = [
            { id: 'don-reciente', donante_id: 'd4', fecha: fechaHoyStr }
        ];
        const alerta = evaluarAlertaRetencionDonante(donante, donaciones, 30);
        assert.equal(alerta, null);
    });
});
