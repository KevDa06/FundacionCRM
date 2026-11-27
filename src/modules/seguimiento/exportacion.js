/**
 * Submódulo: Exportación de Informes de Seguimiento en Formato Excel
 * Genera libros multicapa (Resumen ejecutivo, Donaron, Pendientes y Ocasionales) con SheetJS.
 */
import { store } from '../../state/store.js';
import {
    formatearMoneda,
    normalizarACOP,
    sanitizarFilaExcel,
    descargarExcel,
    TASAS_CAMBIO_DEFAULT,
    LOC_MONEDA_DEFAULT
} from '../../utils/formatters.js';
import { tienePermiso } from '../../utils/permissions.js';
import { mostrarNotificacion } from '../../components/toast.js';
import * as XLSX from 'xlsx';

function obtenerLibreriaXLSX() {
    if (typeof window !== 'undefined' && window.XLSX && window.XLSX.utils) {
        return window.XLSX;
    }
    if (XLSX && XLSX.utils) {
        return XLSX;
    }
    if (XLSX && XLSX.default && XLSX.default.utils) {
        return XLSX.default;
    }
    return null;
}

function extraerFechaISOSegura(fecha) {
    if (!fecha) return '';
    const limpia = String(fecha).trim().split('T')[0].split(' ')[0];
    const match = limpia.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return '';
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

export function generarNombreArchivoSeguimiento(infoPeriodo) {
    const sufijoArchivo = (infoPeriodo.tipo === 'anual' || infoPeriodo.tipo === 'año')
        ? `Anio_${infoPeriodo.anio}`
        : (infoPeriodo.tipo === 'trimestral' || infoPeriodo.tipo === 'trimestre')
            ? `T${infoPeriodo.valor}_${infoPeriodo.anio}`
            : (infoPeriodo.tipo === 'mensual' || infoPeriodo.tipo === 'mes')
                ? `Mes_${String(infoPeriodo.valor).padStart(2, '0')}_${infoPeriodo.anio}`
                : `Semana_${infoPeriodo.valor}_Mes_${String(infoPeriodo.mes || '').padStart(2, '0')}_${infoPeriodo.anio}`;

    return `Informe_Seguimiento_${sufijoArchivo}.xlsx`;
}

/**
 * Construye el libro Excel multicapa del informe de seguimiento.
 * Función pura apta para pruebas unitarias en Node y ejecución en navegador.
 */
export function construirLibroInformeSeguimiento({
    infoPeriodo,
    metricas,
    donantes = store.globalDonantes,
    donaciones = store.globalDonaciones,
    monedaActual = store.monedaActual || 'COP',
    tasasCambio = store.tasasCambio || TASAS_CAMBIO_DEFAULT,
    locMoneda = store.locMoneda || LOC_MONEDA_DEFAULT
}) {
    const x = obtenerLibreriaXLSX();
    if (!x || !x.utils) return null;

    const listaDonantes = Array.isArray(donantes) ? donantes : [];
    const listaDonaciones = Array.isArray(donaciones) ? donaciones : [];
    const donaronLista = Array.isArray(metricas?.donantesQueDonaron) ? metricas.donantesQueDonaron : [];
    const noDonaronLista = Array.isArray(metricas?.donantesNoDonaron) ? metricas.donantesNoDonaron : [];

    const hojaResumenData = [
        { Concepto: 'Año Consultado', Valor: infoPeriodo.anio },
        { Concepto: 'Tipo de Período', Valor: infoPeriodo.tipoTexto },
        { Concepto: 'Período Consultado', Valor: infoPeriodo.nombre },
        { Concepto: 'Rango de Fechas', Valor: `${infoPeriodo.inicioStr} al ${infoPeriodo.finStr}` },
        { Concepto: 'Total de Donadores (sin ocasionales)', Valor: metricas.totalEsperados || 0 },
        { Concepto: 'Donantes que Donaron', Valor: metricas.totalDonaron || 0 },
        { Concepto: 'Porcentaje Cumplimiento (%)', Valor: `${metricas.pctDonaron ?? '0'}%` },
        { Concepto: 'Donantes que No Donaron', Valor: metricas.totalNoDonaron || 0 },
        { Concepto: 'Porcentaje Incumplimiento (%)', Valor: `${metricas.pctNoDonaron ?? '0'}%` },
        {
            Concepto: `Total Recaudado (${monedaActual})`,
            Valor: formatearMoneda(metricas.totalMontoRecaudadoCOP || 0, monedaActual, tasasCambio, locMoneda)
        }
    ];

    const hojaDonaronData = donaronLista.map(d => ({
        Nombre: d.nombre || '',
        Documento: d.documento || '',
        Tipo: d.tipo || '',
        Periodicidad: d.periodicidad || '',
        Telefono: d.telefono || '',
        Correo: d.correo || '',
        Cantidad_Aportes: d.cantidadDonaciones || 0,
        Fechas_Donacion: (Array.isArray(d.donacionesPeriodo) ? d.donacionesPeriodo : [])
            .map(don => extraerFechaISOSegura(don?.fecha) || don?.fecha || '')
            .filter(Boolean)
            .join('; '),
        Total_Aportado_COP: Number(d.totalMontoPeriodoCOP) || 0
    }));

    const hojaNoDonaronData = noDonaronLista.map(d => ({
        Nombre: d.nombre || '',
        Documento: d.documento || '',
        Tipo: d.tipo || '',
        Periodicidad: d.periodicidad || '',
        Telefono: d.telefono || '',
        Correo: d.correo || '',
        Fecha_Registro: extraerFechaISOSegura(d.fecha_registro) || d.fecha_registro || ''
    }));

    const ocasionales = listaDonantes
        .filter(d => ((d && d.periodicidad) || '').trim().toLowerCase() === 'ocasional')
        .map(d => {
            const donacionesEnRango = listaDonaciones.filter(don => {
                if (!don || don.donante_id === null || don.donante_id === undefined) return false;
                if (String(don.donante_id) !== String(d.id)) return false;
                const fechaISO = extraerFechaISOSegura(don.fecha);
                return Boolean(fechaISO && fechaISO >= infoPeriodo.inicioStr && fechaISO <= infoPeriodo.finStr);
            });
            const montoCOP = donacionesEnRango.reduce(
                (sum, don) => sum + normalizarACOP(don.monto, don.moneda_aporte, tasasCambio),
                0
            );
            return {
                Nombre: d.nombre || '',
                Documento: d.documento || '',
                Estado: d.estado || 'Activo',
                Telefono: d.telefono || '',
                Correo: d.correo || '',
                Aportes_En_Periodo: donacionesEnRango.length,
                Monto_Periodo_COP: montoCOP
            };
        });

    const libro = x.utils.book_new();

    const hoja1 = x.utils.json_to_sheet(hojaResumenData.map(sanitizarFilaExcel));
    hoja1['!cols'] = [{ wch: 38 }, { wch: 34 }];
    x.utils.book_append_sheet(libro, hoja1, 'Resumen');

    const hoja2 = x.utils.json_to_sheet(
        (hojaDonaronData.length > 0 ? hojaDonaronData : [{ Mensaje: 'Sin donantes que donaron' }]).map(sanitizarFilaExcel)
    );
    hoja2['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 25 }, { wch: 20 }];
    x.utils.book_append_sheet(libro, hoja2, 'Donaron');

    const hoja3 = x.utils.json_to_sheet(
        (hojaNoDonaronData.length > 0 ? hojaNoDonaronData : [{ Mensaje: 'Sin donantes pendientes' }]).map(sanitizarFilaExcel)
    );
    hoja3['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }];
    x.utils.book_append_sheet(libro, hoja3, 'Pendientes');

    const hoja4 = x.utils.json_to_sheet(
        (ocasionales.length > 0 ? ocasionales : [{ Mensaje: 'Sin ocasionales' }]).map(sanitizarFilaExcel)
    );
    hoja4['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }];
    x.utils.book_append_sheet(libro, hoja4, 'Ocasionales');

    return libro;
}

/**
 * Genera y descarga el informe analítico de seguimiento en formato .xlsx
 *
 * @param {Function} obtenerInfoPeriodoSeguimiento
 * @param {Function} calcularMetricasSeguimiento
 * @returns {boolean}
 */
export function generarInformeSeguimientoExcel(obtenerInfoPeriodoSeguimiento, calcularMetricasSeguimiento) {
    if (!tienePermiso('exportar_excel')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Tu rol no tiene autorización para exportar informes de seguimiento.');
        return false;
    }

    try {
        const infoPeriodo = obtenerInfoPeriodoSeguimiento();
        const metricas = calcularMetricasSeguimiento();

        const libro = construirLibroInformeSeguimiento({
            infoPeriodo,
            metricas,
            donantes: store.globalDonantes,
            donaciones: store.globalDonaciones,
            monedaActual: store.monedaActual || 'COP',
            tasasCambio: store.tasasCambio || TASAS_CAMBIO_DEFAULT,
            locMoneda: store.locMoneda || LOC_MONEDA_DEFAULT
        });

        if (!libro) {
            mostrarNotificacion('alerta', 'Exportación no disponible', 'La librería Excel (SheetJS) no está disponible en este momento.');
            return false;
        }

        const nombreArchivo = generarNombreArchivoSeguimiento(infoPeriodo);
        const descargado = descargarExcel(nombreArchivo, libro);

        if (!descargado) {
            mostrarNotificacion(
                'peligro',
                'Error al Descargar Informe',
                'No fue posible iniciar la descarga del archivo Excel. Verifica los permisos de descarga de tu navegador.'
            );
            return false;
        }

        mostrarNotificacion('exito', 'Informe Generado', `Se descargó el informe de ${infoPeriodo.descripcion} correctamente.`);
        return true;
    } catch (err) {
        console.error('Error al generar informe de seguimiento:', err);
        mostrarNotificacion(
            'peligro',
            'Error al Generar Informe',
            'Ocurrió un error inesperado al construir el archivo Excel de seguimiento.'
        );
        return false;
    }
}
