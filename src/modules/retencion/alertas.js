/**
 * Submódulo: Alertas de Retención y Semáforo de Ciclos Vencidos
 * Evalúa el desfase de periodicidad de donaciones y renderiza el centro de alertas.
 */
import { store } from '../../state/store.js';
import { escaparHTML } from '../../utils/formatters.js';
import { calcularDiasDesdeFecha, sumarMesesCalendario } from '../../utils/dates.js';
import { generarEnlaceWhatsApp } from './whatsapp.js';
import { renderizarTablaRecordatorios } from './recordatorios.js';

export const MESES_POR_PERIODICIDAD = {
    'mensual': 1,
    'trimestral': 3,
    'semestral': 6,
    'anual': 12
};

/**
 * Evalúa si un donante activo ha superado el ciclo esperado según su periodicidad más el umbral.
 * 
 * @param {Object} donante 
 * @param {Array} donaciones 
 * @param {number} umbralDias 
 * @returns {Object|null}
 */
export function evaluarAlertaRetencionDonante(donante, donaciones, umbralDias) {
    if (!donante || donante.estado !== 'Activo') return null;

    const p = (donante.periodicidad || '').trim().toLowerCase();
    const mesesCiclo = MESES_POR_PERIODICIDAD[p];
    if (!mesesCiclo) return null; // Donantes Ocasionales o sin periodicidad fija quedan excluidos

    const donDonante = (donaciones || []).filter(d => d && d.donante_id === donante.id);
    let ultimaFechaStr = donante.fecha_registro || '2020-01-01';
    let esFechaRegistro = true;

    if (donDonante.length > 0) {
        donDonante.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        ultimaFechaStr = donDonante[0].fecha;
        esFechaRegistro = false;
    }

    if (!ultimaFechaStr) return null;
    const soloFecha = String(ultimaFechaStr).split('T')[0];
    const parts = soloFecha.split('-');
    if (parts.length < 3) return null;

    const anio = parseInt(parts[0], 10);
    const mes = parseInt(parts[1], 10) - 1;
    const dia = parseInt(parts[2], 10);

    // 1. Fecha esperada de próxima donación = última donación + meses de periodicidad (calendario local)
    const fechaEsperada = sumarMesesCalendario(anio, mes, dia, mesesCiclo);

    // 2. Fecha límite de alerta = fecha esperada + umbral en días (margen de tolerancia)
    const fechaLimite = new Date(fechaEsperada.getFullYear(), fechaEsperada.getMonth(), fechaEsperada.getDate() + umbralDias, 0, 0, 0, 0);

    // 3. Fecha de hoy a medianoche local
    const hoy = new Date();
    const fechaHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);

    // El donante entra en alerta cuando la fecha actual supera la fecha límite
    if (fechaHoy.getTime() > fechaLimite.getTime()) {
        const diffDays = calcularDiasDesdeFecha(ultimaFechaStr);
        return {
            estaEnAlerta: true,
            dias_ausencia: diffDays,
            ultima_donacion: esFechaRegistro ? `${ultimaFechaStr} (Registro)` : ultimaFechaStr,
            fechaEsperada,
            fechaLimite
        };
    }

    return null;
}

/**
 * Renderiza la tabla de alertas de retención basada en donantes sin aportar o fuera de ciclo.
 */
