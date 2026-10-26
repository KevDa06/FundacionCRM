import { clasificarErrorSupabase } from '../../utils/supabaseErrors.js';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { mostrarNotificacion } from '../../components/toast.js';
import { store } from '../../state/store.js';
import { ejecutarVerificacionSegundoPlano } from '../../services/backgroundCheckService.js';
import * as donantesService from '../../services/donantesService.js';
import { supabaseClient } from '../../services/supabase.js';
import { cargarDatosSupabase } from '../../controllers/dataSync.js';

const COLUMNAS = {
    donanteId: ['Donante_ID', 'donante_id', 'ID_Donante', 'id_donante'],
    documento: ['Documento_Donante', 'Documento', 'documento', 'Cedula', 'Cédula', 'NIT', 'NIT_Donante', 'Identificacion', 'Identificación'],
    correo: ['Correo_Donante', 'Correo', 'correo', 'Email', 'email'],
    nombre: ['Nombre_Donante', 'Nombre', 'nombre', 'Nombre_Razon_Social', 'Nombre o Razón Social', 'Donante'],
    monto: ['Monto', 'monto', 'Valor', 'valor', 'Importe', 'Total'],
    moneda: ['Moneda', 'moneda', 'Moneda_Aporte', 'moneda_aporte', 'Divisa'],
    fecha: ['Fecha_Donacion', 'Fecha_Donación', 'Fecha_Donación_YYYY_MM_DD', 'Fecha', 'fecha'],
    medio: ['Medio_Pago', 'Medio de Pago', 'Medio', 'medio', 'Metodo', 'Método', 'Forma_Pago'],
    comprobante: ['Comprobante', 'comprobante', 'Referencia', 'referencia', 'No_Recibo', 'Recibo'],
    destinacion: ['Destinacion', 'Destinación', 'destinacion', 'Destino', 'Programa', 'Fondo', 'Proyecto'],
    nota: ['Notas', 'notas', 'Nota', 'nota', 'Descripcion', 'Descripción', 'Concepto', 'Observaciones']
};

function pick(row, aliases) {
    for (const key of aliases) {
        if (Object.prototype.hasOwnProperty.call(row, key) && String(row[key] ?? '').trim() !== '') return String(row[key]).trim();
    }
    const normalized = Object.keys(row).reduce((acc, k) => {
        acc[normalize(k)] = k;
        return acc;
    }, {});
    for (const alias of aliases) {
        const key = normalized[normalize(alias)];
        if (key && String(row[key] ?? '').trim() !== '') return String(row[key]).trim();
    }
    return '';
}

