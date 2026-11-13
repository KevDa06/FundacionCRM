/**
 * Centro de Ayuda y Tutoriales por Sección (FundaciónCRM)
 * Renderiza el selector modal de tutoriales filtrados por rol, con acceso directo
 * al recorrido general y al tutorial específico de la vista actual.
 */
import { escaparHTML } from '../../utils/formatters.js';
import { CATEGORIAS_TUTORIAL } from './tutorialCatalog.js';

const NOMBRES_ROL = {
    admin: 'Administrador',
    operador: 'Operador',
    lector: 'Lector (solo consulta)'
};

const DESCRIPCIONES_ROL = {
    admin: 'Tienes acceso completo a todos los módulos operativos, herramientas y administración.',
    operador: 'Puedes consultar y gestionar donantes, donaciones, seguimiento, cumpleaños, alertas y herramientas.',
    lector: 'Tienes acceso en modo lectura para consultar indicadores, listados, seguimiento, cumpleaños y alertas.'
};

function getRootContainer() {
    let root = document.getElementById('tutorial-system-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'tutorial-system-root';
        document.body.appendChild(root);
    }
    return root;
}

export function renderizarHubTutoriales({
    usuario,
    seccionesDisponibles,
    totalPasosGenerales,
    seccionActual,
    completadosSet,
    callbacks
}) {
    const root = getRootContainer();
    const rolKey = String(usuario?.rol || 'operador').toLowerCase();
    const rolNombre = NOMBRES_ROL[rolKey] || 'Operador';
    const rolDesc = DESCRIPCIONES_ROL[rolKey] || DESCRIPCIONES_ROL.operador;

    const bloquesCategorias = CATEGORIAS_TUTORIAL
        .map(cat => {
            const items = seccionesDisponibles.filter(s => s.categoria === cat.id);
            if (!items.length) return '';

            const tarjetasHtml = items.map(sec => {
                const completado = completadosSet instanceof Set && completadosSet.has(sec.id);
                const esActual = seccionActual && seccionActual.id === sec.id;
                return `
                    <article class="tutorial-hub-card ${esActual ? 'tutorial-hub-card-current' : ''}">
                        <div class="tutorial-hub-card-top">
                            <div class="tutorial-hub-icon" aria-hidden="true">
                                <i class="fa-solid ${escaparHTML(sec.icono || 'fa-book-open')}"></i>
                            </div>
                            <div class="tutorial-hub-badges">
                                <span class="ui-badge ui-badge-neutral">${sec.pasos.length} ${sec.pasos.length === 1 ? 'paso' : 'pasos'}</span>
                                ${completado ? '<span class="ui-badge ui-badge-success"><i class="fa-solid fa-check text-[10px]"></i> Completado</span>' : ''}
                            </div>
                        </div>
                        <h4 class="tutorial-hub-card-title">${escaparHTML(sec.titulo)}</h4>
                        <p class="tutorial-hub-card-desc">${escaparHTML(sec.subtitulo)}</p>
                        <div class="tutorial-hub-card-actions">
                            <button type="button" data-tutorial-seccion="${escaparHTML(sec.id)}" class="btn ${esActual ? 'btn-accent' : 'btn-secondary'} btn-sm w-full min-h-[44px]">
                                <i class="fa-solid fa-play text-[11px]"></i>
                                <span>${completado ? 'Repasar tutorial' : 'Iniciar tutorial'}</span>
                            </button>
                        </div>
                    </article>
                `;
            }).join('');

            return `
                <section class="tutorial-hub-category">
                    <h3 class="tutorial-hub-category-title">${escaparHTML(cat.titulo)}</h3>
                    <div class="tutorial-hub-grid">
                        ${tarjetasHtml}
                    </div>
                </section>
            `;
        })
        .filter(Boolean)
        .join('');

    const tituloSeccionActual = seccionActual ? `Tutorial de ${seccionActual.titulo}` : 'Tutorial de esta sección';
    const pasosActual = seccionActual ? seccionActual.pasos.length : 0;

    root.innerHTML = `
        <div id="modal-centro-tutoriales" class="tutorial-hub-backdrop" role="dialog" aria-modal="true" aria-labelledby="tutorial-hub-title">
            <div class="tutorial-hub-dialog">
                <header class="tutorial-hub-header">
                    <div class="tutorial-hub-header-left">
                        <div class="tutorial-hub-emblem" aria-hidden="true">
                            <i class="fa-solid fa-book-open"></i>
                        </div>
                        <div>
                            <h2 id="tutorial-hub-title" class="tutorial-hub-title">Guía de uso y tutoriales</h2>
                            <p class="tutorial-hub-subtitle">Aprende paso a paso cómo funciona cada módulo de la aplicación.</p>
                        </div>
                    </div>
                    <button type="button" id="btn-cerrar-hub-tutoriales" class="ui-icon-btn" title="Cerrar guía de uso (Esc)" aria-label="Cerrar guía de uso">
                        <i class="fa-solid fa-xmark text-sm"></i>
                    </button>
                </header>

                <div class="tutorial-hub-body custom-scrollbar">
                    <div class="tutorial-hub-role-banner">
                        <div class="tutorial-hub-role-info">
                            <span class="ui-badge ui-badge-info">Perfil activo: ${escaparHTML(rolNombre)}</span>
                            <p class="tutorial-hub-role-text">${escaparHTML(rolDesc)}</p>
                        </div>
                    </div>

                    <div class="tutorial-hub-hero-actions">
                        <div class="tutorial-hub-hero-card tutorial-hub-hero-primary">
                            <div>
                                <h3 class="tutorial-hub-hero-title">Recorrido completo de la aplicación</h3>
                                <p class="tutorial-hub-hero-desc">Visita en orden todas las pantallas habilitadas para tu perfil con explicaciones guiadas (${totalPasosGenerales} pasos).</p>
                            </div>
                            <button type="button" id="btn-iniciar-recorrido-completo" class="btn btn-primary min-h-[44px]">
                                <i class="fa-solid fa-route text-xs"></i>
                                <span>Iniciar recorrido completo</span>
                            </button>
                        </div>

                        ${seccionActual ? `
                            <div class="tutorial-hub-hero-card">
                                <div>
                                    <h3 class="tutorial-hub-hero-title">${escaparHTML(tituloSeccionActual)}</h3>
                                    <p class="tutorial-hub-hero-desc">Aprende específicamente los controles de la pantalla que tienes abierta ahora (${pasosActual} ${pasosActual === 1 ? 'paso' : 'pasos'}).</p>
                                </div>
                                <button type="button" id="btn-iniciar-tutorial-actual" class="btn btn-accent min-h-[44px]">
                                    <i class="fa-solid fa-location-arrow text-xs"></i>
                                    <span>Ver guía de esta sección</span>
                                </button>
                            </div>
                        ` : ''}
                    </div>

                    ${bloquesCategorias}
                </div>

                <footer class="tutorial-hub-footer">
                    <span class="tutorial-hub-footer-note">Puedes pausar cualquier tutorial en el momento que desees para practicar en pantalla.</span>
                    <button type="button" id="btn-cerrar-hub-footer" class="btn btn-secondary btn-sm min-h-[44px]">Cerrar</button>
                </footer>
            </div>
        </div>
    `;

    const backdrop = document.getElementById('modal-centro-tutoriales');
    const btnClose = document.getElementById('btn-cerrar-hub-tutoriales');
    const btnCloseFooter = document.getElementById('btn-cerrar-hub-footer');
    const btnFullTour = document.getElementById('btn-iniciar-recorrido-completo');
    const btnCurrentTour = document.getElementById('btn-iniciar-tutorial-actual');

    if (btnClose) btnClose.addEventListener('click', () => callbacks.onCerrar?.());
    if (btnCloseFooter) btnCloseFooter.addEventListener('click', () => callbacks.onCerrar?.());
    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) callbacks.onCerrar?.();
        });
    }
    if (btnFullTour) btnFullTour.addEventListener('click', () => callbacks.onIniciarCompleto?.());
    if (btnCurrentTour && seccionActual) {
        btnCurrentTour.addEventListener('click', () => callbacks.onIniciarSeccion?.(seccionActual.id));
    }

    root.querySelectorAll('[data-tutorial-seccion]').forEach(btn => {
        btn.addEventListener('click', () => {
            const secId = btn.getAttribute('data-tutorial-seccion');
            if (secId) callbacks.onIniciarSeccion?.(secId);
        });
    });

    if (btnFullTour) {
        btnFullTour.focus({ preventScroll: true });
    }
}

export function cerrarHubTutorialesDOM() {
    const modal = document.getElementById('modal-centro-tutoriales');
    if (modal) modal.remove();
}
