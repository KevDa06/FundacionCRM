/**
 * Componente Card Modular y Contenedor Responsivo (@container)
 */

export function renderCard({ titulo = '', subtitulo = '', contenido = '', footer = '', claseExtra = '' } = {}) {
    return `
        <div class="@container bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-6 shadow-sm transition-all hover:shadow-md ${claseExtra}">
            ${titulo ? `
                <div class="mb-4">
                    <h3 class="font-bold text-slate-900 text-base @[400px]:text-lg tracking-tight">${titulo}</h3>
                    ${subtitulo ? `<p class="text-xs text-slate-500 mt-0.5">${subtitulo}</p>` : ''}
                </div>
            ` : ''}
            <div class="card-body">
                ${contenido}
            </div>
            ${footer ? `
                <div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    ${footer}
                </div>
            ` : ''}
        </div>
    `;
}
