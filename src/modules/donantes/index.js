/**
 * Módulo Donantes
 * Gestión integral de perfiles de donantes (CRUD), validaciones de identidad, historial de aportes y métricas.
 */
import { store } from '../../state/store.js';
import * as donantesService from '../../services/donantesService.js';
import * as donacionesService from '../../services/donacionesService.js';
import * as recordatoriosService from '../../services/recordatoriosService.js';
import { clasificarErrorSupabase } from '../../utils/supabaseErrors.js';
import { escaparHTML, normalizarDocumento, formatearMoneda, normalizarACOP } from '../../utils/formatters.js';
import { obtenerFechaActualLocal, esFechaValida, esFechaFutura } from '../../utils/dates.js';
import { validarEmail, validarTelefono } from '../../utils/validation.js';
import { tienePermiso } from '../../utils/permissions.js';
import { mostrarNotificacion } from '../../components/toast.js';
import { cerrarModal, capturarEstadoInicialFormulario } from '../../components/modal.js';

export function abrirModalDonante(id = null) {
    if (id ? !tienePermiso('editar_donantes') : !tienePermiso('crear_donantes')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Tu rol no tiene autorización para crear o modificar donantes.');
        return;
    }
    const form = document.getElementById('form-donante');
    if (form) {
        form.reset();
        form.noValidate = true;
    }
    const hoyLocal = obtenerFechaActualLocal();
    const inputFechaNac = document.getElementById('donante-fecha-nac');
    if (inputFechaNac) {
        inputFechaNac.max = hoyLocal;
    }
    store.editandoDonanteId = id;
    const tituloModal = document.getElementById('titulo-modal-donante');
    const btnGuardar = document.getElementById('btn-guardar-donante');

    if (id) {
        if (tituloModal) tituloModal.innerText = 'Editar Donante';
        if (btnGuardar) btnGuardar.innerText = 'Guardar Cambios';
        const d = store.globalDonantes.find(x => x.id === id);
        if (d) {
            document.getElementById('donante-nombre').value = d.nombre;
            document.getElementById('donante-documento').value = d.documento;
            document.getElementById('donante-fecha-nac').value = d.fecha_nac || '';
            document.getElementById('donante-telefono').value = d.telefono || '';
            document.getElementById('donante-correo').value = d.correo || '';
            document.getElementById('donante-tipo').value = d.tipo || 'Natural';
            document.getElementById('donante-periodicidad').value = d.periodicidad || 'Ocasional';
            document.getElementById('donante-estado').value = d.estado || 'Activo';
            document.getElementById('donante-nota').value = d.nota || '';

            const recExistente = store.globalRecordatorios.find(r => r.donante_id === id && r.estado_recordatorio !== 'Gestionado') ||
                store.globalRecordatorios.find(r => r.donante_id === id);
            const recFechaInput = document.getElementById('donante-fecha-recordatorio');
            if (recFechaInput) recFechaInput.value = recExistente?.fecha_recordatorio || '';
            const recEstadoSelect = document.getElementById('donante-estado-recordatorio');
            if (recEstadoSelect) recEstadoSelect.value = recExistente?.estado_recordatorio || 'Pendiente';
            const recMontoInput = document.getElementById('donante-monto-recordatorio');
            if (recMontoInput) recMontoInput.value = recExistente?.monto_recordatorio || '';
        }
    } else {
        if (tituloModal) tituloModal.innerText = 'Nuevo Donante';
        if (btnGuardar) btnGuardar.innerText = 'Guardar Datos';
        const recFechaInput = document.getElementById('donante-fecha-recordatorio');
        if (recFechaInput) recFechaInput.value = '';
        const recEstadoSelect = document.getElementById('donante-estado-recordatorio');
        if (recEstadoSelect) recEstadoSelect.value = 'Pendiente';
        const recMontoInput = document.getElementById('donante-monto-recordatorio');
        if (recMontoInput) recMontoInput.value = '';
    }
    const modal = document.getElementById('modal-donante');
    if (modal) modal.classList.remove('hidden');
    capturarEstadoInicialFormulario('form-donante');
}

