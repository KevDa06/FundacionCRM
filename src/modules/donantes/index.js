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

    const duplicadoEnMemoria = store.globalDonantes.find(d => {
        if (store.editandoDonanteId && String(d.id) === String(store.editandoDonanteId)) {
            return false;
        }
        return normalizarDocumento(d.documento) === docNorm;
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
                return true;
            });
            if (duplicadoBD) {
                mostrarNotificacion('alerta', 'Documento Duplicado', 'Ya existe un donante registrado con este documento.');
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
        nombre: nombreTrimmed,
        documento: documentoTrimmed,
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
            (d.documento && String(d.documento).includes(termino));
        return coincideNombreODoc &&
            (estado === '' || d.estado === estado) &&
            (tipoP === '' || d.tipo === tipoP) &&
            (peri === '' || d.periodicidad === peri);
    });

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center"><div class="flex flex-col items-center justify-center max-w-sm mx-auto"><div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3"><i class="fa-solid fa-users-slash text-xl"></i></div><p class="font-bold text-slate-700 text-sm mb-1">No se encontraron donantes</p><p class="text-xs text-slate-400">Verifica los filtros o el término de búsqueda ingresado.</p></div></td></tr>`;
        return;
    }

    filtrados.forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50/80 even:bg-slate-50/50 transition-colors';

        let badgeEstado = '';
        if (d.estado === 'Activo') badgeEstado = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">Activo</span>';
        else if (d.estado === 'Inactivo') badgeEstado = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">Inactivo</span>';
        else badgeEstado = '<span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">Retirado</span>';

        const idSeguro = escaparHTML(d.id);
        let botonesAcciones = `<button type="button" onclick="verDetalleDonante('${idSeguro}')" class="ui-icon-btn" title="Ver Detalle" aria-label="Ver detalle"><i class="fa-solid fa-eye"></i></button>`;
        if (tienePermiso('editar_donantes')) {
            botonesAcciones += `<button type="button" onclick="abrirModalDonante('${idSeguro}')" class="ui-icon-btn" title="Editar" aria-label="Editar donante"><i class="fa-solid fa-pen"></i></button>`;
        }
        if (tienePermiso('eliminar_donantes')) {
            botonesAcciones += `<button type="button" onclick="confirmarEliminarDonante('${idSeguro}')" class="ui-icon-btn danger" title="Eliminar" aria-label="Eliminar donante"><i class="fa-solid fa-trash"></i></button>`;
        }

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800">${escaparHTML(d.nombre)}</div>
                <div class="text-[11px] text-slate-400 uppercase mt-1">Registrado: ${escaparHTML(d.fecha_registro || '-')}</div>
            </td>
            <td class="px-6 py-4 font-mono text-sm text-slate-600">${escaparHTML(d.documento)}</td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-slate-700">${escaparHTML(d.telefono || '-')}</div>
                <div class="text-xs text-slate-500">${escaparHTML(d.correo || '-')}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-slate-700">${escaparHTML(d.tipo)}</div>
                <div class="text-xs font-bold text-blue-600">${escaparHTML(d.periodicidad)}</div>
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
    document.getElementById('detalle-id-oculto').value = id;
    document.getElementById('detalle-nombre').innerText = d.nombre;
    document.getElementById('detalle-doc').innerText = `ID: ${d.documento}`;
    document.getElementById('detalle-notas').innerText = d.nota || 'Sin notas registradas.';

    const hoy = new Date();
    document.getElementById('detalle-filtro-mes').value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('detalle-filtro-anio').value = hoy.getFullYear();

    actualizarMetricasDetalle();
    document.getElementById('modal-detalle-donante').classList.remove('hidden');
}

export function actualizarMetricasDetalle() {
    const id = document.getElementById('detalle-id-oculto').value;
    const don = store.globalDonaciones.filter(d => d && d.donante_id === id);

    let totalHist = don.reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio), 0);
    document.getElementById('detalle-total-historico').innerText = formatearMoneda(totalHist, store.monedaActual, store.tasasCambio, store.locMoneda);

    const filtroMes = document.getElementById('detalle-filtro-mes').value;
    let totalMes = don.filter(d => d.fecha && d.fecha.startsWith(filtroMes)).reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio), 0);
    document.getElementById('detalle-total-mes').innerText = formatearMoneda(totalMes, store.monedaActual, store.tasasCambio, store.locMoneda);

    const filtroAnio = document.getElementById('detalle-filtro-anio').value;
    let totalAnio = don.filter(d => d.fecha && d.fecha.startsWith(filtroAnio)).reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio), 0);
    document.getElementById('detalle-total-anio').innerText = formatearMoneda(totalAnio, store.monedaActual, store.tasasCambio, store.locMoneda);
}

export { poblarSelectDonantes } from '../donaciones/index.js';
