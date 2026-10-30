/**
 * Componente Panel / Contenedor Modular Responsivo
 * Sobrio, con delimitación nítida, radio controlado (12px) y sin flotaciones excesivas.
 */

export function renderCard({ titulo = '', subtitulo = '', contenido = '', footer = '', claseExtra = '' } = {}) {
    return `
        <div class="@container bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5 shadow-2xs ${claseExtra}">
            ${titulo ? `
                <div class="mb-3.5 pb-2.5 border-b border-slate-100">
                    <h3 class="font-bold text-slate-900 text-sm sm:text-base tracking-tight">${titulo}</h3>
                    ${subtitulo ? `<p class="text-xs text-slate-500 mt-0.5">${subtitulo}</p>` : ''}
                </div>
            ` : ''}
            <div class="card-body">
                ${contenido}
            </div>
            ${footer ? `
                <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    ${footer}
                </div>
            ` : ''}
        </div>
    `;
}
