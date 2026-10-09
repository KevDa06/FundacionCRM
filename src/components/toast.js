/**
 * Componente Enterprise de Notificaciones Flotantes (Toasts) y Modales de Confirmación
 * - Notificaciones no intrusivas con auto-cierre, pausa en hover y barra de progreso regresiva.
 * - Modales de diálogo accesibles (WCAG 2.2) para confirmaciones críticas con prevención de doble envío.
 * - Cero Cumulative Layout Shift (CLS) con CSS Grid Stacking.
 * - Registro automático en el historial del store para consulta en el Centro Operativo / Resumen.
 */
import { escaparHTML } from '../utils/formatters.js';
import { agregarNotificacionHistorial } from '../state/store.js';

// Configuración de paleta semántica y estilos OKLCH
const ESTILOS_TIPO = {
    exito: {
        nombre: 'Éxito',
        icon: 'fa-circle-check',
        colorIcon: 'text-emerald-600',
        bgIcon: 'bg-emerald-50 border-emerald-200',
        borderCard: 'border-emerald-200/80',
        bgBar: 'bg-emerald-500',
        btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        labelBtn: 'Aceptar'
    },
    alerta: {
        nombre: 'Atención',
        icon: 'fa-triangle-exclamation',
        colorIcon: 'text-amber-600',
        bgIcon: 'bg-amber-50 border-amber-200',
        borderCard: 'border-amber-200/80',
        bgBar: 'bg-amber-500',
        btnClass: 'bg-amber-500 hover:bg-amber-600 text-white',
        labelBtn: 'Entendido'
    },
    peligro: {
        nombre: 'Error / Crítico',
        icon: 'fa-circle-exclamation',
        colorIcon: 'text-rose-600',
        bgIcon: 'bg-rose-50 border-rose-200',
        borderCard: 'border-rose-200/80',
        bgBar: 'bg-rose-500',
        btnClass: 'bg-rose-600 hover:bg-rose-700 text-white',
        labelBtn: 'Cerrar'
    },
    informacion: {
        nombre: 'Información',
        icon: 'fa-circle-info',
        colorIcon: 'text-blue-600',
        bgIcon: 'bg-blue-50 border-blue-200',
        borderCard: 'border-blue-200/80',
        bgBar: 'bg-blue-500',
        btnClass: 'bg-blue-600 hover:bg-blue-700 text-white',
        labelBtn: 'Aceptar'
    },
    info: {
        nombre: 'Información',
        icon: 'fa-circle-info',
        colorIcon: 'text-blue-600',
        bgIcon: 'bg-blue-50 border-blue-200',
        borderCard: 'border-blue-200/80',
        bgBar: 'bg-blue-500',
        btnClass: 'bg-blue-600 hover:bg-blue-700 text-white',
        labelBtn: 'Aceptar'
    }
};

/**
 * Síntesis de audio no invasiva (Web Audio API) para feedback sensorial sutil
 */
function emitirFeedbackSonoro(tipo) {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0.025, t);

        if (tipo === 'exito') {
            osc.frequency.setValueAtTime(523.25, t); // C5
            osc.frequency.exponentialRampToValueAtTime(659.25, t + 0.08); // E5
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
        } else if (tipo === 'alerta') {
            osc.frequency.setValueAtTime(440, t); // A4
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
            osc.start(t);
            osc.stop(t + 0.18);
        } else if (tipo === 'peligro') {
            osc.frequency.setValueAtTime(329.63, t); // E4
            osc.frequency.exponentialRampToValueAtTime(261.63, t + 0.1); // C4
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
            osc.start(t);
            osc.stop(t + 0.22);
        }
    } catch (_) {
        // Modo silencioso pasivo si el navegador bloquea audio
    }
}

/**
 * Obtiene o crea el contenedor de Toasts en el DOM
 */
function asegurarContenedorToasts() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed top-4 right-4 z-[280] flex flex-col gap-3 max-w-sm sm:max-w-md w-full pointer-events-none px-4 sm:px-0';
        container.setAttribute('role', 'region');
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-label', 'Notificaciones del sistema');
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Renderiza un Toast Flotante interactivo no-bloqueante
 */