export async function guardarDonante() {
    if (store.editandoDonanteId ? !tienePermiso('editar_donantes') : !tienePermiso('crear_donantes')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'No cuentas con los permisos necesarios para guardar datos de donantes.');
        return;
    }
    const form = document.getElementById('form-donante');
    if (form) form.noValidate = true;

    const inputNombre = document.getElementById('donante-nombre');
    const inputDoc = document.getElementById('donante-documento');
    const inputFechaNac = document.getElementById('donante-fecha-nac');
    const inputTel = document.getElementById('donante-telefono');
    const inputCorreo = document.getElementById('donante-correo');

    const nombreTrimmed = (inputNombre ? inputNombre.value : '').trim();
    const rawDocumento = inputDoc ? inputDoc.value : '';
    const documentoTrimmed = String(rawDocumento || '').trim();
    const fechaNacValor = inputFechaNac && inputFechaNac.value ? inputFechaNac.value.trim() : '';
    const telefonoTrimmed = (inputTel ? inputTel.value : '').trim();
    const correoTrimmed = (inputCorreo ? inputCorreo.value : '').trim();

    if (!nombreTrimmed || !documentoTrimmed) {
        return mostrarNotificacion('alerta', 'Datos Incompletos', 'Completa los campos requeridos con (*).');
    }

    if (inputFechaNac && inputFechaNac.required && !fechaNacValor) {
        return mostrarNotificacion('alerta', 'Datos Incompletos', 'Completa los campos requeridos con (*).');
    }

    if (fechaNacValor) {
        if (!esFechaValida(fechaNacValor)) {
            mostrarNotificacion('alerta', 'Fecha Inválida', 'Ingresa una fecha de nacimiento válida.');
            if (inputFechaNac) {
                inputFechaNac.focus();
                if (typeof inputFechaNac.select === 'function') inputFechaNac.select();
            }
            return;
        }

        if (esFechaFutura(fechaNacValor)) {
            mostrarNotificacion('alerta', 'Fecha Inválida', 'La fecha de nacimiento no puede ser futura.');
            if (inputFechaNac) {
                inputFechaNac.focus();
                if (typeof inputFechaNac.select === 'function') inputFechaNac.select();
            }
            return;
        }
    }

    if (!validarTelefono(telefonoTrimmed)) {
        mostrarNotificacion('alerta', 'Teléfono Inválido', 'Ingresa un número de teléfono válido.');
        if (inputTel) {
            inputTel.focus();
            inputTel.select();
        }
        return;
    }

    if (!validarEmail(correoTrimmed)) {
        mostrarNotificacion('alerta', 'Correo Inválido', 'Ingresa un correo electrónico válido.');
        if (inputCorreo) {
            inputCorreo.focus();
            inputCorreo.select();
        }
        return;
    }

    const docNorm = normalizarDocumento(documentoTrimmed);

    if (docNorm !== '') {
        const duplicadoEnMemoria = store.globalDonantes.find(d => {
            if (store.editandoDonanteId && String(d.id) === String(store.editandoDonanteId)) {
                return false;
            }
            const dNorm = normalizarDocumento(d.documento);
            return dNorm !== '' && dNorm === docNorm;
        });

        if (duplicadoEnMemoria) {
            mostrarNotificacion('alerta', 'Documento Duplicado', 'Ya existe un donante registrado con este documento.');
            if (inputDoc) {
                inputDoc.focus();
                inputDoc.select();
            }
            return;
        }

        try {
            const { data: coincidenciasBD, error: errVerif } = await donantesService.buscarPorDocumento(documentoTrimmed);
            if (!errVerif && Array.isArray(coincidenciasBD) && coincidenciasBD.length > 0) {
                const duplicadoBD = coincidenciasBD.find(d => {
                    if (store.editandoDonanteId && String(d.id) === String(store.editandoDonanteId)) {
                        return false;
                    }
                    const dDocNorm = normalizarDocumento(d.documento);
                    return dDocNorm !== '' && dDocNorm === docNorm;
                });
                if (duplicadoBD) {
                    mostrarNotificacion('alerta', 'Documento Duplicado', 'Ya existe un donante registrado con este documento en la base de datos.');
                    if (inputDoc) {
                        inputDoc.focus();
                        inputDoc.select();
                    }
                    return;
                }
            }
        } catch (errRemoto) {
            console.warn('Advertencia en verificación remota de documento:', errRemoto);
        }
    }

    if (store.guardandoDonante) return;
    store.guardandoDonante = true;

    const btnGuardar = document.getElementById('btn-guardar-donante');
    const textoOriginal = btnGuardar ? btnGuardar.innerText : (store.editandoDonanteId ? 'Guardar Cambios' : 'Guardar Datos');
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.classList.add('opacity-70', 'cursor-not-allowed');
        btnGuardar.innerText = 'Guardando...';
    }

    const payload = {
        nombre: nombreTrimmed || 'Sin nombre registrado',
        documento: docNorm !== '' ? documentoTrimmed : null,
        fecha_nac: fechaNacValor ? fechaNacValor : null,
        telefono: telefonoTrimmed,
        correo: correoTrimmed,
        tipo: document.getElementById('donante-tipo').value,
        periodicidad: document.getElementById('donante-periodicidad').value,
        estado: document.getElementById('donante-estado').value,
        nota: (document.getElementById('donante-nota').value || '').trim()
    };

    try {
        let targetId = store.editandoDonanteId;
        if (store.editandoDonanteId) {
            const { error } = await donantesService.actualizar(store.editandoDonanteId, payload);
            if (error) {
                const infoError = clasificarErrorSupabase(error);
                return mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
            }
            cerrarModal('modal-donante', true);
            mostrarNotificacion('exito', 'Perfil Actualizado', 'Modificaciones guardadas en la base de datos.');
        } else {
            payload.fecha_registro = obtenerFechaActualLocal();
            const { data: resInsert, error } = await donantesService.insertar([payload]);
            if (error) {
                const infoError = clasificarErrorSupabase(error);
                return mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
            }
            if (resInsert) {
                targetId = Array.isArray(resInsert) ? resInsert[0]?.id : resInsert?.id;
            }
            cerrarModal('modal-donante', true);
            mostrarNotificacion('exito', 'Registro Exitoso', 'Donante ingresado a la base de datos.');
        }

        const fechaRecVal = (document.getElementById('donante-fecha-recordatorio')?.value || '').trim();
        if (fechaRecVal && esFechaValida(fechaRecVal)) {
            const estadoRecVal = document.getElementById('donante-estado-recordatorio')?.value || 'Pendiente';
            const montoRecVal = parseFloat(document.getElementById('donante-monto-recordatorio')?.value) || null;
            const recExistente = targetId ? (store.globalRecordatorios.find(r => r.donante_id === targetId && r.estado_recordatorio !== 'Gestionado') ||
                store.globalRecordatorios.find(r => r.donante_id === targetId)) : null;

            if (recExistente) {
                await recordatoriosService.actualizarRecordatorio(recExistente.id, {
                    fecha_recordatorio: fechaRecVal,
                    estado_recordatorio: estadoRecVal,
                    monto_recordatorio: montoRecVal
                });
            } else if (targetId) {
                await recordatoriosService.crearRecordatorio({
                    donante_id: targetId,
                    fecha_recordatorio: fechaRecVal,
                    estado_recordatorio: estadoRecVal,
                    monto_recordatorio: montoRecVal
                });
            }
        }

        if (window.cargarDatosSupabase) {
            await window.cargarDatosSupabase();
        }
    } catch (err) {
        const infoError = clasificarErrorSupabase(err);
        mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
    } finally {
        store.guardandoDonante = false;
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.classList.remove('opacity-70', 'cursor-not-allowed');
            btnGuardar.innerText = textoOriginal;
        }
    }
}

