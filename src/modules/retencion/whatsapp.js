/**
 * Submódulo: Enlaces y mensajería de WhatsApp para FundaciónCRM
 */

/**
 * Genera un enlace directo wa.me para WhatsApp con normalización de indicativo de país
 * y codificación segura del mensaje.
 * 
 * @param {string|number} telefono - Número de teléfono del donante.
 * @param {string} mensaje - Texto predeterminado a enviar.
 * @returns {string} URL formateada para WhatsApp Web / App.
 */
export function generarEnlaceWhatsApp(telefono, mensaje) {
    if (!telefono) return '#';
    let telStr = String(telefono).replace(/\D/g, '');
    if (!telStr) return '#';
    if (telStr.length === 10 && telStr.startsWith('3')) {
        telStr = '57' + telStr;
    }
    const msg = encodeURIComponent(mensaje);
    return `https://wa.me/${telStr}?text=${msg}`;
}
