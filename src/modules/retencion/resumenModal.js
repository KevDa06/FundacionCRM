/**
 * Submódulo: Modal de Resumen y Novedades de Inicio (FundaciónCRM)
 * Presenta el balance de donantes sin donar, recordatorios próximos, cumpleaños e historial de notificaciones.
 */
import { store } from '../../state/store.js';
import { escaparHTML } from '../../utils/formatters.js';
import { calcularDiasProximoCumple } from '../../utils/dates.js';
import { calcularProximaDonacionEsperada } from '../../services/backgroundCheckService.js';
import { calcularInfoPlazoRecordatorio, renderizarTablaRecordatorios } from './recordatorios.js';
import { evaluarAlertaRetencionDonante, cambiarSubTabAlertas } from './alertas.js';

export function mostrarModalResumenInicio() {
    const modal = document.getElementById('modal-resumen-inicio');
    if (!modal) return;

    const { globalDonantes, globalDonaciones, globalRecordatorios, notificacionesRecientes } = store;

    // 1. DONANTES QUE NO HAN DONADO (Evaluación predictiva y ciclo vencido)
    const idsConDonaciones = new Set(
        (globalDonaciones || []).filter(d => d && d.donante_id).map(d => String(d.donante_id))
    );

    const selectorUmbral = document.getElementById('selector-umbral-alertas');
    const umbralDias = selectorUmbral ? (parseInt(selectorUmbral.value, 10) || 30) : 30;

    const mapaNoHanDonado = new Map();
    let countSinAportes = 0;
    let countCicloVencido = 0;
    const listaDonantesPrioritarios = [];

    // Donantes activos sin ninguna donación registrada
    (globalDonantes || []).filter(d => d && d.estado === 'Activo').forEach(donante => {
        if (!idsConDonaciones.has(String(donante.id))) {
            mapaNoHanDonado.set(String(donante.id), { donante, tipo: 'sin_aportes' });
            countSinAportes++;
            if (listaDonantesPrioritarios.length < 3) {
                listaDonantesPrioritarios.push({
                    nombre: donante.nombre || 'Donante sin nombre',
                    motivo: 'Nuevo sin aportes',
                    telefono: donante.telefono || '',
                    periodicidad: donante.periodicidad || 'No definida'
                });
            }
        }
    });

    // Donantes activos con ciclo de aporte vencido
    (globalDonantes || []).filter(d => d && d.estado === 'Activo').forEach(donante => {
        const alerta = evaluarAlertaRetencionDonante(donante, globalDonaciones, umbralDias);
        if (alerta && !mapaNoHanDonado.has(String(donante.id))) {
            mapaNoHanDonado.set(String(donante.id), { donante, tipo: 'ciclo_vencido' });
            countCicloVencido++;
            if (listaDonantesPrioritarios.length < 3) {
                listaDonantesPrioritarios.push({
                    nombre: donante.nombre || 'Donante',
                    motivo: `${alerta.diasVencido || 0}d de retraso`,
                    telefono: donante.telefono || '',
                    periodicidad: donante.periodicidad || 'Recurrente'
                });
            }
        }
    });

    const totalNoHanDonado = mapaNoHanDonado.size;

    // 2. RECORDATORIOS (Hoy y Próximos 7 días)
    let totalRecordatorios7D = 0;
    let recHoy = 0;
    let recProximos7 = 0;
    const listaRecordatoriosPrioritarios = [];

    (globalRecordatorios || []).forEach(r => {
        if (!r || !r.fecha_recordatorio) return;
        if (r.estado_recordatorio === 'Gestionado') return;

        const info = calcularInfoPlazoRecordatorio(r.fecha_recordatorio);
        if (!info) return;

        if (info.dias >= 0 && info.dias <= 7) {
            totalRecordatorios7D++;
            if (info.dias === 0) {
                recHoy++;
            } else {
                recProximos7++;
            }

            if (listaRecordatoriosPrioritarios.length < 3) {
                const nombreDonante = r.donantes?.nombre || (r.donante_id ? 'Donante asignado' : 'General');
                listaRecordatoriosPrioritarios.push({
                    donante: nombreDonante,
                    nota: r.nota || 'Llamada de seguimiento',
                    plazo: info.dias === 0 ? 'Hoy' : `En ${info.dias}d`,
                    telefono: r.donantes?.telefono || ''
                });
            }
        }
    });

    // 3. CUMPLEAÑOS (Hoy y Próximos 7 días)
    let totalCumpleanos7D = 0;
    let cumpleHoy = 0;
    let cumpleProximos7 = 0;
    const listaCumpleanosPrioritarios = [];

    (globalDonantes || []).forEach(donante => {
        if (!donante || !donante.fecha_nac) return;
        const diasFaltantes = calcularDiasProximoCumple(donante.fecha_nac);
        if (diasFaltantes >= 0 && diasFaltantes <= 7) {
            totalCumpleanos7D++;
            if (diasFaltantes === 0) {
                cumpleHoy++;
            } else {
                cumpleProximos7++;
            }

            if (listaCumpleanosPrioritarios.length < 3) {
                listaCumpleanosPrioritarios.push({
                    nombre: donante.nombre,
                    telefono: donante.telefono || '',
                    plazo: diasFaltantes === 0 ? '¡Hoy!' : `En ${diasFaltantes}d`
                });
            }
        }
    });

    // 4. PRÓXIMAS DONACIONES ESPERADAS (≤ 3 Días - Background Check)
    let totalProximos3D = 0;
    let proxHoy = 0;
    let prox1a3 = 0;
    const listaProximosPrioritarios = [];

    (globalDonantes || []).filter(d => d && d.estado === 'Activo').forEach(donante => {
        const info = donante._flagProximaDonacion || calcularProximaDonacionEsperada(donante, globalDonaciones, globalRecordatorios);
        if (info && info.diasFaltantes >= 0 && info.diasFaltantes <= 3) {
            totalProximos3D++;
            if (info.diasFaltantes === 0) {
                proxHoy++;
            } else {
                prox1a3++;
            }

            if (listaProximosPrioritarios.length < 3) {
                listaProximosPrioritarios.push({
                    nombre: donante.nombre,
                    telefono: donante.telefono || '',
                    monto: info.montoEstimado,
                    moneda: info.monedaEstimada || 'COP',
                    diasFaltantes: info.diasFaltantes,
                    fechaEsperadaStr: info.fechaEsperadaStr,
                    motivo: info.motivo,
                    plazo: info.diasFaltantes === 0 ? '¡Hoy!' : info.diasFaltantes === 1 ? 'Mañana' : `En ${info.diasFaltantes}d`
                });
            }
        }
    });

    // Actualización de Elementos de Métricas en el DOM
    const metricaNoDonaronEl = document.getElementById('resumen-no-donaron-metrica');
    if (metricaNoDonaronEl) {
        metricaNoDonaronEl.innerText = `${totalNoHanDonado} pendientes`;
    }
    const desgloseNoDonaronEl = document.getElementById('resumen-no-donaron-desglose');
    if (desgloseNoDonaronEl) {
        if (totalNoHanDonado === 0) {
            desgloseNoDonaronEl.innerText = '(Al día)';
        } else if (countSinAportes > 0 && countCicloVencido > 0) {
            desgloseNoDonaronEl.innerText = `(${countSinAportes} nuevos, ${countCicloVencido} ciclo vencido)`;
        } else if (countSinAportes > 0) {
            desgloseNoDonaronEl.innerText = `(${countSinAportes} sin aportes iniciales)`;
        } else {
            desgloseNoDonaronEl.innerText = `(${countCicloVencido} en retraso)`;
        }
    }

    const metricaRecEl = document.getElementById('resumen-recordatorios-metrica');
    if (metricaRecEl) {
        metricaRecEl.innerText = `${totalRecordatorios7D} en semana`;
    }
    const desgloseRecEl = document.getElementById('resumen-recordatorios-desglose');
    if (desgloseRecEl) {
        if (totalRecordatorios7D === 0) {
            desgloseRecEl.innerText = '(Ninguno pendiente)';
        } else if (recHoy > 0) {
            desgloseRecEl.innerText = `(${recHoy} para hoy, ${recProximos7} próximos)`;
        } else {
            desgloseRecEl.innerText = `(${recProximos7} en los próximos 7 días)`;
        }
    }

    const metricaCumpleEl = document.getElementById('resumen-cumpleanos-metrica');
    if (metricaCumpleEl) {
        metricaCumpleEl.innerText = `${totalCumpleanos7D} cumpleañero${totalCumpleanos7D === 1 ? '' : 's'}`;
    }
    const desgloseCumpleEl = document.getElementById('resumen-cumpleanos-desglose');
    if (desgloseCumpleEl) {
        if (totalCumpleanos7D === 0) {
            desgloseCumpleEl.innerText = '(Ninguno en semana)';
        } else if (cumpleHoy > 0) {
            desgloseCumpleEl.innerText = `(${cumpleHoy} hoy 🎂, ${cumpleProximos7} en semana)`;
        } else {
            desgloseCumpleEl.innerText = `(${cumpleProximos7} en los próximos 7 días)`;
        }
    }

    const badgeHeader = document.getElementById('badge-resumen-header');
    const totalAlertasResumen = totalNoHanDonado + totalRecordatorios7D + totalCumpleanos7D + totalProximos3D;
    if (badgeHeader) {
        if (totalAlertasResumen > 0) {
            badgeHeader.innerText = totalAlertasResumen > 99 ? '99+' : totalAlertasResumen;
            badgeHeader.classList.remove('hidden');
        } else {
            badgeHeader.classList.add('hidden');
        }
    }

    // Renderizar previsualizaciones rápidas
    const listaNoDonaronEl = document.getElementById('resumen-lista-no-donaron');
    if (listaNoDonaronEl) {
        if (listaDonantesPrioritarios.length === 0) {
            listaNoDonaronEl.innerHTML = '<li class="text-xs text-slate-400 italic">¡Excelente! Todos los donantes están al día.</li>';
        } else {
            listaNoDonaronEl.innerHTML = listaDonantesPrioritarios.map(d => `
                <li class="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-none">
                    <span class="font-bold text-slate-700 truncate max-w-[170px]">${escaparHTML(d.nombre)}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">${escaparHTML(d.motivo)}</span>
                </li>
            `).join('');
        }
    }

    const listaRecEl = document.getElementById('resumen-lista-recordatorios');
    if (listaRecEl) {
        if (listaRecordatoriosPrioritarios.length === 0) {
            listaRecEl.innerHTML = '<li class="text-xs text-slate-400 italic">No hay recordatorios pendientes para esta semana.</li>';
        } else {
            listaRecEl.innerHTML = listaRecordatoriosPrioritarios.map(r => `
                <li class="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-none">
                    <span class="font-bold text-slate-700 truncate max-w-[170px]">${escaparHTML(r.donante)}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.plazo === 'Hoy' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-blue-50 text-blue-700'}">${escaparHTML(r.plazo)}</span>
                </li>
            `).join('');
        }
    }

    const listaCumpleEl = document.getElementById('resumen-lista-cumpleanos');
    if (listaCumpleEl) {
        if (listaCumpleanosPrioritarios.length === 0) {
            listaCumpleEl.innerHTML = '<li class="text-xs text-slate-400 italic">No hay aniversarios de donantes en los próximos 7 días.</li>';
        } else {
            listaCumpleEl.innerHTML = listaCumpleanosPrioritarios.map(c => `
                <li class="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-none">
                    <span class="font-bold text-slate-700 truncate max-w-[170px]">${escaparHTML(c.nombre)}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.plazo.includes('Hoy') ? 'bg-amber-500 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">${escaparHTML(c.plazo)}</span>
                </li>
            `).join('');
        }
    }

    // Renderizar Historial de Notificaciones
    renderizarHistorialNotificacionesResumen();

    modal.classList.remove('hidden');
}

