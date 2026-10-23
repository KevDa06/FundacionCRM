/**
 * Módulo de Cumpleaños
 * Detección de fechas de nacimiento próximas, cálculo de edades y felicitaciones automáticas.
 */
import { store } from '../../state/store.js';
import { escaparHTML } from '../../utils/formatters.js';
import { calcularDiasProximoCumple, calcularEdadProxima, formatearFechaCumple } from '../../utils/dates.js';
import { generarEnlaceWhatsApp } from '../retencion/index.js';

export function renderizarModuloCumpleanos() {
    const tbody = document.getElementById('tbody-cumpleanos');
    if (!tbody) return;

    const filtroDiasEl = document.getElementById('filtro-dias-cumpleanos');
    const filtroDias = filtroDiasEl ? filtroDiasEl.value : '30';
    const buscarTermino = (document.getElementById('buscar-cumpleanero')?.value || '').toLowerCase().trim();

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const mesActual = hoy.getMonth();

    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const labelMesCumple = document.getElementById('label-mes-cumple');
    if (labelMesCumple) labelMesCumple.innerText = `Cumplen en ${meses[mesActual]}`;

    let cumpleHoy = 0;
    let cumpleSemana = 0;
    let cumpleMes = 0;
    let cumpleTotal = 0;

    const listaCumpleaneros = [];
    const { globalDonantes } = store;

    globalDonantes.forEach(donante => {
        if (!donante || !donante.fecha_nac) return;
        cumpleTotal++;

        const parts = String(donante.fecha_nac).split('-');
        if (parts.length < 3) return;
        const mesNac = parseInt(parts[1], 10) - 1;

        if (mesNac === mesActual) cumpleMes++;

        const diasFaltantes = calcularDiasProximoCumple(donante.fecha_nac);
        if (diasFaltantes === 0) cumpleHoy++;
        if (diasFaltantes >= 0 && diasFaltantes <= 7) cumpleSemana++;

        const edad = calcularEdadProxima(donante.fecha_nac);

        listaCumpleaneros.push({
            ...donante,
            diasFaltantes,
            edad,
            mesNac,
            fechaCumpleTexto: formatearFechaCumple(donante.fecha_nac)
        });
    });

    const kpiHoyEl = document.getElementById('kpi-cumple-hoy');
    if (kpiHoyEl) kpiHoyEl.innerText = cumpleHoy;
    const kpiSemanaEl = document.getElementById('kpi-cumple-semana');
    if (kpiSemanaEl) kpiSemanaEl.innerText = cumpleSemana;
    const kpiMesEl = document.getElementById('kpi-cumple-mes');
    if (kpiMesEl) kpiMesEl.innerText = cumpleMes;
    const kpiTotalEl = document.getElementById('kpi-cumple-total');
    if (kpiTotalEl) kpiTotalEl.innerText = cumpleTotal;

    const badgeCumple = document.getElementById('badge-cumpleanos-sidebar');
    if (badgeCumple) {
        if (cumpleSemana > 0) {
            badgeCumple.innerText = cumpleSemana;
            badgeCumple.classList.remove('hidden');
        } else {
            badgeCumple.classList.add('hidden');
        }
    }

    let filtrados = listaCumpleaneros.filter(d => {
        if (filtroDias === '7') return d.diasFaltantes >= 0 && d.diasFaltantes <= 7;
        if (filtroDias === '15') return d.diasFaltantes >= 0 && d.diasFaltantes <= 15;
        if (filtroDias === '30') return d.diasFaltantes >= 0 && d.diasFaltantes <= 30;
        if (filtroDias === 'mes') return d.mesNac === mesActual;
        return true;
    });

    if (buscarTermino) {
        filtrados = filtrados.filter(d =>
            (d.nombre || '').toLowerCase().includes(buscarTermino) ||
            (d.documento || '').toLowerCase().includes(buscarTermino)
        );
    }

    filtrados.sort((a, b) => a.diasFaltantes - b.diasFaltantes);

    tbody.innerHTML = '';
    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-400 font-medium">No se encontraron donantes para el criterio de cumpleaños seleccionado.</td></tr>`;
        return;
    }

    filtrados.forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-amber-50/40 transition-colors';

        let badgeProximidad = '';
        if (d.diasFaltantes === 0) {
            badgeProximidad = '<span class="px-3 py-1 bg-amber-500 text-white rounded-full text-xs font-extrabold shadow-sm animate-pulse">¡Hoy! 🎂</span>';
        } else if (d.diasFaltantes === 1) {
            badgeProximidad = '<span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold shadow-sm">Mañana</span>';
        } else if (d.diasFaltantes <= 7) {
            badgeProximidad = `<span class="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold shadow-sm">En ${d.diasFaltantes} días</span>`;
        } else {
            badgeProximidad = `<span class="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">En ${d.diasFaltantes} días</span>`;
        }

        const mensajeCumple = `¡Hola ${d.nombre}! De parte de todo el equipo de nuestra Fundación queremos desearte un muy Feliz Cumpleaños 🎉🎂. Agradecemos inmensamente tu apoyo y compromiso. ¡Que tengas un día maravilloso lleno de bendiciones!`;
        const linkWhatsApp = generarEnlaceWhatsApp(d.telefono, mensajeCumple);
        const emailMsg = encodeURIComponent(mensajeCumple);
        const linkEmail = d.correo ? `mailto:${encodeURIComponent(d.correo)}?subject=${encodeURIComponent('¡Feliz Cumpleaños de parte de la Fundación! 🎂')}&body=${emailMsg}` : '#';

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800 text-sm">${escaparHTML(d.nombre)}</div>
                <div class="text-xs text-slate-400 font-mono">${escaparHTML(d.documento || 'Sin documento')}</div>
            </td>
            <td class="px-6 py-4">
                <span class="font-semibold text-slate-700">${escaparHTML(d.fechaCumpleTexto)}</span>
                <div class="text-[11px] text-slate-400 font-mono">Nac: ${escaparHTML(d.fecha_nac)}</div>
            </td>
            <td class="px-6 py-4">
                ${badgeProximidad}
            </td>
            <td class="px-6 py-4 font-bold text-slate-700">
                ${d.edad ? `${escaparHTML(d.edad)} años` : 'N/D'}
            </td>
            <td class="px-6 py-4 text-xs">
                <div class="text-slate-700 font-medium">${d.telefono ? escaparHTML(d.telefono) : '<span class="text-slate-400 italic">Sin teléfono</span>'}</div>
                <div class="text-slate-400 truncate max-w-[180px]">${d.correo ? escaparHTML(d.correo) : '<span class="text-slate-400 italic">Sin correo</span>'}</div>
            </td>
            <td class="px-6 py-4 text-right space-x-2">
                ${linkWhatsApp !== '#' ? `
                    <a href="${escaparHTML(linkWhatsApp)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm transition-all" title="Felicitar por WhatsApp">
                        <i class="fa-brands fa-whatsapp text-sm"></i>
                        <span>Felicitar</span>
                    </a>
                ` : `
                    <button type="button" disabled class="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 rounded-xl text-xs font-medium cursor-not-allowed">
                        <i class="fa-brands fa-whatsapp text-sm"></i>
                        <span>Sin cel</span>
                    </button>
                `}
                ${d.correo ? `
                    <a href="${escaparHTML(linkEmail)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center p-2 text-blue-600 hover:bg-blue-50 rounded-xl border border-blue-200 transition-colors" title="Enviar correo">
                        <i class="fa-solid fa-envelope text-xs"></i>
                    </a>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}