export function renderizarTablaAlertas() {
    const tbody = document.getElementById('tbody-alertas');
    if (!tbody) return;
    tbody.innerHTML = '';

    const selectorUmbral = document.getElementById('selector-umbral-alertas');
    const umbralDias = selectorUmbral ? (parseInt(selectorUmbral.value, 10) || 30) : 30;
    const { globalDonantes, globalDonaciones } = store;

    const idsConDonaciones = new Set(
        (globalDonaciones || []).filter(d => d && d.donante_id).map(d => String(d.donante_id))
    );

    const alertasMap = new Map();

    // 1. Donantes activos con alerta de retención por periodicidad vencida
    (globalDonantes || []).filter(d => d && d.estado === 'Activo').forEach(donante => {
        const alerta = evaluarAlertaRetencionDonante(donante, globalDonaciones, umbralDias);
        if (alerta) {
            alertasMap.set(String(donante.id), {
                ...donante,
                ultima_donacion: alerta.ultima_donacion,
                dias_ausencia: alerta.dias_ausencia,
                tipo_alerta: 'ciclo_vencido'
            });
        }
    });

    // 2. Donantes activos que nunca han donado (sin registros de donación)
    (globalDonantes || []).filter(d => d && d.estado === 'Activo').forEach(donante => {
        if (!idsConDonaciones.has(String(donante.id)) && !alertasMap.has(String(donante.id))) {
            const diasRegistro = calcularDiasDesdeFecha(donante.fecha_registro || donante.created_at);
            alertasMap.set(String(donante.id), {
                ...donante,
                ultima_donacion: donante.fecha_registro ? `Sin donaciones (Reg: ${donante.fecha_registro})` : 'Sin donaciones registradas',
                dias_ausencia: diasRegistro,
                tipo_alerta: 'sin_aportes'
            });
        }
    });

    const donantesAlerta = Array.from(alertasMap.values());

    if (donantesAlerta.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-slate-400 font-medium">No hay donantes en alerta ni con donaciones pendientes.</td></tr>`;
        return;
    }

    donantesAlerta.sort((a, b) => b.dias_ausencia - a.dias_ausencia).forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-rose-100 hover:bg-rose-50/50 transition-colors';

        const esSinAportes = d.tipo_alerta === 'sin_aportes';
        const msg = esSinAportes
            ? `Hola ${d.nombre}, gracias por registrarte en nuestra fundación. Nos encantaría invitarte a realizar tu primera donación para apoyar nuestros programas...`
            : `Hola ${d.nombre}, gracias por apoyar a la fundación. Nos comunicamos porque notamos que no hemos recibido aportes recientes...`;

        const linkWa = generarEnlaceWhatsApp(d.telefono, msg);
        const linkMail = d.correo ? `mailto:${encodeURIComponent(d.correo)}?subject=${encodeURIComponent(esSinAportes ? 'Bienvenido a la Fundación' : 'Agradecimiento y Seguimiento')}&body=${encodeURIComponent(msg)}` : '#';

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800">${escaparHTML(d.nombre)}</div>
                <div class="text-[11px] text-slate-500 font-mono">${escaparHTML(d.documento)}</div>
            </td>
            <td class="px-6 py-4 font-medium ${esSinAportes ? 'text-amber-700 font-semibold' : 'text-slate-600'}">${escaparHTML(d.ultima_donacion)}</td>
            <td class="px-6 py-4 font-bold text-rose-600">${escaparHTML(d.dias_ausencia)} días</td>
            <td class="px-6 py-4 text-sm font-medium text-slate-600">${escaparHTML(d.periodicidad || 'Ocasional')}</td>
            <td class="px-6 py-4 text-right space-x-2">
                ${linkWa !== '#' ? `
                    <a href="${escaparHTML(linkWa)}" target="_blank" rel="noopener noreferrer" class="inline-block p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg shadow-sm border border-emerald-100 transition-colors" title="WhatsApp"><i class="fa-brands fa-whatsapp text-lg"></i></a>
                ` : ''}
                ${d.correo ? `
                    <a href="${escaparHTML(linkMail)}" target="_blank" rel="noopener noreferrer" class="inline-block p-2 text-blue-500 hover:bg-blue-50 rounded-lg shadow-sm border border-blue-100 transition-colors" title="Email"><i class="fa-solid fa-envelope text-lg"></i></a>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Alterna entre pestañas secundarias en la vista de retención (Alertas / Recordatorios).
 * 
 * @param {string} subtab - 'alertas' | 'recordatorios'
 */
export function cambiarSubTabAlertas(subtab) {
    store.subTabAlertasActiva = subtab;
    try {
        localStorage.setItem('crm_subtab_retencion', subtab);
    } catch (_e) {}
    const btnAlertas = document.getElementById('btn-subtab-alertas-retencion');
    const btnRec = document.getElementById('btn-subtab-alertas-recordatorios');
    const secAlertas = document.getElementById('subseccion-alertas-retencion');
    const secRec = document.getElementById('subseccion-alertas-recordatorios');
    const headerTitle = document.getElementById('header-titulo-vista');

    if (subtab === 'alertas') {
        if (btnAlertas) btnAlertas.className = 'px-5 py-3 text-sm font-bold border-b-2 border-rose-600 text-rose-600 transition-colors flex items-center space-x-2';
        if (btnRec) btnRec.className = 'px-5 py-3 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors flex items-center space-x-2';
        if (secAlertas) secAlertas.classList.remove('hidden');
        if (secRec) secRec.classList.add('hidden');
        if (headerTitle) headerTitle.innerText = 'Centro de Retención';
        renderizarTablaAlertas();
    } else {
        if (btnAlertas) btnAlertas.className = 'px-5 py-3 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors flex items-center space-x-2';
        if (btnRec) btnRec.className = 'px-5 py-3 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition-colors flex items-center space-x-2';
        if (secAlertas) secAlertas.classList.add('hidden');
        if (secRec) secRec.classList.remove('hidden');
        if (headerTitle) headerTitle.innerText = 'Recordatorios de Donación';
        renderizarTablaRecordatorios();
    }
}
