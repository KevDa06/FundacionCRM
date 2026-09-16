/**
 * Módulo de Auditoría del Sistema (Logs y Registro de Actividad RLS)
 */
import * as usuariosService from '../../services/usuariosService.js';
import { tienePermiso } from '../../utils/permissions.js';
import { clasificarErrorSupabase } from '../../utils/supabaseErrors.js';
import { escaparHTML } from '../../utils/formatters.js';
import { mostrarNotificacion } from '../../components/toast.js';

let listaAuditoriaGlobal = [];

export function setListaAuditoria(lista) {
    listaAuditoriaGlobal = Array.isArray(lista) ? lista : [];
}

export function getListaAuditoria() {
    return listaAuditoriaGlobal;
}

export const DICCIONARIO_CAMPOS_AUDITORIA = {
    monto: 'Monto / Importe',
    valor: 'Monto / Importe',
    medio: 'Medio de Pago',
    medio_pago: 'Medio de Pago',
    destinacion: 'Destinación / Proyecto',
    referencia: 'Referencia / Comprobante',
    comprobante: 'Referencia / Comprobante',
    estado: 'Estado',
    nombre: 'Nombre Completo / Razón Social',
    documento: 'Documento de Identidad',
    tipo: 'Tipo de Donante / Persona',
    email: 'Correo Electrónico',
    telefono: 'Teléfono de Contacto',
    direccion: 'Dirección',
    ciudad: 'Ciudad',
    periodicidad: 'Periodicidad de Donación',
    notas: 'Notas / Observaciones',
    rol: 'Rol de Acceso',
    activo: 'Estado Activo',
    fecha: 'Fecha Registrada',
    fecha_donacion: 'Fecha de Donación',
    donante_id: 'ID Donante Vinculado',
    usuario_id: 'ID Usuario Responsable'
};

export const CAMPOS_METADATOS_SISTEMA = new Set([
    'id', 'created_at', 'updated_at', 'deleted_at', 'timestamp', 'fecha_actualizacion'
]);

export function obtenerFechaAuditoria(a) {
    if (!a) return null;
    return a.fecha || a.created_at || a.timestamp || a.fecha_operacion || a.date || null;
}

export function formatearFechaAuditoria(fechaRaw) {
    if (!fechaRaw) return '-';
    try {
        const d = new Date(fechaRaw);
        if (isNaN(d.getTime())) return '-';

        const dia = String(d.getDate()).padStart(2, '0');
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const anio = d.getFullYear();

        let horas = d.getHours();
        const minutos = String(d.getMinutes()).padStart(2, '0');
        const ampm = horas >= 12 ? 'PM' : 'AM';
        horas = horas % 12;
        horas = horas ? horas : 12;
        const horasStr = String(horas).padStart(2, '0');

        return `${dia}/${mes}/${anio} ${horasStr}:${minutos} ${ampm}`;
    } catch (_e) {
        return '-';
    }
}

export function formatearValorAuditoria(campo, valor) {
    if (valor === null || valor === undefined || valor === '') {
        return '<span class="text-slate-400 italic text-xs font-normal">(Vacío)</span>';
    }

    if (typeof valor === 'boolean') {
        return valor
            ? '<span class="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-100/80 px-2 py-0.5 rounded-full text-xs"><i class="fa-solid fa-check text-[10px]"></i> Sí / Activo</span>'
            : '<span class="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-100/80 px-2 py-0.5 rounded-full text-xs"><i class="fa-solid fa-xmark text-[10px]"></i> No / Inactivo</span>';
    }

    const cMinus = String(campo || '').toLowerCase();

    if (cMinus.includes('monto') || cMinus.includes('valor') || cMinus.includes('total') || cMinus.includes('precio')) {
        const num = Number(valor);
        if (!isNaN(num)) {
            return `<strong class="text-emerald-700 font-mono text-xs tracking-tight">$ ${num.toLocaleString('es-CO')}</strong>`;
        }
    }

    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
        if (valor.includes('T') || valor.includes(':')) {
            return `<span class="font-mono text-xs text-slate-700">${formatearFechaAuditoria(valor)}</span>`;
        } else {
            const partes = valor.split('T')[0].split('-');
            if (partes.length === 3) {
                return `<span class="font-mono text-xs text-slate-700">${partes[2]}/${partes[1]}/${partes[0]}</span>`;
            }
        }
    }

    if (typeof valor === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(valor)) {
        return `<span class="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200" title="${escaparHTML(valor)}">${valor.substring(0, 8)}...</span>`;
    }

    if (typeof valor === 'object') {
        try {
            return `<code class="font-mono text-xs bg-slate-100 p-1 rounded text-slate-700">${escaparHTML(JSON.stringify(valor))}</code>`;
        } catch (_e) {
            return escaparHTML(String(valor));
        }
    }

    return `<span class="text-slate-800 text-xs font-medium">${escaparHTML(String(valor))}</span>`;
}

