/**
 * Utilidades para formateo de texto, moneda, números y sanitización.
 */

// Función auxiliar para sanitizar e impedir inyecciones XSS
export function escaparHTML(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Normaliza documentos para búsqueda y comparación evitando diferencias de formato o tildes
export function normalizarDocumento(doc) {
    if (!doc) return '';
    const str = String(doc).trim();
    if (str.includes('@')) {
        return str.toLowerCase();
    }
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}

// Tasas de cambio predeterminadas
export const TASAS_CAMBIO_DEFAULT = { 'COP': 1, 'USD': 4000, 'EUR': 4400 };
export const LOC_MONEDA_DEFAULT = { 'COP': 'es-CO', 'USD': 'en-US', 'EUR': 'es-ES' };

// Formatea un monto expresado en COP a la moneda actualmente seleccionada
export function formatearMoneda(montoEnCop, monedaActual = 'COP', tasas = TASAS_CAMBIO_DEFAULT, locales = LOC_MONEDA_DEFAULT) {
    const tasa = tasas[monedaActual] || 1;
    const valorConvertido = (Number(montoEnCop) || 0) / tasa;
    const loc = locales[monedaActual] || 'es-CO';
    return new Intl.NumberFormat(loc, {
        style: 'currency',
        currency: monedaActual,
        minimumFractionDigits: (monedaActual === 'COP') ? 0 : 2
    }).format(valorConvertido);
}

// Formatea un monto con su moneda estática respectiva
export function formatearMonedaEstatica(monto, moneda = 'COP', locales = LOC_MONEDA_DEFAULT) {
    const loc = locales[moneda] || 'es-CO';
    return new Intl.NumberFormat(loc, {
        style: 'currency',
        currency: moneda || 'COP',
        minimumFractionDigits: (moneda === 'COP') ? 0 : 2
    }).format(Number(monto) || 0);
}

// Convierte un aporte en moneda extranjera a COP
export function normalizarACOP(montoOriginal, monedaAporte = 'COP', tasas = TASAS_CAMBIO_DEFAULT) {
    return (parseFloat(montoOriginal) || 0) * (tasas[monedaAporte] || 1);
}

// Sanitización de fórmulas para exportaciones a Excel (evita Formula Injection)
export function sanitizarValorExcel(valor) {
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
    const str = String(valor);
    if (str.length > 0) {
        const primerChar = str.charAt(0);
        if (primerChar === '=' || primerChar === '+' || primerChar === '-' || primerChar === '@' || primerChar === '\t' || primerChar === '\r') {
            return `'${str}`;
        }
    }
    return str;
}

import * as XLSX from 'xlsx';

if (typeof window !== 'undefined' && !window.XLSX) {
    window.XLSX = XLSX;
}

export function sanitizarFilaExcel(fila) {
    if (!fila || typeof fila !== 'object') return fila;
    if (Array.isArray(fila)) {
        return fila.map(sanitizarValorExcel);
    }
    const filaLimpia = {};
    for (const [clave, valor] of Object.entries(fila)) {
        filaLimpia[clave] = sanitizarValorExcel(valor);
    }
    return filaLimpia;
}

export function construirLibroExcel(nombreHoja, filas, anchos = []) {
    const x = window.XLSX || XLSX;
    if (!x || !x.utils) return null;
    const filasSeguras = Array.isArray(filas) ? filas.map(sanitizarFilaExcel) : [];
    const hoja = x.utils.json_to_sheet(filasSeguras);
    if (anchos.length) hoja['!cols'] = anchos.map(w => ({ wch: w }));
    const libro = x.utils.book_new();
    x.utils.book_append_sheet(libro, hoja, nombreHoja);
    return libro;
}

export function descargarExcel(nombreArchivo, libro) {
    const x = window.XLSX || XLSX;
    if (!x || !libro) {
        console.error('Librería XLSX no disponible para descargar Excel:', nombreArchivo);
        return false;
    }
    try {
        x.writeFile(libro, nombreArchivo, { compression: true });
        return true;
    } catch (err) {
        console.error('Error en XLSX.writeFile:', err);
        // Fallback usando array buffer y Blob si writeFile falla en ciertos entornos de iframe
        try {
            const wbout = x.write(libro, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreArchivo;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        } catch (blobErr) {
            console.error('Error en fallback Blob de Excel:', blobErr);
            return false;
        }
    }
}

// Formatea valores de auditoría para comparativas
export function formatearValorAuditoria(campo, valor) {
    if (valor === null || valor === undefined || valor === '') return '<em class="text-slate-400 font-normal">vacío</em>';
    if (campo === 'monto') {
        const num = Number(valor);
        return isNaN(num) ? escaparHTML(String(valor)) : escaparHTML(formatearMonedaEstatica(num, 'COP'));
    }
    if (campo === 'activo') {
        return valor ? '<span class="text-emerald-600 font-semibold">Activo</span>' : '<span class="text-rose-600 font-semibold">Inactivo</span>';
    }
    return escaparHTML(String(valor));
}
