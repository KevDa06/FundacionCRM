import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { store } from '../../src/state/store.js';
import { setUsuarioActual, limpiarUsuarioActual } from '../../src/services/auth.js';
import {
    extraerFechaISO,
    normalizarTextoBusqueda,
    obtenerSemanasDelMes,
    esDonacionEnTrimestre,
    calcularMetricasSeguimiento
} from '../../src/modules/seguimiento/index.js';
import {
    construirLibroInformeSeguimiento,
    generarNombreArchivoSeguimiento,
    generarInformeSeguimientoExcel
} from '../../src/modules/seguimiento/exportacion.js';

describe('Módulo Seguimiento y Exportación de Informes', () => {
    let originalDonantes;
    let originalDonaciones;
    let originalMoneda;
    let originalTasas;
    let originalDocument;
    let originalCreateObjectURL;
    let originalRevokeObjectURL;

    beforeEach(() => {
        originalDonantes = store.globalDonantes;
        originalDonaciones = store.globalDonaciones;
        originalMoneda = store.monedaActual;
        originalTasas = store.tasasCambio;
        originalDocument = globalThis.document;
        originalCreateObjectURL = globalThis.URL?.createObjectURL;
        originalRevokeObjectURL = globalThis.URL?.revokeObjectURL;

        store.monedaActual = 'COP';
        store.tasasCambio = { COP: 1, USD: 4000, EUR: 4400 };
        setUsuarioActual({ id: 'u-admin', documento: '123456', rol: 'admin', activo: true });
    });

    afterEach(() => {
        store.globalDonantes = originalDonantes;
        store.globalDonaciones = originalDonaciones;
        store.monedaActual = originalMoneda;
        store.tasasCambio = originalTasas;
        limpiarUsuarioActual();
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
        if (globalThis.URL) {
            if (originalCreateObjectURL) globalThis.URL.createObjectURL = originalCreateObjectURL;
            if (originalRevokeObjectURL) globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
        }
    });

    describe('extraerFechaISO y normalizarTextoBusqueda', () => {
        it('debe normalizar fechas ISO con hora o padding simple', () => {
            assert.equal(extraerFechaISO('2026-11-30T14:22:05Z'), '2026-11-30');
            assert.equal(extraerFechaISO('2026-5-7 09:30:00'), '2026-05-07');
            assert.equal(extraerFechaISO(''), '');
            assert.equal(extraerFechaISO(null), '');
        });

        it('debe normalizar texto eliminando tildes y mayúsculas', () => {
            assert.equal(normalizarTextoBusqueda('  Fundación José María  '), 'fundacion jose maria');
        });
    });

    describe('obtenerSemanasDelMes', () => {
        it('debe generar 4 semanas para febrero no bisiesto', () => {
            const semanas = obtenerSemanasDelMes(2025, 2);
            assert.equal(semanas.length, 4);
            assert.equal(semanas[3].finStr, '2025-02-28');
        });

        it('debe generar 5 semanas para febrero bisiesto (29 días)', () => {
            const semanas = obtenerSemanasDelMes(2024, 2);
            assert.equal(semanas.length, 5);
            assert.equal(semanas[4].inicioStr, '2024-02-29');
            assert.equal(semanas[4].finStr, '2024-02-29');
        });

        it('debe generar 5 semanas hasta el día 31 en meses largos', () => {
            const semanas = obtenerSemanasDelMes(2026, 3);
            assert.equal(semanas.length, 5);
            assert.equal(semanas[4].finStr, '2026-03-31');
        });
    });

    describe('esDonacionEnTrimestre', () => {
        it('debe evaluar trimestres correctamente incluso con marca horaria ISO', () => {
            assert.equal(esDonacionEnTrimestre('2026-01-15T10:00:00', 2026, 1), true);
            assert.equal(esDonacionEnTrimestre('2026-03-31T23:59:59Z', 2026, 1), true);
            assert.equal(esDonacionEnTrimestre('2026-04-01', 2026, 1), false);
            assert.equal(esDonacionEnTrimestre('2026-11-27T08:00:00', 2026, 4), true);
        });
    });

    describe('calcularMetricasSeguimiento', () => {
        it('debe calcular cumplimiento, recaudación multi-moneda, IDs string/num y fechas con timestamp sin errores', () => {
            store.globalDonantes = [
                { id: 101, nombre: 'María López', documento: '1001', tipo: 'Natural', periodicidad: 'Mensual', estado: 'Activo' },
                { id: '102', nombre: 'Empresa Alfa', documento: '9001', tipo: 'Juridica', periodicidad: 'Trimestral', estado: 'Activo' },
                { id: 103, nombre: 'Juan Ocasional', documento: '2002', tipo: 'Natural', periodicidad: 'Ocasional', estado: 'Activo' },
                { id: 104, nombre: 'Pedro Retirado', documento: '3003', tipo: 'Natural', periodicidad: 'Mensual', estado: 'Retirado' }
            ];

            store.globalDonaciones = [
                { id: 'd1', donante_id: '101', fecha: '2026-11-30T18:45:00Z', monto: 50, moneda_aporte: 'USD' },
                { id: 'd2', donante_id: 103, fecha: '2026-11-10', monto: 100000, moneda_aporte: 'COP' },
                { id: 'd3', donante_id: '102', fecha: '2026-10-05', monto: 200000, moneda_aporte: 'COP' }
            ];

            const mMensual = calcularMetricasSeguimiento('mensual', 2026, 11);
            assert.equal(mMensual.totalEsperados, 2);
            assert.equal(mMensual.totalDonaron, 1);
            assert.equal(mMensual.totalNoDonaron, 1);
            assert.equal(mMensual.pctDonaron, '50.0');
            assert.equal(mMensual.pctNoDonaron, '50.0');
            assert.equal(mMensual.totalMontoRecaudadoCOP, 200000);
            assert.equal(mMensual.donantesQueDonaron[0].nombre, 'María López');
            assert.equal(mMensual.donantesNoDonaron[0].nombre, 'Empresa Alfa');

            const mTrim = calcularMetricasSeguimiento('trimestral', 2026, 4);
            assert.equal(mTrim.totalDonaron, 2);
            assert.equal(mTrim.totalNoDonaron, 0);
            assert.equal(mTrim.totalMontoRecaudadoCOP, 400000);

            const mSem = calcularMetricasSeguimiento('semanal', 2026, 5, 11);
            assert.equal(mSem.infoPeriodo.inicioStr, '2026-11-29');
            assert.equal(mSem.infoPeriodo.finStr, '2026-11-30');
            assert.equal(mSem.totalDonaron, 1);
        });

        it('debe soportar listas vacías o nulas sin arrojar excepciones', () => {
            store.globalDonantes = null;
            store.globalDonaciones = undefined;
            const m = calcularMetricasSeguimiento('anual', 2026, 2026);
            assert.equal(m.totalEsperados, 0);
            assert.equal(m.totalDonaron, 0);
            assert.equal(m.totalNoDonaron, 0);
            assert.equal(m.totalMontoRecaudadoCOP, 0);
        });
    });

    describe('construirLibroInformeSeguimiento y generarInformeSeguimientoExcel', () => {
        it('debe construir el libro Excel de 4 hojas con datos reales, protección contra fórmulas y ocasionales', () => {
            store.globalDonantes = [
                { id: 1, nombre: '=SUM(A1)', documento: '111', tipo: 'Natural', periodicidad: 'Mensual', estado: 'Activo' },
                { id: 2, nombre: 'Pendiente Uno', documento: '222', tipo: 'Natural', periodicidad: 'Mensual', estado: 'Activo' },
                { id: 3, nombre: 'Ocasional Uno', documento: '333', tipo: 'Natural', periodicidad: 'Ocasional', estado: 'Activo' }
            ];
            store.globalDonaciones = [
                { id: 10, donante_id: '1', fecha: '2026-11-20T12:00:00', monto: 150000, moneda_aporte: 'COP' },
                { id: 11, donante_id: 3, fecha: '2026-11-18', monto: 25, moneda_aporte: 'USD' }
            ];

            const metricas = calcularMetricasSeguimiento('mensual', 2026, 11);
            const libro = construirLibroInformeSeguimiento({
                infoPeriodo: metricas.infoPeriodo,
                metricas,
                donantes: store.globalDonantes,
                donaciones: store.globalDonaciones,
                monedaActual: 'COP',
                tasasCambio: store.tasasCambio
            });

            assert.ok(libro);
            assert.deepEqual(libro.SheetNames, ['Resumen', 'Donaron', 'Pendientes', 'Ocasionales']);

            const donaronRows = XLSX.utils.sheet_to_json(libro.Sheets.Donaron);
            assert.equal(donaronRows.length, 1);
            assert.equal(donaronRows[0].Nombre, "'=SUM(A1)");
            assert.equal(donaronRows[0].Total_Aportado_COP, 150000);

            const pendientesRows = XLSX.utils.sheet_to_json(libro.Sheets.Pendientes);
            assert.equal(pendientesRows.length, 1);
            assert.equal(pendientesRows[0].Nombre, 'Pendiente Uno');

            const ocasionalesRows = XLSX.utils.sheet_to_json(libro.Sheets.Ocasionales);
            assert.equal(ocasionalesRows.length, 1);
            assert.equal(ocasionalesRows[0].Aportes_En_Periodo, 1);
            assert.equal(ocasionalesRows[0].Monto_Periodo_COP, 100000);

            const filename = generarNombreArchivoSeguimiento(metricas.infoPeriodo);
            assert.equal(filename, 'Informe_Seguimiento_Mes_11_2026.xlsx');

            const buffer = XLSX.write(libro, { bookType: 'xlsx', type: 'array', compression: true });
            assert.ok(buffer.byteLength > 1000);
        });

        it('debe descargar correctamente en entorno con DOM y respetar permisos RBAC', () => {
            store.globalDonantes = [
                { id: 1, nombre: 'Donante Activo', documento: '111', tipo: 'Natural', periodicidad: 'Mensual', estado: 'Activo' }
            ];
            store.globalDonaciones = [
                { id: 10, donante_id: 1, fecha: '2026-11-20', monto: 50000, moneda_aporte: 'COP' }
            ];

            setUsuarioActual({ id: 'u-lector', documento: '999', rol: 'lector', activo: true });
            const metricas = calcularMetricasSeguimiento('mensual', 2026, 11);
            assert.equal(generarInformeSeguimientoExcel(() => metricas.infoPeriodo, () => metricas), false);

            setUsuarioActual({ id: 'u-admin', documento: '123456', rol: 'admin', activo: true });
            assert.equal(generarInformeSeguimientoExcel(() => metricas.infoPeriodo, () => metricas), false);

            let clickEjecutado = false;
            let archivoDescargado = '';
            const fakeAnchor = {
                href: '',
                download: '',
                rel: '',
                style: {},
                click() { clickEjecutado = true; archivoDescargado = this.download; },
                remove() {}
            };
            const crearFakeDiv = () => ({
                id: '',
                className: '',
                innerHTML: '',
                style: {},
                children: [],
                setAttribute() {},
                addEventListener() {},
                querySelector() { return null; },
                appendChild(el) { this.children.push(el); },
                remove() {}
            });
            globalThis.document = {
                getElementById: () => null,
                createElement: (tag) => (tag === 'a' ? fakeAnchor : crearFakeDiv()),
                body: crearFakeDiv()
            };
            globalThis.URL.createObjectURL = () => 'blob:mock-excel';
            globalThis.URL.revokeObjectURL = () => {};

            const okBrowser = generarInformeSeguimientoExcel(() => metricas.infoPeriodo, () => metricas);
            assert.equal(okBrowser, true);
            assert.equal(clickEjecutado, true);
            assert.equal(archivoDescargado, 'Informe_Seguimiento_Mes_11_2026.xlsx');
        });
    });
});
