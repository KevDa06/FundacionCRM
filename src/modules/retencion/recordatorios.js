/**
 * Submódulo: Gestión de Recordatorios de Donación
 * Programación, cambio de estados, notificaciones por WhatsApp y semáforos de plazos.
 */
import { store } from '../../state/store.js';
import * as recordatoriosService from '../../services/recordatoriosService.js';
import { clasificarErrorSupabase } from '../../utils/supabaseErrors.js';
import { escaparHTML, formatearMonedaEstatica } from '../../utils/formatters.js';
import { obtenerFechaActualLocal, esFechaValida } from '../../utils/dates.js';
import { mostrarNotificacion } from '../../components/toast.js';
import { cerrarModal } from '../../components/modal.js';
import { generarEnlaceWhatsApp } from './whatsapp.js';

export function calcularInfoPlazoRecordatorio(fechaRecordatorioStr) {
    if (!fechaRecordatorioStr) {
        return {
            categoria: 'proximos',
            dias: 0,
            diasAbs: 0,
            texto: 'Sin fecha',
            badgeClass: 'bg-slate-100 text-slate-700 border-slate-200'
        };
    }

    const hoy = new Date();
    const fechaHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);

    let fechaRec = null;
    const strLimpio = String(fechaRecordatorioStr).trim();
    const soloFecha = strLimpio.split('T')[0].split(' ')[0];

    if (soloFecha.includes('-')) {
        const parts = soloFecha.split('-');
        if (parts.length >= 3) {
            const anio = parseInt(parts[0], 10);
            const mes = parseInt(parts[1], 10) - 1;
            const dia = parseInt(parts[2], 10);
            if (!isNaN(anio) && !isNaN(mes) && !isNaN(dia)) {
                fechaRec = new Date(anio, mes, dia, 0, 0, 0, 0);
            }
        }
    } else if (soloFecha.includes('/')) {
        const parts = soloFecha.split('/');
        if (parts.length >= 3) {
            if (parts[0].length === 4) {
                fechaRec = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 0, 0, 0, 0);
            } else {
                fechaRec = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 0, 0, 0, 0);
            }
        }
    }

    if (!fechaRec || isNaN(fechaRec.getTime())) {
        const d = new Date(fechaRecordatorioStr);
        if (!isNaN(d.getTime())) {
            fechaRec = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        }
    }

    if (!fechaRec || isNaN(fechaRec.getTime())) {
        return {
            categoria: 'proximos',
            dias: 0,
            diasAbs: 0,
            texto: strLimpio || 'Pendiente',
            badgeClass: 'bg-slate-100 text-slate-700 border-slate-200'
        };
    }

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

