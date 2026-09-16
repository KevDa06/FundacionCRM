export function gestionarBoton(btnElement, accion) {
    if (btnElement.classList.contains('is-loading')) return;
    btnElement.classList.add('is-loading');
    btnElement.disabled = true;
    
    // Simular o ejecutar acción asíncrona
    Promise.resolve(typeof accion === 'function' ? accion() : null)
        .finally(() => {
            // Se restaura el botón tras un breve timeout para mostrar fluidez
            setTimeout(() => {
                btnElement.classList.remove('is-loading');
                btnElement.disabled = false;
            }, 300);
        });
}