export function cerrarModalResumenInicio() {
    const modal = document.getElementById('modal-resumen-inicio');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export function cambiarTabResumen(tabName) {
    const vistaPanel = document.getElementById('resumen-tab-panel');
    const vistaHist = document.getElementById('resumen-tab-historial');
    const btnTabPanel = document.getElementById('btn-tab-resumen-panel');
    const btnTabHist = document.getElementById('btn-tab-resumen-historial');

    if (tabName === 'historial') {
        if (vistaPanel) vistaPanel.classList.add('hidden');
        if (vistaHist) vistaHist.classList.remove('hidden');
        if (btnTabHist) {
            btnTabHist.classList.add('bg-white', 'text-blue-700', 'shadow-xs');
            btnTabHist.classList.remove('text-slate-600', 'hover:text-slate-900');
        }
        if (btnTabPanel) {
            btnTabPanel.classList.remove('bg-white', 'text-blue-700', 'shadow-xs');
            btnTabPanel.classList.add('text-slate-600', 'hover:text-slate-900');
        }
        renderizarHistorialNotificacionesResumen();
    } else {
        if (vistaPanel) vistaPanel.classList.remove('hidden');
        if (vistaHist) vistaHist.classList.add('hidden');
        if (btnTabPanel) {
            btnTabPanel.classList.add('bg-white', 'text-blue-700', 'shadow-xs');
            btnTabPanel.classList.remove('text-slate-600', 'hover:text-slate-900');
        }
        if (btnTabHist) {
            btnTabHist.classList.remove('bg-white', 'text-blue-700', 'shadow-xs');
            btnTabHist.classList.add('text-slate-600', 'hover:text-slate-900');
        }
    }
}

export function renderizarHistorialNotificacionesResumen() {
    const contenedor = document.getElementById('resumen-lista-notificaciones');
    if (!contenedor) return;

    const notificaciones = store.notificacionesRecientes || [];
    const countBadge = document.getElementById('badge-count-historial-notificaciones');
    if (countBadge) {
        countBadge.innerText = notificaciones.length;
        countBadge.classList.toggle('hidden', notificaciones.length === 0);
    }

    if (notificaciones.length === 0) {
        contenedor.innerHTML = `
            <div class="text-center py-10 px-4">
                <div class="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                    <i class="fa-regular fa-bell-slash text-xl"></i>
                </div>
                <p class="text-sm font-semibold text-slate-700">Sin notificaciones recientes</p>
                <p class="text-xs text-slate-400 mt-1">Las novedades y confirmaciones del sistema aparecerán aquí en tiempo real.</p>
            </div>
        `;
        return;
    }

    const estilos = {
        exito: { border: 'border-emerald-200', bg: 'bg-emerald-50/60', text: 'text-emerald-700', icon: 'fa-circle-check' },
        alerta: { border: 'border-amber-200', bg: 'bg-amber-50/60', text: 'text-amber-700', icon: 'fa-triangle-exclamation' },
        peligro: { border: 'border-rose-200', bg: 'bg-rose-50/60', text: 'text-rose-700', icon: 'fa-circle-exclamation' },
        info: { border: 'border-blue-200', bg: 'bg-blue-50/60', text: 'text-blue-700', icon: 'fa-circle-info' }
    };

    contenedor.innerHTML = notificaciones.map(n => {
        const est = estilos[n.tipo] || estilos.info;
        const fechaObj = new Date(n.fecha);
        const horaStr = !isNaN(fechaObj.getTime()) ? fechaObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';

        let botonWhatsApp = '';
        if (n.telefono) {
            let telLimpio = String(n.telefono).replace(/\D/g, '');
            if (telLimpio.length === 10 && telLimpio.startsWith('3')) telLimpio = '57' + telLimpio;
            const waUrl = `https://wa.me/${telLimpio}?text=${encodeURIComponent(`Hola, te contactamos desde FundaciónCRM en relación a tu notificación: ${n.titulo}`)}`;
            botonWhatsApp = `
                <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/90 hover:bg-emerald-200 px-2 py-0.5 rounded-md transition-colors shrink-0" title="Contactar vía WhatsApp">
                    <i class="fa-brands fa-whatsapp"></i>
                    <span>Contactar</span>
                </a>
            `;
        }

        return `
            <div class="p-3.5 rounded-2xl border ${est.border} ${est.bg} flex items-start gap-3 transition-all hover:bg-white">
                <div class="w-8 h-8 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs ${est.text}">
                    <i class="fa-solid ${est.icon} text-sm"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                        <h4 class="text-xs font-bold text-slate-800 truncate">${escaparHTML(n.titulo)}</h4>
                        <div class="flex items-center gap-2">
                            ${botonWhatsApp}
                            <span class="text-[10px] text-slate-400 font-medium shrink-0">${horaStr}</span>
                        </div>
                    </div>
                    <p class="text-xs text-slate-600 mt-0.5 leading-relaxed break-words">${escaparHTML(n.mensaje)}</p>
                </div>
            </div>
        `;
    }).join('');
}

export function limpiarHistorialNotificacionesDesdeUI() {
    store.notificacionesRecientes = [];
    renderizarHistorialNotificacionesResumen();
}

export function irAAlertasDesdeResumen(subtab = 'alertas', filtroPlazo = null) {
    cerrarModalResumenInicio();
    if (window.cambiarTab) window.cambiarTab('alertas');
    cambiarSubTabAlertas(subtab);
    if (subtab === 'recordatorios' && filtroPlazo) {
        const selectPlazo = document.getElementById('filtro-recordatorios-plazo');
        if (selectPlazo) {
            selectPlazo.value = filtroPlazo;
            renderizarTablaRecordatorios();
        }
    }
}

export function irACumpleanosDesdeResumen(filtroDias = '7') {
    cerrarModalResumenInicio();
    if (window.cambiarTab) window.cambiarTab('cumpleanos');
    const selectDias = document.getElementById('filtro-dias-cumpleanos');
    if (selectDias) {
        selectDias.value = filtroDias;
    }
    if (window.renderizarModuloCumpleanos) {
        window.renderizarModuloCumpleanos();
    }
}

export function irADonantesDesdeResumen(filtro = 'proximas3dias') {
    cerrarModalResumenInicio();
    if (window.cambiarTab) window.cambiarTab('donantes');
    const selectPeri = document.getElementById('filtro-periodicidad-donante');
    if (selectPeri) {
        selectPeri.value = filtro;
    }
    if (window.filtrarTablaDonantes) {
        window.filtrarTablaDonantes();
    } else if (window.renderizarTablaDonantes) {
        window.renderizarTablaDonantes();
    }
}
