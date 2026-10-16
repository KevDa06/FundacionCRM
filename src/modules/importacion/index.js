/**
 * Módulo de Importación y Exportación de Datos (Excel / CSV)
 */
import { store } from '../../state/store.js';
import * as donantesService from '../../services/donantesService.js';
import * as recordatoriosService from '../../services/recordatoriosService.js';
import { escaparHTML, construirLibroExcel, descargarExcel } from '../../utils/formatters.js';
import { obtenerFechaActualLocal, esFechaValida, esFechaFutura } from '../../utils/dates.js';
import { CAMPOS_VALIDOS_DONANTE, validarEmail, validarTelefono } from '../../utils/validation.js';
import { mostrarNotificacion } from '../../components/toast.js';
import { initImportacionDonaciones } from '../importacionDonaciones.js';
import { ejecutarVerificacionSegundoPlano } from '../../services/backgroundCheckService.js';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

if (typeof window !== 'undefined') {
    if (!window.XLSX) window.XLSX = XLSX;
    if (!window.Papa) window.Papa = Papa;
}

let erroresImportacionActuales = [];

export function getErroresImportacion() {
    return erroresImportacionActuales;
}

export function exportarExcel(tipo) {
    const datos = tipo === 'donantes' ? store.globalDonantes : store.globalDonaciones;
    if (!datos || datos.length === 0) {
        return mostrarNotificacion('alerta', 'Datos Vacíos', `No hay registros de ${tipo} para exportar.`);
    }

    let filas, anchos, nombreHoja;

    if (tipo === 'donantes') {
        nombreHoja = 'Donantes';
        anchos = [28, 18, 16, 26, 18, 28, 16, 14, 18, 32, 18, 32];
        filas = datos.map(d => {
            const rec = store.globalRecordatorios.find(r => r.donante_id === d.id && r.estado_recordatorio !== 'Gestionado') ||
                store.globalRecordatorios.find(r => r.donante_id === d.id);
            return {
                'Nombre_Razon_Social': d.nombre || '',
                'Documento': d.documento || '',
                'Tipo_Persona': d.tipo || 'Natural',
                'Fecha_Nacimiento_YYYY_MM_DD': d.fecha_nac || '',
                'Telefono': d.telefono || '',
                'Correo': d.correo || '',
                'Periodicidad': d.periodicidad || 'Ocasional',
                'Estado': d.estado || 'Activo',
                'Fecha_Registro': d.fecha_registro || '',
                'Fecha_Proxima_Donacion_YYYY_MM_DD': rec?.fecha_recordatorio || d.proxima_donacion || '',
                'Monto_Esperado': rec?.monto_recordatorio || d.monto_habitual || '',
                'Notas': d.nota || ''
            };
        });
    } else {
        nombreHoja = 'Donaciones';
        anchos = [20, 28, 16, 14, 10, 18, 24, 18, 32];
        filas = datos.map(d => {
            const donante = store.globalDonantes.find(x => x.id === d.donante_id);
            return {
                'Documento_Donante': donante ? (donante.documento || donante.correo || donante.id) : '',
                'Nombre_Donante': donante ? donante.nombre : 'Desvinculado',
                'Fecha_Donacion': d.fecha || '',
                'Monto': Number(d.monto) || 0,
                'Moneda': d.moneda_aporte || 'COP',
                'Medio_Pago': d.medio || '',
                'Destinacion': d.destinacion || '',
                'Comprobante': d.comprobante || '',
                'Notas': d.nota || ''
            };
        });
    }

    const libro = construirLibroExcel(nombreHoja, filas, anchos);
    if (!libro) {
        mostrarNotificacion('peligro', 'Error de Exportación', 'No se pudo generar el libro de Excel.');
        return;
    }
    const ok = descargarExcel(`Reporte_${tipo.toUpperCase()}_${obtenerFechaActualLocal()}.xlsx`, libro);
    if (ok) {
        mostrarNotificacion('exito', 'Exportación Completa', `Se exportaron ${filas.length} registros de ${tipo} correctamente.`);
    }
}

