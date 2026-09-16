/**
 * Utilidades de validación de datos para donantes, donaciones y contactos.
 */

export const CAMPOS_VALIDOS_DONANTE = {
    tipo: ['Natural', 'Juridica'],
    periodicidad: ['Ocasional', 'Mensual', 'Anual'],
    estado: ['Activo', 'Inactivo', 'Retirado']
};

export const PERIODICIDADES_VALIDAS = ['Ocasional', 'Mensual', 'Trimestral', 'Semestral', 'Anual'];
export const MEDIOS_PAGO_VALIDOS = ['Transferencia', 'Efectivo', 'Tarjeta', 'PSE', 'Cheque', 'Otro'];

// Valida formato de correo electrónico
export function validarEmail(email) {
    if (email === null || email === undefined) return true;
    const trimmed = String(email).trim();
    if (trimmed === '') return true;

    // No permitir espacios internos
    if (/\s/.test(trimmed)) return false;

    // No permitir puntos consecutivos
    if (trimmed.includes('..')) return false;

    // Estructura usuario@dominio.tld con extensión de al menos 2 letras
    const regexEmail = /^[a-zA-Z0-9_%+-]+(?:\.[a-zA-Z0-9_%+-]+)*@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;
    return regexEmail.test(trimmed);
}

// Valida número de teléfono (admitiendo formatos colombianos e internacionales)
export function validarTelefono(telefono) {
    if (telefono === null || telefono === undefined) return true;
    const trimmed = String(telefono).trim();
    if (trimmed === '') return true;

    // Permitir opcionalmente '+' al inicio, seguido exclusivamente de dígitos, espacios, guiones y paréntesis
    if (!/^\+?[0-9\s\-()]+$/.test(trimmed)) {
        return false;
    }

    // Si tiene paréntesis, validar estructura básica: máximo 1 par y en orden de apertura/cierre
    const openParen = (trimmed.match(/\(/g) || []).length;
    const closeParen = (trimmed.match(/\)/g) || []).length;
    if (openParen !== closeParen || openParen > 1) {
        return false;
    }
    if (openParen === 1 && trimmed.indexOf('(') >= trimmed.indexOf(')')) {
        return false;
    }

    // Contar únicamente los dígitos
    const soloDigitos = trimmed.replace(/\D/g, '');

    // Exigir entre 7 y 15 dígitos según estándar internacional
    if (soloDigitos.length < 7 || soloDigitos.length > 15) {
        return false;
    }

    return true;
}

// Valida documento de identidad colombiano / NIT
export function validarDocumentoIdentidad(documento) {
    if (!documento) return false;
    const limpio = String(documento).trim();
    return limpio.length >= 3 && limpio.length <= 25;
}