export function renderizarComparativaAuditoria(operacion, datosAnteriores, datosNuevos) {
    const op = String(operacion || '').toUpperCase();
    const oldObj = (datosAnteriores && typeof datosAnteriores === 'object') ? datosAnteriores : {};
    const newObj = (datosNuevos && typeof datosNuevos === 'object') ? datosNuevos : {};

    if (op === 'UPDATE') {
        const todasClaves = Array.from(new Set([
            ...Object.keys(oldObj),
            ...Object.keys(newObj)
        ]));

        let modificados = todasClaves.filter(key => {
            if (CAMPOS_METADATOS_SISTEMA.has(key)) return false;
            const vOld = oldObj[key];
            const vNew = newObj[key];
            return JSON.stringify(vOld) !== JSON.stringify(vNew);
        });

        if (modificados.length === 0) {
            modificados = todasClaves.filter(key => {
                const vOld = oldObj[key];
                const vNew = newObj[key];
                return JSON.stringify(vOld) !== JSON.stringify(vNew);
            });
        }

        const conteoEl = document.getElementById('det-audit-diff-conteo');
        if (conteoEl) {
            conteoEl.innerText = `${modificados.length} campo(s) modificado(s)`;
        }

        if (modificados.length === 0) {
            return `
                <div class="p-8 text-center text-slate-400">
                    <i class="fa-solid fa-circle-check text-2xl text-emerald-400 mb-2 block"></i>
                    <p class="text-xs font-semibold text-slate-600">No se detectaron diferencias entre los valores anteriores y los nuevos.</p>
                </div>
            `;
        }

        return `
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider text-[11px]">
                        <th class="px-5 py-3 w-1/3">Campo Modificado</th>
                        <th class="px-5 py-3 w-1/3 bg-rose-50/50 text-rose-800">
                            <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-clock-rotate-left text-rose-500"></i> Valor Anterior (OLD)</span>
                        </th>
                        <th class="px-5 py-3 w-1/3 bg-emerald-50/50 text-emerald-800">
                            <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-sparkles text-emerald-500"></i> Valor Nuevo (NEW)</span>
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${modificados.map(key => {
                        const label = DICCIONARIO_CAMPOS_AUDITORIA[key] || key;
                        const vOld = oldObj[key];
                        const vNew = newObj[key];
                        const htmlOld = formatearValorAuditoria(key, vOld);
                        const htmlNew = formatearValorAuditoria(key, vNew);

                        return `
                            <tr class="hover:bg-slate-50/70 transition-colors">
                                <td class="px-5 py-3.5 align-top">
                                    <div class="font-bold text-slate-800 text-xs">${escaparHTML(label)}</div>
                                    <div class="font-mono text-[10px] text-slate-400 mt-0.5">${escaparHTML(key)}</div>
                                </td>
                                <td class="px-5 py-3.5 align-top bg-rose-50/20">
                                    <div class="text-rose-900 line-through opacity-80">${htmlOld}</div>
                                </td>
                                <td class="px-5 py-3.5 align-top bg-emerald-50/20 font-semibold">
                                    <div class="text-emerald-950">${htmlNew}</div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    if (op === 'INSERT') {
        const claves = Object.keys(newObj).filter(k => !CAMPOS_METADATOS_SISTEMA.has(k) || k === 'id');
        const conteoEl = document.getElementById('det-audit-diff-conteo');
        if (conteoEl) {
            conteoEl.innerText = `${claves.length} campo(s) registrados`;
        }

        if (claves.length === 0) {
            return `
                <div class="p-8 text-center text-slate-400">
                    <p class="text-xs">No hay datos de inserción disponibles.</p>
                </div>
            `;
        }

        return `
            <div class="bg-emerald-50/70 text-emerald-900 px-5 py-2.5 text-xs font-semibold border-b border-emerald-100 flex items-center gap-2">
                <i class="fa-solid fa-circle-plus text-emerald-600"></i> Registro Creado: Campos y valores iniciales registrados.
            </div>
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider text-[11px]">
                        <th class="px-5 py-3 w-1/3">Campo Registrado</th>
                        <th class="px-5 py-3 w-2/3 bg-emerald-50/50 text-emerald-800">
                            <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-sparkles text-emerald-500"></i> Valor Nuevo (NEW)</span>
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${claves.map(key => {
                        const label = DICCIONARIO_CAMPOS_AUDITORIA[key] || key;
                        const vNew = newObj[key];
                        const htmlNew = formatearValorAuditoria(key, vNew);

                        return `
                            <tr class="hover:bg-slate-50/70 transition-colors">
                                <td class="px-5 py-3.5 align-top">
                                    <div class="font-bold text-slate-800 text-xs">${escaparHTML(label)}</div>
                                    <div class="font-mono text-[10px] text-slate-400 mt-0.5">${escaparHTML(key)}</div>
                                </td>
                                <td class="px-5 py-3.5 align-top bg-emerald-50/20">
                                    ${htmlNew}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    if (op === 'DELETE') {
        const claves = Object.keys(oldObj).filter(k => !CAMPOS_METADATOS_SISTEMA.has(k) || k === 'id');
        const conteoEl = document.getElementById('det-audit-diff-conteo');
        if (conteoEl) {
            conteoEl.innerText = `${claves.length} campo(s) eliminados`;
        }

        if (claves.length === 0) {
            return `
                <div class="p-8 text-center text-slate-400">
                    <p class="text-xs">No hay datos previos del registro eliminado.</p>
                </div>
            `;
        }

        return `
            <div class="bg-rose-50/70 text-rose-900 px-5 py-2.5 text-xs font-semibold border-b border-rose-100 flex items-center gap-2">
                <i class="fa-solid fa-trash-can text-rose-600"></i> Registro Eliminado: Datos contenidos antes de la eliminación.
            </div>
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider text-[11px]">
                        <th class="px-5 py-3 w-1/3">Campo Eliminado</th>
                        <th class="px-5 py-3 w-2/3 bg-rose-50/50 text-rose-800">
                            <span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-clock-rotate-left text-rose-500"></i> Valor Eliminado (OLD)</span>
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${claves.map(key => {
                        const label = DICCIONARIO_CAMPOS_AUDITORIA[key] || key;
                        const vOld = oldObj[key];
                        const htmlOld = formatearValorAuditoria(key, vOld);

                        return `
                            <tr class="hover:bg-slate-50/70 transition-colors">
                                <td class="px-5 py-3.5 align-top">
                                    <div class="font-bold text-slate-800 text-xs">${escaparHTML(label)}</div>
                                    <div class="font-mono text-[10px] text-slate-400 mt-0.5">${escaparHTML(key)}</div>
                                </td>
                                <td class="px-5 py-3.5 align-top bg-rose-50/20">
                                    ${htmlOld}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    return `
        <div class="p-6 text-center text-slate-400">
            <p class="text-xs">Operación ${escaparHTML(op)}.</p>
        </div>
    `;
}

export async function cargarYRenderizarAuditoria() {
    if (!tienePermiso('ver_auditoria')) {
        mostrarNotificacion('peligro', 'Acceso Restringido', 'Solo administradores pueden consultar los registros de auditoría.');
        return;
    }

    const tbody = document.getElementById('tbody-auditoria');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-slate-400 font-medium"><i class="fa-solid fa-circle-notch fa-spin text-xl text-purple-500 mb-2 block"></i> Consultando registros de auditoría...</td></tr>`;
    }

    const tablaSelect = document.getElementById('filtro-auditoria-tabla');
    const operacionSelect = document.getElementById('filtro-auditoria-operacion');

    const tabla = tablaSelect?.value || 'todas';
    const operacion = operacionSelect?.value || 'todas';

    try {
        const respuesta = await usuariosService.listarAuditoria({ tabla, operacion, limite: 100 });
        const data = Array.isArray(respuesta) ? respuesta : (respuesta?.data || []);
        const error = Array.isArray(respuesta) ? null : respuesta?.error;
        if (error) {
            const errInfo = clasificarErrorSupabase(error);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-rose-500 font-medium"><i class="fa-solid fa-circle-exclamation text-xl mb-2 block"></i> ${escaparHTML(errInfo.mensaje)}</td></tr>`;
            }
            return;
        }

        listaAuditoriaGlobal = Array.isArray(data) ? data : [];
        filtrarTablaAuditoria();
    } catch (err) {
        console.error('Error al listar auditoría:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-rose-500 font-medium">Error inesperado al cargar registros de auditoría.</td></tr>`;
        }
    }
}

export function filtrarTablaAuditoria() {
    const tbody = document.getElementById('tbody-auditoria');
    if (!tbody) return;

    const busquedaInput = document.getElementById('filtro-auditoria-busqueda');
    const busqueda = (busquedaInput?.value || '').trim().toLowerCase();

    const filtrados = listaAuditoriaGlobal.filter(a => {
        if (!busqueda) return true;
        const op = (a.operacion || '').toLowerCase();
        const tab = (a.tabla || '').toLowerCase();
        const recId = (a.registro_id || '').toLowerCase();
        const email = (a.usuario_email || '').toLowerCase();
        const nombre = (a.usuario_nombre || '').toLowerCase();
        const doc = (a.usuario_documento || '').toLowerCase();

        return op.includes(busqueda) || tab.includes(busqueda) || recId.includes(busqueda) ||
            email.includes(busqueda) || nombre.includes(busqueda) || doc.includes(busqueda);
    });

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-slate-400 font-medium">No se encontraron registros de auditoría que coincidan con la búsqueda.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map((a, idx) => {
        const fecha = formatearFechaAuditoria(obtenerFechaAuditoria(a));

        let badgeOp = '';
        if (a.operacion === 'INSERT') {
            badgeOp = '<span class="bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full text-xs font-bold">INSERT</span>';
        } else if (a.operacion === 'UPDATE') {
            badgeOp = '<span class="bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full text-xs font-bold">UPDATE</span>';
        } else if (a.operacion === 'DELETE') {
            badgeOp = '<span class="bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full text-xs font-bold">DELETE</span>';
        } else {
            badgeOp = `<span class="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-xs font-bold">${escaparHTML(a.operacion || '-')}</span>`;
        }

        let usuarioTexto = a.usuario_nombre || a.usuario_email || 'Sistema';
        if (a.usuario_documento) {
            usuarioTexto += ` <span class="text-xs text-slate-400">(${escaparHTML(a.usuario_documento)})</span>`;
        }

        const tablaBadge = `<span class="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md text-xs font-mono font-medium">${escaparHTML(a.tabla || '-')}</span>`;
        const recIdCorto = a.registro_id ? (a.registro_id.length > 10 ? a.registro_id.substring(0, 8) + '...' : a.registro_id) : '-';

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                <td class="px-6 py-3.5 text-xs text-slate-600 font-mono font-medium" data-label="Fecha">${escaparHTML(fecha)}</td>
                <td class="px-6 py-3.5 text-xs text-slate-800 font-semibold" data-label="Usuario">${usuarioTexto}</td>
                <td class="px-6 py-3.5" data-label="Módulo">${tablaBadge}</td>
                <td class="px-6 py-3.5" data-label="Operación">${badgeOp}</td>
                <td class="px-6 py-3.5 font-mono text-xs text-slate-500" data-label="Registro" title="${escaparHTML(a.registro_id || '')}">${escaparHTML(recIdCorto)}</td>
                <td class="px-6 py-3.5 text-right" data-label="Detalle">
                    <button type="button" onclick="verDetalleAuditoria(${idx})" class="ui-icon-btn" title="Ver detalle" aria-label="Ver detalle de auditoría">
                        <i class="fa-solid fa-eye text-xs"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

export function verDetalleAuditoria(indice) {
    const a = listaAuditoriaGlobal[indice];
    if (!a) return;

    const tabEl = document.getElementById('det-audit-tabla');
    const opEl = document.getElementById('det-audit-operacion');
    const userEl = document.getElementById('det-audit-usuario');
    const fechaEl = document.getElementById('det-audit-fecha');
    const oldEl = document.getElementById('det-audit-old');
    const newEl = document.getElementById('det-audit-new');
    const subtituloEl = document.getElementById('detalle-auditoria-subtitulo');
    const registroInfoEl = document.getElementById('det-audit-registro-info');
    const diffContainerEl = document.getElementById('det-audit-diff-container');

    const fechaFormateada = formatearFechaAuditoria(obtenerFechaAuditoria(a));

    if (tabEl) tabEl.innerText = a.tabla || '-';

    if (opEl) {
        let badgeOp = '';
        if (a.operacion === 'INSERT') {
            badgeOp = '<span class="bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full text-xs font-bold">INSERT</span>';
        } else if (a.operacion === 'UPDATE') {
            badgeOp = '<span class="bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full text-xs font-bold">UPDATE</span>';
        } else if (a.operacion === 'DELETE') {
            badgeOp = '<span class="bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full text-xs font-bold">DELETE</span>';
        } else {
            badgeOp = `<span class="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-xs font-bold">${escaparHTML(a.operacion || '-')}</span>`;
        }
        opEl.innerHTML = badgeOp;
    }

    let usuarioTexto = a.usuario_nombre || a.usuario_email || a.usuario_id || 'Sistema';
    if (a.usuario_documento) {
        usuarioTexto += ` (${a.usuario_documento})`;
    }
    if (userEl) {
        userEl.innerText = usuarioTexto;
        userEl.title = usuarioTexto;
    }

    if (fechaEl) fechaEl.innerText = fechaFormateada;
    if (subtituloEl) subtituloEl.innerText = `Operación ${a.operacion || ''} en módulo "${a.tabla || ''}"`;
    if (registroInfoEl) registroInfoEl.innerText = `ID Registro: ${a.registro_id || '-'}`;

    if (diffContainerEl) {
        diffContainerEl.innerHTML = renderizarComparativaAuditoria(a.operacion, a.datos_anteriores, a.datos_nuevos);
    }

    if (oldEl) {
        if (a.datos_anteriores && Object.keys(a.datos_anteriores).length > 0) {
            oldEl.innerText = JSON.stringify(a.datos_anteriores, null, 2);
        } else {
            oldEl.innerText = 'No aplica (registro creado)';
        }
    }

    if (newEl) {
        if (a.datos_nuevos && Object.keys(a.datos_nuevos).length > 0) {
            newEl.innerText = JSON.stringify(a.datos_nuevos, null, 2);
        } else {
            newEl.innerText = 'No aplica (registro eliminado)';
        }
    }

    const modal = document.getElementById('modal-detalle-auditoria');
    if (modal) modal.classList.remove('hidden');
}
