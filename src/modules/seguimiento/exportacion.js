/**
 * Submódulo: Exportación de Informes de Seguimiento en Formato Excel
 * Genera libros multicapa (Resumen ejecutivo, Donaron, Pendientes y Ocasionales) con SheetJS.
 */
import { store } from '../../state/store.js';
import { formatearMoneda, normalizarACOP, sanitizarFilaExcel, descargarExcel } from '../../utils/formatters.js';
import { mostrarNotificacion } from '../../components/toast.js';
import * as XLSX from 'xlsx';

/**
 * Genera y descarga el informe analítico de seguimiento en formato .xlsx
 * 
 * @param {Function} obtenerInfoPeriodoSeguimiento 
 * @param {Function} calcularMetricasSeguimiento 
 */
export function generarInformeSeguimientoExcel(obtenerInfoPeriodoSeguimiento, calcularMetricasSeguimiento) {
    const infoPeriodo = obtenerInfoPeriodoSeguimiento();
    const metricas = calcularMetricasSeguimiento();

    const hojaResumenData = [
        { Concepto: 'Año Consultado', Valor: infoPeriodo.anio },
        { Concepto: 'Tipo de Período', Valor: infoPeriodo.tipoTexto },
        { Concepto: 'Período Consultado', Valor: infoPeriodo.nombre },
        { Concepto: 'Rango de Fechas', Valor: `${infoPeriodo.inicioStr} al ${infoPeriodo.finStr}` },
        { Concepto: 'Total de Donadores (sin ocasionales)', Valor: metricas.totalEsperados },
        { Concepto: 'Donantes que Donaron', Valor: metricas.totalDonaron },
        { Concepto: 'Porcentaje Cumplimiento (%)', Valor: `${metricas.pctDonaron}%` },
        { Concepto: 'Donantes que No Donaron', Valor: metricas.totalNoDonaron },
        { Concepto: 'Porcentaje Incumplimiento (%)', Valor: `${metricas.pctNoDonaron}%` },
        { Concepto: `Total Recaudado (${store.monedaActual})`, Valor: formatearMoneda(metricas.totalMontoRecaudadoCOP, store.monedaActual, store.tasasCambio, store.locMoneda) }
    ];

    const hojaDonaronData = metricas.donantesQueDonaron.map(d => ({
        Nombre: d.nombre,
        Documento: d.documento || '',
        Tipo: d.tipo,
        Periodicidad: d.periodicidad,
        Telefono: d.telefono || '',
        Correo: d.correo || '',
        Cantidad_Aportes: d.cantidadDonaciones,
        Fechas_Donacion: d.donacionesPeriodo.map(x => x.fecha).join('; '),
        Total_Aportado_COP: d.totalMontoPeriodoCOP
    }));

    const hojaNoDonaronData = metricas.donantesNoDonaron.map(d => ({
        Nombre: d.nombre,
        Documento: d.documento || '',
        Tipo: d.tipo,
        Periodicidad: d.periodicidad,
        Telefono: d.telefono || '',
        Correo: d.correo || '',
        Fecha_Registro: d.fecha_registro || ''
    }));

    const ocasionales = store.globalDonantes
        .filter(d => (d && d.periodicidad || '').trim().toLowerCase() === 'ocasional')
        .map(d => {
            const donacionesEnRango = store.globalDonaciones.filter(x =>
                x &&
                x.donante_id === d.id &&
                x.fecha &&
                x.fecha >= infoPeriodo.inicioStr &&
                x.fecha <= infoPeriodo.finStr
            );
            const montoCOP = donacionesEnRango.reduce((sum, x) => sum + normalizarACOP(x.monto, x.moneda_aporte, store.tasasCambio), 0);
            return {
                Nombre: d.nombre,
                Documento: d.documento || '',
                Telefono: d.telefono || '',
                Correo: d.correo || '',
                Aportes_En_Periodo: donacionesEnRango.length,
                Monto_Periodo_COP: montoCOP
            };
        });

    const x = window.XLSX || XLSX;
    if (!x || !x.utils) {
        mostrarNotificacion('alerta', 'Exportación no disponible', 'La librería Excel (SheetJS) no está cargada.');
        return;
    }

    const libro = x.utils.book_new();

    const hoja1 = x.utils.json_to_sheet(hojaResumenData.map(sanitizarFilaExcel));
    hoja1['!cols'] = [{ wch: 38 }, { wch: 30 }];
    x.utils.book_append_sheet(libro, hoja1, 'Resumen');

    const hoja2 = x.utils.json_to_sheet((hojaDonaronData.length > 0 ? hojaDonaronData : [{ Mensaje: 'Sin donantes que donaron' }]).map(sanitizarFilaExcel));
    hoja2['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 25 }, { wch: 20 }];
    x.utils.book_append_sheet(libro, hoja2, 'Donaron');

    const hoja3 = x.utils.json_to_sheet((hojaNoDonaronData.length > 0 ? hojaNoDonaronData : [{ Mensaje: 'Sin donantes pendientes' }]).map(sanitizarFilaExcel));
    hoja3['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }];
    x.utils.book_append_sheet(libro, hoja3, 'Pendientes');

    const hoja4 = x.utils.json_to_sheet((ocasionales.length > 0 ? ocasionales : [{ Mensaje: 'Sin ocasionales' }]).map(sanitizarFilaExcel));
    hoja4['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }];
    x.utils.book_append_sheet(libro, hoja4, 'Ocasionales');

    const sufijoArchivo = (infoPeriodo.tipo === 'anual' || infoPeriodo.tipo === 'año') ? `Anio_${infoPeriodo.anio}` :
        (infoPeriodo.tipo === 'trimestral' || infoPeriodo.tipo === 'trimestre') ? `T${infoPeriodo.valor}_${infoPeriodo.anio}` :
        (infoPeriodo.tipo === 'mensual' || infoPeriodo.tipo === 'mes') ? `Mes_${String(infoPeriodo.valor).padStart(2, '0')}_${infoPeriodo.anio}` :
            `Semana_${infoPeriodo.valor}_Mes_${String(infoPeriodo.mes || '').padStart(2, '0')}_${infoPeriodo.anio}`;

    descargarExcel(`Informe_Seguimiento_${sufijoArchivo}.xlsx`, libro);
    mostrarNotificacion('exito', 'Informe Generado', `Se descargó el informe de ${infoPeriodo.descripcion} correctamente.`);
}
