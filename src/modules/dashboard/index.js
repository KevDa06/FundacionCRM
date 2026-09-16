/**
 * Módulo Dashboard
 * Métricas clave (KPIs), visualización de impacto y gráficos de recaudación/medios de pago con Chart.js.
 */
import Chart from 'chart.js/auto';
import { store } from '../../state/store.js';
import { formatearMoneda, formatearMonedaEstatica, normalizarACOP } from '../../utils/formatters.js';
import { calcularDiasProximoCumple } from '../../utils/dates.js';
import { evaluarAlertaRetencionDonante, calcularInfoPlazoRecordatorio } from '../retencion/index.js';

export function actualizarControlesFiltro() {
    const selectAgrup = document.getElementById('select-agrupacion-grafico');
    if (!selectAgrup) return;
    const agrup = selectAgrup.value;
    const elMes = document.getElementById('filtro-mes-select');
    const elTrim = document.getElementById('filtro-trimestre-select');
    if (elMes) elMes.classList.toggle('hidden', agrup !== 'mensual');
    if (elTrim) elTrim.classList.toggle('hidden', agrup !== 'trimestral');
}

export function actualizarKPIs() {
    const { globalDonantes, globalDonaciones, globalRecordatorios, monedaActual, tasasCambio, locMoneda } = store;

    let totalCOP = globalDonaciones.reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, tasasCambio), 0);
    const kpiTotalEl = document.getElementById('kpi-total');
    if (kpiTotalEl) kpiTotalEl.innerText = formatearMoneda(totalCOP, monedaActual, tasasCambio, locMoneda);

    const kpiActivosEl = document.getElementById('kpi-activos');
    if (kpiActivosEl) kpiActivosEl.innerText = globalDonantes.filter(d => d && d.estado === 'Activo').length;

    const yFiltroEl = document.getElementById('filtro-anio');
    const mFiltroEl = document.getElementById('filtro-mes-select');
    const yFiltro = yFiltroEl ? parseInt(yFiltroEl.value, 10) : new Date().getFullYear();
    const mFiltro = mFiltroEl ? parseInt(mFiltroEl.value, 10) : (new Date().getMonth() + 1);

    const labelKpiMes = document.getElementById('label-kpi-mes');
    if (labelKpiMes) {
        const nombreMes = new Date(yFiltro, mFiltro - 1, 1).toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        labelKpiMes.innerText = `Donado en ${nombreMes}`;
    }

    let totalMesCOP = 0;
    globalDonaciones.forEach(d => {
        if (!d || !d.fecha) return;
        const parts = String(d.fecha).split('-');
        if (parseInt(parts[0], 10) === yFiltro && parseInt(parts[1], 10) === mFiltro) {
            totalMesCOP += normalizarACOP(d.monto, d.moneda_aporte, tasasCambio);
        }
    });

    const kpiMesEl = document.getElementById('kpi-mes');
    if (kpiMesEl) kpiMesEl.innerText = formatearMoneda(totalMesCOP, monedaActual, tasasCambio, locMoneda);

    const selectorUmbral = document.getElementById('selector-umbral-alertas');
    const umbralDias = selectorUmbral ? (parseInt(selectorUmbral.value, 10) || 30) : 30;
    let countAlertas = 0;

    globalDonantes.filter(d => d && d.estado === 'Activo').forEach(donante => {
        const alerta = evaluarAlertaRetencionDonante(donante, globalDonaciones, umbralDias);
        if (alerta) countAlertas++;
    });

    const kpiAlertasEl = document.getElementById('kpi-alertas');
    if (kpiAlertasEl) kpiAlertasEl.innerText = countAlertas;

    // Métricas de Recordatorios de Donación
    let recTotal = 0;
    let recHoy = 0;
    let recVencidos = 0;
    let recProximos = 0;
    let recGestionados = 0;

    globalRecordatorios.forEach(r => {
        if (!r || !r.fecha_recordatorio) return;
        recTotal++;
        if (r.estado_recordatorio === 'Gestionado') recGestionados++;

        const info = calcularInfoPlazoRecordatorio(r.fecha_recordatorio);
        if (!info) return;
        if (info.categoria === 'hoy') recHoy++;
        else if (info.categoria === 'vencidos') recVencidos++;
        else if (info.categoria === 'proximos') recProximos++;
    });

    const kpiRecTotal = document.getElementById('kpi-rec-total');
    if (kpiRecTotal) kpiRecTotal.innerText = recTotal;

    const kpiRecHoy = document.getElementById('kpi-rec-hoy');
    if (kpiRecHoy) kpiRecHoy.innerText = recHoy;

    const kpiRecVencidos = document.getElementById('kpi-rec-vencidos');
    if (kpiRecVencidos) kpiRecVencidos.innerText = recVencidos;

    const kpiRecProximos = document.getElementById('kpi-rec-proximos');
    if (kpiRecProximos) kpiRecProximos.innerText = recProximos;

    const kpiRecGestionados = document.getElementById('kpi-rec-gestionados');
    if (kpiRecGestionados) kpiRecGestionados.innerText = recGestionados;

    const badgeSubtabAlertas = document.getElementById('badge-count-subtab-alertas');
    if (badgeSubtabAlertas) badgeSubtabAlertas.innerText = countAlertas;

    const badgeSubtabRec = document.getElementById('badge-count-subtab-recordatorios');
    if (badgeSubtabRec) badgeSubtabRec.innerText = recTotal;

    const badgeResumenHeader = document.getElementById('badge-resumen-header');
    if (badgeResumenHeader) {
        if (countAlertas > 0 || recHoy > 0 || recVencidos > 0) {
            badgeResumenHeader.classList.remove('hidden');
        } else {
            badgeResumenHeader.classList.add('hidden');
        }
    }

    const badge = document.getElementById('badge-alertas-sidebar');
    if (badge) {
        const totalAlertas = countAlertas + recHoy + recVencidos;
        if (totalAlertas > 0) {
            badge.innerText = totalAlertas;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    const badgeCumple = document.getElementById('badge-cumpleanos-sidebar');
    if (badgeCumple) {
        let countProximos = 0;
        globalDonantes.forEach(d => {
            if (!d || !d.fecha_nac) return;
            const diff = calcularDiasProximoCumple(d.fecha_nac);
            if (diff >= 0 && diff <= 7) countProximos++;
        });
        if (countProximos > 0) {
            badgeCumple.innerText = countProximos;
            badgeCumple.classList.remove('hidden');
        } else {
            badgeCumple.classList.add('hidden');
        }
    }
}

export function renderizarGraficos() {
    const selectAgrup = document.getElementById('select-agrupacion-grafico');
    const selectAnio = document.getElementById('filtro-anio');
    const selectTipo = document.getElementById('select-tipo-grafico');
    if (!selectAgrup || !selectAnio || !selectTipo) return;

    const agrupacion = selectAgrup.value;
    const yearFiltro = parseInt(selectAnio.value, 10);
    const tipoGrafico = selectTipo.value;

    let labels = [];
    let datosRecaudacionCOP = [];

    const { globalDonaciones, monedaActual, tasasCambio } = store;

    if (agrupacion === 'mensual') {
        const selectMes = document.getElementById('filtro-mes-select');
        const monthFiltro = selectMes ? parseInt(selectMes.value, 10) : 1;
        const numDias = new Date(yearFiltro, monthFiltro, 0).getDate();
        labels = Array.from({ length: numDias }, (_, i) => `${i + 1}`);
        datosRecaudacionCOP = new Array(numDias).fill(0);

        globalDonaciones.forEach(d => {
            if (!d || !d.fecha) return;
            const parts = String(d.fecha).split('-');
            if (parseInt(parts[0], 10) === yearFiltro && parseInt(parts[1], 10) === monthFiltro) {
                const diaIdx = parseInt(parts[2], 10) - 1;
                if (diaIdx >= 0 && diaIdx < numDias) {
                    datosRecaudacionCOP[diaIdx] += normalizarACOP(d.monto, d.moneda_aporte, tasasCambio);
                }
            }
        });

    } else if (agrupacion === 'trimestral') {
        const selectTrim = document.getElementById('filtro-trimestre-select');
        const quarter = selectTrim ? parseInt(selectTrim.value, 10) : 1;
        const startMonth = (quarter - 1) * 3;
        const startDate = new Date(yearFiltro, startMonth, 1);
        const endDate = new Date(yearFiltro, startMonth + 3, 0);
        const totalDaysInQ = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const numWeeks = Math.ceil(totalDaysInQ / 7);

        labels = Array.from({ length: numWeeks }, (_, i) => `Sem. ${i + 1}`);
        datosRecaudacionCOP = new Array(numWeeks).fill(0);

        globalDonaciones.forEach(d => {
            if (!d || !d.fecha) return;
            const [dY, dM, dD] = String(d.fecha).split('-');
            const dDate = new Date(parseInt(dY, 10), parseInt(dM, 10) - 1, parseInt(dD, 10));
            if (dDate >= startDate && dDate <= endDate) {
                const daysDiff = Math.floor((dDate - startDate) / (1000 * 60 * 60 * 24));
                const weekIdx = Math.floor(daysDiff / 7);
                if (weekIdx >= 0 && weekIdx < numWeeks) {
                    datosRecaudacionCOP[weekIdx] += normalizarACOP(d.monto, d.moneda_aporte, tasasCambio);
                }
            }
        });

    } else if (agrupacion === 'anual') {
        labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        datosRecaudacionCOP = new Array(12).fill(0);
        globalDonaciones.forEach(d => {
            if (!d || !d.fecha) return;
            const parts = String(d.fecha).split('-');
            if (parseInt(parts[0], 10) === yearFiltro) {
                const mesIdx = parseInt(parts[1], 10) - 1;
                if (mesIdx >= 0 && mesIdx < 12) {
                    datosRecaudacionCOP[mesIdx] += normalizarACOP(d.monto, d.moneda_aporte, tasasCambio);
                }
            }
        });
    }

    const tasaVisual = tasasCambio[monedaActual] || 1;
    const datosConvertidos = datosRecaudacionCOP.map(m => m / tasaVisual);

    const ctxR = document.getElementById('chart-recaudacion');
    if (ctxR) {
        if (store.chartRecaudacionInstance) store.chartRecaudacionInstance.destroy();
        store.chartRecaudacionInstance = new Chart(ctxR.getContext('2d'), {
            type: tipoGrafico,
            data: {
                labels: labels,
                datasets: [{
                    label: `Recaudado (${monedaActual})`,
                    data: datosConvertidos,
                    backgroundColor: tipoGrafico === 'line' ? 'rgba(37, 99, 235, 0.1)' : '#2563eb',
                    borderColor: '#2563eb',
                    borderWidth: 2,
                    borderRadius: tipoGrafico === 'bar' ? 6 : 0,
                    fill: tipoGrafico === 'line',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (c) => formatearMonedaEstatica(c.raw, monedaActual)
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, border: { display: false }, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b' } },
                    x: { border: { display: false }, grid: { display: false }, ticks: { color: '#64748b' } }
                }
            }
        });
    }
    renderizarGraficoAnillos();
}

export function renderizarGraficoAnillos() {
    const selectAgrup = document.getElementById('select-agrupacion-grafico');
    const selectAnio = document.getElementById('filtro-anio');
    const selectMes = document.getElementById('filtro-mes-select');
    if (!selectAgrup || !selectAnio || !selectMes) return;

    const agrup = selectAgrup.value;
    const y = parseInt(selectAnio.value, 10);
    const m = parseInt(selectMes.value, 10);
    const medios = {};

    const labelPeriodo = document.getElementById('label-periodo-anillos');
    if (labelPeriodo) {
        labelPeriodo.innerText = agrup === 'mensual' ? 'Mes Específico' : 'Periodo Completo';
    }

    const { globalDonaciones } = store;

    globalDonaciones.forEach(d => {
        if (!d || !d.fecha) return;
        const parts = String(d.fecha).split('-');
        let entra = false;
        if (agrup === 'mensual' && parseInt(parts[0], 10) === y && parseInt(parts[1], 10) === m) entra = true;
        if (agrup !== 'mensual' && parseInt(parts[0], 10) === y) entra = true;

        if (entra) {
            const medioKey = d.medio || 'Otro';
            medios[medioKey] = (medios[medioKey] || 0) + 1;
        }
    });

    const labels = Object.keys(medios);
    const data = Object.values(medios);
    const ctx = document.getElementById('chart-medios-pago');

    if (store.chartMediosPagoInstance) store.chartMediosPagoInstance.destroy();

    if (!ctx) return;

    if (data.length === 0) {
        store.chartMediosPagoInstance = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: { labels: ['Sin datos'], datasets: [{ data: [1], backgroundColor: ['#f8fafc'] }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%' }
        });
        return;
    }

    store.chartMediosPagoInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#2563eb', '#38bdf8', '#10b981', '#f59e0b', '#8b5cf6'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: { legend: { position: 'bottom' } }
        }
    });
}
