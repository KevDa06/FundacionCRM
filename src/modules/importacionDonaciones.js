const COLUMNAS = {
    donanteId: ['Donante_ID', 'donante_id', 'ID_Donante', 'id_donante'],
    documento: ['Documento_Donante', 'Documento', 'documento', 'Cedula', 'Cédula', 'NIT', 'Documento_Donante'],
    correo: ['Correo_Donante', 'Correo', 'correo', 'Email', 'email'],
    nombre: ['Nombre_Donante', 'Nombre', 'nombre', 'Nombre_Razon_Social', 'Nombre_Donante'],
    monto: ['Monto', 'monto', 'Valor', 'valor', 'Importe'],
    moneda: ['Moneda', 'moneda', 'Moneda_Aporte', 'moneda_aporte'],
    fecha: ['Fecha', 'fecha', 'Fecha_Donacion', 'Fecha_Donación', 'Fecha_Donación_YYYY_MM_DD'],
    medio: ['Medio', 'medio', 'Metodo', 'Método', 'Medio_Pago'],
    comprobante: ['Comprobante', 'comprobante', 'Referencia', 'referencia'],
    destinacion: ['Destinacion', 'Destinación', 'destinacion', 'Destino'],
    nota: ['Nota', 'nota', 'Notas', 'descripcion', 'Descripción']
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
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    let raw = String(value ?? '').trim().replace(/\s/g, '').replace(/\$/g, '');
    if (!raw) return NaN;
    if (raw.includes(',') && raw.includes('.')) {
        if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) raw = raw.replace(/\./g, '').replace(',', '.');
        else raw = raw.replace(/,/g, '');
    } else if (raw.includes(',')) {
        const parts = raw.split(',');
        raw = parts[parts.length - 1].length === 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
    }
    return Number(raw);
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

function rowToPayload(row, donantes, existing, seen) {
    const rawDonante = pick(row, COLUMNAS.donanteId) || pick(row, COLUMNAS.documento) || pick(row, COLUMNAS.correo) || pick(row, COLUMNAS.nombre);
    const donante = findDonante(rawDonante, donantes);
    const fecha = normalizeDate(pick(row, COLUMNAS.fecha));
    const monto = parseAmount(pick(row, COLUMNAS.monto));
    const moneda = (pick(row, COLUMNAS.moneda) || 'COP').toUpperCase();
    const medio = pick(row, COLUMNAS.medio);
    const comprobante = pick(row, COLUMNAS.comprobante) || 'S/N';
    const destinacion = pick(row, COLUMNAS.destinacion);
    const nota = pick(row, COLUMNAS.nota);
    const errors = [];

    if (!donante) errors.push('No se encontró el donante. Usa ID, documento, correo o nombre exacto.');
    if (!fecha) errors.push('Fecha inválida o faltante. Usa YYYY-MM-DD o DD/MM/YYYY.');
    if (!Number.isFinite(monto) || monto <= 0) errors.push('Monto inválido.');
    if (!['COP','USD','EUR'].includes(moneda)) errors.push(`Moneda no soportada: ${moneda}.`);
    if (!medio) errors.push('Falta el medio de pago.');
    if (!destinacion) errors.push('Falta la destinación.');

    const payload = donante ? { donante_id: donante.id, monto, moneda_aporte: moneda, fecha, medio, comprobante, destinacion, nota } : null;
    if (payload) {
        const fingerprint = [payload.donante_id, payload.fecha, payload.monto, payload.moneda_aporte, payload.medio, payload.comprobante, payload.destinacion].join('|');
        const duplicate = existing.has(fingerprint) || seen.has(fingerprint);
        if (duplicate) errors.push('Posible donación duplicada.');
        seen.add(fingerprint);
    }
    return { payload, errors };
}

