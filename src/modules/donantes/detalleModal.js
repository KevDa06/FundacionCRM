/**
 * Submódulo: Modal Ficha 360° de Detalle del Donante
 * Visualización exhaustiva de perfil, métricas de aportes históricos, recordatorios e historial de transacciones.
 */
import { store } from '../../state/store.js';
import { escaparHTML, formatearMoneda, normalizarACOP } from '../../utils/formatters.js';
import { esCumpleSinAnio, formatearFechaCumple } from '../../utils/dates.js';
import { cerrarModal } from '../../components/modal.js';

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
            if (esCumpleSinAnio(d.fecha_nac)) {
                fechaNacCont.innerHTML = `<span class="text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5"><i class="fa-solid fa-cake-candles text-amber-500"></i> ${escaparHTML(formatearFechaCumple(d.fecha_nac))} <span class="text-xs text-slate-500 font-normal italic">(Cumpleaños sin año)</span></span>`;
            } else {
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
            }
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
    const conteoHistorialEl = document.getElementById('detalle-conteo-historial');
    if (conteoHistorialEl) {
        conteoHistorialEl.innerText = `${donacionesDonante.length} registro(s)`;
    }

    // Renderizar tabla
    const tbody = document.getElementById('tbody-detalle-donaciones');
    if (tbody) {
        tbody.innerHTML = '';
        if (donacionesDonante.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400 italic">No hay donaciones registradas para este donante.</td></tr>';
        } else {
            const ordenadas = [...donacionesDonante].sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
            ordenadas.forEach(d => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-100 hover:bg-slate-50/70 transition-colors text-xs';
                const montoVisual = formatearMoneda(normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio), store.monedaActual, store.tasasCambio, store.locMoneda);
                const monedaOriginal = (d.moneda_aporte && d.moneda_aporte !== store.monedaActual)
                    ? `<span class="text-[10px] text-slate-400 block">${d.moneda_aporte} ${Number(d.monto).toLocaleString('es-CO')}</span>`
                    : '';

                tr.innerHTML = `
                    <td class="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">${escaparHTML(d.fecha || '-')}</td>
                    <td class="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                        ${montoVisual}
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
    if (typeof window.abrirModalDonante === 'function') {
        window.abrirModalDonante(id);
    }
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
