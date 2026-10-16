/**
 * Módulo Donaciones
 * Registro, actualización y auditoría de transacciones financieras de recaudación, recibos e impresión.
 */
import { store } from '../../state/store.js';
import * as donacionesService from '../../services/donacionesService.js';
import { clasificarErrorSupabase } from '../../utils/supabaseErrors.js';
import { escaparHTML, formatearMonedaEstatica, formatearMoneda, normalizarACOP } from '../../utils/formatters.js';
import { obtenerFechaActualLocal, esFechaValida, esFechaFutura } from '../../utils/dates.js';
import { tienePermiso } from '../../utils/permissions.js';
import { mostrarNotificacion } from '../../components/toast.js';
import { cerrarModal, capturarEstadoInicialFormulario } from '../../components/modal.js';
import { actualizarKPIs, renderizarGraficos } from '../dashboard/index.js';

export function poblarSelectDonantes(donanteIdSeleccionado = null) {
    const select = document.getElementById('donacion-donante');
    if (!select) return;
    select.innerHTML = '<option value="">-- Seleccione donante activo --</option>';
    let donanteSeleccionadoIncluido = false;

    store.globalDonantes.filter(d => d && d.estado === 'Activo').forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.nombre} (${d.documento})`;
        if (donanteIdSeleccionado && d.id === donanteIdSeleccionado) {
            opt.selected = true;
            donanteSeleccionadoIncluido = true;
        }
        select.appendChild(opt);
    });

    if (donanteIdSeleccionado && !donanteSeleccionadoIncluido) {
        const donanteExistente = store.globalDonantes.find(d => d && d.id === donanteIdSeleccionado);
        if (donanteExistente) {
            const opt = document.createElement('option');
            opt.value = donanteExistente.id;
            opt.textContent = `${donanteExistente.nombre} (${donanteExistente.documento}) [${donanteExistente.estado}]`;
            opt.selected = true;
            select.appendChild(opt);
        }
    }
}

export function abrirModalDonacion(id = null) {
    if (id ? !tienePermiso('editar_donaciones') : !tienePermiso('crear_donaciones')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Tu rol no tiene autorización para registrar o modificar aportes.');
        return;
    }
    const form = document.getElementById('form-donacion');
    if (form) {
        form.reset();
        form.noValidate = true;
    }
    store.editandoDonacionId = id;

    const hoyLocal = obtenerFechaActualLocal();
    const fechaInput = document.getElementById('donacion-fecha');
    if (fechaInput) {
        fechaInput.max = hoyLocal;
    }

    const tituloEl = document.getElementById('titulo-modal-donacion');
    const btnGuardarEl = document.getElementById('btn-guardar-donacion');

    if (id) {
        if (tituloEl) tituloEl.innerText = 'Editar Donación';
        if (btnGuardarEl) btnGuardarEl.innerText = 'Guardar Cambios';

        const d = store.globalDonaciones.find(x => x.id === id);
        if (d) {
            poblarSelectDonantes(d.donante_id);
            const donanteSelect = document.getElementById('donacion-donante');
            if (donanteSelect) donanteSelect.value = d.donante_id || '';

            const montoInput = document.getElementById('donacion-monto');
            if (montoInput) montoInput.value = d.monto;

            const monedaSelect = document.getElementById('donacion-moneda');
            if (monedaSelect) monedaSelect.value = d.moneda_aporte || 'COP';

            if (fechaInput) fechaInput.value = d.fecha || hoyLocal;

            const medioSelect = document.getElementById('donacion-medio');
            if (medioSelect) medioSelect.value = d.medio || 'Transferencia';

            const compInput = document.getElementById('donacion-comprobante');
            if (compInput) compInput.value = d.comprobante === 'S/N' ? '' : (d.comprobante || '');

            const destSelect = document.getElementById('donacion-destinacion');
            if (destSelect && d.destinacion) {
                const existe = Array.from(destSelect.options).some(opt => opt.value === d.destinacion);
                if (!existe) {
                    const opt = document.createElement('option');
                    opt.value = d.destinacion;
                    opt.textContent = d.destinacion;
                    destSelect.appendChild(opt);
                }
                destSelect.value = d.destinacion;
            }

            const notaInput = document.getElementById('donacion-nota');
            if (notaInput) notaInput.value = d.nota || '';
        } else {
            poblarSelectDonantes();
        }
    } else {
        if (tituloEl) tituloEl.innerText = 'Registrar Donación';
        if (btnGuardarEl) btnGuardarEl.innerText = 'Registrar Aporte';
        poblarSelectDonantes();
        if (fechaInput) fechaInput.value = hoyLocal;
        const monedaSelect = document.getElementById('donacion-moneda');
        if (monedaSelect) monedaSelect.value = 'COP';
        const medioSelect = document.getElementById('donacion-medio');
        if (medioSelect) medioSelect.value = 'Transferencia';
    }

    const modal = document.getElementById('modal-donacion');
    if (modal) modal.classList.remove('hidden');
    capturarEstadoInicialFormulario('form-donacion');
}

export async function guardarDonacion() {
    if (store.editandoDonacionId ? !tienePermiso('editar_donaciones') : !tienePermiso('crear_donaciones')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'No cuentas con los permisos requeridos para registrar o modificar donaciones.');
        return;
    }
    const form = document.getElementById('form-donacion');
    if (form) form.noValidate = true;

    const donanteSelect = document.getElementById('donacion-donante');
    const donanteId = donanteSelect ? donanteSelect.value : '';
    if (!donanteId) return mostrarNotificacion('alerta', 'Faltan Datos', 'Debes seleccionar un donante.');

    const montoInput = document.getElementById('donacion-monto');
    const montoVal = parseFloat(montoInput ? montoInput.value : '');
    if (isNaN(montoVal) || montoVal <= 0) {
        return mostrarNotificacion('alerta', 'Monto Inválido', 'El monto de la donación debe ser un número mayor a 0.');
    }

    const inputFecha = document.getElementById('donacion-fecha');
    const fechaVal = inputFecha && inputFecha.value ? inputFecha.value.trim() : '';
    if (!fechaVal) return mostrarNotificacion('alerta', 'Faltan Datos', 'Debes indicar la fecha de recepción.');

    if (!esFechaValida(fechaVal)) {
        mostrarNotificacion('alerta', 'Fecha Inválida', 'Ingresa una fecha de donación válida.');
        if (inputFecha) {
            inputFecha.focus();
            if (typeof inputFecha.select === 'function') inputFecha.select();
        }
        return;
    }

    if (esFechaFutura(fechaVal)) {
        mostrarNotificacion('alerta', 'Fecha Inválida', 'La fecha de donación no puede ser futura.');
        if (inputFecha) {
            inputFecha.focus();
            if (typeof inputFecha.select === 'function') inputFecha.select();
        }
        return;
    }

    const destSelect = document.getElementById('donacion-destinacion');
    const destinacionVal = destSelect ? destSelect.value : '';
    if (!destinacionVal) return mostrarNotificacion('alerta', 'Faltan Datos', 'Debes seleccionar una destinación.');

    if (store.guardandoDonacion) return;
    store.guardandoDonacion = true;

    const btnGuardar = document.getElementById('btn-guardar-donacion');
    const textoOriginal = btnGuardar ? btnGuardar.innerText : (store.editandoDonacionId ? 'Guardar Cambios' : 'Registrar Aporte');
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.classList.add('opacity-70', 'cursor-not-allowed');
        btnGuardar.innerText = 'Guardando...';
    }

    const payload = {
        donante_id: donanteId,
        monto: montoVal,
        moneda_aporte: document.getElementById('donacion-moneda').value || 'COP',
        fecha: fechaVal,
        medio: document.getElementById('donacion-medio').value || 'Transferencia',
        comprobante: (document.getElementById('donacion-comprobante').value || '').trim() || 'S/N',
        destinacion: destinacionVal,
        nota: (document.getElementById('donacion-nota').value || '').trim()
    };

    try {
        if (store.editandoDonacionId) {
            const { error } = await donacionesService.actualizar(store.editandoDonacionId, payload);
            if (error) {
                const infoError = clasificarErrorSupabase(error);
                return mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
            }
            cerrarModal('modal-donacion', true);
            mostrarNotificacion('exito', 'Donación Actualizada', 'Los cambios han sido guardados correctamente en la base de datos.');
        } else {
            const { error } = await donacionesService.insertar([payload]);
            if (error) {
                const infoError = clasificarErrorSupabase(error);
                return mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
            }
            cerrarModal('modal-donacion', true);
            mostrarNotificacion('exito', 'Aporte Aprobado', 'Se insertó en la base de datos.');
        }

        if (window.cargarDatosSupabase) {
            await window.cargarDatosSupabase();
        }
    } catch (err) {
        const infoError = clasificarErrorSupabase(err);
        mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
    } finally {
        store.guardandoDonacion = false;
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.classList.remove('opacity-70', 'cursor-not-allowed');
            btnGuardar.innerText = textoOriginal;
        }
    }
}

export function confirmarEliminarDonacion(id) {
    if (!tienePermiso('eliminar_donaciones')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Tu rol no tiene autorización para eliminar donaciones.');
        return;
    }
    mostrarNotificacion('peligro', 'Reversar Transacción', '¿Desea eliminar la transacción de la base de datos?', async () => {
        if (store.eliminandoDonacion) return;
        store.eliminandoDonacion = true;
        try {
            store.globalDonaciones = store.globalDonaciones.filter(d => d.id !== id);

            renderizarTablaDonaciones();
            actualizarKPIs();
            renderizarGraficos();

            const { error } = await donacionesService.eliminar(id);
            if (error) {
                const info = clasificarErrorSupabase(error);
                mostrarNotificacion('peligro', info.titulo, info.mensaje);
                if (window.cargarDatosSupabase) await window.cargarDatosSupabase();
            } else {
                mostrarNotificacion('exito', 'Transacción Eliminada', 'Se borró la donación de la base de datos.');
            }
        } catch (err) {
            const info = clasificarErrorSupabase(err);
            mostrarNotificacion('peligro', info.titulo, info.mensaje);
            if (window.cargarDatosSupabase) await window.cargarDatosSupabase();
        } finally {
            store.eliminandoDonacion = false;
        }
    });
}

export function filtrarTablaDonaciones() {
    renderizarTablaDonaciones();
}

export function renderizarTablaDonaciones() {
    const buscarInput = document.getElementById('buscar-donacion');
    const filtroMesInput = document.getElementById('filtro-mes-tabla-donaciones');
    const filtroDestInput = document.getElementById('filtro-destinacion-donacion');

    const termino = (buscarInput?.value || '').trim().toLowerCase();
    const filtroMes = (filtroMesInput?.value || '').trim();
    const filtroDest = (filtroDestInput?.value || '').trim();
    const tbody = document.getElementById('tbody-donaciones');
    if (!tbody) return;
    tbody.innerHTML = '';

    const listaDonaciones = Array.isArray(store.globalDonaciones) ? store.globalDonaciones : [];

    const filtrados = listaDonaciones.filter(d => {
        if (!d) return false;
        const donante = Array.isArray(store.globalDonantes) ? store.globalDonantes.find(x => x && x.id === d.donante_id) : null;
        const nombreDonante = donante && donante.nombre ? donante.nombre.toLowerCase() : '';
        const comp = (d.comprobante || '').toLowerCase();
        
        const fechaVacia = !d.fecha || String(d.fecha).trim() === '' || d.fecha === 'Sin fecha';
        const donanteIncompleto = !donante || !d.donante_id || !donante.nombre || donante.nombre.toLowerCase().includes('sin vincular') || donante.nombre.toLowerCase().includes('sin registrar') || !donante.documento;
        const montoIncompleto = !d.monto || Number(d.monto) <= 0;
        const medioIncompleto = !d.medio || String(d.medio).trim() === '' || d.medio === 'No especificado';
        const destIncompleta = !d.destinacion || String(d.destinacion).trim() === '' || d.destinacion === 'No especificada';
        const compIncompleto = !d.comprobante || String(d.comprobante).trim() === '' || d.comprobante === 'S/N' || d.comprobante === 'N/A';
        const esIncompleta = fechaVacia || donanteIncompleto || montoIncompleto || medioIncompleto || destIncompleta || compIncompleto;

        const matchBusqueda = termino === '' || 
            comp.includes(termino) || 
            nombreDonante.includes(termino) ||
            (esIncompleta && (termino.includes('incomplet') || termino.includes('sin') || termino.includes('falt')));

        const matchMes = filtroMes === '' || (d.fecha && String(d.fecha).startsWith(filtroMes));

        let matchDest = false;
        if (filtroDest === '') {
            matchDest = true;
        } else if (filtroDest === 'incompletas') {
            matchDest = esIncompleta;
        } else {
            matchDest = d.destinacion && String(d.destinacion) === filtroDest;
        }

        return matchBusqueda && matchMes && matchDest;
    });

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center"><div class="flex flex-col items-center justify-center max-w-sm mx-auto"><div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3"><i class="fa-solid fa-receipt text-xl"></i></div><p class="font-bold text-slate-700 text-sm mb-1">No hay donaciones registradas</p><p class="text-xs text-slate-400">No se encontraron aportes que coincidan con los filtros aplicados.</p></div></td></tr>`;
        return;
    }

    filtrados.forEach(d => {
        const donante = Array.isArray(store.globalDonantes) ? store.globalDonantes.find(x => x && x.id === d.donante_id) : null;
        const moneda = d.moneda_aporte || 'COP';
        
        // Convert to COP then to the global currency
        const montoCOP = normalizarACOP(d.monto, moneda, store.tasasCambio);
        const montoConvertidoFormateado = formatearMoneda(montoCOP, store.monedaActual, store.tasasCambio, store.locMoneda);
        
        const fechaVacia = !d.fecha || String(d.fecha).trim() === '' || d.fecha === 'Sin fecha';
        const donanteIncompleto = !donante || !d.donante_id || !donante.nombre || donante.nombre.toLowerCase().includes('sin vincular') || donante.nombre.toLowerCase().includes('sin registrar');
        const montoIncompleto = !d.monto || Number(d.monto) <= 0;
        const medioIncompleto = !d.medio || String(d.medio).trim() === '' || d.medio === 'No especificado';
        const destIncompleta = !d.destinacion || String(d.destinacion).trim() === '' || d.destinacion === 'No especificada';
        const compIncompleto = !d.comprobante || String(d.comprobante).trim() === '' || d.comprobante === 'S/N' || d.comprobante === 'N/A';

        const esIncompleta = fechaVacia || donanteIncompleto || montoIncompleto || medioIncompleto || destIncompleta || compIncompleto;
        const donacionId = d.id || '';

        const idSeguro = escaparHTML(donacionId);
        let botonesAcciones = `<button type="button" onclick="imprimirRecibo('${idSeguro}')" class="ui-icon-btn" title="Imprimir Recibo" aria-label="Imprimir recibo"><i class="fa-solid fa-print"></i></button>`;
        if (tienePermiso('editar_donaciones')) {
            botonesAcciones += `<button type="button" onclick="abrirModalDonacion('${idSeguro}')" class="ui-icon-btn" title="Editar Donación" aria-label="Editar donación"><i class="fa-solid fa-pen"></i></button>`;
        }
        if (tienePermiso('eliminar_donaciones')) {
            botonesAcciones += `<button type="button" onclick="confirmarEliminarDonacion('${idSeguro}')" class="ui-icon-btn danger" title="Eliminar" aria-label="Eliminar donación"><i class="fa-solid fa-trash"></i></button>`;
        }

        // Renderizado destacado en rojo para cada campo faltante
        const fechaHtml = fechaVacia
            ? `<span class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-xs font-semibold"><i class="fa-solid fa-calendar-xmark text-[10px]"></i> Sin fecha</span>`
            : `<span class="font-medium text-slate-700">${escaparHTML(d.fecha)}</span>`;

        let donanteHtml = '';
        if (donanteIncompleto) {
            donanteHtml = `<div class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-xs font-semibold"><i class="fa-solid fa-user-xmark text-[10px]"></i> Donante sin vincular</div>`;
        } else {
            const docDetalle = !donante.documento
                ? '<span class="text-[10px] text-rose-500 font-bold block">(Sin documento)</span>'
                : `<div class="text-[11px] text-slate-400 font-mono">${escaparHTML(donante.documento)}</div>`;
            donanteHtml = `<div class="font-bold text-slate-800">${escaparHTML(donante.nombre)}</div>${docDetalle}`;
        }

        const montoHtml = montoIncompleto
            ? `<span class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-xs font-bold"><i class="fa-solid fa-circle-exclamation text-[10px]"></i> Sin monto ($0)</span>`
            : `<div class="font-bold text-emerald-600">${montoConvertidoFormateado}</div>${moneda !== store.monedaActual ? `<div class="text-[10px] text-slate-400">Original: ${escaparHTML(formatearMonedaEstatica(d.monto, moneda))}</div>` : ''}`;

        const medioHtml = medioIncompleto
            ? `<span class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-xs font-semibold"><i class="fa-solid fa-credit-card text-[10px]"></i> Sin medio</span>`
            : `<span class="text-sm text-slate-600">${escaparHTML(d.medio)}</span>`;

        const destHtml = destIncompleta
            ? `<span class="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 rounded-full text-xs font-bold shadow-sm"><i class="fa-solid fa-tag text-[10px]"></i> Sin destinación</span>`
            : `<span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">${escaparHTML(d.destinacion)}</span>`;

        const compHtml = compIncompleto
            ? `<span class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-xs font-mono font-medium"><i class="fa-solid fa-receipt text-[10px]"></i> Sin comprobante</span>`
            : `<span class="font-mono text-xs text-slate-500">${escaparHTML(d.comprobante)}</span>`;

        const tr = document.createElement('tr');
        if (esIncompleta) {
            tr.className = 'border-b border-rose-100/80 bg-rose-50/20 hover:bg-rose-50/40 even:bg-rose-50/30 transition-colors';
        } else {
            tr.className = 'border-b border-slate-100 hover:bg-slate-50/80 even:bg-slate-50/50 transition-colors';
        }

        tr.innerHTML = `
            <td class="px-6 py-4">${fechaHtml}</td>
            <td class="px-6 py-4">${donanteHtml}</td>
            <td class="px-6 py-4">${montoHtml}</td>
            <td class="px-6 py-4">${medioHtml}</td>
            <td class="px-6 py-4">${destHtml}</td>
            <td class="px-6 py-4">${compHtml}</td>
            <td class="px-6 py-4 text-right space-x-2">
                ${botonesAcciones}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

export function imprimirRecibo(id) {
    const d = store.globalDonaciones.find(x => x.id === id);
    if (!d) return;
    const donante = store.globalDonantes.find(x => x.id === d.donante_id);

    document.getElementById('recibo-comp').innerText = d.comprobante || `REF-${d.id.substring(0, 8)}`;
    document.getElementById('recibo-fecha').innerText = d.fecha;
    document.getElementById('recibo-donante-nombre').innerText = donante ? donante.nombre : 'Donante Desconocido';
    document.getElementById('recibo-donante-doc').innerText = donante ? donante.documento : '-';
    document.getElementById('recibo-destinacion').innerText = d.destinacion;
    document.getElementById('recibo-medio').innerText = d.medio;
    document.getElementById('recibo-monto').innerText = `${formatearMonedaEstatica(d.monto, d.moneda_aporte)} ${d.moneda_aporte}`;

    window.print();
}