// Generador de fallback en CSV con codificación UTF-8 con BOM para apertura perfecta en Excel
export function descargarPlantillaCSV(nombre, filasEjemplo) {
    try {
        const filas = Array.isArray(filasEjemplo) ? filasEjemplo : [filasEjemplo];
        if (!filas.length) return false;
        const cabeceras = Object.keys(filas[0]).join(';');
        const filasCsv = filas.map(fila =>
            Object.values(fila).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')
        ).join('\r\n');
        const csvContenido = '\uFEFF' + cabeceras + '\r\n' + filasCsv + '\r\n';
        const blob = new Blob([csvContenido], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Plantilla_Importacion_${nombre}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        mostrarNotificacion('exito', 'Plantilla Descargada', `Se descargó la plantilla de ${nombre} en formato CSV.`);
        return true;
    } catch (err) {
        console.error('Error al generar plantilla CSV:', err);
        mostrarNotificacion('peligro', 'Error de Descarga', 'No se pudo generar la plantilla CSV.');
        return false;
    }
}

export function descargarPlantillaImportacion() {
    const filasEjemplo = [
        {
            'Nombre_Razon_Social': 'Juan Pérez Restrepo',
            'Documento': '100200300',
            'Tipo_Persona': 'Natural',
            'Fecha_Nacimiento_YYYY_MM_DD': '1990-05-15',
            'Telefono': '+57 3001234567',
            'Correo': 'juan.perez@ejemplo.com',
            'Periodicidad': 'Mensual',
            'Estado': 'Activo',
            'Fecha_Proxima_Donacion_YYYY_MM_DD': '2026-04-15',
            'Monto_Esperado': 150000,
            'Notas': 'Donante comprometido con programas de educación'
        },
        {
            'Nombre_Razon_Social': 'Inversiones y Alimentos SAS',
            'Documento': '900555444-1',
            'Tipo_Persona': 'Juridica',
            'Fecha_Nacimiento_YYYY_MM_DD': '',
            'Telefono': '6012345678',
            'Correo': 'donaciones@alimentos.com',
            'Periodicidad': 'Trimestral',
            'Estado': 'Activo',
            'Fecha_Proxima_Donacion_YYYY_MM_DD': '2026-06-30',
            'Monto_Esperado': 1500000,
            'Notas': 'Donación corporativa para comedor comunitario'
        }
    ];

    try {
        const anchos = [28, 18, 16, 26, 18, 28, 16, 14, 32, 18, 36];
        const libro = construirLibroExcel('Plantilla Donantes', filasEjemplo, anchos);
        if (libro) {
            const ok = descargarExcel('Plantilla_Importacion_Donantes.xlsx', libro);
            if (ok) {
                mostrarNotificacion('exito', 'Plantilla Descargada', 'Se ha descargado la plantilla completa para importación de donantes (.xlsx).');
                return;
            }
        }
        descargarPlantillaCSV('Donantes', filasEjemplo);
    } catch (e) {
        console.error('Error al descargar plantilla donantes:', e);
        descargarPlantillaCSV('Donantes', filasEjemplo);
    }
}

export function descargarPlantillaDonaciones() {
    const filasEjemplo = [
        {
            'Documento_Donante': '1020304050',
            'Nombre_Donante': 'María Camila Restrepo',
            'Fecha_Donacion': '2026-03-15',
            'Monto': 250000,
            'Moneda': 'COP',
            'Medio_Pago': 'Transferencia',
            'Destinacion': 'Educación y Becas',
            'Comprobante': 'TRX-982341',
            'Notas': 'Aporte mensual programa de educación'
        },
        {
            'Documento_Donante': '900555444-1',
            'Nombre_Donante': 'Inversiones y Alimentos SAS',
            'Fecha_Donacion': '2026-03-20',
            'Monto': 1500000,
            'Moneda': 'COP',
            'Medio_Pago': 'PSE',
            'Destinacion': 'General',
            'Comprobante': 'PSE-871234',
            'Notas': 'Donación corporativa comedor comunitario'
        },
        {
            'Documento_Donante': '79888999',
            'Nombre_Donante': 'Andrés Felipe Gómez',
            'Fecha_Donacion': '2026-03-25',
            'Monto': 100,
            'Moneda': 'USD',
            'Medio_Pago': 'Tarjeta',
            'Destinacion': 'Fondo de Emergencia',
            'Comprobante': 'CC-8821',
            'Notas': 'Donación internacional en línea'
        }
    ];

    try {
        const anchos = [22, 28, 16, 14, 10, 18, 24, 18, 36];
        const libro = construirLibroExcel('Plantilla Donaciones', filasEjemplo, anchos);
        if (libro) {
            const ok = descargarExcel('Plantilla_Importacion_Donaciones.xlsx', libro);
            if (ok) {
                mostrarNotificacion('exito', 'Plantilla Descargada', 'Se ha descargado la plantilla completa para importación de donaciones (.xlsx).');
                return;
            }
        }
        descargarPlantillaCSV('Donaciones', filasEjemplo);
    } catch (e) {
        console.error('Error al descargar plantilla donaciones:', e);
        descargarPlantillaCSV('Donaciones', filasEjemplo);
    }
}

export function procesarImportacionArchivo(event, onCompletado) {
    const archivo = event.target.files[0];
    if (!archivo) return;

    const nombreLower = archivo.name.toLowerCase();
    const esCSV = nombreLower.endsWith('.csv');
    const esExcel = nombreLower.endsWith('.xlsx') || nombreLower.endsWith('.xls');

    if (!esCSV && !esExcel) {
        mostrarNotificacion('peligro', 'Formato Inválido', 'Solo se aceptan archivos .xlsx, .xls o .csv.');
        event.target.value = '';
        return;
    }

    const statusEl = document.getElementById('status-db');
    if (statusEl) statusEl.innerText = 'Importando...';

    if (esCSV) {
        const parser = window.Papa || Papa;
        if (!parser || !parser.parse) {
            mostrarNotificacion('peligro', 'Error', 'La librería CSV (PapaParse) no está disponible.');
            return;
        }
        parser.parse(archivo, {
            header: true,
            skipEmptyLines: true,
            transformHeader: h => h.trim(),
            complete: (resultados) => finalizarImportacionDonantes(resultados.data, event, onCompletado),
            error: () => manejarErrorLecturaArchivo(event)
        });
    } else {
        const x = window.XLSX || XLSX;
        if (!x || !x.read) {
            mostrarNotificacion('peligro', 'Error', 'La librería Excel no está disponible.');
            return;
        }
        const lector = new FileReader();
        lector.onload = (e) => {
            try {
                const libro = x.read(e.target.result, { type: 'array', cellDates: true });
                const hoja = libro.Sheets[libro.SheetNames[0]];
                const filas = x.utils.sheet_to_json(hoja, { defval: '', raw: false });
                finalizarImportacionDonantes(filas, event, onCompletado);
            } catch (err) {
                manejarErrorLecturaArchivo(event);
            }
        };
        lector.onerror = () => manejarErrorLecturaArchivo(event);
        lector.readAsArrayBuffer(archivo);
    }
}

export function manejarErrorLecturaArchivo(event) {
    mostrarNotificacion('peligro', 'Archivo Inválido', 'No se pudo leer el archivo. Verifica que el formato y las columnas sean correctos.');
    const statusEl = document.getElementById('status-db');
    if (statusEl) statusEl.innerText = 'Sistema en línea';
    if (event?.target) event.target.value = '';
}

export async function finalizarImportacionDonantes(filas, event, onCompletado) {
    try {
        if (!filas || filas.length === 0) throw new Error('El archivo está vacío o no tiene el formato esperado.');

        const documentosExistentes = new Set(store.globalDonantes.map(d => String(d.documento || '').trim().toLowerCase()));
        const documentosEnArchivo = new Set();
        const payload = [];
        const recordatoriosAProcesar = [];
        const errores = [];

        const obtenerValor = (row, keys) => {
            for (const key of keys) {
                if (row[key] !== undefined && String(row[key]).trim() !== '') {
                    return String(row[key]).trim();
                }
            }
            // Búsqueda insensible a mayúsculas, tildes y guiones bajos
            const normalizedRow = {};
            for (const k of Object.keys(row)) {
                const cleanK = String(k).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                normalizedRow[cleanK] = row[k];
            }
            for (const key of keys) {
                const cleanKey = String(key).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                if (normalizedRow[cleanKey] !== undefined && String(normalizedRow[cleanKey]).trim() !== '') {
                    return String(normalizedRow[cleanKey]).trim();
                }
            }
            return '';
        };

        const normalizarTipoPersona = (val) => {
            const v = String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (v.includes('jurid')) return 'Juridica';
            return 'Natural';
        };

        const normalizarPeriodicidad = (val) => {
            const v = String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (v.includes('mensual')) return 'Mensual';
            if (v.includes('trimestral')) return 'Trimestral';
            if (v.includes('semestral')) return 'Semestral';
            if (v.includes('anual')) return 'Anual';
            return 'Ocasional';
        };

        const normalizarEstado = (val) => {
            const v = String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (v.includes('inactiv')) return 'Inactivo';
            if (v.includes('retirad')) return 'Retirado';
            return 'Activo';
        };

        filas.forEach((fila, i) => {
            const numFila = i + 2;

            // Omitir filas totalmente en blanco
            const tieneContenido = Object.values(fila).some(v => v !== null && v !== undefined && String(v).trim() !== '');
            if (!tieneContenido) return;

            const nombre = obtenerValor(fila, ['Nombre_Razon_Social', 'Nombre o Razón Social', 'Nombre', 'nombre', 'Razon_Social']);
            const documento = obtenerValor(fila, ['Documento', 'Documento (CC o NIT)', 'documento', 'Cedula', 'Cédula', 'NIT']);

            // Permitir campos vacíos: si falta el nombre o documento se importan como vacíos / sin registrar
            const nombreFinal = nombre || 'Sin nombre registrado';
            const documentoFinal = documento || '';

            // Solo validar duplicados si el documento fue suministrado
            if (documentoFinal !== '') {
                const docLimpioLower = documentoFinal.toLowerCase();
                if (documentosExistentes.has(docLimpioLower) || documentosEnArchivo.has(docLimpioLower)) {
                    errores.push({ fila: numFila, causa: 'Documento duplicado', detalle: `El documento "${documentoFinal}" ya está registrado en el sistema o en el archivo.` });
                    return;
                }
                documentosEnArchivo.add(docLimpioLower);
            }

            const rawTipo = obtenerValor(fila, ['Tipo_Persona', 'Tipo_Natural_Juridica', 'Tipo de Persona', 'tipo', 'Tipo']);
            const rawPeriodicidad = obtenerValor(fila, ['Periodicidad', 'Periodicidad_Aporte', 'Periodicidad_Ocasional_Mensual_Anual', 'periodicidad']);
            const rawEstado = obtenerValor(fila, ['Estado', 'Estado_Donante', 'Estado_Activo_Inactivo_Retirado', 'estado']);
            const fechaNac = obtenerValor(fila, ['Fecha_Nacimiento_YYYY_MM_DD', 'Fecha de Nacimiento', 'fecha_nac', 'Fecha_Nacimiento']);
            const telefono = obtenerValor(fila, ['Telefono', 'Teléfono', 'telefono', 'Celular', 'Movil']);
            const correo = obtenerValor(fila, ['Correo', 'Correo Electrónico', 'correo', 'Email', 'email']);
            const fechaProxima = obtenerValor(fila, ['Fecha_Proxima_Donacion_YYYY_MM_DD', 'Fecha_Proxima_Donacion', 'Proxima_Donacion', 'Fecha_Recordatorio', 'fecha_recordatorio']);
            const montoEsperadoStr = obtenerValor(fila, ['Monto_Esperado', 'Monto_Recordatorio', 'Monto_Habitual', 'monto_esperado', 'monto_recordatorio']);
            const notas = obtenerValor(fila, ['Notas', 'nota', 'Observaciones', 'descripcion', 'Detalle']);

            // Validaciones no bloqueantes: si una fecha o dato opcional tiene formato incorrecto, se normaliza o conserva sin impedir la importación
            let fechaNacValida = null;
            if (fechaNac && esFechaValida(fechaNac) && !esFechaFutura(fechaNac)) {
                fechaNacValida = fechaNac;
            }

            let montoEsperadoNum = null;
            if (montoEsperadoStr) {
                const parseMonto = parseFloat(String(montoEsperadoStr).replace(/[^0-9.]/g, ''));
                if (!isNaN(parseMonto) && parseMonto > 0) montoEsperadoNum = parseMonto;
            }

            const registroDonante = {
                nombre: nombreFinal,
                documento: documentoFinal,
                fecha_nac: fechaNacValida,
                telefono: telefono || '',
                correo: correo || '',
                tipo: rawTipo ? normalizarTipoPersona(rawTipo) : '',
                periodicidad: rawPeriodicidad ? normalizarPeriodicidad(rawPeriodicidad) : '',
                estado: rawEstado ? normalizarEstado(rawEstado) : 'Activo',
                nota: notas || '',
                proxima_donacion: (fechaProxima && esFechaValida(fechaProxima)) ? fechaProxima : null,
                monto_habitual: montoEsperadoNum,
                fecha_registro: obtenerFechaActualLocal()
            };

            payload.push(registroDonante);

            if (registroDonante.proxima_donacion && registroDonante.documento) {
                recordatoriosAProcesar.push({
                    documento: registroDonante.documento,
                    fecha_recordatorio: registroDonante.proxima_donacion,
                    monto_recordatorio: montoEsperadoNum,
                    nota_recordatorio: `Aporte programado importado (${registroDonante.periodicidad || 'Periódico'})`
                });
            }
        });

        erroresImportacionActuales = errores;

        if (payload.length === 0) {
            mostrarModalReporteErrores(`No se importó ningún registro (${errores.length} observaciones encontradas).`);
            return;
        }

        const { data: donantesInsertados, error } = await donantesService.insertar(payload);
        if (error) throw error;

        // Crear recordatorios si se incluyó próxima fecha de donación
        if (recordatoriosAProcesar.length > 0) {
            try {
                // Obtener IDs de donantes recién insertados
                const docsMap = new Map();
                if (Array.isArray(donantesInsertados)) {
                    donantesInsertados.forEach(d => {
                        if (d && d.documento && d.id) docsMap.set(String(d.documento).trim().toLowerCase(), d.id);
                    });
                }

                // Fallback de búsqueda si PostgREST no retornó IDs directamente
                if (docsMap.size === 0) {
                    const { data: donantesActuales } = await donantesService.listar();
                    if (Array.isArray(donantesActuales)) {
                        donantesActuales.forEach(d => {
                            if (d && d.documento && d.id) docsMap.set(String(d.documento).trim().toLowerCase(), d.id);
                        });
                    }
                }

                const payloadRecordatorios = [];
                recordatoriosAProcesar.forEach(rec => {
                    const donanteId = docsMap.get(String(rec.documento).trim().toLowerCase());
                    if (donanteId) {
                        payloadRecordatorios.push({
                            donante_id: donanteId,
                            fecha_recordatorio: rec.fecha_recordatorio,
                            estado_recordatorio: 'Pendiente',
                            monto_recordatorio: rec.monto_recordatorio,
                            nota_recordatorio: rec.nota_recordatorio
                        });
                    }
                });

                if (payloadRecordatorios.length > 0) {
                    await recordatoriosService.crearRecordatorio(payloadRecordatorios);
                }
            } catch (errRec) {
                console.warn('Advertencia al vincular recordatorios automáticos de donantes:', errRec);
            }
        }

        // Actualizar datos globales y refrescar UI
        if (typeof onCompletado === 'function') {
            await onCompletado();
        } else if (typeof window !== 'undefined' && typeof window.cargarDatosSupabase === 'function') {
            await window.cargarDatosSupabase();
        }

        // Ejecutar chequeo en segundo plano inmediatamente
        try {
            await ejecutarVerificacionSegundoPlano();
        } catch (_errCheck) { /* ignore */ }

        const incompletos = payload.filter(d => !d.nombre || d.nombre === 'Sin nombre registrado' || !d.documento || !d.telefono || !d.correo).length;

        if (errores.length > 0) {
            mostrarModalReporteErrores(`Importación parcial: Se agregaron ${payload.length} donante(s) (${incompletos} con campos faltantes señalados en rojo), pero ${errores.length} fila(s) tuvieron duplicados u observaciones.`);
        } else {
            const extraMsg = incompletos > 0 ? ` (${incompletos} registro(s) con campos vacíos marcados en rojo para completar)` : '';
            mostrarNotificacion('exito', 'Importación Exitosa', `Se agregaron ${payload.length} nuevo(s) donante(s) correctamente.${extraMsg}`);
        }

    } catch (err) {
        mostrarNotificacion('peligro', 'Error de Importación', err.message || 'No se pudo completar la importación.');
    } finally {
        const statusEl = document.getElementById('status-db');
        if (statusEl) statusEl.innerText = 'Sistema en línea';
        if (event && event.target) event.target.value = '';
    }
}

export function mostrarModalReporteErrores(mensajeResumen) {
    let modal = document.getElementById('modal-reporte-errores');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-reporte-errores';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[50] flex items-center justify-center p-4 transition-all';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col overflow-hidden" style="max-height: 90vh;">
            <div class="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                <div>
                    <h3 class="font-bold text-lg text-slate-800">Reporte de Errores / Observaciones</h3>
                    <p class="text-xs text-slate-500 mt-1">${escaparHTML(mensajeResumen)}</p>
                </div>
                <button onclick="cerrarModalReporteErrores()" class="text-slate-400 hover:text-rose-500 bg-white p-2 rounded-full shadow-sm border border-slate-200 transition-colors">
                    <i class="fa-solid fa-xmark w-4 h-4 flex items-center justify-center"></i>
                </button>
            </div>

            <div class="p-6 flex flex-col bg-white gap-4">
                <div class="shrink-0 flex gap-2">
                    <input type="text" id="buscar-error-reporte" onkeyup="filtrarErroresReporte()" placeholder="Buscar por fila, motivo o detalle..." class="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 shadow-sm">
                    <button onclick="abrirReporteEnNuevaVentana()" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shadow-sm border border-slate-200 transition-colors" title="Abrir en pantalla completa">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Nueva ventana
                    </button>
                    <button onclick="descargarReporteErroresTXT()" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shadow-sm border border-slate-200 transition-colors" title="Guardar como TXT">
                        <i class="fa-solid fa-download"></i> TXT
                    </button>
                </div>

                <div class="border border-slate-200 rounded-xl shadow-inner bg-white relative block" style="height: 350px; overflow-y: auto; display: block;">
                    <table class="w-full text-left border-collapse">
                        <thead class="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 uppercase font-bold z-10 shadow-sm">
                            <tr>
                                <th class="py-3 px-4 whitespace-nowrap w-28">FILA</th>
                                <th class="py-3 px-4">MOTIVO</th>
                                <th class="py-3 px-4">DETALLE</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-reporte-errores" class="text-xs divide-y divide-slate-100">
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="p-5 border-t border-slate-100 flex justify-end bg-slate-50 shrink-0">
                <button onclick="cerrarModalReporteErrores()" class="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm rounded-xl transition-colors shadow-md">
                    Cerrar Reporte
                </button>
            </div>
        </div>
    `;

    renderizarFilasErrores(erroresImportacionActuales);
    modal.classList.remove('hidden');
}

export function renderizarFilasErrores(lista) {
    const tbody = document.getElementById('tbody-reporte-errores');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-slate-400">No se encontraron errores o la lista está vacía.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(err => `
        <tr class="hover:bg-slate-50">
            <td class="py-2.5 px-4 font-mono font-bold text-rose-600">#${escaparHTML(err.fila)}</td>
            <td class="py-2.5 px-4 font-semibold text-slate-700">${escaparHTML(err.causa)}</td>
            <td class="py-2.5 px-4 text-slate-500">${escaparHTML(err.detalle)}</td>
        </tr>
    `).join('');
}

export function filtrarErroresReporte() {
    const q = document.getElementById('buscar-error-reporte')?.value.toLowerCase() || '';
    const filtrados = erroresImportacionActuales.filter(e =>
        String(e.fila).includes(q) ||
        e.causa.toLowerCase().includes(q) ||
        e.detalle.toLowerCase().includes(q)
    );
    renderizarFilasErrores(filtrados);
}

export function cerrarModalReporteErrores() {
    const modal = document.getElementById('modal-reporte-errores');
    if (modal) modal.classList.add('hidden');
}

export function descargarReporteErroresTXT() {
    if (!erroresImportacionActuales.length) return;
    const contenido = erroresImportacionActuales.map(e => `[Fila ${e.fila}] ${e.causa}: ${e.detalle}`).join('\n');
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_Errores_Importacion_${obtenerFechaActualLocal()}.txt`;
    link.click();
}

export function abrirReporteEnNuevaVentana() {
    if (!erroresImportacionActuales.length) return;
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) return;
    const html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Reporte de Errores de Importación</title>
            <style>
                body { font-family: system-ui, sans-serif; padding: 24px; color: #1e293b; background: #f8fafc; }
                h2 { color: #0f172a; margin-bottom: 8px; }
                table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
                th { background: #f1f5f9; text-transform: uppercase; font-size: 12px; color: #64748b; }
                .fila { font-weight: bold; color: #e11d48; font-family: monospace; }
            </style>
        </head>
        <body>
            <h2>Detalle de Observaciones de Importación</h2>
            <p style="font-size:14px; color:#64748b;">Total de filas omitidas o con error: ${erroresImportacionActuales.length}</p>
            <table>
                <thead>
                    <tr><th>Fila</th><th>Motivo</th><th>Detalle</th></tr>
                </thead>
                <tbody>
                    ${erroresImportacionActuales.map(e => `
                        <tr>
                            <td class="fila">#${escaparHTML(e.fila)}</td>
                            <td><strong>${escaparHTML(e.causa)}</strong></td>
                            <td>${escaparHTML(e.detalle)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;
    win.document.write(html);
    win.document.close();
}

export { initImportacionDonaciones };
