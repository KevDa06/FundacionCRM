/**
 * Módulo de Importación y Exportación de Datos (Excel / CSV)
 */
import { store } from '../../state/store.js';
import * as donantesService from '../../services/donantesService.js';
import { escaparHTML, construirLibroExcel, descargarExcel } from '../../utils/formatters.js';
import { obtenerFechaActualLocal } from '../../utils/dates.js';
import { CAMPOS_VALIDOS_DONANTE } from '../../utils/validation.js';
import { mostrarNotificacion } from '../../components/toast.js';
import { initImportacionDonaciones } from '../importacionDonaciones.js';

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
        anchos = [28, 18, 16, 16, 28, 16, 18, 14, 18, 32];
        filas = datos.map(d => ({
            'Nombre_Razon_Social': d.nombre || '',
            'Documento': d.documento || '',
            'Fecha_Nacimiento_YYYY_MM_DD': d.fecha_nac || '',
            'Telefono': d.telefono || '',
            'Correo': d.correo || '',
            'Tipo_Natural_Juridica': d.tipo || 'Natural',
            'Periodicidad_Ocasional_Mensual_Anual': d.periodicidad || 'Ocasional',
            'Estado_Activo_Inactivo_Retirado': d.estado || 'Activo',
            'Fecha_Registro': d.fecha_registro || '',
            'Notas': d.nota || ''
        }));
    } else {
        nombreHoja = 'Donaciones';
        anchos = [18, 28, 16, 14, 10, 18, 24, 18, 32];
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
    descargarExcel(`Reporte_${tipo.toUpperCase()}_${obtenerFechaActualLocal()}.xlsx`, libro);
}

export function descargarPlantillaImportacion() {
    const filaEjemplo = {
        'Nombre_Razon_Social': 'Juan Pérez',
        'Documento': '100200300',
        'Fecha_Nacimiento_YYYY_MM_DD': '1990-05-15',
        'Telefono': '3001234567',
        'Correo': 'juan@ejemplo.com',
        'Tipo_Natural_Juridica': 'Natural',
        'Periodicidad_Ocasional_Mensual_Anual': 'Mensual',
        'Estado_Activo_Inactivo_Retirado': 'Activo',
        'Notas': 'Ejemplo de importación'
    };
    const anchos = [26, 16, 26, 14, 26, 22, 34, 28, 30];
    const libro = construirLibroExcel('Plantilla', [filaEjemplo], anchos);
    descargarExcel('Plantilla_Importacion_Donantes.xlsx', libro);
}

export function descargarPlantillaDonaciones() {
    const filaEjemplo = {
        'Documento_Donante': '100200300',
        'Fecha_Donacion': '2026-03-15',
        'Monto': 150000,
        'Moneda': 'COP',
        'Medio_Pago': 'Transferencia',
        'Destinacion': 'Programa Educativo',
        'Comprobante': 'TRX-982341',
        'Notas': 'Aporte mensual correspondiente a marzo'
    };
    const anchos = [22, 18, 14, 10, 18, 24, 18, 35];
    const libro = construirLibroExcel('Plantilla Donaciones', [filaEjemplo], anchos);
    descargarExcel('Plantilla_Importacion_Donaciones.xlsx', libro);
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
        const Papa = window.Papa;
        if (!Papa) {
            mostrarNotificacion('peligro', 'Error', 'La librería CSV (PapaParse) no está disponible.');
            return;
        }
        Papa.parse(archivo, {
            header: true,
            skipEmptyLines: true,
            transformHeader: h => h.trim(),
            complete: (resultados) => finalizarImportacionDonantes(resultados.data, event, onCompletado),
            error: () => manejarErrorLecturaArchivo(event)
        });
    } else {
        const XLSX = window.XLSX;
        if (!XLSX) {
            mostrarNotificacion('peligro', 'Error', 'La librería Excel no está disponible.');
            return;
        }
        const lector = new FileReader();
        lector.onload = (e) => {
            try {
                const libro = XLSX.read(e.target.result, { type: 'array', cellDates: true });
                const hoja = libro.Sheets[libro.SheetNames[0]];
                const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false });
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

        const documentosExistentes = new Set(store.globalDonantes.map(d => String(d.documento || '').trim()));
        const documentosEnArchivo = new Set();
        const payload = [];
        const errores = [];

        const obtenerValor = (row, keys) => {
            for (const key of keys) {
                if (row[key] !== undefined && String(row[key]).trim() !== '') {
                    return String(row[key]).trim();
                }
            }
            return '';
        };

        filas.forEach((fila, i) => {
            const numFila = i + 2;
            const nombre = obtenerValor(fila, ['Nombre_Razon_Social', 'Nombre o Razón Social', 'Nombre', 'nombre']);
            const documento = obtenerValor(fila, ['Documento', 'Documento (CC o NIT)', 'documento', 'Cedula', 'NIT']);

            if (!nombre || !documento) {
                errores.push({ fila: numFila, causa: 'Campos incompletos', detalle: 'Falta el Nombre o el Documento.' });
                return;
            }

            if (documentosExistentes.has(documento) || documentosEnArchivo.has(documento)) {
                errores.push({ fila: numFila, causa: 'Documento duplicado', detalle: `El documento "${documento}" ya existe en la BD o en el archivo.` });
                return;
            }

            const rawTipo = obtenerValor(fila, ['Tipo_Natural_Juridica', 'Tipo de Persona', 'tipo']);
            const rawPeriodicidad = obtenerValor(fila, ['Periodicidad_Ocasional_Mensual_Anual', 'Periodicidad', 'periodicidad']);
            const rawEstado = obtenerValor(fila, ['Estado_Activo_Inactivo_Retirado', 'Estado', 'estado']);
            const fechaNac = obtenerValor(fila, ['Fecha_Nacimiento_YYYY_MM_DD', 'Fecha de Nacimiento', 'fecha_nac']);

            documentosEnArchivo.add(documento);
            payload.push({
                nombre,
                documento,
                fecha_nac: fechaNac || null,
                telefono: obtenerValor(fila, ['Telefono', 'Teléfono', 'telefono']),
                correo: obtenerValor(fila, ['Correo', 'Correo Electrónico', 'correo', 'Email']),
                tipo: CAMPOS_VALIDOS_DONANTE.tipo.includes(rawTipo) ? rawTipo : 'Natural',
                periodicidad: CAMPOS_VALIDOS_DONANTE.periodicidad.includes(rawPeriodicidad) ? rawPeriodicidad : 'Ocasional',
                estado: CAMPOS_VALIDOS_DONANTE.estado.includes(rawEstado) ? rawEstado : 'Activo',
                nota: obtenerValor(fila, ['Notas', 'nota']),
                fecha_registro: obtenerFechaActualLocal()
            });
        });

        erroresImportacionActuales = errores;

        if (payload.length === 0) {
            mostrarModalReporteErrores(`No se importó ningún registro (${errores.length} errores encontrados).`);
            return;
        }

        const { error } = await donantesService.insertar(payload);
        if (error) throw error;

        if (typeof onCompletado === 'function') {
            await onCompletado();
        }

        if (errores.length > 0) {
            mostrarModalReporteErrores(`Importación parcial: Se agregaron ${payload.length} donante(s), pero ${errores.length} fila(s) tuvieron observaciones.`);
        } else {
            mostrarNotificacion('exito', 'Importación Exitosa', `Se agregaron ${payload.length} nuevo(s) donante(s) correctamente.`);
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
