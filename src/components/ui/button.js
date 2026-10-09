/**
 * Componente Botón Desacoplado de Grado Empresarial (shadcn/ui inspired)
 * Cumple con WCAG 2.2, Cero CLS (Grid-Stacking), microinteracciones y guardas de idempotencia.
 */

/**
 * Ejecuta una acción de botón con protección estricta contra doble envío (idempotencia)
 * y estabilidad estructural cero CLS mediante CSS Grid Stacking.
 * 
 * @param {HTMLButtonElement} btnElement - Elemento botón del DOM.
 * @param {Function} asyncAction - Acción asíncrona a ejecutar.
 */
export function ejecutarBotonIdempotente(btnElement, asyncAction) {
    if (!btnElement || btnElement.disabled || btnElement.classList.contains('is-loading')) {
        return;
    }

    // Guarda de estado visual y funcional inmediata
    btnElement.disabled = true;
    btnElement.setAttribute('aria-busy', 'true');
    btnElement.classList.add('is-loading');

    // Ejecución segura de la acción
    return Promise.resolve()
        .then(() => typeof asyncAction === 'function' ? asyncAction() : null)
        .catch((error) => {
            console.error('[Button Action Error]:', error);
            throw error;
        })
        .finally(() => {
            // Breve amortiguación visual para asegurar feedback táctil fluido
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
 * Renderiza la estructura interna con Grid-Stacking para cero Cumulative Layout Shift (CLS).
 * 
 * @param {string} contenidoHTML - Texto o iconos del botón.
 * @param {string} spinnerHTML - Icono o indicador de carga alternativo.
 * @returns {string} Markup HTML optimizado.
 */
export function renderizarContenidoBotonGridStack(contenidoHTML, spinnerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>') {
    return `
        <span class="btn-grid-stack w-full h-full">
            <span class="btn-content inline-flex items-center justify-center space-x-2">
                ${contenidoHTML}
            </span>
            <span class="btn-spinner inline-flex items-center justify-center space-x-2" aria-hidden="true">
                ${spinnerHTML}
            </span>
        </span>
    `;
}
