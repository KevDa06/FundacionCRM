/**
 * Componente Badge Desacoplado de Grado Empresarial
 * Semántica de estado clara, tipografía controlada y radio geométrico sobrio (6px).
 */

const BADGE_VARIANTS = {
    default: 'ui-badge-info',
    success: 'ui-badge-success',
    warning: 'ui-badge-warning',
    destructive: 'ui-badge-danger',
    muted: 'ui-badge-neutral'
};

export function renderBadge(texto, variante = 'default', icono = '') {
    const claseVariante = BADGE_VARIANTS[variante] || BADGE_VARIANTS.default;
    const iconoHTML = icono ? `<i class="fa-solid ${icono} text-[10px]"></i>` : '';
    return `<span class="ui-badge ${claseVariante}">${iconoHTML}<span>${texto}</span></span>`;
}