export function renderizarTablaRecordatorios() {
    const tbody = document.getElementById('tbody-recordatorios');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtroEstado = document.getElementById('filtro-recordatorios-estado')?.value || 'todos';
    const filtroPlazo = document.getElementById('filtro-recordatorios-plazo')?.value || 'todos';
    const termino = (document.getElementById('buscar-recordatorio')?.value || '').toLowerCase().trim();

    const { globalRecordatorios, globalDonantes, globalDonaciones } = store;

    let totalRec = 0;
    let recHoy = 0;
    let recVencidos = 0;
    let recProximos7 = 0;
    let recGestionados = 0;

    globalRecordatorios.forEach(r => {
        if (!r || !r.fecha_recordatorio) return;
        totalRec++;
        if (r.estado_recordatorio === 'Gestionado') {
            recGestionados++;
        }

        const info = calcularInfoPlazoRecordatorio(r.fecha_recordatorio);
        if (!info) return;

        if (info.categoria === 'hoy') recHoy++;
        else if (info.categoria === 'vencidos') recVencidos++;
        else if (info.categoria === 'proximos' && info.dias <= 7) recProximos7++;
    });

    const kpiTotalEl = document.getElementById('kpi-rec-total');
    if (kpiTotalEl) kpiTotalEl.innerText = totalRec;
    const kpiHoyEl = document.getElementById('kpi-rec-hoy');
    if (kpiHoyEl) kpiHoyEl.innerText = recHoy;
    const kpiVencidosEl = document.getElementById('kpi-rec-vencidos');
    if (kpiVencidosEl) kpiVencidosEl.innerText = recVencidos;
    const kpiProximosEl = document.getElementById('kpi-rec-proximos');
    if (kpiProximosEl) kpiProximosEl.innerText = recProximos7;
    const kpiGestionadosEl = document.getElementById('kpi-rec-gestionados');
    if (kpiGestionadosEl) kpiGestionadosEl.innerText = recGestionados;

    const recordatoriosFiltrados = globalRecordatorios.filter(r => {
        if (!r || !r.fecha_recordatorio) return false;

        const donante = r.donantes || globalDonantes.find(d => 
            d.id === r.donante_id || 
            (d.id && r.donante_id && String(d.id).toLowerCase() === String(r.donante_id).toLowerCase())
        ) || {};

        const coincideTermino = !termino ||
            (donante.nombre || '').toLowerCase().includes(termino) ||
            (donante.documento || '').toLowerCase().includes(termino);
        if (!coincideTermino) return false;

        const estadoRec = r.estado_recordatorio || 'Pendiente';
        if (filtroEstado !== 'todos' && estadoRec !== filtroEstado) return false;

        const infoPlazo = calcularInfoPlazoRecordatorio(r.fecha_recordatorio);
        if (!infoPlazo) return false;

        if (filtroPlazo === 'proximos7') {
            if (infoPlazo.dias < 0 || infoPlazo.dias > 7) return false;
        } else if (filtroPlazo !== 'todos' && infoPlazo.categoria !== filtroPlazo) {
            return false;
        }

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

        const donante = r.donantes || globalDonantes.find(d => 
            d.id === r.donante_id || 
            (d.id && r.donante_id && String(d.id).toLowerCase() === String(r.donante_id).toLowerCase())
        ) || {
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
            
            if (elementoCreado && elementoCreado.id) {
                if (donante && !elementoCreado.donantes) {
                    elementoCreado.donantes = {
                        nombre: donante.nombre,
                        documento: donante.documento,
                        telefono: donante.telefono,
                        correo: donante.correo
                    };
                }
                store.globalRecordatorios.unshift(elementoCreado);
            } else {
                const { data: recsActualizados } = await recordatoriosService.obtenerRecordatorios();
                if (recsActualizados && recsActualizados.length > 0) {
                    store.globalRecordatorios = recsActualizados;
                }
            }

            cerrarModal('modal-recordatorio-donacion');
            mostrarNotificacion('exito', 'Recordatorio Creado', 'El recordatorio de donación ha sido programado con éxito.');
        }

        renderizarTablaRecordatorios();
        if (typeof window.actualizarKPIs === 'function') window.actualizarKPIs();
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
    let rec = store.globalRecordatorios.find(r => r.id === recordatorioId);
    if (!rec) return;

    const esUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(recordatorioId));
    let idParaBD = recordatorioId;

    if (!esUUID && String(recordatorioId).startsWith('rec_')) {
        const { data: recsReales } = await recordatoriosService.obtenerRecordatorios();
        if (recsReales && recsReales.length > 0) {
            store.globalRecordatorios = recsReales;
            const recCoincidente = recsReales.find(r => r.donante_id === rec.donante_id && r.fecha_recordatorio === rec.fecha_recordatorio) ||
                                  recsReales.find(r => r.donante_id === rec.donante_id);
            if (recCoincidente) {
                idParaBD = recCoincidente.id;
                rec = recCoincidente;
            }
        }
    }

    const donanteNombre = rec.donantes?.nombre || store.globalDonantes.find(d => d.id === rec.donante_id)?.nombre || 'Donante';

    try {
        const { error } = await recordatoriosService.actualizarEstadoRecordatorio(idParaBD, nuevoEstado);
        if (error) throw error;

        rec.estado_recordatorio = nuevoEstado;
        renderizarTablaRecordatorios();
        if (typeof window.actualizarKPIs === 'function') window.actualizarKPIs();
        mostrarNotificacion('exito', 'Estado Actualizado', `Recordatorio de ${donanteNombre} marcado como "${nuevoEstado}".`);
    } catch (e) {
        console.error('Error detallado al actualizar estado del recordatorio:', e);
        const infoError = clasificarErrorSupabase(e);
        const detalleTecnico = e?.message || e?.details || e?.hint || (typeof e === 'object' ? JSON.stringify(e) : String(e));
        const mensajeFinal = detalleTecnico 
            ? `${infoError?.mensaje || 'No se pudo actualizar el estado del recordatorio.'}\nMotivo: ${detalleTecnico}`
            : (infoError?.mensaje || 'No se pudo actualizar el estado del recordatorio.');
        mostrarNotificacion('peligro', infoError?.titulo || 'Error', mensajeFinal);
    }
}

export function confirmarEliminarRecordatorio(recordatorioId) {
    let rec = store.globalRecordatorios.find(r => r.id === recordatorioId);
    const donanteNombre = rec?.donantes?.nombre || store.globalDonantes.find(d => d.id === rec?.donante_id)?.nombre || 'este donante';

    mostrarNotificacion('peligro', 'Eliminar Recordatorio', `¿Deseas eliminar el recordatorio de ${donanteNombre}?`, async () => {
        try {
            const esUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(recordatorioId));
            let idParaBD = recordatorioId;

            if (!esUUID && String(recordatorioId).startsWith('rec_')) {
                const { data: recsReales } = await recordatoriosService.obtenerRecordatorios();
                if (recsReales && recsReales.length > 0) {
                    store.globalRecordatorios = recsReales;
                    const recCoincidente = recsReales.find(r => r.donante_id === rec?.donante_id && r.fecha_recordatorio === rec?.fecha_recordatorio) ||
                                          recsReales.find(r => r.donante_id === rec?.donante_id);
                    if (recCoincidente) {
                        idParaBD = recCoincidente.id;
                    }
                }
            }

            const { error } = await recordatoriosService.eliminarRecordatorio(idParaBD);
            if (error) {
                const infoError = clasificarErrorSupabase(error);
                return mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
            }

            store.globalRecordatorios = store.globalRecordatorios.filter(r => r.id !== recordatorioId && r.id !== idParaBD);
            renderizarTablaRecordatorios();
            if (typeof window.actualizarKPIs === 'function') window.actualizarKPIs();
            mostrarNotificacion('exito', 'Recordatorio Eliminado', 'El recordatorio ha sido eliminado correctamente.');
        } catch (err) {
            const infoError = clasificarErrorSupabase(err);
            mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
        }
    });
}