function mostrarToastFlotante(tipo, titulo, mensaje, opciones = {}) {
    const container = asegurarContenedorToasts();
    const config = ESTILOS_TIPO[tipo] || ESTILOS_TIPO.informacion;
    const duracion = typeof opciones.duracion === 'number' ? opciones.duracion : 4500;
    const toastId = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const toastEl = document.createElement('div');
    toastEl.id = toastId;
    toastEl.className = `toast-item pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border ${config.borderCard} p-4 flex flex-col overflow-hidden animate-toast-in interactive-element transition-all`;
    toastEl.setAttribute('role', 'status');

    toastEl.innerHTML = `
        <div class="flex items-start gap-3 w-full">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${config.bgIcon}">
                <i class="fa-solid ${config.icon} text-lg ${config.colorIcon}"></i>
            </div>
            <div class="flex-1 min-w-0 pr-1">
                <div class="flex items-center justify-between gap-2 mb-0.5">
                    <h4 class="text-sm font-bold text-slate-800 truncate">${escaparHTML(titulo)}</h4>
                    <span class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${config.bgIcon} ${config.colorIcon}">${config.nombre}</span>
                </div>
                <p class="text-xs text-slate-600 leading-relaxed break-words line-clamp-3">${escaparHTML(mensaje)}</p>
            </div>
            <button type="button" class="btn-cerrar-toast min-touch-target -mr-2 -mt-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 rounded-xl transition-colors shrink-0" aria-label="Cerrar notificación">
                <i class="fa-solid fa-xmark text-sm"></i>
            </button>
        </div>
        <div class="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-3">
            <div class="toast-progress h-full ${config.bgBar} rounded-full" style="width: 100%;"></div>
        </div>
    `;

    container.appendChild(toastEl);
    emitirFeedbackSonoro(tipo);

    // Lógica de temporización y pausa en hover
    let tiempoRestante = duracion;
    let tiempoInicio = Date.now();
    let temporizador = null;
    const progressBar = toastEl.querySelector('.toast-progress');

    if (progressBar) {
        progressBar.style.transition = `width ${duracion}ms linear`;
        // Forzar reflow para disparar la transición
        void progressBar.offsetWidth;
        progressBar.style.width = '0%';
    }

    const removerToast = () => {
        if (!toastEl || !toastEl.parentElement) return;
        toastEl.classList.remove('animate-toast-in');
        toastEl.classList.add('animate-toast-out');
        setTimeout(() => {
            if (toastEl.parentElement) {
                toastEl.parentElement.removeChild(toastEl);
            }
        }, 250);
    };

    const iniciarTemporizador = () => {
        tiempoInicio = Date.now();
        temporizador = setTimeout(removerToast, tiempoRestante);
    };

    const pausarTemporizador = () => {
        if (temporizador) clearTimeout(temporizador);
        const transcurrido = Date.now() - tiempoInicio;
        tiempoRestante = Math.max(0, tiempoRestante - transcurrido);
        if (progressBar) {
            const anchoActual = window.getComputedStyle(progressBar).width;
            progressBar.style.transition = 'none';
            progressBar.style.width = anchoActual;
        }
    };

    const reanudarTemporizador = () => {
        if (tiempoRestante <= 0) {
            removerToast();
            return;
        }
        if (progressBar) {
            progressBar.style.transition = `width ${tiempoRestante}ms linear`;
            progressBar.style.width = '0%';
        }
        iniciarTemporizador();
    };

    iniciarTemporizador();

    toastEl.addEventListener('mouseenter', pausarTemporizador);
    toastEl.addEventListener('mouseleave', reanudarTemporizador);

    const btnCerrar = toastEl.querySelector('.btn-cerrar-toast');
    if (btnCerrar) {
        btnCerrar.onclick = (e) => {
            e.stopPropagation();
            if (temporizador) clearTimeout(temporizador);
            removerToast();
        };
    }
}

/**
 * Muestra el Modal de Diálogo para Confirmaciones Críticas (Accesible & Zero-CLS)
 */
