/**
 * Componente de Estados de Carga (Skeletons, Spinners e Indicadores de Sincronización)
 */
import { isSupabaseConfigured } from '../services/supabase.js';

export function actualizarEstadoDB(texto = null, tipo = 'auto') {
    const statusEl = document.getElementById('status-db');
    if (!statusEl) return;

    if (tipo === 'sincronizando') {
        statusEl.innerText = texto || 'Sincronizando DB...';
        statusEl.className = 'text-xs font-semibold text-slate-500 animate-pulse';
        if (statusEl.previousElementSibling) {
            statusEl.previousElementSibling.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';
        }
        return;
    }

    if (!isSupabaseConfigured) {
        statusEl.innerText = texto || 'Modo Local (Demo)';
        statusEl.className = 'text-xs font-semibold text-blue-700';
        if (statusEl.previousElementSibling) {
            statusEl.previousElementSibling.className = 'w-2 h-2 rounded-full bg-blue-500';
        }
    } else {
        statusEl.innerText = texto || 'Sistema en línea';
        statusEl.className = 'text-xs font-semibold text-emerald-700';
        if (statusEl.previousElementSibling) {
            statusEl.previousElementSibling.className = 'w-2 h-2 rounded-full bg-emerald-500';
        }
    }
}

export function renderizarEstadoVacioTabla(colSpan, icono = 'fa-inbox', titulo = 'Sin registros', subtitulo = 'No hay información para mostrar con los filtros aplicados.') {
    return `<tr>
        <td colspan="${colSpan}" class="px-6 py-12 text-center">
            <div class="flex flex-col items-center justify-center max-w-sm mx-auto">
                <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                    <i class="fa-solid ${icono} text-xl"></i>
                </div>
                <p class="font-bold text-slate-700 text-sm mb-1">${titulo}</p>
                <p class="text-xs text-slate-400">${subtitulo}</p>
            </div>
        </td>
    </tr>`;
}