export function descargarPlantillaDonaciones() {
    try {
        const filaEjemplo = {
            'Documento_Donante': '100200300',
            'Fecha_Donacion': '2026-03-15',
            'Monto': 150000,
            'Moneda': 'COP',
            'Medio_Pago': 'Transferencia',
            'Destinacion': 'Programa Educativo',
            'Comprobante': 'TRX-982341',
            'Notas': 'Aporte de ejemplo'
        };

        if (typeof XLSX === 'undefined') {
            throw new Error('La librería XLSX (SheetJS) no está cargada.');
        }

        const ws = XLSX.utils.json_to_sheet([filaEjemplo]);
        
        ws['!cols'] = [
            { wch: 22 }, // Documento_Donante
            { wch: 18 }, // Fecha_Donacion
            { wch: 14 }, // Monto
            { wch: 10 }, // Moneda
            { wch: 18 }, // Medio_Pago
            { wch: 24 }, // Destinacion
            { wch: 18 }, // Comprobante
            { wch: 30 }  // Notas
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Donaciones');
        XLSX.writeFile(wb, 'Plantilla_Importacion_Donaciones.xlsx');
    } catch (error) {
        console.error('Error al generar la plantilla:', error);
        alert(error.message || 'No se pudo descargar la plantilla.');
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
        return await new Promise((resolve, reject) => {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: r => resolve(r.data), error: reject });
        });
    }
    if (['xlsx','xls'].includes(ext)) {
        const buffer = await file.arrayBuffer();
        const book = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheet = book.Sheets[book.SheetNames[0]];
        return XLSX.utils.sheet_to_json(sheet, { defval: '' });
    }
    throw new Error('Formato no compatible. Usa CSV, XLSX o XLS.');
}

function validateRows(rows, donantes, donaciones) {
    if (!rows.length) throw new Error('El archivo está vacío.');
    const required = ['monto', 'fecha', 'medio', 'destinacion'];
    const keys = Object.keys(rows[0]);
    const missing = required.filter(name => !keys.some(k => COLUMNAS[name]?.some(a => normalize(a) === normalize(k))));
    const existing = new Set(donaciones.map(d => [d.donante_id,d.fecha,d.monto,d.moneda_aporte,d.medio,d.comprobante || 'S/N',d.destinacion].join('|')));
    const seen = new Set();
    const valid = [], errors = [];
    rows.forEach((row, index) => {
        const result = rowToPayload(row, donantes, existing, seen);
        if (result.errors.length) errors.push({ row: index + 2, messages: result.errors, raw: row });
        else valid.push({ row: index + 2, payload: result.payload });
    });
    return { valid, errors, missing };
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
    [...valid.slice(0, 50).map(v => ({...v, ok:true})), ...errors.slice(0,50).map(e => ({...e, ok:false}))].forEach(item => {
        const p = item.ok ? item.payload : null;
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100';
        tr.innerHTML = item.ok
            ? `<td class="px-4 py-3">${escapeHTML(item.row)}</td><td class="px-4 py-3">${escapeHTML(p.fecha)}</td><td class="px-4 py-3 font-medium">${escapeHTML(p.donante_id)}</td><td class="px-4 py-3">${escapeHTML(p.monto.toLocaleString('es-CO'))} ${escapeHTML(p.moneda_aporte)}</td><td class="px-4 py-3">${escapeHTML(p.medio)}</td><td class="px-4 py-3"><span class="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">Válida</span></td>`
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
    try {
        const batchSize = 100;
        let inserted = 0;
        for (let i = 0; i < current.valid.length; i += batchSize) {
            const batch = current.valid.slice(i, i + batchSize).map(x => x.payload);
            const { error } = await supabaseClient.from('donaciones').insert(batch);
            if (error) throw error;
            inserted += batch.length;
            document.getElementById('texto-progreso-import-donaciones').textContent = `${inserted} de ${current.valid.length}`;
        }
        const rejected = current.errors.length;
        closeModal();
        mostrarNotificacion('exito', 'Importación completada', `${inserted} donación(es) importada(s). ${rejected} fila(s) quedaron rechazadas.`);
        await cargarDatosSupabase();
    } catch (error) {
        mostrarNotificacion('peligro', 'Error de importación', error.message || 'No se pudo completar la importación.');
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
}