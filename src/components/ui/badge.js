/**
 * Componente Badge Desacoplado basado en tokens semánticos OKLCH
 */

const BADGE_VARIANTS = {
    default: 'bg-primary-50 text-primary-700 border-primary-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    destructive: 'bg-rose-50 text-rose-700 border-rose-200',
    muted: 'bg-slate-100 text-slate-700 border-slate-200'
};

export function renderBadge(texto, variante = 'default', icono = '') {
    const claseVariante = BADGE_VARIANTS[variante] || BADGE_VARIANTS.default;
    const iconoHTML = icono ? `<i class="fa-solid ${icono} mr-1 text-[10px]"></i>` : '';
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${claseVariante} transition-colors">${iconoHTML}${texto}</span>`;
}
