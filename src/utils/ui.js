import { escaparHTML } from './formatters.js';

/**
 * Control defensivo de botones con protección de doble envío (idempotencia),
 * estabilidad cero CLS y estado accesible aria-busy.
 */
export function gestionarBoton(btnElement, accion) {
    if (!btnElement || btnElement.disabled || btnElement.classList.contains('is-loading')) return;
    btnElement.classList.add('is-loading');
    btnElement.disabled = true;
    btnElement.setAttribute('aria-busy', 'true');
    
    return Promise.resolve()
        .then(() => typeof accion === 'function' ? accion() : null)
        .catch((err) => {
            console.error('[Action Error]:', err);
            throw err;
        })
        .finally(() => {
            setTimeout(() => {
                if (btnElement) {
                    btnElement.classList.remove('is-loading');
                    btnElement.disabled = false;
                    btnElement.removeAttribute('aria-busy');
                }
            }, 250);
        });
}

/**
 * Función debounce utilitaria para búsquedas e inputs de alta frecuencia.
 */
export function debounce(func, wait = 250) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Genera el HTML de un nombre de donante interactivo que abre su Ficha 360°.
 * Cumple WCAG 2.2 (área táctil mínima y foco visible) sin alterar la estabilidad del diseño.
 */
export function crearBotonNombreDonanteHTML(donanteId, nombre, opciones = {}) {
    const {
        className = 'font-bold text-slate-800 text-sm',
        title = 'Ver información completa del donante',
        onClickPrefix = '',
        contenidoHtml = null
    } = opciones;

    const contenidoSeguro = contenidoHtml !== null
        ? contenidoHtml
        : `<span class="truncate">${escaparHTML(nombre || 'Sin nombre registrado')}</span>`;

    if (!donanteId) {
        return `<div class="${className}">${contenidoSeguro}</div>`;
    }

    const idSeguro = escaparHTML(donanteId);
    const prefijo = onClickPrefix ? `${onClickPrefix} ` : '';
    return `<button type="button" onclick="${prefijo}verDetalleDonante('${idSeguro}')" class="inline-flex items-center gap-1.5 max-w-full min-w-0 text-left ${className} hover:text-[#003B73] hover:underline cursor-pointer transition-colors min-h-[28px] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003B73]" title="${escaparHTML(title)}">${contenidoSeguro}</button>`;
}