function normalize(value) {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function parseAmount(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let raw = String(value ?? '').trim().replace(/\s/g, '').replace(/\$/g, '');
    if (!raw) return 0;
    if (raw.includes(',') && raw.includes('.')) {
        if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) raw = raw.replace(/\./g, '').replace(',', '.');
        else raw = raw.replace(/,/g, '');
    } else if (raw.includes(',')) {
        const parts = raw.split(',');
        raw = parts[parts.length - 1].length === 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}

function normalizeDate(value) {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const yyyy = value.getUTCFullYear();
        const mm = String(value.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(value.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function findDonante(value, donantes) {
    if (!value) return null;
    const needle = normalize(value);
    
    // Prioriza ID, documento o correo estricto primero
    let match = donantes.find(d => 
        [d.id, d.documento, d.correo].filter(Boolean).some(v => normalize(v) === needle)
    );
    if (match) return match;

    // Fallback a coincidencia por nombre
    return donantes.find(d => d.nombre && normalize(d.nombre) === needle) || null;
}

function rowToPayload(row, donantes, existing, seen, donantesNuevosPendientes) {
    // Si la fila no contiene ningún dato, se descarta
    const tieneDatos = Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (!tieneDatos) return { payload: null, errors: ['Fila vacía'], warnings: [] };

    const rawDonante = pick(row, COLUMNAS.donanteId) || pick(row, COLUMNAS.documento) || pick(row, COLUMNAS.correo) || pick(row, COLUMNAS.nombre);
    let donante = findDonante(rawDonante, donantes);

    // Si no se encuentra el donante, se genera automáticamente un donante provisional o sin vincular
    // para permitir importar la fila y que aparezca en rojo en Donantes y Donaciones
    if (!donante) {
        const docExtraidoRaw = pick(row, COLUMNAS.documento) || (rawDonante && /^\d+[\w-]*$/.test(rawDonante) ? rawDonante : '');
        const docExtraido = (docExtraidoRaw && String(docExtraidoRaw).trim() !== '') ? String(docExtraidoRaw).trim() : null;
        const nombreExtraido = pick(row, COLUMNAS.nombre) || (!docExtraido ? rawDonante : '') || 'Donante sin vincular';
        
        // Buscar si ya creamos un donante temporal igual en este lote
        donante = donantesNuevosPendientes.find(d => 
            (docExtraido && d.documento === docExtraido) || 
            (nombreExtraido && d.nombre.toLowerCase() === nombreExtraido.toLowerCase())
        );

        if (!donante) {
            const uuidVal = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : undefined;
            donante = {
                ...(uuidVal ? { id: uuidVal } : {}),
                nombre: nombreExtraido,
                documento: docExtraido, // null si no tiene documento, nunca string vacío ''
                tipo: '',
                periodicidad: '',
                estado: 'Activo',
                telefono: '',
                correo: pick(row, COLUMNAS.correo) || '',
                fecha_registro: new Date().toISOString().slice(0, 10),
                nota: 'Creado automáticamente durante importación de donaciones (campos incompletos)'
            };
            donantesNuevosPendientes.push(donante);
            donantes.push(donante); // Añadir para búsquedas en la misma ejecución
        }
    }

    const fecha = normalizeDate(pick(row, COLUMNAS.fecha));
    const monto = parseAmount(pick(row, COLUMNAS.monto));
    const monedaRaw = (pick(row, COLUMNAS.moneda) || 'COP').toUpperCase();
    const moneda = ['COP', 'USD', 'EUR'].includes(monedaRaw) ? monedaRaw : 'COP';
    const medio = pick(row, COLUMNAS.medio) || '';
    const comprobante = pick(row, COLUMNAS.comprobante) || '';
    const destinacion = pick(row, COLUMNAS.destinacion) || '';
    const nota = pick(row, COLUMNAS.nota) || '';

    const warnings = [];
    if (!donante || donante.nombre === 'Donante sin vincular' || !donante.documento) warnings.push('Donante incompleto');
    if (!fecha) warnings.push('Sin fecha');
    if (monto <= 0) warnings.push('Sin monto');
    if (!medio) warnings.push('Sin medio');
    if (!destinacion) warnings.push('Sin destinación');
    if (!comprobante) warnings.push('Sin comprobante');

    const payload = {
        donante_id: donante.id,
        monto,
        moneda_aporte: moneda,
        fecha: fecha || '',
        medio,
        comprobante: comprobante || 'S/N',
        destinacion,
        nota
    };

    const fingerprint = [payload.donante_id, payload.fecha, payload.monto, payload.moneda_aporte, payload.medio, payload.comprobante, payload.destinacion].join('|');
    const duplicate = existing.has(fingerprint) || seen.has(fingerprint);
    if (duplicate) {
        return { payload: null, errors: ['Posible donación duplicada.'], warnings };
    }
    seen.add(fingerprint);

    return { payload, errors: [], warnings };
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
        const x = window.XLSX || XLSX;
        if (x && x.utils) {
            const ws = x.utils.json_to_sheet(filasEjemplo);
            ws['!cols'] = [
                { wch: 22 }, // Documento_Donante
                { wch: 28 }, // Nombre_Donante
                { wch: 16 }, // Fecha_Donacion
                { wch: 14 }, // Monto
                { wch: 10 }, // Moneda
                { wch: 18 }, // Medio_Pago
                { wch: 24 }, // Destinacion
                { wch: 18 }, // Comprobante
                { wch: 36 }  // Notas
            ];

            const wb = x.utils.book_new();
            x.utils.book_append_sheet(wb, ws, 'Plantilla Donaciones');
            try {
                x.writeFile(wb, 'Plantilla_Importacion_Donaciones.xlsx');
                mostrarNotificacion('exito', 'Plantilla Descargada', 'Se descargó la plantilla de donaciones (.xlsx).');
                return;
            } catch (writeErr) {
                console.warn('writeFile falló, intentando blob fallback:', writeErr);
                const wbout = x.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'Plantilla_Importacion_Donaciones.xlsx';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                mostrarNotificacion('exito', 'Plantilla Descargada', 'Se descargó la plantilla de donaciones (.xlsx).');
                return;
            }
        }

        // CSV Fallback
        const cabeceras = Object.keys(filasEjemplo[0]).join(';');
        const filasCsv = filasEjemplo.map(fila =>
            Object.values(fila).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')
        ).join('\r\n');
        const blob = new Blob(['\uFEFF' + cabeceras + '\r\n' + filasCsv + '\r\n'], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Plantilla_Importacion_Donaciones.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        mostrarNotificacion('exito', 'Plantilla Descargada', 'Se descargó la plantilla de donaciones en formato CSV.');
    } catch (error) {
        console.error('Error al generar la plantilla:', error);
        mostrarNotificacion('peligro', 'Error de Descarga', error.message || 'No se pudo descargar la plantilla.');
    }
}

if (typeof window !== 'undefined') {
    window.descargarPlantillaDonaciones = descargarPlantillaDonaciones;
}

export function initImportacionDonaciones({ supabaseClient, getDonantes, getDonaciones, getDestinaciones, mostrarNotificacion, cargarDatosSupabase }) {
    const input = document.getElementById('input-importar-donaciones');
    if (!input) return;

    input.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const rows = await readFile(file);
            const { valid, errors, missing } = validateRows(rows, getDonantes(), getDonaciones());
            if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}`);
            renderPreview(valid, errors);
        } catch (error) {
            mostrarNotificacion('peligro', 'Archivo inválido', error.message || 'No se pudo procesar el archivo.');
        } finally {
            input.value = '';
        }
    });

    // Eventos para cerrar el modal (botón Cancelar y la 'X' superior)
    document.getElementById('btn-cancelar-importacion-donaciones')?.addEventListener('click', () => closeModal());
    document.getElementById('btn-cancelar-importacion-donaciones-x')?.addEventListener('click', () => closeModal());

    document.getElementById('btn-confirmar-importacion-donaciones')?.addEventListener('click', async () => {
        await importValidRows({ supabaseClient, getDonaciones, mostrarNotificacion, cargarDatosSupabase });
    });
    document.getElementById('btn-seleccionar-importacion-donaciones')?.addEventListener('click', () => input.click());
}

let current = { valid: [], errors: [] };

async function readFile(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'csv') {
        const parser = window.Papa || Papa;
        return await new Promise((resolve, reject) => {
            parser.parse(file, { header: true, skipEmptyLines: true, complete: r => resolve(r.data), error: reject });
        });
    }
    if (['xlsx','xls'].includes(ext)) {
        const buffer = await file.arrayBuffer();
        const x = window.XLSX || XLSX;
        const book = x.read(buffer, { type: 'array', cellDates: true });
        const sheet = book.Sheets[book.SheetNames[0]];
        return x.utils.sheet_to_json(sheet, { defval: '' });
    }
    throw new Error('Formato no compatible. Usa CSV, XLSX o XLS.');
}

let nuevosDonantesPendientes = [];

function validateRows(rows, donantes, donaciones) {
    if (!rows.length) throw new Error('El archivo está vacío.');
    nuevosDonantesPendientes = [];
    const donantesCopia = [...donantes];
    const existing = new Set(donaciones.map(d => [d.donante_id, d.fecha, d.monto, d.moneda_aporte, d.medio, d.comprobante || 'S/N', d.destinacion].join('|')));
    const seen = new Set();
    const valid = [], errors = [];
    rows.forEach((row, index) => {
        const result = rowToPayload(row, donantesCopia, existing, seen, nuevosDonantesPendientes);
        if (result.errors.length) errors.push({ row: index + 2, messages: result.errors, raw: row });
        else valid.push({ row: index + 2, payload: result.payload, warnings: result.warnings || [] });
    });
    return { valid, errors, missing: [] };
}

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderPreview(valid, errors) {
    current = { valid, errors };
    document.getElementById('import-donaciones-total').textContent = valid.length + errors.length;
    document.getElementById('import-donaciones-validas').textContent = valid.length;
    document.getElementById('import-donaciones-errores').textContent = errors.length;
    const body = document.getElementById('tbody-preview-import-donaciones');
    body.innerHTML = '';
    const listaDonantes = Array.isArray(store.globalDonantes) ? store.globalDonantes : [];

    [...valid.slice(0, 50).map(v => ({...v, ok:true})), ...errors.slice(0,50).map(e => ({...e, ok:false}))].forEach(item => {
        const p = item.ok ? item.payload : null;
        const donante = p ? (listaDonantes.find(d => d && d.id === p.donante_id) || nuevosDonantesPendientes.find(d => d && d.id === p.donante_id)) : null;
        const nombreMostrar = donante ? `${donante.nombre}${donante.documento ? ` (${donante.documento})` : ' (Sin doc)'}` : (p ? p.donante_id : '');
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100';

        let badgeEstado = '<span class="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">Válida</span>';
        if (item.ok && item.warnings && item.warnings.length > 0) {
            badgeEstado = `<span class="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200" title="Campos vacíos: ${item.warnings.join(', ')}">Campos vacíos (${item.warnings.length})</span>`;
        }

        const fechaHtml = (p && p.fecha) ? escapeHTML(p.fecha) : '<span class="text-rose-600 font-bold">Sin fecha</span>';
        const montoHtml = (p && p.monto > 0) ? `${escapeHTML(p.monto.toLocaleString('es-CO'))} ${escapeHTML(p.moneda_aporte)}` : '<span class="text-rose-600 font-bold">$0 (Sin monto)</span>';
        const medioHtml = (p && p.medio) ? escapeHTML(p.medio) : '<span class="text-rose-600 font-bold">Sin medio</span>';

        tr.innerHTML = item.ok
            ? `<td class="px-4 py-3">${escapeHTML(item.row)}</td><td class="px-4 py-3">${fechaHtml}</td><td class="px-4 py-3 font-medium text-slate-800">${escapeHTML(nombreMostrar)}</td><td class="px-4 py-3 font-bold text-emerald-600">${montoHtml}</td><td class="px-4 py-3">${medioHtml}</td><td class="px-4 py-3">${badgeEstado}</td>`
            : `<td class="px-4 py-3">${escapeHTML(item.row)}</td><td colspan="4" class="px-4 py-3 text-rose-600">${escapeHTML(item.messages.join(' '))}</td><td class="px-4 py-3"><span class="px-2 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-bold">Error</span></td>`;
        body.appendChild(tr);
    });
    document.getElementById('import-donaciones-limitada').textContent = (valid.length + errors.length > 100) ? 'Mostrando las primeras 100 filas en la vista previa.' : '';
    document.getElementById('modal-importar-donaciones').classList.remove('hidden');
}

async function importValidRows({ supabaseClient, getDonaciones, mostrarNotificacion, cargarDatosSupabase }) {
    if (!current.valid.length) return mostrarNotificacion('alerta', 'Sin registros válidos', 'Corrige el archivo antes de importar.');
    const button = document.getElementById('btn-confirmar-importacion-donaciones');
    button.disabled = true;
    button.textContent = 'Importando...';
    const progress = document.getElementById('progreso-import-donaciones');
    progress.classList.remove('hidden');
    const textoProgreso = document.getElementById('texto-progreso-import-donaciones');
    if (textoProgreso) textoProgreso.textContent = `Procesando ${current.valid.length} donación(es)...`;

    try {
        // 1. Insertar primero cualquier nuevo donante provisional generado por datos incompletos
        if (nuevosDonantesPendientes.length > 0) {
            try {
                await donantesService.insertar(nuevosDonantesPendientes);
            } catch (errDon) {
                console.warn('Advertencia al insertar donantes provisionales:', errDon);
            }
        }

        const allPayloads = current.valid.map(x => x.payload);
        let inserted = 0;

        // 2. Insertar donaciones directamente para admitir campos vacíos sin bloqueos de RPC
        const { error: insertError } = await supabaseClient.from('donaciones').insert(allPayloads);
        if (!insertError) {
            inserted = allPayloads.length;
        } else {
            // Intento alternativo por RPC si la política de la base lo exige
            const { data: rpcData, error: rpcError } = await supabaseClient.rpc('importar_donaciones_batch', {
                donaciones_json: allPayloads
            });
            if (rpcError) throw insertError;
            inserted = (rpcData && typeof rpcData.insertadas === 'number') ? rpcData.insertadas : allPayloads.length;
        }

        if (textoProgreso) textoProgreso.textContent = `${inserted} de ${current.valid.length}`;
        const rejected = current.errors.length;
        const conVacios = current.valid.filter(v => v.warnings && v.warnings.length > 0).length;
        closeModal();
        const msgExtra = conVacios > 0 ? ` (${conVacios} con campos vacíos señalados en rojo en la lista).` : '.';
        mostrarNotificacion('exito', 'Importación completada', `${inserted} donación(es) importada(s) correctamente${msgExtra}${rejected > 0 ? ` ${rejected} fila(s) vacías o duplicadas fueron omitidas.` : ''}`);
        await cargarDatosSupabase();

        // Ejecutar chequeo en segundo plano inmediatamente
        try {
            await ejecutarVerificacionSegundoPlano();
        } catch (_errCheck) { /* ignore */ }
    } catch (error) {
        console.error('Error en importación de donaciones:', error);
        const infoError = clasificarErrorSupabase(error);
        mostrarNotificacion('peligro', infoError.titulo || 'Error de Importación', infoError.mensaje || error.message || 'No se pudo completar la importación.');
    } finally {
        button.disabled = false;
        button.textContent = 'Importar donaciones válidas';
        progress.classList.add('hidden');
        const input = document.getElementById('input-importar-donaciones');
        if (input) input.value = '';
    }
}

function closeModal() {
    document.getElementById('modal-importar-donaciones')?.classList.add('hidden');
    const input = document.getElementById('input-importar-donaciones');
    if (input) input.value = '';
    current = { valid: [], errors: [] };
    nuevosDonantesPendientes = [];
}