/**
 * Componente de Notificaciones Emergentes y Cuadros de Diálogo (Toasts & Confirmations)
 */
import { escaparHTML } from '../utils/formatters.js';

export function mostrarNotificacion(tipo, titulo, mensaje, callbackConfirmacion = null, opciones = {}) {
    const modal = document.getElementById('modal-notificacion');
    if (!modal) return alert(`${titulo}: ${mensaje}`);

    const estilosTipo = {
        exito: { bgIcon: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: 'fa-check', btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white', labelBtn: 'Aceptar' },
        alerta: { bgIcon: 'bg-amber-50 text-amber-500 border-amber-100', icon: 'fa-triangle-exclamation', btnClass: 'bg-amber-500 hover:bg-amber-600 text-white', labelBtn: 'Entendido' },
        peligro: { bgIcon: 'bg-rose-50 text-rose-600 border-rose-100', icon: 'fa-trash', btnClass: 'bg-rose-600 hover:bg-rose-700 text-white', labelBtn: 'Cerrar' }
    };

    const config = estilosTipo[tipo] || estilosTipo.alerta;
    const labelConfirmar = opciones.labelConfirmar || 'Confirmar';
    const labelCancelar = opciones.labelCancelar || 'Cancelar';
    const btnClassConfirmar = opciones.btnClassConfirmar || config.btnClass;
    const btnClassCancelar = opciones.btnClassCancelar || 'px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-sm rounded-xl transition-all';

    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4 transition-all';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 flex flex-col overflow-hidden" style="max-height: 85vh;">
            <div class="p-6 flex-1 min-h-0 flex flex-col">
                <div class="flex justify-end shrink-0 mb-2">
                    <button type="button" onclick="cerrarNotificacion()" class="ui-icon-btn" aria-label="Cerrar notificación">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                
                <div class="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 border-4 ${config.bgIcon} shrink-0">
                    <i class="fa-solid ${config.icon} text-3xl"></i>
                </div>
                
                <h3 class="font-bold text-lg text-slate-800 text-center mb-4 shrink-0">${escaparHTML(titulo)}</h3>
                
                <div class="overflow-y-auto flex-1 min-h-0 custom-scrollbar text-sm text-slate-700 leading-relaxed px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 whitespace-pre-line">
                    ${escaparHTML(mensaje)}
                </div>

                <div class="mt-6 flex flex-col-reverse sm:flex-row justify-center gap-3 shrink-0">
                    ${callbackConfirmacion ? `
                        <button type="button" id="btn-cancelar-notif-action" class="${btnClassCancelar}">${escaparHTML(labelCancelar)}</button>
                        <button type="button" id="btn-confirmar-notif-action" class="px-5 py-2.5 ${btnClassConfirmar} font-semibold text-sm rounded-xl transition-all shadow-md min-h-[44px]">${escaparHTML(labelConfirmar)}</button>
                    ` : `
                        <button type="button" onclick="cerrarNotificacion()" class="px-8 py-2.5 ${config.btnClass} font-semibold text-sm rounded-xl transition-all shadow-md min-h-[44px]">${config.labelBtn}</button>
                    `}
                </div>
            </div>
        </div>
    `;

    if (callbackConfirmacion) {
        const btnConfirmar = document.getElementById('btn-confirmar-notif-action');
        if (btnConfirmar) {
            btnConfirmar.onclick = () => {
                if (btnConfirmar.disabled) return;
                btnConfirmar.disabled = true;
                btnConfirmar.classList.add('opacity-70', 'cursor-not-allowed');
                cerrarNotificacion();
                callbackConfirmacion();
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
    }

    modal.classList.remove('hidden');
}

export function cerrarNotificacion() {
    const modal = document.getElementById('modal-notificacion');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.zIndex = '';
    }
}