function mostrarModalConfirmacion(tipo, titulo, mensaje, callbackConfirmacion, opciones = {}) {
    let modal = document.getElementById('modal-notificacion');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-notificacion';
        document.body.appendChild(modal);
    }

    const config = ESTILOS_TIPO[tipo] || ESTILOS_TIPO.peligro;
    const labelConfirmar = opciones.labelConfirmar || 'Confirmar';
    const labelCancelar = opciones.labelCancelar || 'Cancelar';
    const btnClassConfirmar = opciones.btnClassConfirmar || config.btnClass;
    const btnClassCancelar = opciones.btnClassCancelar || 'px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-all border border-slate-200';

    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[260] flex items-center justify-center p-4 transition-all animate-fade-in';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'notif-modal-title');
    modal.setAttribute('aria-describedby', 'notif-modal-desc');

    modal.innerHTML = `
        <div class="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-fade-in @container" style="max-height: 90vh;">
            <div class="p-6 sm:p-8 flex-1 min-h-0 flex flex-col">
                <div class="flex justify-between items-center shrink-0 mb-4">
                    <span class="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${config.bgIcon} ${config.colorIcon}">
                        ${config.nombre}
                    </span>
                    <button type="button" onclick="cerrarNotificacion()" class="min-touch-target -mr-2 -mt-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-blue-600" aria-label="Cerrar cuadro de diálogo">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <div class="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 border-2 ${config.bgIcon} shrink-0 shadow-sm">
                    <i class="fa-solid ${config.icon} text-3xl ${config.colorIcon}"></i>
                </div>

                <h3 id="notif-modal-title" class="font-bold text-xl text-slate-900 text-center mb-3 shrink-0 tracking-tight">
                    ${escaparHTML(titulo)}
                </h3>

                <div id="notif-modal-desc" class="overflow-y-auto flex-1 min-h-0 custom-scrollbar text-sm text-slate-600 leading-relaxed px-4 py-3 bg-slate-50/80 rounded-2xl border border-slate-200/80 whitespace-pre-line text-center">
                    ${escaparHTML(mensaje)}
                </div>

                <div class="mt-6 flex flex-col-reverse sm:flex-row justify-center gap-3 shrink-0">
                    <button type="button" id="btn-cancelar-notif-action" class="${btnClassCancelar} min-touch-target interactive-element w-full sm:w-auto">
                        ${escaparHTML(labelCancelar)}
                    </button>
                    <button type="button" id="btn-confirmar-notif-action" class="min-touch-target px-6 py-2.5 ${btnClassConfirmar} font-semibold text-sm rounded-xl transition-all shadow-md interactive-element btn-grid-stack w-full sm:w-auto">
                        <span class="btn-content">${escaparHTML(labelConfirmar)}</span>
                        <i class="fa-solid fa-spinner fa-spin btn-spinner"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    emitirFeedbackSonoro(tipo);

    const btnConfirmar = document.getElementById('btn-confirmar-notif-action');
    if (btnConfirmar) {
        btnConfirmar.onclick = async () => {
            if (btnConfirmar.disabled) return;
            // Prevención estricta de doble envío (Idempotencia)
            btnConfirmar.disabled = true;
            btnConfirmar.classList.add('is-loading', 'opacity-60', 'cursor-not-allowed');

            try {
                if (typeof callbackConfirmacion === 'function') {
                    await callbackConfirmacion();
                }
            } catch (err) {
                console.error('Error al ejecutar callback de confirmación:', err);
            } finally {
                cerrarNotificacion();
            }
        };
    }

    const btnCancelar = document.getElementById('btn-cancelar-notif-action');
    if (btnCancelar) {
        btnCancelar.onclick = () => {
            cerrarNotificacion();
            if (typeof opciones.callbackCancelar === 'function') {
                opciones.callbackCancelar();
            }
        };
    }

    modal.classList.remove('hidden');
}

/**
 * Punto de entrada principal para el Sistema de Notificaciones
 * - Si recibe callbackConfirmacion o se solicita forzarModal: muestra modal de confirmación centrado y accesible.
 * - De lo contrario: muestra Toast flotante sin interrumpir el flujo del usuario.
 * - Registra siempre la notificación en el historial de la sesión para el Centro Operativo.
 */
export function mostrarNotificacion(tipo, titulo, mensaje, callbackConfirmacion = null, opciones = {}) {
    const tipoNormalizado = (tipo || 'info').toLowerCase();

    // 1. Registro automático en el historial de notificaciones
    agregarNotificacionHistorial({
        tipo: tipoNormalizado,
        titulo: titulo || 'Aviso',
        mensaje: mensaje || '',
        fecha: new Date().toISOString()
    });

    // 2. Discriminación de flujo UX: Confirmación crítica vs Feedback no-bloqueante
    if (typeof callbackConfirmacion === 'function' || opciones.forzarModal === true) {
        mostrarModalConfirmacion(tipoNormalizado, titulo, mensaje, callbackConfirmacion, opciones);
    } else {
        mostrarToastFlotante(tipoNormalizado, titulo, mensaje, opciones);
    }
}

/**
 * Cierra el modal de diálogo de confirmación
 */
export function cerrarNotificacion() {
    const modal = document.getElementById('modal-notificacion');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.zIndex = '';
    }
}

/**
 * Limpia todos los toasts actualmente visibles
 */
export function limpiarTodosLosToasts() {
    const container = document.getElementById('toast-container');
    if (container) {
        container.innerHTML = '';
    }
}

/**
 * Helper de alto nivel para confirmaciones destructivas o de seguridad
 */
export function confirmarAccion({ titulo, mensaje, tipo = 'peligro', labelConfirmar, labelCancelar, onConfirmar, onCancelar }) {
    mostrarNotificacion(tipo, titulo, mensaje, onConfirmar, {
        labelConfirmar,
        labelCancelar,
        callbackCancelar: onCancelar,
        forzarModal: true
    });
}
