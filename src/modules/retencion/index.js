/**
 * Módulo de Retención y Recordatorios de Donación
 * Alertas predictivas de inactividad, semáforos de plazos y seguimiento por WhatsApp.
 */
import { store } from '../../state/store.js';
import * as recordatoriosService from '../../services/recordatoriosService.js';
import { clasificarErrorSupabase } from '../../utils/supabaseErrors.js';
import { escaparHTML, formatearMonedaEstatica } from '../../utils/formatters.js';
import { obtenerFechaActualLocal, esFechaValida, calcularDiasDesdeFecha, sumarMesesCalendario } from '../../utils/dates.js';
import { mostrarNotificacion } from '../../components/toast.js';
import { cerrarModal } from '../../components/modal.js';
import { actualizarKPIs } from '../dashboard/index.js';

const MESES_POR_PERIODICIDAD = {
    'mensual': 1,
    'trimestral': 3,
    'semestral': 6,
    'anual': 12
};

export function evaluarAlertaRetencionDonante(donante, donaciones, umbralDias) {
    if (!donante || donante.estado !== 'Activo') return null;

    const p = (donante.periodicidad || '').trim().toLowerCase();
    const mesesCiclo = MESES_POR_PERIODICIDAD[p];
    if (!mesesCiclo) return null; // Donantes Ocasionales o sin periodicidad fija quedan excluidos

    const donDonante = donaciones.filter(d => d && d.donante_id === donante.id);
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

export function calcularInfoPlazoRecordatorio(fechaRecordatorioStr) {
    if (!fechaRecordatorioStr) return null;
    const soloFecha = String(fechaRecordatorioStr).split('T')[0];
    const parts = soloFecha.split('-');
    if (parts.length < 3) return null;

    const hoy = new Date();
    const fechaHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);

    const anio = parseInt(parts[0], 10);
    const mes = parseInt(parts[1], 10) - 1;
    const dia = parseInt(parts[2], 10);
    const fechaRec = new Date(anio, mes, dia, 0, 0, 0, 0);

    const diffMs = fechaRec.getTime() - fechaHoy.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias === 0) {
        return {
            categoria: 'hoy',
            dias: 0,
            diasAbs: 0,
            texto: '¡Hoy!',
            badgeClass: 'bg-amber-100 text-amber-800 border-amber-200'
        };
    } else if (diffDias < 0) {
        const diasAbs = Math.abs(diffDias);
        return {
            categoria: 'vencidos',
            dias: diffDias,
            diasAbs: diasAbs,
            texto: `Vencido hace ${diasAbs} día${diasAbs === 1 ? '' : 's'}`,
            badgeClass: 'bg-rose-100 text-rose-800 border-rose-200'
        };
    } else {
        return {
            categoria: 'proximos',
            dias: diffDias,
            diasAbs: diffDias,
            texto: `En ${diffDias} día${diffDias === 1 ? '' : 's'}`,
            badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200'
        };
    }
}

export function generarEnlaceWhatsApp(telefono, mensaje) {
    if (!telefono) return '#';
    let telStr = String(telefono).replace(/\D/g, '');
    if (!telStr) return '#';
    if (telStr.length === 10 && telStr.startsWith('3')) {
        telStr = '57' + telStr;
    }
    const msg = encodeURIComponent(mensaje);
    return `https://wa.me/${telStr}?text=${msg}`;
}

