/**
 * Motor Visual de Spotlight y Ventana Contextual de Tutorial (FundaciónCRM)
 * Resalta elementos reales de la interfaz, posiciona la tarjeta explicativa de forma
 * inteligente y responsiva, y gestiona la barra de estado pausado.
 */
import { escaparHTML } from '../../utils/formatters.js';

let resizeObserver = null;
let resizeListener = null;
let scrollListener = null;
let keydownListener = null;
let rafRepositionId = null;

function getRootContainer() {
    let root = document.getElementById('tutorial-system-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'tutorial-system-root';
        document.body.appendChild(root);
    }
    return root;
}

function getTargetRect(targetSelector) {
    if (!targetSelector || targetSelector === 'center') return null;
    const el = document.querySelector(targetSelector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return { el, rect };
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function calcularPosicionPopover(targetRect, popoverEl, preferredPlacement = 'bottom') {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 14;
    const gap = 14;

    const popRect = popoverEl.getBoundingClientRect();
    const popW = popRect.width || Math.min(380, vw - margin * 2);
    const popH = popRect.height || 300;

    // En pantallas pequeñas o cuando no hay target visible, anclar abajo o centrado de forma segura
    if (!targetRect || vw < 640) {
        const left = clamp((vw - popW) / 2, margin, Math.max(margin, vw - popW - margin));
        let top;
        if (targetRect && targetRect.top > vh * 0.52) {
            top = clamp(margin + 8, margin, Math.max(margin, vh - popH - margin));
        } else {
            top = clamp(vh - popH - margin - 8, margin, Math.max(margin, vh - popH - margin));
        }
        return { top, left };
    }

    const candidates = {
        bottom: {
            top: targetRect.bottom + gap,
            left: targetRect.left + targetRect.width / 2 - popW / 2,
            fits: targetRect.bottom + gap + popH + margin <= vh
        },
        top: {
            top: targetRect.top - gap - popH,
            left: targetRect.left + targetRect.width / 2 - popW / 2,
            fits: targetRect.top - gap - popH >= margin
        },
        right: {
            top: targetRect.top + targetRect.height / 2 - popH / 2,
            left: targetRect.right + gap,
            fits: targetRect.right + gap + popW + margin <= vw
        },
        left: {
            top: targetRect.top + targetRect.height / 2 - popH / 2,
            left: targetRect.left - gap - popW,
            fits: targetRect.left - gap - popW >= margin
        }
    };

    const order = [preferredPlacement, 'bottom', 'top', 'right', 'left']
        .filter((v, i, a) => v && a.indexOf(v) === i);

    let chosen = null;
    for (const dir of order) {
        if (candidates[dir] && candidates[dir].fits) {
            chosen = candidates[dir];
            break;
        }
    }

    if (!chosen) {
        const spaceBelow = vh - targetRect.bottom;
        const spaceAbove = targetRect.top;
        chosen = spaceBelow >= spaceAbove ? candidates.bottom : candidates.top;
    }

    return {
        top: clamp(chosen.top, margin, Math.max(margin, vh - popH - margin)),
        left: clamp(chosen.left, margin, Math.max(margin, vw - popW - margin))
    };
}

function posicionarElementosSpotlight(targetSelector, preferredPlacement) {
    const overlay = document.getElementById('tutorial-spotlight-overlay');
    const ring = document.getElementById('tutorial-spotlight-ring');
    const popover = document.getElementById('tutorial-spotlight-popover');
    if (!overlay || !ring || !popover) return;

    const info = getTargetRect(targetSelector);
    if (info) {
        const pad = 6;
        const { rect } = info;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const left = clamp(rect.left - pad, 4, vw - 20);
        const top = clamp(rect.top - pad, 4, vh - 20);
        const width = Math.max(24, Math.min(rect.width + pad * 2, vw - left - 4));
        const height = Math.max(24, Math.min(rect.height + pad * 2, vh - top - 4));

        ring.style.display = 'block';
        ring.style.left = `${left}px`;
        ring.style.top = `${top}px`;
        ring.style.width = `${width}px`;
        ring.style.height = `${height}px`;
        overlay.classList.remove('tutorial-backdrop-solid');

        const pos = calcularPosicionPopover(
            { top, left, right: left + width, bottom: top + height, width, height },
            popover,
            preferredPlacement
        );
        popover.style.top = `${pos.top}px`;
        popover.style.left = `${pos.left}px`;
    } else {
        ring.style.display = 'none';
        overlay.classList.add('tutorial-backdrop-solid');
        const pos = calcularPosicionPopover(null, popover, 'center');
        popover.style.top = `${pos.top}px`;
        popover.style.left = `${pos.left}px`;
    }
}

function desvincularListenersSpotlight() {
    if (rafRepositionId) {
        cancelAnimationFrame(rafRepositionId);
        rafRepositionId = null;
    }
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    if (resizeListener) {
        window.removeEventListener('resize', resizeListener);
        resizeListener = null;
    }
    if (scrollListener) {
        window.removeEventListener('scroll', scrollListener, true);
        scrollListener = null;
    }
    if (keydownListener) {
        document.removeEventListener('keydown', keydownListener);
        keydownListener = null;
    }
}

/**
 * Muestra un paso del tutorial con spotlight sobre el elemento destino.
 */
export function mostrarPasoSpotlight({
    paso,
    indice,
    total,
    tituloRecorrido,
    callbacks
}) {
    const root = getRootContainer();
    desvincularListenersSpotlight();

    // Asegurar que el elemento destino entre suavemente en la vista si existe
    const targetEl = paso.target && paso.target !== 'center' ? document.querySelector(paso.target) : null;
    if (targetEl && typeof targetEl.scrollIntoView === 'function') {
        try {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch (_e) {
            targetEl.scrollIntoView();
        }
    }

    const porcentaje = Math.round(((indice + 1) / Math.max(total, 1)) * 100);
    const esPrimero = indice === 0;
    const esUltimo = indice === total - 1;

    const listaComoUsar = Array.isArray(paso.comoUsar) && paso.comoUsar.length > 0
        ? `<ol class="tutorial-steps-list">${paso.comoUsar.map(item => `<li>${escaparHTML(item)}</li>`).join('')}</ol>`
        : '';

    const bloqueEjemplo = paso.ejemplo
        ? `
            <div class="tutorial-example-box">
                <span class="tutorial-example-label">Ejemplo práctico</span>
                <p class="tutorial-example-text">${escaparHTML(paso.ejemplo)}</p>
            </div>
        `
        : '';

    root.innerHTML = `
        <div id="tutorial-spotlight-overlay" class="tutorial-spotlight-overlay" role="presentation" aria-hidden="true"></div>
        <div id="tutorial-spotlight-ring" class="tutorial-spotlight-ring" aria-hidden="true"></div>
        <section id="tutorial-spotlight-popover" class="tutorial-popover" role="dialog" aria-modal="true" aria-labelledby="tutorial-step-title" tabindex="-1">
            <header class="tutorial-popover-header">
                <div class="tutorial-popover-meta">
                    <span class="tutorial-module-tag">${escaparHTML(paso.seccionTitulo || tituloRecorrido || 'Guía de uso')}</span>
                    <span class="tutorial-step-counter">Paso ${indice + 1} de ${total}</span>
                </div>
                <button type="button" id="btn-tutorial-salir-x" class="ui-icon-btn" title="Salir del tutorial (Esc)" aria-label="Salir del tutorial">
                    <i class="fa-solid fa-xmark text-xs"></i>
                </button>
            </header>

            <div class="tutorial-progress-track" aria-hidden="true">
                <div class="tutorial-progress-fill" style="width: ${porcentaje}%"></div>
            </div>

            <div class="tutorial-popover-body">
                <h3 id="tutorial-step-title" class="tutorial-step-title">${escaparHTML(paso.titulo)}</h3>
                <p class="tutorial-step-desc">${escaparHTML(paso.queEs)}</p>

                ${listaComoUsar ? `
                    <div class="tutorial-howto-block">
                        <span class="tutorial-section-label">Cómo se utiliza</span>
                        ${listaComoUsar}
                    </div>
                ` : ''}

                ${bloqueEjemplo}
            </div>

            <footer class="tutorial-popover-footer">
                <div class="tutorial-footer-secondary">
                    <button type="button" id="btn-tutorial-pausar" class="btn btn-ghost btn-sm min-h-[44px]" title="Pausar para practicar en la pantalla">
                        <i class="fa-solid fa-pause text-[11px]"></i>
                        <span>Pausar</span>
                    </button>
                    <button type="button" id="btn-tutorial-salir" class="btn btn-ghost btn-sm min-h-[44px]">
                        <span>Salir</span>
                    </button>
                </div>
                <div class="tutorial-footer-primary">
                    <button type="button" id="btn-tutorial-anterior" class="btn btn-secondary btn-sm min-h-[44px]" ${esPrimero ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-left text-[11px]"></i>
                        <span>Anterior</span>
                    </button>
                    <button type="button" id="btn-tutorial-siguiente" class="btn btn-accent btn-sm min-h-[44px]">
                        <span>${esUltimo ? 'Finalizar' : 'Siguiente'}</span>
                        ${esUltimo ? '<i class="fa-solid fa-check text-[11px]"></i>' : '<i class="fa-solid fa-chevron-right text-[11px]"></i>'}
                    </button>
                </div>
            </footer>
        </section>
    `;

    // Conectar eventos
    const btnPrev = document.getElementById('btn-tutorial-anterior');
    const btnNext = document.getElementById('btn-tutorial-siguiente');
    const btnPause = document.getElementById('btn-tutorial-pausar');
    const btnExit = document.getElementById('btn-tutorial-salir');
    const btnExitX = document.getElementById('btn-tutorial-salir-x');
    const overlay = document.getElementById('tutorial-spotlight-overlay');
    const popover = document.getElementById('tutorial-spotlight-popover');

    if (btnPrev && !esPrimero) btnPrev.addEventListener('click', () => callbacks.onAnterior?.());
    if (btnNext) btnNext.addEventListener('click', () => callbacks.onSiguiente?.());
    if (btnPause) btnPause.addEventListener('click', () => callbacks.onPausar?.());
    if (btnExit) btnExit.addEventListener('click', () => callbacks.onSalir?.());
    if (btnExitX) btnExitX.addEventListener('click', () => callbacks.onSalir?.());
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    const scheduleReposition = () => {
        if (rafRepositionId) cancelAnimationFrame(rafRepositionId);
        rafRepositionId = requestAnimationFrame(() => {
            posicionarElementosSpotlight(paso.target, paso.placement || 'bottom');
        });
    };

    resizeListener = scheduleReposition;
    scrollListener = scheduleReposition;
    window.addEventListener('resize', resizeListener);
    window.addEventListener('scroll', scrollListener, true);

    if (typeof ResizeObserver !== 'undefined' && targetEl) {
        resizeObserver = new ResizeObserver(scheduleReposition);
        resizeObserver.observe(targetEl);
    }

    keydownListener = (e) => {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            callbacks.onSiguiente?.();
        } else if (e.key === 'ArrowLeft' && !esPrimero) {
            e.preventDefault();
            callbacks.onAnterior?.();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            callbacks.onSalir?.();
        }
    };
    document.addEventListener('keydown', keydownListener);

    // Posicionar inmediatamente y recalcular tras completar transiciones suaves
    posicionarElementosSpotlight(paso.target, paso.placement || 'bottom');
    setTimeout(scheduleReposition, 240);
    setTimeout(scheduleReposition, 460);

    if (popover) {
        popover.focus({ preventScroll: true });
    }
}

/**
 * Muestra la píldora discreta flotante cuando el usuario pausa el tutorial.
 */
export function mostrarBarraPausaTutorial({ tituloRecorrido, indice, total, onReanudar, onSalir }) {
    const root = getRootContainer();
    desvincularListenersSpotlight();

    root.innerHTML = `
        <aside id="tutorial-paused-pill" class="tutorial-paused-pill" role="region" aria-label="Tutorial en pausa">
            <div class="tutorial-paused-info">
                <span class="tutorial-paused-dot" aria-hidden="true"></span>
                <div class="min-w-0">
                    <p class="tutorial-paused-title">Guía en pausa</p>
                    <p class="tutorial-paused-sub">${escaparHTML(tituloRecorrido || 'Tutorial')} • Paso ${indice + 1} de ${total}</p>
                </div>
            </div>
            <div class="tutorial-paused-actions">
                <button type="button" id="btn-tutorial-reanudar" class="btn btn-accent btn-sm min-h-[44px]">
                    <i class="fa-solid fa-play text-[11px]"></i>
                    <span>Reanudar</span>
                </button>
                <button type="button" id="btn-tutorial-pausa-salir" class="btn btn-secondary btn-sm min-h-[44px]" title="Finalizar tutorial">
                    <span>Salir</span>
                </button>
            </div>
        </aside>
    `;

    const btnResume = document.getElementById('btn-tutorial-reanudar');
    const btnExit = document.getElementById('btn-tutorial-pausa-salir');
    if (btnResume) btnResume.addEventListener('click', () => onReanudar?.());
    if (btnExit) btnExit.addEventListener('click', () => onSalir?.());
}

/**
 * Limpia cualquier spotlight, popover o barra de pausa del DOM.
 */
export function limpiarVistaSpotlight() {
    desvincularListenersSpotlight();
    const root = document.getElementById('tutorial-system-root');
    if (root) {
        root.innerHTML = '';
    }
}
