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