export function renderizarTablaAlertas() {
    const tbody = document.getElementById('tbody-alertas');
    if (!tbody) return;
    tbody.innerHTML = '';

    const selectorUmbral = document.getElementById('selector-umbral-alertas');
    const umbralDias = selectorUmbral ? (parseInt(selectorUmbral.value, 10) || 30) : 30;
    const donantesAlerta = [];

    const { globalDonantes, globalDonaciones } = store;

    globalDonantes.filter(d => d && d.estado === 'Activo').forEach(donante => {
        const alerta = evaluarAlertaRetencionDonante(donante, globalDonaciones, umbralDias);
        if (alerta) {
            donantesAlerta.push({
                ...donante,
                ultima_donacion: alerta.ultima_donacion,
                dias_ausencia: alerta.dias_ausencia
            });
        }
    });

    if (donantesAlerta.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-slate-400 font-medium">No hay donantes en alerta de retención.</td></tr>`;
        return;
    }

    donantesAlerta.sort((a, b) => b.dias_ausencia - a.dias_ausencia).forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-rose-100 hover:bg-rose-50/50 transition-colors';

        const msg = `Hola ${d.nombre}, gracias por apoyar a la fundación. Nos comunicamos porque notamos que no hemos recibido aportes recientes...`;
        const linkWa = generarEnlaceWhatsApp(d.telefono, msg);
        const linkMail = d.correo ? `mailto:${encodeURIComponent(d.correo)}?subject=${encodeURIComponent('Agradecimiento y Seguimiento')}&body=${encodeURIComponent(msg)}` : '#';

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800">${escaparHTML(d.nombre)}</div>
                <div class="text-[11px] text-slate-500 font-mono">${escaparHTML(d.documento)}</div>
            </td>
            <td class="px-6 py-4 font-medium text-slate-600">${escaparHTML(d.ultima_donacion)}</td>
            <td class="px-6 py-4 font-bold text-rose-600">${escaparHTML(d.dias_ausencia)} días</td>
            <td class="px-6 py-4 text-sm font-medium text-slate-600">${escaparHTML(d.periodicidad)}</td>
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

export function cambiarSubTabAlertas(subtab) {
    store.subTabAlertasActiva = subtab;
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

export function renderizarTablaRecordatorios() {
    const tbody = document.getElementById('tbody-recordatorios');
    if (!tbody) return;
    tbody.innerHTML = '';

    const { globalRecordatorios, globalDonantes, globalDonaciones } = store;
    const termino = (document.getElementById('filtro-recordatorios-busqueda')?.value || '').toLowerCase().trim();
    const filtroPlazo = document.getElementById('filtro-recordatorios-plazo')?.value || 'todos';
    const filtroEstado = document.getElementById('filtro-recordatorios-estado')?.value || 'todos';

    const recordatoriosFiltrados = globalRecordatorios.filter(r => {
        if (!r || !r.fecha_recordatorio) return false;

        const donante = r.donantes || globalDonantes.find(d => d.id === r.donante_id) || {};
        const coincideTermino = !termino ||
            (donante.nombre || '').toLowerCase().includes(termino) ||
            (donante.documento || '').toLowerCase().includes(termino);
        if (!coincideTermino) return false;

        const estadoRec = r.estado_recordatorio || 'Pendiente';
        if (filtroEstado !== 'todos' && estadoRec !== filtroEstado) return false;

        const infoPlazo = calcularInfoPlazoRecordatorio(r.fecha_recordatorio);
        if (!infoPlazo) return false;

        if (filtroPlazo !== 'todos' && infoPlazo.categoria !== filtroPlazo) return false;

        return true;
    });

    recordatoriosFiltrados.sort((a, b) => {
        const infoA = calcularInfoPlazoRecordatorio(a.fecha_recordatorio);
        const infoB = calcularInfoPlazoRecordatorio(b.fecha_recordatorio);
        if (!infoA || !infoB) return 0;

        const ordenCat = { 'hoy': 0, 'vencidos': 1, 'proximos': 2 };
        if (ordenCat[infoA.categoria] !== ordenCat[infoB.categoria]) {
            return ordenCat[infoA.categoria] - ordenCat[infoB.categoria];
        }
        return infoA.dias - infoB.dias;
    });

    if (recordatoriosFiltrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center text-slate-400">
                    <div class="flex flex-col items-center justify-center space-y-2">
                        <i class="fa-solid fa-calendar-xmark text-3xl text-slate-300"></i>
                        <p class="font-medium text-sm">No se encontraron recordatorios con los filtros aplicados.</p>
                        <button type="button" onclick="abrirModalProgramarRecordatorio()" class="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                            + Programar Nuevo Recordatorio
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    recordatoriosFiltrados.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50/70 transition-colors';

        const donante = r.donantes || globalDonantes.find(d => d.id === r.donante_id) || {
            nombre: 'Donante no encontrado',
            documento: '-',
            telefono: '',
            correo: '',
            periodicidad: 'Ocasional'
        };

        const infoPlazo = calcularInfoPlazoRecordatorio(r.fecha_recordatorio);
        const idRecSeguro = escaparHTML(r.id);
        const estadoActual = r.estado_recordatorio || 'Pendiente';

        const badgePlazo = `<span class="px-2.5 py-1 rounded-full text-xs font-bold border ${infoPlazo.badgeClass}">${escaparHTML(infoPlazo.texto)}</span>`;

        const donacionesDelDonante = globalDonaciones.filter(dn => dn && dn.donante_id === r.donante_id);
        donacionesDelDonante.sort((x, y) => (y.fecha || '').localeCompare(x.fecha || ''));
        const ultimaDonacion = donacionesDelDonante[0];

        const donacionInfoHtml = `
            <div class="text-xs">
                <span class="font-bold text-slate-700">${escaparHTML(donante.periodicidad || 'Ocasional')}</span>
                ${r.monto_recordatorio ? `<div class="text-emerald-700 font-bold mt-0.5">Esp: ${formatearMonedaEstatica(r.monto_recordatorio, 'COP')}</div>` : ''}
                <div class="text-[11px] text-slate-400 mt-0.5">Última: ${ultimaDonacion ? `${escaparHTML(ultimaDonacion.fecha)} (${formatearMonedaEstatica(ultimaDonacion.monto, ultimaDonacion.moneda_aporte)})` : 'Sin registros previos'}</div>
            </div>
        `;

        const selectEstadoHtml = `
            <select onchange="cambiarEstadoRecordatorio('${idRecSeguro}', this.value)" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg border outline-none cursor-pointer ${
                estadoActual === 'Gestionado' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                estadoActual === 'Mensaje enviado' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                'bg-amber-50 text-amber-700 border-amber-200'
            }">
                <option value="Pendiente" ${estadoActual === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                <option value="Mensaje enviado" ${estadoActual === 'Mensaje enviado' ? 'selected' : ''}>✉️ Mensaje enviado</option>
                <option value="Gestionado" ${estadoActual === 'Gestionado' ? 'selected' : ''}>✅ Gestionado</option>
            </select>
        `;

        let plazoTexto = '';
        if (infoPlazo.categoria === 'hoy') plazoTexto = 'programado para el día de hoy';
        else if (infoPlazo.categoria === 'vencidos') plazoTexto = `que teníamos previsto para el ${r.fecha_recordatorio}`;
        else plazoTexto = `programado para el ${r.fecha_recordatorio}`;

        const montoTexto = r.monto_recordatorio ? ` por valor de ${formatearMonedaEstatica(r.monto_recordatorio, 'COP')}` : '';
        const mensajeWhatsApp = `Hola ${donante.nombre}, te saludamos cordialmente de la Fundación. Nos comunicamos para recordar tu valioso compromiso de donación ${plazoTexto}${montoTexto}. Tu aporte constante transforma vidas y nos permite continuar nuestra misión social. Si ya realizaste tu donación, te damos las gracias infinitas. ¡Quedamos atentos a cualquier inquietud!`;

        const linkWhatsApp = donante.telefono ? generarEnlaceWhatsApp(donante.telefono, mensajeWhatsApp) : '#';

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800 text-sm">${escaparHTML(donante.nombre)}</div>
                <div class="text-[11px] text-slate-400 font-mono mt-0.5">CC/NIT: ${escaparHTML(donante.documento || '-')}</div>
                ${r.nota_recordatorio ? `<div class="text-[11px] text-slate-500 italic mt-1 bg-slate-100/60 px-2 py-0.5 rounded max-w-xs truncate" title="${escaparHTML(r.nota_recordatorio)}"><i class="fa-regular fa-note-sticky mr-1"></i>${escaparHTML(r.nota_recordatorio)}</div>` : ''}
            </td>
            <td class="px-6 py-4 font-mono text-xs font-bold text-slate-700">
                ${escaparHTML(r.fecha_recordatorio)}
            </td>
            <td class="px-6 py-4">
                ${badgePlazo}
            </td>
            <td class="px-6 py-4">
                ${donacionInfoHtml}
            </td>
            <td class="px-6 py-4">
                <div class="text-xs text-slate-700 font-medium">${donante.telefono ? escaparHTML(donante.telefono) : '<span class="text-slate-400 italic">Sin teléfono</span>'}</div>
                ${donante.correo ? `<div class="text-[11px] text-slate-400 truncate max-w-[150px]">${escaparHTML(donante.correo)}</div>` : ''}
            </td>
            <td class="px-6 py-4">
                ${selectEstadoHtml}
            </td>
            <td class="px-6 py-4 text-right space-x-1.5 whitespace-nowrap">
                ${linkWhatsApp !== '#' ? `
                    <a href="${escaparHTML(linkWhatsApp)}" target="_blank" rel="noopener noreferrer" onclick="alEnviarWhatsApp('${idRecSeguro}')" class="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all" title="Enviar recordatorio preformateado por WhatsApp">
                        <i class="fa-brands fa-whatsapp text-sm"></i>
                        <span>WhatsApp</span>
                    </a>
                ` : `
                    <button type="button" onclick="mostrarNotificacion('alerta', 'Sin Teléfono', 'Este donante no tiene número de teléfono registrado.')" class="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 text-slate-400 rounded-xl text-xs font-bold cursor-not-allowed">
                        <i class="fa-brands fa-whatsapp text-sm"></i>
                        <span>WhatsApp</span>
                    </button>
                `}
                <button type="button" onclick="abrirModalProgramarRecordatorio(null, '${idRecSeguro}')" class="inline-flex items-center p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-slate-200 shadow-sm transition-colors text-xs" title="Editar recordatorio">
                    <i class="fa-solid fa-pen text-xs"></i>
                </button>
                <button type="button" onclick="confirmarEliminarRecordatorio('${idRecSeguro}')" class="inline-flex items-center p-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-slate-200 shadow-sm transition-colors text-xs" title="Eliminar recordatorio">
                    <i class="fa-solid fa-trash-can text-xs"></i>
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

export function alEnviarWhatsApp(recordatorioId) {
    const r = store.globalRecordatorios.find(x => x.id === recordatorioId);
    if (r && (!r.estado_recordatorio || r.estado_recordatorio === 'Pendiente')) {
        cambiarEstadoRecordatorio(recordatorioId, 'Mensaje enviado');
    }
}

export function poblarSelectDonantesRecordatorio(donanteIdSeleccionado = null) {
    const select = document.getElementById('recordatorio-select-donante');
    if (!select) return;
    select.innerHTML = '<option value="">-- Seleccionar donante --</option>';

    store.globalDonantes.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.nombre} (${d.documento || 'S/D'}) - ${d.estado}`;
        if (donanteIdSeleccionado && d.id === donanteIdSeleccionado) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });

    if (donanteIdSeleccionado) {
        select.value = donanteIdSeleccionado;
    }
}

export function abrirModalProgramarRecordatorio(donanteId = null, recordatorioId = null) {
    const modal = document.getElementById('modal-recordatorio-donacion');
    if (!modal) return;

    const inputRecId = document.getElementById('recordatorio-id');
    const inputDonanteId = document.getElementById('recordatorio-donante-id');
    const selectDonante = document.getElementById('recordatorio-select-donante');
    const inputFecha = document.getElementById('recordatorio-fecha');
    const selectEstado = document.getElementById('recordatorio-estado');
    const inputMonto = document.getElementById('recordatorio-monto');
    const inputNota = document.getElementById('recordatorio-nota');
    const tituloModal = document.getElementById('titulo-modal-recordatorio');
    const btnGuardar = document.getElementById('btn-guardar-recordatorio');

    let rec = null;
    let targetDonante = null;

    if (recordatorioId) {
        rec = store.globalRecordatorios.find(r => r.id === recordatorioId);
    } else if (donanteId) {
        rec = store.globalRecordatorios.find(r => r.id === donanteId);
        if (!rec) {
            targetDonante = store.globalDonantes.find(d => d.id === donanteId);
        }
    }

    if (rec) {
        store.editandoRecordatorioId = rec.id;
        if (inputRecId) inputRecId.value = rec.id;
        if (inputDonanteId) inputDonanteId.value = rec.donante_id;
        poblarSelectDonantesRecordatorio(rec.donante_id);
        if (selectDonante) {
            selectDonante.value = rec.donante_id;
            selectDonante.disabled = true;
        }

        const donante = rec.donantes || store.globalDonantes.find(d => d.id === rec.donante_id);
        if (tituloModal) tituloModal.innerText = donante ? `Recordatorio: ${donante.nombre}` : 'Editar Recordatorio';
        if (btnGuardar) btnGuardar.innerText = 'Guardar Cambios';

        if (inputFecha) inputFecha.value = rec.fecha_recordatorio || obtenerFechaActualLocal();
        if (selectEstado) selectEstado.value = rec.estado_recordatorio || 'Pendiente';
        if (inputMonto) inputMonto.value = rec.monto_recordatorio || '';
        if (inputNota) inputNota.value = rec.nota_recordatorio || '';
    } else if (targetDonante) {
        store.editandoRecordatorioId = null;
        if (inputRecId) inputRecId.value = '';
        if (inputDonanteId) inputDonanteId.value = targetDonante.id;
        poblarSelectDonantesRecordatorio(targetDonante.id);
        if (selectDonante) {
            selectDonante.value = targetDonante.id;
            selectDonante.disabled = true;
        }
        if (tituloModal) tituloModal.innerText = `Recordatorio: ${targetDonante.nombre}`;
        if (btnGuardar) btnGuardar.innerText = 'Guardar Recordatorio';
        if (inputFecha) inputFecha.value = obtenerFechaActualLocal();
        if (selectEstado) selectEstado.value = 'Pendiente';
        if (inputMonto) inputMonto.value = '';
        if (inputNota) inputNota.value = '';
    } else {
        store.editandoRecordatorioId = null;
        if (inputRecId) inputRecId.value = '';
        if (inputDonanteId) inputDonanteId.value = '';
        poblarSelectDonantesRecordatorio(null);
        if (selectDonante) {
            selectDonante.disabled = false;
            selectDonante.value = '';
        }
        if (tituloModal) tituloModal.innerText = 'Programar Recordatorio de Donación';
        if (btnGuardar) btnGuardar.innerText = 'Guardar Recordatorio';
        if (inputFecha) inputFecha.value = obtenerFechaActualLocal();
        if (selectEstado) selectEstado.value = 'Pendiente';
        if (inputMonto) inputMonto.value = '';
        if (inputNota) inputNota.value = '';
    }

    modal.classList.remove('hidden');
}

export async function guardarRecordatorio() {
    const selectDonante = document.getElementById('recordatorio-select-donante');
    const donanteId = selectDonante ? selectDonante.value : '';
    if (!donanteId) {
        return mostrarNotificacion('alerta', 'Faltan Datos', 'Debes seleccionar un donante.');
    }

    const inputFecha = document.getElementById('recordatorio-fecha');
    const fechaVal = inputFecha ? inputFecha.value.trim() : '';
    if (!fechaVal) {
        return mostrarNotificacion('alerta', 'Faltan Datos', 'Debes indicar una fecha de recordatorio.');
    }

    if (!esFechaValida(fechaVal)) {
        return mostrarNotificacion('alerta', 'Fecha Inválida', 'Ingresa una fecha de recordatorio válida.');
    }

    const selectEstado = document.getElementById('recordatorio-estado');
    const estadoVal = selectEstado ? selectEstado.value : 'Pendiente';

    const inputMonto = document.getElementById('recordatorio-monto');
    const montoVal = inputMonto && inputMonto.value ? parseFloat(inputMonto.value) : null;

    const inputNota = document.getElementById('recordatorio-nota');
    const notaVal = inputNota ? inputNota.value.trim() : null;

    if (store.guardandoRecordatorio) return;
    store.guardandoRecordatorio = true;

    const btnGuardar = document.getElementById('btn-guardar-recordatorio');
    const txtOriginal = btnGuardar ? btnGuardar.innerText : 'Guardar Recordatorio';
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerText = 'Guardando...';
    }

    const payload = {
        fecha_recordatorio: fechaVal,
        estado_recordatorio: estadoVal,
        monto_recordatorio: montoVal,
        nota_recordatorio: notaVal
    };

    try {
        if (store.editandoRecordatorioId) {
            const { error } = await recordatoriosService.actualizarRecordatorio(store.editandoRecordatorioId, payload);
            if (error) {
                const infoError = clasificarErrorSupabase(error);
                return mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
            }

            const rec = store.globalRecordatorios.find(r => r.id === store.editandoRecordatorioId);
            if (rec) {
                Object.assign(rec, payload);
            }
            cerrarModal('modal-recordatorio-donacion');
            mostrarNotificacion('exito', 'Recordatorio Actualizado', 'Los cambios en el recordatorio se han guardado con éxito.');
        } else {
            const nuevoRegistro = {
                donante_id: donanteId,
                ...payload
            };
            const { data, error } = await recordatoriosService.crearRecordatorio(nuevoRegistro);
            if (error) {
                const infoError = clasificarErrorSupabase(error);
                return mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
            }

            const donante = store.globalDonantes.find(d => d.id === donanteId);
            const elementoCreado = Array.isArray(data) ? data[0] : (data || nuevoRegistro);
            if (!elementoCreado.id) elementoCreado.id = 'rec_' + Date.now();
            if (donante) {
                elementoCreado.donantes = {
                    nombre: donante.nombre,
                    documento: donante.documento,
                    telefono: donante.telefono,
                    correo: donante.correo
                };
            }
            store.globalRecordatorios.unshift(elementoCreado);

            cerrarModal('modal-recordatorio-donacion');
            mostrarNotificacion('exito', 'Recordatorio Creado', 'El recordatorio de donación ha sido programado con éxito.');
        }

        renderizarTablaRecordatorios();
        actualizarKPIs();
    } catch (err) {
        const infoError = clasificarErrorSupabase(err);
        mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
    } finally {
        store.guardandoRecordatorio = false;
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerText = txtOriginal;
        }
    }
}

export async function cambiarEstadoRecordatorio(recordatorioId, nuevoEstado) {
    const rec = store.globalRecordatorios.find(r => r.id === recordatorioId);
    if (!rec) return;

    const donanteNombre = rec.donantes?.nombre || store.globalDonantes.find(d => d.id === rec.donante_id)?.nombre || 'Donante';

    try {
        const { error } = await recordatoriosService.actualizarEstadoRecordatorio(recordatorioId, nuevoEstado);
        if (error) throw error;

        rec.estado_recordatorio = nuevoEstado;
        renderizarTablaRecordatorios();
        actualizarKPIs();
        mostrarNotificacion('exito', 'Estado Actualizado', `Recordatorio de ${donanteNombre} marcado como "${nuevoEstado}".`);
    } catch (e) {
        console.error('Error al actualizar estado del recordatorio:', e);
        mostrarNotificacion('peligro', 'Error', 'No se pudo actualizar el estado del recordatorio.');
    }
}

export function confirmarEliminarRecordatorio(recordatorioId) {
    const rec = store.globalRecordatorios.find(r => r.id === recordatorioId);
    const donanteNombre = rec?.donantes?.nombre || store.globalDonantes.find(d => d.id === rec?.donante_id)?.nombre || 'este donante';

    mostrarNotificacion('peligro', 'Eliminar Recordatorio', `¿Deseas eliminar el recordatorio de ${donanteNombre}?`, async () => {
        try {
            const { error } = await recordatoriosService.eliminarRecordatorio(recordatorioId);
            if (error) {
                const infoError = clasificarErrorSupabase(error);
                return mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
            }

            store.globalRecordatorios = store.globalRecordatorios.filter(r => r.id !== recordatorioId);
            renderizarTablaRecordatorios();
            actualizarKPIs();
            mostrarNotificacion('exito', 'Recordatorio Eliminado', 'El recordatorio ha sido eliminado correctamente.');
        } catch (err) {
            const infoError = clasificarErrorSupabase(err);
            mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
        }
    });
}

export function mostrarModalResumenInicio() {
    const modal = document.getElementById('modal-resumen-inicio');
    if (!modal) return;

    const selectorUmbral = document.getElementById('selector-umbral-alertas');
    const umbralDias = selectorUmbral ? (parseInt(selectorUmbral.value, 10) || 30) : 30;
    let countAlertas = 0;

    const { globalDonantes, globalDonaciones, globalRecordatorios } = store;

    globalDonantes.filter(d => d && d.estado === 'Activo').forEach(donante => {
        const alerta = evaluarAlertaRetencionDonante(donante, globalDonaciones, umbralDias);
        if (alerta) countAlertas++;
    });

    let countHoy = 0;
    let countVencidos = 0;
    let countProximos = 0;

    globalRecordatorios.forEach(r => {
        if (!r || !r.fecha_recordatorio) return;
        const info = calcularInfoPlazoRecordatorio(r.fecha_recordatorio);
        if (!info) return;
        if (info.categoria === 'hoy') countHoy++;
        else if (info.categoria === 'vencidos') countVencidos++;
        else if (info.categoria === 'proximos') countProximos++;
    });

    const textoAlertasEl = document.getElementById('resumen-alertas-texto');
    if (textoAlertasEl) {
        textoAlertasEl.innerText = countAlertas === 1
            ? '1 donante activo en alerta de retención'
            : `${countAlertas} donantes activos en alerta de retención`;
    }

    const recHoyEl = document.getElementById('resumen-recordatorios-hoy');
    if (recHoyEl) recHoyEl.innerText = countHoy;

    const recVencidosEl = document.getElementById('resumen-recordatorios-vencidos');
    if (recVencidosEl) recVencidosEl.innerText = countVencidos;

    const recProximosEl = document.getElementById('resumen-recordatorios-proximos');
    if (recProximosEl) recProximosEl.innerText = countProximos;

    modal.classList.remove('hidden');
}

export function cerrarModalResumenInicio() {
    const modal = document.getElementById('modal-resumen-inicio');
    if (modal) modal.classList.add('hidden');
}

export function irAAlertasDesdeResumen(subtab = 'alertas') {
    cerrarModalResumenInicio();
    if (window.cambiarTab) window.cambiarTab('alertas');
    cambiarSubTabAlertas(subtab);
}