export function confirmarEliminarDonante(id) {
    if (!tienePermiso('eliminar_donantes')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Tu rol no tiene autorización para eliminar donantes.');
        return;
    }
    mostrarNotificacion('peligro', 'Eliminar Permanente', '¿Borrar este donante y sus transacciones asociadas?', async () => {
        if (store.eliminandoDonante) return;
        store.eliminandoDonante = true;
        try {
            const { error: errDonaciones } = await donacionesService.eliminarPorDonante(id);
            if (errDonaciones) {
                const info = clasificarErrorSupabase(errDonaciones);
                return mostrarNotificacion('peligro', info.titulo, 'No se pudieron eliminar las transacciones asociadas: ' + info.mensaje);
            }

            const { error: errDonante } = await donantesService.eliminar(id);
            if (errDonante) {
                const info = clasificarErrorSupabase(errDonante);
                return mostrarNotificacion('peligro', info.titulo, info.mensaje);
            }

            mostrarNotificacion('exito', 'Eliminado', 'Registro borrado permanentemente.');
            if (window.cargarDatosSupabase) {
                await window.cargarDatosSupabase();
            }
        } catch (err) {
            const info = clasificarErrorSupabase(err);
            mostrarNotificacion('peligro', info.titulo, info.mensaje);
        } finally {
            store.eliminandoDonante = false;
        }
    });
}

export function filtrarTablaDonantes() {
    renderizarTablaDonantes();
}

