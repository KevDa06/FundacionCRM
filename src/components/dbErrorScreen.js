/**
 * Componente Manejador de Error de Inicialización y Estado de Conexión de Supabase
 * Bloquea la interfaz cuando Supabase no responde o no está configurado en producción.
 * Gestiona además los indicadores visuales discretos de Modo Mock en desarrollo.
 */

/**
 * Muestra una pantalla crítica y bloqueante de error de conexión con la base de datos.
 * Impide cualquier interacción con el sistema para proteger la integridad de los datos.
 */
export function mostrarErrorConexionDB({
    titulo = 'Error de Conexión: No se pudo conectar con el servidor de base de datos.',
    mensaje = 'No fue posible establecer conexión con el servidor de base de datos en entorno de producción.',
    detalle = null,
    onReintentar = null
} = {}) {
    let overlay = document.getElementById('pantalla-error-conexion');

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'pantalla-error-conexion';
        overlay.className = 'fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fade-in';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-8 text-center border border-rose-100 relative">
            <div class="w-16 h-16 mx-auto rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mb-5 shadow-sm">
                <i class="fa-solid fa-triangle-exclamation text-3xl"></i>
            </div>
            
            <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900 mb-3 tracking-tight leading-snug">
                ${escaparTexto(titulo)}
            </h2>
            
            <p class="text-xs sm:text-sm text-slate-600 mb-5 leading-relaxed">
                ${escaparTexto(mensaje)}
            </p>

            <div class="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 mb-5 text-left flex items-start space-x-3">
                <i class="fa-solid fa-shield-halved text-amber-600 mt-0.5 shrink-0 text-sm"></i>
                <div class="text-xs text-amber-900 leading-relaxed">
                    <strong class="font-bold block mb-0.5">Protección de Datos Activa</strong>
                    Para prevenir la pérdida de datos o registros desincronizados, el almacenamiento local temporal en el navegador (localStorage) ha sido bloqueado en este entorno.
                </div>
            </div>

            ${detalle ? `
            <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6 text-left">
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Detalle Técnico</span>
                <code class="text-xs text-slate-700 font-mono break-all whitespace-pre-wrap block leading-relaxed">${escaparTexto(detalle)}</code>
            </div>
            ` : ''}

            <div class="space-y-3">
                <button type="button" id="btn-reintentar-conexion-db" class="w-full py-3.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-rose-600/25 flex items-center justify-center cursor-pointer">
                    <i class="fa-solid fa-rotate mr-2"></i> Reintentar Conexión
                </button>
            </div>

            <p class="text-[11px] text-slate-400 mt-5 leading-normal">
                Si eres desarrollador y deseas habilitar pruebas locales, configure <code>VITE_ENABLE_MOCK=true</code> en sus variables de entorno.
            </p>
        </div>
    `;

    overlay.classList.remove('hidden');

    const btnReintentar = document.getElementById('btn-reintentar-conexion-db');
    if (btnReintentar) {
        btnReintentar.onclick = () => {
            if (typeof onReintentar === 'function') {
                onReintentar();
            } else {
                window.location.reload();
            }
        };
    }

    // Desactivar o cubrir el lock-screen para prevenir que el usuario intente autenticarse en vacío
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen) {
        const inputs = lockScreen.querySelectorAll('input, button');
        inputs.forEach(el => el.setAttribute('disabled', 'true'));
    }
}

/**
 * Oculta la pantalla crítica de error de conexión.
 */
export function ocultarErrorConexionDB() {
    const overlay = document.getElementById('pantalla-error-conexion');
    if (overlay) {
        overlay.classList.add('hidden');
    }
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen) {
        const inputs = lockScreen.querySelectorAll('input, button');
        inputs.forEach(el => el.removeAttribute('disabled'));
    }
}

/**
 * Actualiza los indicadores visuales en la interfaz según el modo activo (Mock vs Real).
 * - En modo Mock: Muestra "⚠️ Modo Mock Activo (Datos Locales)" de manera discreta en Header, Footer y Pantalla de Bloqueo.
 * - En modo Real: Oculta los badges de mock y mantiene el estado conectado de Supabase.
 */
export function actualizarIndicadorMockUI(isMockActive) {
    const headerMockBadge = document.getElementById('badge-modo-mock');
    const lockMockBadge = document.getElementById('lockscreen-modo-mock');
    const sidebarMockBadge = document.getElementById('sidebar-modo-mock');
    const statusDb = document.getElementById('status-db');

    if (isMockActive) {
        if (headerMockBadge) {
            headerMockBadge.classList.remove('hidden');
            headerMockBadge.classList.add('flex');
        }
        if (lockMockBadge) {
            lockMockBadge.classList.remove('hidden');
        }
        if (sidebarMockBadge) {
            sidebarMockBadge.classList.remove('hidden');
        }
        if (statusDb) {
            statusDb.innerText = 'Modo Mock (Datos Locales)';
            statusDb.className = 'text-xs font-semibold text-amber-700';
            if (statusDb.previousElementSibling) {
                statusDb.previousElementSibling.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
            }
            if (statusDb.parentElement) {
                statusDb.parentElement.className = 'flex items-center space-x-2 bg-amber-50 px-3.5 py-1.5 rounded-full border border-amber-200';
            }
        }
    } else {
        if (headerMockBadge) {
            headerMockBadge.classList.add('hidden');
            headerMockBadge.classList.remove('flex');
        }
        if (lockMockBadge) {
            lockMockBadge.classList.add('hidden');
        }
        if (sidebarMockBadge) {
            sidebarMockBadge.classList.add('hidden');
        }
        if (statusDb) {
            statusDb.innerText = 'Sistema en línea';
            statusDb.className = 'text-xs font-semibold text-emerald-700';
            if (statusDb.previousElementSibling) {
                statusDb.previousElementSibling.className = 'w-2 h-2 rounded-full bg-emerald-500';
            }
            if (statusDb.parentElement) {
                statusDb.parentElement.className = 'flex items-center space-x-2 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100';
            }
        }
    }
}

function escaparTexto(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = String(str);
    return div.innerHTML;
}