export function renderizarTablaDonantes() {
    const inputBuscar = document.getElementById('buscar-donante');
    const selectEstado = document.getElementById('filtro-estado-donante');
    const selectTipo = document.getElementById('filtro-tipo-donante');
    const selectPeri = document.getElementById('filtro-periodicidad-donante');

    const termino = inputBuscar ? inputBuscar.value.toLowerCase().trim() : '';
    const estado = selectEstado ? selectEstado.value : '';
    const tipoP = selectTipo ? selectTipo.value : '';
    const peri = selectPeri ? selectPeri.value : '';
    const tbody = document.getElementById('tbody-donantes');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtrados = store.globalDonantes.filter(d => {
        if (!d) return false;
        const coincideNombreODoc = (d.nombre && d.nombre.toLowerCase().includes(termino)) ||
            (d.documento && String(d.documento).includes(termino)) ||
            ((!d.nombre || !d.documento) && (termino.includes('incomplet') || termino.includes('sin') || termino.includes('falt')));
        
        let coincidePeri = false;
        if (peri === '') {
            coincidePeri = true;
        } else if (peri === 'proximas3dias') {
            coincidePeri = !!(d._flagProximaDonacion && d._flagProximaDonacion.activa);
        } else {
            coincidePeri = d.periodicidad === peri;
        }

        const tieneCamposFaltantes = !d.nombre || d.nombre === 'Sin nombre registrado' || !d.documento || !d.telefono || !d.correo;
        let coincideEstado = false;
        if (estado === '') coincideEstado = true;
        else if (estado === 'incompletos') coincideEstado = tieneCamposFaltantes;
        else coincideEstado = d.estado === estado;

        return coincideNombreODoc &&
            coincideEstado &&
            (tipoP === '' || d.tipo === tipoP) &&
            coincidePeri;
    });

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center"><div class="flex flex-col items-center justify-center max-w-sm mx-auto"><div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3"><i class="fa-solid fa-users-slash text-xl"></i></div><p class="font-bold text-slate-700 text-sm mb-1">No se encontraron donantes</p><p class="text-xs text-slate-400">Verifica los filtros o el término de búsqueda ingresado.</p></div></td></tr>`;
        return;
    }

    filtrados.forEach(d => {
        const tr = document.createElement('tr');

        const docVacio = !d.documento || String(d.documento).trim() === '';
        const telVacio = !d.telefono || String(d.telefono).trim() === '';
        const correoVacio = !d.correo || String(d.correo).trim() === '';
        const nombreVacio = !d.nombre || d.nombre.trim() === '' || d.nombre === 'Sin nombre registrado';
        const tipoVacio = !d.tipo || String(d.tipo).trim() === '';
        const periVacia = !d.periodicidad || String(d.periodicidad).trim() === '';
        const estadoVacio = !d.estado || String(d.estado).trim() === '';

        const tieneCamposFaltantes = docVacio || telVacio || correoVacio || nombreVacio || tipoVacio || periVacia;

        if (tieneCamposFaltantes) {
            tr.className = 'border-b border-rose-100/80 bg-rose-50/20 hover:bg-rose-50/40 even:bg-rose-50/30 transition-colors';
        } else {
            tr.className = 'border-b border-slate-100 hover:bg-slate-50/80 even:bg-slate-50/50 transition-colors';
        }

        let badgeEstado = '';
        if (estadoVacio) badgeEstado = '<span class="bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1 rounded-full text-xs font-bold shadow-sm">Sin estado</span>';
        else if (d.estado === 'Activo') badgeEstado = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">Activo</span>';
        else if (d.estado === 'Inactivo') badgeEstado = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">Inactivo</span>';
        else badgeEstado = '<span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">Retirado</span>';

        const idSeguro = escaparHTML(d.id);
        let flagHtml = '';
        let botonContactoProximo = '';

        if (d._flagProximaDonacion && d._flagProximaDonacion.activa) {
            const f = d._flagProximaDonacion;
            const plazoBadge = f.diasFaltantes === 0
                ? '<span class="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse">¡Hoy!</span>'
                : f.diasFaltantes === 1
                    ? '<span class="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold">Mañana</span>'
                    : `<span class="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold">En ${f.diasFaltantes}d</span>`;

            flagHtml = `
                <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-1 rounded-md bg-amber-50 border border-amber-300/80 text-[11px] font-bold text-amber-900 shadow-2xs" title="Próxima donación esperada el ${escaparHTML(f.fechaEsperadaStr)} (${escaparHTML(f.motivo)})">
                    <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0"></span>
                    <span class="truncate">⚡ Próxima donación:</span>
                    ${plazoBadge}
                </div>
            `;

            if (d.telefono) {
                const msg = `Hola ${d.nombre}, te saludamos de FundaciónCRM para confirmar los detalles de tu próximo aporte programado para el ${f.fechaEsperadaStr}. ¡Muchas gracias por tu valioso apoyo!`;
                let telLimpio = String(d.telefono).replace(/\D/g, '');
                if (telLimpio.length === 10 && telLimpio.startsWith('3')) telLimpio = '57' + telLimpio;
                const urlWa = `https://wa.me/${telLimpio}?text=${encodeURIComponent(msg)}`;
                botonContactoProximo = `<a href="${urlWa}" target="_blank" rel="noopener noreferrer" class="ui-icon-btn text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title="Contactar por WhatsApp sobre próxima donación" aria-label="Contactar por WhatsApp"><i class="fa-brands fa-whatsapp text-sm"></i></a>`;
            }
        }

        let botonesAcciones = `${botonContactoProximo}<button type="button" onclick="verDetalleDonante('${idSeguro}')" class="ui-icon-btn" title="Ver Detalle" aria-label="Ver detalle"><i class="fa-solid fa-eye"></i></button>`;
        if (tienePermiso('editar_donantes')) {
            botonesAcciones += `<button type="button" onclick="abrirModalDonante('${idSeguro}')" class="ui-icon-btn" title="Editar" aria-label="Editar donante"><i class="fa-solid fa-pen"></i></button>`;
        }
        if (tienePermiso('eliminar_donantes')) {
            botonesAcciones += `<button type="button" onclick="confirmarEliminarDonante('${idSeguro}')" class="ui-icon-btn danger" title="Eliminar" aria-label="Eliminar donante"><i class="fa-solid fa-trash"></i></button>`;
        }

        // Renderizado con destaque en rojo de campos faltantes
        const nombreHtml = nombreVacio
            ? `<div class="inline-flex items-center gap-1.5 text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-xs font-bold"><i class="fa-solid fa-triangle-exclamation text-[10px]"></i> Sin nombre registrado</div>`
            : `<div class="font-bold text-slate-800">${escaparHTML(d.nombre)}</div>`;

        const alertaFaltantes = tieneCamposFaltantes
            ? `<div class="inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded-md bg-rose-100/70 border border-rose-300 text-[11px] font-bold text-rose-800" title="Este registro tiene datos faltantes. Haz clic en el lápiz para completarlos."><i class="fa-solid fa-circle-exclamation text-[10px] text-rose-600"></i> Datos incompletos</div>`
            : '';

        const docHtml = docVacio
            ? `<span class="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-xs font-bold"><i class="fa-solid fa-id-card-clip text-[10px] text-rose-500"></i> Sin documento</span>`
            : `<span class="font-mono text-sm text-slate-600">${escaparHTML(d.documento)}</span>`;

        const telHtml = telVacio
            ? `<div class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-[11px] font-semibold"><i class="fa-solid fa-phone-slash text-[9px]"></i> Sin teléfono</div>`
            : `<div class="text-sm font-medium text-slate-700">${escaparHTML(d.telefono)}</div>`;

        const correoHtml = correoVacio
            ? `<div class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-[11px] font-semibold mt-0.5"><i class="fa-solid fa-envelope text-[9px]"></i> Sin correo</div>`
            : `<div class="text-xs text-slate-500">${escaparHTML(d.correo)}</div>`;

        const tipoHtml = tipoVacio
            ? `<div class="text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-xs font-semibold inline-block">Sin tipo</div>`
            : `<div class="text-sm text-slate-700">${escaparHTML(d.tipo)}</div>`;

        const periHtml = periVacia
            ? `<div class="text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-xs font-semibold inline-block mt-0.5">Sin periodicidad</div>`
            : `<div class="text-xs font-bold text-blue-600">${escaparHTML(d.periodicidad)}</div>`;

        tr.innerHTML = `
            <td class="px-6 py-4">
                ${nombreHtml}
                <div class="text-[11px] text-slate-400 uppercase mt-0.5">Registrado: ${escaparHTML(d.fecha_registro || '-')}</div>
                ${alertaFaltantes}
                ${flagHtml}
            </td>
            <td class="px-6 py-4">${docHtml}</td>
            <td class="px-6 py-4">
                ${telHtml}
                ${correoHtml}
            </td>
            <td class="px-6 py-4">
                ${tipoHtml}
                ${periHtml}
            </td>
            <td class="px-6 py-4">${badgeEstado}</td>
            <td class="px-6 py-4 text-right space-x-2">
                ${botonesAcciones}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

export function verDetalleDonante(id) {
    const d = store.globalDonantes.find(x => x.id === id);
    if (!d) return;
    const inputOculto = document.getElementById('detalle-id-oculto');
    if (inputOculto) inputOculto.value = id;

    // 1. Identidad en Header
    const nombreEl = document.getElementById('detalle-nombre');
    if (nombreEl) {
        if (!d.nombre || d.nombre.trim() === '' || d.nombre === 'Sin nombre registrado') {
            nombreEl.innerHTML = '<span class="text-rose-300 font-bold bg-rose-950/60 px-2.5 py-0.5 rounded border border-rose-500/40">Sin nombre registrado</span>';
        } else {
            nombreEl.innerText = d.nombre;
        }
    }

    const docEl = document.getElementById('detalle-doc');
    if (docEl) {
        if (!d.documento || String(d.documento).trim() === '') {
            docEl.innerHTML = '<span class="text-rose-300 font-bold bg-rose-950/60 px-2 py-0.5 rounded border border-rose-500/40">⚠️ Sin documento registrado</span>';
        } else {
            docEl.innerText = `ID: ${d.documento}`;
        }
    }

    const avatarIcono = document.getElementById('detalle-avatar-icono');
    if (avatarIcono) {
        avatarIcono.innerHTML = d.tipo === 'Juridica'
            ? '<i class="fa-solid fa-building"></i>'
            : '<i class="fa-solid fa-user"></i>';
    }

    const badgeTipo = document.getElementById('detalle-badge-tipo');
    if (badgeTipo) {
        badgeTipo.innerText = d.tipo || 'Sin tipo';
        badgeTipo.className = `px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
            d.tipo === 'Juridica'
                ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30'
                : 'bg-white/15 text-blue-100 border border-white/20'
        }`;
    }

    const badgeEstado = document.getElementById('detalle-badge-estado');
    if (badgeEstado) {
        const est = d.estado || 'Activo';
        badgeEstado.innerText = est;
        if (est === 'Activo') {
            badgeEstado.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
        } else if (est === 'Inactivo') {
            badgeEstado.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-400/30';
        } else {
            badgeEstado.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-rose-500/20 text-rose-300 border border-rose-400/30';
        }
    }

    const fechaRegEl = document.getElementById('detalle-fecha-registro');
    if (fechaRegEl) {
        fechaRegEl.innerText = `Registrado: ${d.fecha_registro || d.created_at?.slice(0, 10) || 'Sin fecha'}`;
    }

    // 2. Banner de campos faltantes
    const faltantes = [];
    if (!d.nombre || d.nombre.trim() === '' || d.nombre === 'Sin nombre registrado') faltantes.push('Nombre');
    if (!d.documento || String(d.documento).trim() === '') faltantes.push('Documento');
    if (!d.telefono || String(d.telefono).trim() === '') faltantes.push('Teléfono');
    if (!d.correo || String(d.correo).trim() === '') faltantes.push('Correo');
    if (!d.fecha_nac) faltantes.push('Fecha de nacimiento');
    if (!d.tipo) faltantes.push('Tipo de persona');
    if (!d.periodicidad) faltantes.push('Periodicidad');

    const bannerFaltantes = document.getElementById('detalle-banner-faltantes');
    const listaFaltantesEl = document.getElementById('detalle-lista-faltantes');
    if (bannerFaltantes) {
        if (faltantes.length > 0) {
            bannerFaltantes.classList.remove('hidden');
            if (listaFaltantesEl) listaFaltantesEl.innerText = `Faltan registrar: ${faltantes.join(', ')}.`;
        } else {
            bannerFaltantes.classList.add('hidden');
        }
    }

    // 3. Tarjeta 1: Contacto (Teléfono y Correo)
    const telCont = document.getElementById('detalle-telefono-contenedor');
    if (telCont) {
        if (d.telefono && String(d.telefono).trim() !== '') {
            const telLimpio = String(d.telefono).trim();
            const telSoloNumeros = telLimpio.replace(/\D/g, '');
            telCont.innerHTML = `
                <div class="flex items-center gap-2 flex-wrap">
                    <a href="tel:${telLimpio}" class="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1">
                        <i class="fa-solid fa-phone text-xs"></i> ${escaparHTML(telLimpio)}
                    </a>
                    ${telSoloNumeros.length >= 7 ? `
                        <a href="https://wa.me/${telSoloNumeros}" target="_blank" rel="noopener noreferrer" class="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md text-[11px] font-bold inline-flex items-center gap-1 transition-colors" title="Abrir WhatsApp">
                            <i class="fa-brands fa-whatsapp text-emerald-600"></i> WhatsApp
                        </a>
                    ` : ''}
                </div>
            `;
        } else {
            telCont.innerHTML = '<span class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-xs font-semibold"><i class="fa-solid fa-phone-slash text-[10px]"></i> Sin teléfono registrado</span>';
        }
    }

    const correoCont = document.getElementById('detalle-correo-contenedor');
    if (correoCont) {
        if (d.correo && String(d.correo).trim() !== '') {
            const correoLimpio = String(d.correo).trim();
            correoCont.innerHTML = `
                <a href="mailto:${correoLimpio}" class="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1.5 break-all">
                    <i class="fa-solid fa-envelope text-xs"></i> ${escaparHTML(correoLimpio)}
                </a>
            `;
        } else {
            correoCont.innerHTML = '<span class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-xs font-semibold"><i class="fa-solid fa-envelope text-[10px]"></i> Sin correo registrado</span>';
        }
    }

    // 4. Tarjeta 2: Perfil (Tipo persona y Fecha de nacimiento con cálculo de edad)
    const tipoPersonaEl = document.getElementById('detalle-tipo-persona');
    if (tipoPersonaEl) {
        tipoPersonaEl.innerText = d.tipo === 'Juridica' ? 'Persona Jurídica (Empresa/Entidad)' : (d.tipo === 'Natural' ? 'Persona Natural' : 'Sin especificar');
    }

    const fechaNacCont = document.getElementById('detalle-fecha-nac-contenedor');
    if (fechaNacCont) {
        if (d.fecha_nac) {
            let edadStr = '';
            try {
                const nac = new Date(d.fecha_nac + 'T00:00:00');
                const hoyCalc = new Date();
                let edad = hoyCalc.getFullYear() - nac.getFullYear();
                const m = hoyCalc.getMonth() - nac.getMonth();
                if (m < 0 || (m === 0 && hoyCalc.getDate() < nac.getDate())) {
                    edad--;
                }
                if (!isNaN(edad) && edad >= 0 && edad <= 120) {
                    edadStr = ` (${edad} años)`;
                }
            } catch (_e) { /* ignore */ }
            fechaNacCont.innerHTML = `<span class="text-sm font-semibold text-slate-800">${escaparHTML(d.fecha_nac)}${edadStr}</span>`;
        } else {
            fechaNacCont.innerHTML = '<span class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-xs font-semibold"><i class="fa-solid fa-calendar-xmark text-[10px]"></i> Sin fecha de nacimiento</span>';
        }
    }

    // 5. Tarjeta 3: Compromiso y Recordatorio
    const perCont = document.getElementById('detalle-periodicidad-contenedor');
    if (perCont) {
        if (d.periodicidad && d.periodicidad.trim() !== '') {
            perCont.innerHTML = `<span class="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-lg inline-block">${escaparHTML(d.periodicidad)}</span>`;
        } else {
            perCont.innerHTML = '<span class="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-xs font-semibold"><i class="fa-solid fa-clock text-[10px]"></i> Sin periodicidad definida</span>';
        }
    }

    const recInfoEl = document.getElementById('detalle-recordatorio-info');
    if (recInfoEl) {
        const recExistente = store.globalRecordatorios.find(r => r.donante_id === id && r.estado_recordatorio !== 'Gestionado') ||
            store.globalRecordatorios.find(r => r.donante_id === id);

        if (recExistente) {
            const montoRec = recExistente.monto_recordatorio
                ? ` por ${formatearMoneda(recExistente.monto_recordatorio, store.monedaActual, store.tasasCambio, store.locMoneda)}`
                : '';
            const badgeRec = recExistente.estado_recordatorio === 'Gestionado'
                ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Gestionado</span>'
                : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Pendiente</span>';

            recInfoEl.innerHTML = `
                <div class="space-y-1">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-slate-800">${escaparHTML(recExistente.fecha_recordatorio || '-')}</span>
                        ${badgeRec}
                    </div>
                    <p class="text-[11px] text-slate-600 font-medium">Aporte esperado${montoRec}</p>
                    ${recExistente.nota_recordatorio ? `<p class="text-[10px] text-slate-500 italic mt-0.5 truncate">${escaparHTML(recExistente.nota_recordatorio)}</p>` : ''}
                </div>
            `;
        } else {
            recInfoEl.innerHTML = `
                <div class="text-slate-400 text-xs">
                    Sin recordatorio programado
                </div>
            `;
        }
    }

    // 6. Notas del Donante
    const notasEl = document.getElementById('detalle-notas');
    if (notasEl) {
        if (d.nota && d.nota.trim() !== '') {
            notasEl.innerText = d.nota;
            notasEl.className = 'text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 font-sans';
        } else {
            notasEl.innerText = 'Sin notas u observaciones registradas para este donante.';
            notasEl.className = 'text-xs sm:text-sm text-slate-400 italic whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 font-sans';
        }
    }

    // 7. Inputs de Mes y Año
    const hoy = new Date();
    const filtroMesInput = document.getElementById('detalle-filtro-mes');
    if (filtroMesInput) {
        filtroMesInput.value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    }
    const filtroAnioInput = document.getElementById('detalle-filtro-anio');
    if (filtroAnioInput) {
        filtroAnioInput.value = hoy.getFullYear();
    }

    const divisaLabel = document.getElementById('detalle-divisa-label');
    if (divisaLabel) divisaLabel.innerText = store.monedaActual || 'COP';

    // 8. Actualizar métricas y tabla de donaciones
    actualizarMetricasDetalle();

    document.getElementById('modal-detalle-donante').classList.remove('hidden');
}

export function actualizarMetricasDetalle() {
    const inputOculto = document.getElementById('detalle-id-oculto');
    const id = inputOculto?.value;
    if (!id) return;

    const donacionesDonante = store.globalDonaciones.filter(d => d && d.donante_id === id);

    // Total Histórico
    const totalHist = donacionesDonante.reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio), 0);
    const totalHistEl = document.getElementById('detalle-total-historico');
    if (totalHistEl) {
        totalHistEl.innerText = formatearMoneda(totalHist, store.monedaActual, store.tasasCambio, store.locMoneda);
    }

    // Conteo de donaciones
    const conteoEl = document.getElementById('detalle-conteo-donaciones');
    if (conteoEl) {
        conteoEl.innerText = String(donacionesDonante.length);
    }

    // Promedio
    const promedioEl = document.getElementById('detalle-promedio-donacion');
    if (promedioEl) {
        const promedio = donacionesDonante.length > 0 ? (totalHist / donacionesDonante.length) : 0;
        promedioEl.innerText = formatearMoneda(promedio, store.monedaActual, store.tasasCambio, store.locMoneda);
    }

    // Último aporte
    const ultimoAporteEl = document.getElementById('detalle-ultimo-aporte');
    if (ultimoAporteEl) {
        if (donacionesDonante.length > 0) {
            const ordenadas = [...donacionesDonante].sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
            const ult = ordenadas[0];
            ultimoAporteEl.innerText = `${ult.fecha || '-'} (${formatearMoneda(normalizarACOP(ult.monto, ult.moneda_aporte, store.tasasCambio), store.monedaActual, store.tasasCambio, store.locMoneda)})`;
        } else {
            ultimoAporteEl.innerText = 'Sin aportes';
        }
    }

    // Filtro Mes
    const filtroMesInput = document.getElementById('detalle-filtro-mes');
    const filtroMes = filtroMesInput ? filtroMesInput.value : '';
    const totalMes = donacionesDonante
        .filter(d => d.fecha && d.fecha.startsWith(filtroMes))
        .reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio), 0);
    const totalMesEl = document.getElementById('detalle-total-mes');
    if (totalMesEl) {
        totalMesEl.innerText = formatearMoneda(totalMes, store.monedaActual, store.tasasCambio, store.locMoneda);
    }

    // Filtro Año
    const filtroAnioInput = document.getElementById('detalle-filtro-anio');
    const filtroAnio = filtroAnioInput ? String(filtroAnioInput.value) : '';
    const totalAnio = donacionesDonante
        .filter(d => d.fecha && d.fecha.startsWith(filtroAnio))
        .reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio), 0);
    const totalAnioEl = document.getElementById('detalle-total-anio');
    if (totalAnioEl) {
        totalAnioEl.innerText = formatearMoneda(totalAnio, store.monedaActual, store.tasasCambio, store.locMoneda);
    }

    // Contador historial
    const contadorHistorial = document.getElementById('detalle-contador-historial');
    if (contadorHistorial) {
        contadorHistorial.innerText = `${donacionesDonante.length} aporte${donacionesDonante.length === 1 ? '' : 's'}`;
    }

    // Renderizar tabla de historial de donaciones
    const tbody = document.getElementById('detalle-tabla-donaciones-body');
    const sinDonacionesEl = document.getElementById('detalle-sin-donaciones');
    if (tbody) {
        tbody.innerHTML = '';
        if (donacionesDonante.length === 0) {
            if (sinDonacionesEl) sinDonacionesEl.classList.remove('hidden');
        } else {
            if (sinDonacionesEl) sinDonacionesEl.classList.add('hidden');
            const ordenadas = [...donacionesDonante].sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
            ordenadas.forEach(d => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50/80 transition-colors';

                const montoNormalizado = normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio);
                const montoHtml = formatearMoneda(montoNormalizado, store.monedaActual, store.tasasCambio, store.locMoneda);
                const monedaOriginal = d.moneda_aporte !== store.monedaActual ? `<span class="text-[10px] text-slate-400 block font-normal">Orig: ${Number(d.monto).toLocaleString('es-CO')} ${escaparHTML(d.moneda_aporte || 'COP')}</span>` : '';

                tr.innerHTML = `
                    <td class="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">
                        ${escaparHTML(d.fecha || '-')}
                    </td>
                    <td class="px-4 py-3 font-bold text-emerald-600 whitespace-nowrap">
                        ${montoHtml}
                        ${monedaOriginal}
                    </td>
                    <td class="px-4 py-3 text-slate-600 whitespace-nowrap">
                        <span class="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium text-slate-700">
                            ${escaparHTML(d.medio || 'Sin medio')}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-slate-600 whitespace-nowrap">
                        <span class="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px] font-semibold border border-blue-100">
                            ${escaparHTML(d.destinacion || 'General')}
                        </span>
                    </td>
                    <td class="px-4 py-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                        ${escaparHTML(d.comprobante || 'S/N')}
                    </td>
                    <td class="px-4 py-3 text-slate-500 italic max-w-xs truncate" title="${escaparHTML(d.nota || '')}">
                        ${escaparHTML(d.nota || '-')}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    }
}

export function editarDonanteDesdeDetalle() {
    const id = document.getElementById('detalle-id-oculto')?.value;
    if (!id) return;
    cerrarModal('modal-detalle-donante');
    abrirModalDonante(id);
}

export function registrarDonacionDesdeDetalle() {
    const id = document.getElementById('detalle-id-oculto')?.value;
    if (!id) return;
    cerrarModal('modal-detalle-donante');
    if (typeof window.abrirModalDonacion === 'function') {
        window.abrirModalDonacion(null, id);
    }
}

if (typeof window !== 'undefined') {
    window.editarDonanteDesdeDetalle = editarDonanteDesdeDetalle;
    window.registrarDonacionDesdeDetalle = registrarDonacionDesdeDetalle;
}

export { poblarSelectDonantes } from '../donaciones/index.js';

