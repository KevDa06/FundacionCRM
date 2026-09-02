import Chart from 'chart.js/auto';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabaseClient, AUTH_SYSTEM_EMAIL } from './services/supabase.js';
import * as donantesService from './services/donantesService.js';
import * as donacionesService from './services/donacionesService.js';
import { initImportacionDonaciones } from './modules/importacionDonaciones.js';

// Variables Globales
let monedaActual = 'COP';
const tasasCambio = { 'COP': 1, 'USD': 4000, 'EUR': 4400 };
const locMoneda = { 'COP': 'es-CO', 'USD': 'en-US', 'EUR': 'es-ES' };

let globalDonantes = [];
let globalDonaciones = [];
let globalDestinaciones = [];
let erroresImportacionActuales = [];

let chartRecaudacionInstance = null;
let chartMediosPagoInstance = null;
let editandoDonanteId = null;

// Valores permitidos para validación de importación
const CAMPOS_VALIDOS_DONANTE = {
    tipo: ['Natural', 'Juridica'],
    periodicidad: ['Ocasional', 'Mensual', 'Anual'],
    estado: ['Activo', 'Inactivo', 'Retirado']
};

// FETCH DESDE SUPABASE
async function cargarDatosSupabase() {
    try {
        const statusEl = document.getElementById('status-db');
        if (statusEl) statusEl.innerText = 'Sincronizando DB...';

        console.log('EJECUTANDO donantesService.listar()...');
        const { data: donantes, error: errDonantes } = await donantesService.listar();
        console.log('DONANTES LISTAR:', {
            cantidad: donantes?.length ?? 0,
            error: errDonantes?.message ?? null,
            tieneData: Array.isArray(donantes) && donantes.length > 0
        });
        if (errDonantes) throw errDonantes;
        globalDonantes = donantes || [];

        console.log('EJECUTANDO donacionesService.listar()...');
        const { data: donaciones, error: errDonaciones } = await donacionesService.listar();
        console.log('DONACIONES LISTAR:', {
            cantidad: donaciones?.length ?? 0,
            error: errDonaciones?.message ?? null,
            tieneData: Array.isArray(donaciones) && donaciones.length > 0
        });
        if (errDonaciones) throw errDonaciones;
        globalDonaciones = donaciones || [];

        if (statusEl) statusEl.innerText = 'Sistema en línea';

        actualizarKPIs();
        renderizarGraficos();
        poblarSelectDonantes();

        const tabDonantes = document.getElementById('tab-donantes');
        const tabDonaciones = document.getElementById('tab-donaciones');
        const tabAlertas = document.getElementById('tab-alertas');

        if (tabDonantes && !tabDonantes.classList.contains('hidden')) renderizarTablaDonantes();
        if (tabDonaciones && !tabDonaciones.classList.contains('hidden')) renderizarTablaDonaciones();
        if (tabAlertas && !tabAlertas.classList.contains('hidden')) renderizarTablaAlertas();

    } catch (error) {
        console.error('Supabase Error:', error);
        const statusEl = document.getElementById('status-db');
        if (statusEl) {
            statusEl.innerText = 'Error de Conexión';
            statusEl.classList.replace('text-emerald-700', 'text-rose-700');
            if (statusEl.previousElementSibling) {
                statusEl.previousElementSibling.classList.replace('bg-emerald-500', 'bg-rose-500');
            }
        }
        mostrarNotificacion('peligro', 'Error de Base de Datos', 'No se pudieron cargar los datos de Supabase.');
    }
}

function formatearMoneda(montoEnCop) {
    const tasa = tasasCambio[monedaActual] || 1;
    const valorConvertido = montoEnCop / tasa;
    return new Intl.NumberFormat(locMoneda[monedaActual], { style: 'currency', currency: monedaActual, minimumFractionDigits: (monedaActual === 'COP') ? 0 : 2 }).format(valorConvertido);
}

function formatearMonedaEstatica(monto, moneda) {
    return new Intl.NumberFormat(locMoneda[moneda] || 'es-CO', { style: 'currency', currency: moneda || 'COP', minimumFractionDigits: (moneda === 'COP') ? 0 : 2 }).format(monto);
}

function normalizarACOP(montoOriginal, monedaAporte) {
    return parseFloat(montoOriginal) * (tasasCambio[monedaAporte] || 1);
}

function cambiarMonedaGlobal() {
    monedaActual = document.getElementById('selector-moneda').value;
    actualizarKPIs(); renderizarGraficos(); renderizarTablaDonaciones();
}

// ==================== MENÚ LATERAL DESPLEGABLE (TOGGLE) ====================
function toggleSidebar(forzarEstado = null) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!sidebar) return;

    const estaAbierto = !sidebar.classList.contains('-translate-x-full');
    const abrir = forzarEstado !== null ? forzarEstado : !estaAbierto;

    if (abrir) {
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        if (overlay) overlay.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        sidebar.classList.remove('translate-x-0');
        if (overlay) overlay.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

// TABS Y NAVEGACIÓN
function cambiarTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('aside nav button').forEach(el => el.className = 'w-full flex items-center space-x-3 px-4 py-3 text-sm transition-all rounded-r-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 border-l-4 border-transparent font-medium');

    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) {
        targetTab.classList.remove('hidden');
        targetTab.classList.add('block');
    }

    const targetBtn = document.getElementById(`btn-tab-${tabId}`);
    if (targetBtn) {
        targetBtn.className = 'w-full flex items-center space-x-3 px-4 py-3 text-sm transition-all rounded-r-lg bg-blue-50 text-blue-700 border-l-4 border-blue-600 font-semibold';
    }

    const titulos = { 'dashboard': 'Panel General', 'donantes': 'Directorio', 'donaciones': 'Registro', 'alertas': 'Centro de Retención', 'herramientas': 'Ajustes' };
    const headerTitle = document.getElementById('header-titulo-vista');
    if (headerTitle) headerTitle.innerText = titulos[tabId] || 'Panel';

    if (tabId === 'donantes') renderizarTablaDonantes();
    if (tabId === 'donaciones') renderizarTablaDonaciones();
    if (tabId === 'alertas') renderizarTablaAlertas();
    if (tabId === 'herramientas') renderizarDestinaciones();

    toggleSidebar(false);
}

function cerrarModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden'); 
}

// NOTIFICACIONES (Capa de orden inferior z-[40] para que queden por debajo de errores y reportes z-[60]/z-[70])
function mostrarNotificacion(tipo, titulo, mensaje, callbackConfirmacion = null) {
    const modal = document.getElementById('modal-notificacion');
    if (!modal) return alert(`${titulo}: ${mensaje}`);

    const estilosTipo = {
        exito: { bgIcon: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: 'fa-check', btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white', labelBtn: 'Aceptar' },
        alerta: { bgIcon: 'bg-amber-50 text-amber-500 border-amber-100', icon: 'fa-triangle-exclamation', btnClass: 'bg-amber-500 hover:bg-amber-600 text-white', labelBtn: 'Entendido' },
        peligro: { bgIcon: 'bg-rose-50 text-rose-600 border-rose-100', icon: 'fa-trash', btnClass: 'bg-rose-600 hover:bg-rose-700 text-white', labelBtn: 'Cerrar' }
    };

    const config = estilosTipo[tipo] || estilosTipo.alerta;

    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[40] flex items-center justify-center p-4 transition-all';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150" style="max-height: 85vh;">
            <div class="p-6 flex-1 min-h-0 flex flex-col">
                <div class="flex justify-end shrink-0 mb-2">
                    <button onclick="cerrarNotificacion()" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                
                <div class="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 border-4 ${config.bgIcon} shrink-0">
                    <i class="fa-solid ${config.icon} text-3xl"></i>
                </div>
                
                <h3 class="font-bold text-lg text-slate-800 text-center mb-4 shrink-0">${titulo}</h3>
                
                <!-- Scrollbar agregada con custom-scrollbar -->
                <div class="overflow-y-auto flex-1 min-h-0 custom-scrollbar text-sm text-slate-600 leading-relaxed px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 whitespace-pre-line">
                    ${mensaje}
                </div>

                <div class="mt-6 flex justify-center gap-3 shrink-0">
                    ${callbackConfirmacion ? `
                        <button onclick="cerrarNotificacion()" class="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-sm rounded-xl transition-all">Cancelar</button>
                        <button id="btn-confirmar-notif-action" class="px-5 py-2.5 ${config.btnClass} font-semibold text-sm rounded-xl transition-all shadow-md">Confirmar</button>
                    ` : `
                        <button onclick="cerrarNotificacion()" class="px-8 py-2.5 ${config.btnClass} font-semibold text-sm rounded-xl transition-all shadow-md">${config.labelBtn}</button>
                    `}
                </div>
            </div>
        </div>
    `;

    if (callbackConfirmacion) {
        document.getElementById('btn-confirmar-notif-action').onclick = () => {
            callbackConfirmacion();
            cerrarNotificacion();
        };
    }

    modal.classList.remove('hidden');
}

function cerrarNotificacion() { 
    const modal = document.getElementById('modal-notificacion');
    if (modal) modal.classList.add('hidden'); 
}

// DASHBOARD
function actualizarControlesFiltro() {
    const agrup = document.getElementById('select-agrupacion-grafico').value;
    document.getElementById('filtro-mes-select').classList.toggle('hidden', agrup !== 'mensual');
    document.getElementById('filtro-trimestre-select').classList.toggle('hidden', agrup !== 'trimestral');
}

function actualizarKPIs() {
    let totalCOP = globalDonaciones.reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte), 0);
    const kpiTotalEl = document.getElementById('kpi-total');
    if (kpiTotalEl) kpiTotalEl.innerText = formatearMoneda(totalCOP);

    const kpiActivosEl = document.getElementById('kpi-activos');
    if (kpiActivosEl) kpiActivosEl.innerText = globalDonantes.filter(d => d.estado === 'Activo').length;

    const yFiltroEl = document.getElementById('filtro-anio');
    const mFiltroEl = document.getElementById('filtro-mes-select');
    const yFiltro = yFiltroEl ? parseInt(yFiltroEl.value) : new Date().getFullYear();
    const mFiltro = mFiltroEl ? parseInt(mFiltroEl.value) : (new Date().getMonth() + 1);

    const labelKpiMes = document.getElementById('label-kpi-mes');
    if (labelKpiMes) {
        const nombreMes = new Date(yFiltro, mFiltro - 1, 1).toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        labelKpiMes.innerText = `Donado en ${nombreMes}`;
    }

    let totalMesCOP = 0;
    globalDonaciones.forEach(d => {
        if (!d.fecha) return;
        const parts = d.fecha.split('-');
        if (parseInt(parts[0]) === yFiltro && parseInt(parts[1]) === mFiltro) {
            totalMesCOP += normalizarACOP(d.monto, d.moneda_aporte);
        }
    });

    const kpiMesEl = document.getElementById('kpi-mes');
    if (kpiMesEl) kpiMesEl.innerText = formatearMoneda(totalMesCOP);

    const selectorUmbral = document.getElementById('selector-umbral-alertas');
    const umbralDias = selectorUmbral ? (parseInt(selectorUmbral.value) || 30) : 30;
    const hoy = new Date();
    let countAlertas = 0;

    globalDonantes.filter(d => d.estado === 'Activo').forEach(donante => {
        const donDonante = globalDonaciones.filter(d => d.donante_id === donante.id);
        if (donDonante.length > 0) {
            donDonante.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            const diffDays = Math.ceil(Math.abs(hoy - new Date(donDonante[0].fecha)) / (1000 * 60 * 60 * 24));
            if (diffDays > umbralDias) countAlertas++;
        } else {
            const diffDays = Math.ceil(Math.abs(hoy - (donante.fecha_registro ? new Date(donante.fecha_registro) : new Date(2020, 0, 1))) / (1000 * 60 * 60 * 24));
            if (diffDays > umbralDias) countAlertas++;
        }
    });

    const kpiAlertasEl = document.getElementById('kpi-alertas');
    if (kpiAlertasEl) kpiAlertasEl.innerText = countAlertas;

    const badge = document.getElementById('badge-alertas-sidebar');
    if (badge) {
        if (countAlertas > 0) { badge.innerText = countAlertas; badge.classList.remove('hidden'); }
        else { badge.classList.add('hidden'); }
    }
}

function renderizarGraficos() {
    const agrupacion = document.getElementById('select-agrupacion-grafico').value;
    const yearFiltro = parseInt(document.getElementById('filtro-anio').value);
    const tipoGrafico = document.getElementById('select-tipo-grafico').value;

    let labels = [];
    let datosRecaudacionCOP = [];

    if (agrupacion === 'mensual') {
        const monthFiltro = parseInt(document.getElementById('filtro-mes-select').value);
        const numDias = new Date(yearFiltro, monthFiltro, 0).getDate();
        labels = Array.from({ length: numDias }, (_, i) => `${i + 1}`);
        datosRecaudacionCOP = new Array(numDias).fill(0);

        globalDonaciones.forEach(d => {
            const parts = d.fecha.split('-');
            if (parseInt(parts[0]) === yearFiltro && parseInt(parts[1]) === monthFiltro) {
                datosRecaudacionCOP[parseInt(parts[2]) - 1] += normalizarACOP(d.monto, d.moneda_aporte);
            }
        });

    } else if (agrupacion === 'trimestral') {
        const quarter = parseInt(document.getElementById('filtro-trimestre-select').value);
        const startMonth = (quarter - 1) * 3;
        const startDate = new Date(yearFiltro, startMonth, 1);
        const endDate = new Date(yearFiltro, startMonth + 3, 0);
        const totalDaysInQ = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const numWeeks = Math.ceil(totalDaysInQ / 7);

        labels = Array.from({ length: numWeeks }, (_, i) => `Sem. ${i + 1}`);
        datosRecaudacionCOP = new Array(numWeeks).fill(0);

        globalDonaciones.forEach(d => {
            const [dY, dM, dD] = d.fecha.split('-');
            const dDate = new Date(dY, parseInt(dM) - 1, dD);
            if (dDate >= startDate && dDate <= endDate) {
                const daysDiff = Math.floor((dDate - startDate) / (1000 * 60 * 60 * 24));
                const weekIdx = Math.floor(daysDiff / 7);
                if (weekIdx >= 0 && weekIdx < numWeeks) {
                    datosRecaudacionCOP[weekIdx] += normalizarACOP(d.monto, d.moneda_aporte);
                }
            }
        });

    } else if (agrupacion === 'anual') {
        labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        datosRecaudacionCOP = new Array(12).fill(0);
        globalDonaciones.forEach(d => {
            const parts = d.fecha.split('-');
            if (parseInt(parts[0]) === yearFiltro) {
                datosRecaudacionCOP[parseInt(parts[1]) - 1] += normalizarACOP(d.monto, d.moneda_aporte);
            }
        });
    }

    const tasaVisual = tasasCambio[monedaActual] || 1;
    const datosConvertidos = datosRecaudacionCOP.map(m => m / tasaVisual);

    const ctxR = document.getElementById('chart-recaudacion');
    if (ctxR) {
        if (chartRecaudacionInstance) chartRecaudacionInstance.destroy();
        chartRecaudacionInstance = new Chart(ctxR.getContext('2d'), {
            type: tipoGrafico,
            data: {
                labels: labels,
                datasets: [{
                    label: `Recaudado (${monedaActual})`,
                    data: datosConvertidos,
                    backgroundColor: tipoGrafico === 'line' ? 'rgba(37, 99, 235, 0.1)' : '#2563eb',
                    borderColor: '#2563eb', borderWidth: 2,
                    borderRadius: tipoGrafico === 'bar' ? 6 : 0, fill: tipoGrafico === 'line', tension: 0.4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formatearMonedaEstatica(c.raw, monedaActual) } } },
                scales: {
                    y: { beginAtZero: true, border: { display: false }, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b' } },
                    x: { border: { display: false }, grid: { display: false }, ticks: { color: '#64748b' } }
                }
            }
        });
    }
    renderizarGraficoAnillos();
}

function renderizarGraficoAnillos() {
    const agrup = document.getElementById('select-agrupacion-grafico').value;
    const y = parseInt(document.getElementById('filtro-anio').value);
    const m = parseInt(document.getElementById('filtro-mes-select').value);
    const medios = {};

    document.getElementById('label-periodo-anillos').innerText = agrup === 'mensual' ? 'Mes Específico' : 'Periodo Completo';

    globalDonaciones.forEach(d => {
        const parts = d.fecha.split('-');
        let entra = false;
        if (agrup === 'mensual' && parseInt(parts[0]) === y && parseInt(parts[1]) === m) entra = true;
        if (agrup !== 'mensual' && parseInt(parts[0]) === y) entra = true;

        if (entra) medios[d.medio] = (medios[d.medio] || 0) + 1;
    });

    const labels = Object.keys(medios);
    const data = Object.values(medios);
    const ctx = document.getElementById('chart-medios-pago');

    if (chartMediosPagoInstance) chartMediosPagoInstance.destroy();

    if (!ctx) return;

    if (data.length === 0) {
        chartMediosPagoInstance = new Chart(ctx.getContext('2d'), {
            type: 'doughnut', data: { labels: ['Sin datos'], datasets: [{ data: [1], backgroundColor: ['#f8fafc'] }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%' }
        }); return;
    }

    chartMediosPagoInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#2563eb', '#38bdf8', '#10b981', '#f59e0b', '#8b5cf6'], borderWidth: 2, borderColor: '#fff' }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom' } } }
    });
}

// DONANTES
function abrirModalDonante(id = null) {
    document.getElementById('form-donante').reset();
    editandoDonanteId = id;
    if (id) {
        document.getElementById('titulo-modal-donante').innerText = 'Editar Donante';
        const d = globalDonantes.find(x => x.id === id);
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
        }
    } else {
        document.getElementById('titulo-modal-donante').innerText = 'Nuevo Donante';
    }
    document.getElementById('modal-donante').classList.remove('hidden');
}

async function guardarDonante() {
    const form = document.getElementById('form-donante');
    if (!form.checkValidity()) return mostrarNotificacion('alerta', 'Datos Incompletos', 'Completa los campos requeridos con (*).');

    const payload = {
        nombre: document.getElementById('donante-nombre').value,
        documento: document.getElementById('donante-documento').value,
        fecha_nac: document.getElementById('donante-fecha-nac').value,
        telefono: document.getElementById('donante-telefono').value,
        correo: document.getElementById('donante-correo').value,
        tipo: document.getElementById('donante-tipo').value,
        periodicidad: document.getElementById('donante-periodicidad').value,
        estado: document.getElementById('donante-estado').value,
        nota: document.getElementById('donante-nota').value
    };

    if (editandoDonanteId) {
        const { error } = await donantesService.actualizar(editandoDonanteId, payload);
        if (error) return mostrarNotificacion('peligro', 'Error Supabase', error.message);
        mostrarNotificacion('exito', 'Perfil Actualizado', 'Modificaciones guardadas en la base de datos.');
    } else {
        payload.fecha_registro = new Date().toISOString().split('T')[0];
        const { error } = await donantesService.insertar([payload]);
        if (error) return mostrarNotificacion('peligro', 'Error Supabase', error.message);
        mostrarNotificacion('exito', 'Registro Exitoso', 'Donante ingresado a la base de datos.');
    }

    cerrarModal('modal-donante');
    await cargarDatosSupabase();
}

function confirmarEliminarDonante(id) {
    mostrarNotificacion('peligro', 'Eliminar Permanente', '¿Borrar este donante y dejar huérfanas sus transacciones?', async () => {
        await donacionesService.eliminarPorDonante(id);
        const { error } = await donantesService.eliminar(id);
        if (error) return mostrarNotificacion('peligro', 'Error', error.message);

        mostrarNotificacion('exito', 'Eliminado', 'Registro borrado permanentemente.');
        await cargarDatosSupabase();
    });
}

function filtrarTablaDonantes() { renderizarTablaDonantes(); }
function filtrarTablaDonaciones() { renderizarTablaDonaciones(); }

function renderizarTablaDonantes() {
    const termino = document.getElementById('buscar-donante').value.toLowerCase();
    const estado = document.getElementById('filtro-estado-donante').value;
    const tipoP = document.getElementById('filtro-tipo-donante').value;
    const peri = document.getElementById('filtro-periodicidad-donante').value;
    const tbody = document.getElementById('tbody-donantes');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtrados = globalDonantes.filter(d => {
        return (d.nombre.toLowerCase().includes(termino) || d.documento.includes(termino)) &&
            (estado === '' || d.estado === estado) &&
            (tipoP === '' || d.tipo === tipoP) &&
            (peri === '' || d.periodicidad === peri);
    });

    if (filtrados.length === 0) return tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-slate-400 font-medium">No hay resultados.</td></tr>`;

    filtrados.forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50/80 even:bg-slate-50/50 transition-colors';

        let badgeEstado = '';
        if (d.estado === 'Activo') badgeEstado = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">Activo</span>';
        else if (d.estado === 'Inactivo') badgeEstado = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">Inactivo</span>';
        else badgeEstado = '<span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">Retirado</span>';

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800">${d.nombre}</div>
                <div class="text-[11px] text-slate-400 uppercase mt-1">Registrado: ${d.fecha_registro || '-'}</div>
            </td>
            <td class="px-6 py-4 font-mono text-sm text-slate-600">${d.documento}</td>
            <td class="px-6 py-4">
                <div class="text-sm font-medium text-slate-700">${d.telefono || '-'}</div>
                <div class="text-xs text-slate-500">${d.correo || '-'}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm text-slate-700">${d.tipo}</div>
                <div class="text-xs font-bold text-blue-600">${d.periodicidad}</div>
            </td>
            <td class="px-6 py-4">${badgeEstado}</td>
            <td class="px-6 py-4 text-right space-x-2">
                <button onclick="verDetalleDonante('${d.id}')" class="p-2 text-blue-500 hover:bg-blue-100 rounded-lg"><i class="fa-solid fa-eye"></i></button>
                <button onclick="abrirModalDonante('${d.id}')" class="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg"><i class="fa-solid fa-pen"></i></button>
                <button onclick="confirmarEliminarDonante('${d.id}')" class="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function verDetalleDonante(id) {
    const d = globalDonantes.find(x => x.id === id);
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

function actualizarMetricasDetalle() {
    const id = document.getElementById('detalle-id-oculto').value;
    const don = globalDonaciones.filter(d => d.donante_id === id);

    let totalHist = don.reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte), 0);
    document.getElementById('detalle-total-historico').innerText = formatearMoneda(totalHist);

    const filtroMes = document.getElementById('detalle-filtro-mes').value;
    let totalMes = don.filter(d => d.fecha.startsWith(filtroMes)).reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte), 0);
    document.getElementById('detalle-total-mes').innerText = formatearMoneda(totalMes);

    const filtroAnio = document.getElementById('detalle-filtro-anio').value;
    let totalAnio = don.filter(d => d.fecha.startsWith(filtroAnio)).reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte), 0);
    document.getElementById('detalle-total-anio').innerText = formatearMoneda(totalAnio);
}

// DONACIONES
function poblarSelectDonantes() {
    const select = document.getElementById('donacion-donante');
    if (!select) return;
    select.innerHTML = '<option value="">-- Seleccione donante activo --</option>';
    globalDonantes.filter(d => d.estado === 'Activo').forEach(d => { select.innerHTML += `<option value="${d.id}">${d.nombre} (${d.documento})</option>`; });
}

function abrirModalDonacion() {
    document.getElementById('form-donacion').reset();
    document.getElementById('donacion-fecha').value = new Date().toISOString().split('T')[0];
    poblarSelectDonantes();
    document.getElementById('modal-donacion').classList.remove('hidden');
}

async function guardarDonacion() {
    const form = document.getElementById('form-donacion');
    if (!form.checkValidity()) return mostrarNotificacion('alerta', 'Faltan Datos', 'Revisa los campos obligatorios (*).');

    const payload = {
        donante_id: document.getElementById('donacion-donante').value,
        monto: parseFloat(document.getElementById('donacion-monto').value),
        moneda_aporte: document.getElementById('donacion-moneda').value,
        fecha: document.getElementById('donacion-fecha').value,
        medio: document.getElementById('donacion-medio').value,
        comprobante: document.getElementById('donacion-comprobante').value || 'S/N',
        destinacion: document.getElementById('donacion-destinacion').value,
        nota: document.getElementById('donacion-nota').value
    };

    const { error } = await donacionesService.insertar([payload]);
    if (error) return mostrarNotificacion('peligro', 'Error Supabase', error.message);

    cerrarModal('modal-donacion');
    mostrarNotificacion('exito', 'Aporte Aprobado', 'Se insertó en la base de datos.');
    await cargarDatosSupabase();
}

function confirmarEliminarDonacion(id) {
    mostrarNotificacion('peligro', 'Reversar Transacción', '¿Desea eliminar la transacción de la base de datos?', async () => {
        // 1. Eliminar de la lista local inmediatamente (UI reactiva instantánea)
        globalDonaciones = globalDonaciones.filter(d => d.id !== id);
        
        // 2. Volver a renderizar la tabla y actualizar contadores/gráficos al instante
        renderizarTablaDonaciones();
        if (typeof actualizarKPIs === 'function') actualizarKPIs();
        if (typeof renderizarGraficos === 'function') renderizarGraficos();

        // 3. Ejecutar la eliminación en Supabase
        const { error } = await donacionesService.eliminar(id);
        if (error) {
            mostrarNotificacion('peligro', 'Error al eliminar', error.message);
            // Si ocurrió un error en Supabase, sincronizamos para restaurar los datos reales
            await cargarDatosSupabase();
        } else {
            mostrarNotificacion('exito', 'Transacción Eliminada', 'Se borró la donación de la base de datos.');
        }
    });
}

function renderizarTablaDonaciones() {
    const buscarInput = document.getElementById('buscar-donacion');
    const filtroMesInput = document.getElementById('filtro-mes-tabla-donaciones');
    const filtroDestInput = document.getElementById('filtro-destinacion-donacion');
    
    const termino = (buscarInput?.value || '').trim().toLowerCase();
    const filtroMes = (filtroMesInput?.value || '').trim();
    const filtroDest = (filtroDestInput?.value || '').trim();
    const tbody = document.getElementById('tbody-donaciones');
    if (!tbody) return;
    tbody.innerHTML = '';

    const listaDonaciones = Array.isArray(globalDonaciones) ? globalDonaciones : [];

    const filtrados = listaDonaciones.filter(d => {
        if (!d) return false;
        const donante = Array.isArray(globalDonantes) ? globalDonantes.find(x => x && x.id === d.donante_id) : null;
        const nombreDonante = donante && donante.nombre ? donante.nombre.toLowerCase() : '';
        const comp = (d.comprobante || '').toLowerCase();
        const matchBusqueda = termino === '' || comp.includes(termino) || nombreDonante.includes(termino);
        const matchMes = filtroMes === '' || (d.fecha && String(d.fecha).startsWith(filtroMes));
        const matchDest = filtroDest === '' || (d.destinacion && String(d.destinacion) === filtroDest);
        return matchBusqueda && matchMes && matchDest;
    });

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-slate-400 font-medium">No hay donaciones que coincidan con los filtros.</td></tr>`;
        return;
    }

    filtrados.forEach(d => {
        const donante = Array.isArray(globalDonantes) ? globalDonantes.find(x => x && x.id === d.donante_id) : null;
        const nombreMostrar = donante && donante.nombre ? donante.nombre : 'Donante';
        const moneda = d.moneda_aporte || 'COP';
        const montoFormateado = formatearMonedaEstatica(d.monto, moneda);
        const fechaMostrar = d.fecha || 'Sin fecha';
        const medioMostrar = d.medio || 'No especificado';
        const destinacionMostrar = d.destinacion || 'General';
        const compMostrar = d.comprobante || 'N/A';
        const donacionId = d.id || '';

        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50/80 even:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-slate-700">${fechaMostrar}</td>
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800">${nombreMostrar}</div>
            </td>
            <td class="px-6 py-4 font-bold text-emerald-600">${montoFormateado} <span class="text-[10px] text-slate-400">${moneda}</span></td>
            <td class="px-6 py-4 text-sm text-slate-600">${medioMostrar}</td>
            <td class="px-6 py-4"><span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">${destinacionMostrar}</span></td>
            <td class="px-6 py-4 font-mono text-xs text-slate-500">${compMostrar}</td>
            <td class="px-6 py-4 text-right space-x-2">
                <button onclick="imprimirRecibo('${donacionId}')" class="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg" title="Imprimir Recibo"><i class="fa-solid fa-print"></i></button>
                <button onclick="confirmarEliminarDonacion('${donacionId}')" class="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function imprimirRecibo(id) {
    const d = globalDonaciones.find(x => x.id === id);
    if (!d) return;
    const donante = globalDonantes.find(x => x.id === d.donante_id);

    document.getElementById('recibo-comp').innerText = d.comprobante || `REF-${d.id.substring(0, 8)}`;
    document.getElementById('recibo-fecha').innerText = d.fecha;
    document.getElementById('recibo-donante-nombre').innerText = donante ? donante.nombre : 'Donante Desconocido';
    document.getElementById('recibo-donante-doc').innerText = donante ? donante.documento : '-';
    document.getElementById('recibo-destinacion').innerText = d.destinacion;
    document.getElementById('recibo-medio').innerText = d.medio;
    document.getElementById('recibo-monto').innerText = `${formatearMonedaEstatica(d.monto, d.moneda_aporte)} ${d.moneda_aporte}`;

    window.print();
}

// ALERTAS
function renderizarTablaAlertas() {
    const tbody = document.getElementById('tbody-alertas');
    if (!tbody) return;
    tbody.innerHTML = '';

    const umbralDias = parseInt(document.getElementById('selector-umbral-alertas').value) || 30;
    const hoy = new Date();
    const donantesAlerta = [];

    globalDonantes.filter(d => d.estado === 'Activo').forEach(donante => {
        const donDonante = globalDonaciones.filter(d => d.donante_id === donante.id);
        let ultimaFechaStr = donante.fecha_registro || '2020-01-01';

        if (donDonante.length > 0) {
            donDonante.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            ultimaFechaStr = donDonante[0].fecha;
        }

        const diffDays = Math.ceil(Math.abs(hoy - new Date(ultimaFechaStr)) / (1000 * 60 * 60 * 24));
        if (diffDays > umbralDias) {
            donantesAlerta.push({
                ...donante,
                ultima_donacion: ultimaFechaStr,
                dias_ausencia: diffDays
            });
        }
    });

    if (donantesAlerta.length === 0) return tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-slate-400 font-medium">No hay donantes en alerta de retención.</td></tr>`;

    donantesAlerta.sort((a, b) => b.dias_ausencia - a.dias_ausencia).forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-rose-100 hover:bg-rose-50/50 transition-colors';

        const msg = encodeURIComponent(`Hola ${d.nombre}, gracias por apoyar a la fundación. Nos comunicamos porque notamos que no hemos recibido aportes recientes...`);
        const telStr = (d.telefono || '').replace(/\D/g, '');

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800">${d.nombre}</div>
                <div class="text-[11px] text-slate-500 font-mono">${d.documento}</div>
            </td>
            <td class="px-6 py-4 font-medium text-slate-600">${d.ultima_donacion}</td>
            <td class="px-6 py-4 font-bold text-rose-600">${d.dias_ausencia} días</td>
            <td class="px-6 py-4 text-sm font-medium text-slate-600">${d.periodicidad}</td>
            <td class="px-6 py-4 text-right space-x-2">
                <a href="https://wa.me/${telStr}?text=${msg}" target="_blank" class="inline-block p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg shadow-sm border border-emerald-100 transition-colors" title="WhatsApp"><i class="fa-brands fa-whatsapp text-lg"></i></a>
                <a href="mailto:${d.correo}?subject=Agradecimiento y Seguimiento&body=${msg}" target="_blank" class="inline-block p-2 text-blue-500 hover:bg-blue-50 rounded-lg shadow-sm border border-blue-100 transition-colors" title="Email"><i class="fa-solid fa-envelope text-lg"></i></a>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// UTILIDADES EXCEL
function construirLibroExcel(nombreHoja, filas, anchos = []) {
    const hoja = XLSX.utils.json_to_sheet(filas);
    if (anchos.length) hoja['!cols'] = anchos.map(w => ({ wch: w }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
    return libro;
}

function descargarExcel(nombreArchivo, libro) {
    XLSX.writeFile(libro, nombreArchivo, { compression: true });
}

// EXPORTACIÓN EXCEL
function exportarExcel(tipo) {
    const datos = tipo === 'donantes' ? globalDonantes : globalDonaciones;
    if (!datos || datos.length === 0) return mostrarNotificacion('alerta', 'Datos Vacíos', `No hay registros de ${tipo} para exportar.`);

    let filas, anchos, nombreHoja;

    if (tipo === 'donantes') {
        nombreHoja = 'Donantes';
        anchos = [28, 18, 16, 16, 28, 16, 18, 14, 18, 32];
        filas = datos.map(d => ({
            'Nombre_Razon_Social': d.nombre || '',
            'Documento': d.documento || '',
            'Fecha_Nacimiento_YYYY_MM_DD': d.fecha_nac || '',
            'Telefono': d.telefono || '',
            'Correo': d.correo || '',
            'Tipo_Natural_Juridica': d.tipo || 'Natural',
            'Periodicidad_Ocasional_Mensual_Anual': d.periodicidad || 'Ocasional',
            'Estado_Activo_Inactivo_Retirado': d.estado || 'Activo',
            'Fecha_Registro': d.fecha_registro || '',
            'Notas': d.nota || ''
        }));
    } else {
        nombreHoja = 'Donaciones';
        anchos = [18, 28, 16, 14, 10, 18, 24, 18, 32];
        filas = datos.map(d => {
            const donante = globalDonantes.find(x => x.id === d.donante_id);
            return {
                'Documento_Donante': donante ? (donante.documento || donante.correo || donante.id) : '',
                'Nombre_Donante': donante ? donante.nombre : 'Desvinculado',
                'Fecha_Donacion': d.fecha || '',
                'Monto': Number(d.monto) || 0,
                'Moneda': d.moneda_aporte || 'COP',
                'Medio_Pago': d.medio || '',
                'Destinacion': d.destinacion || '',
                'Comprobante': d.comprobante || '',
                'Notas': d.nota || ''
            };
        });
    }

    const libro = construirLibroExcel(nombreHoja, filas, anchos);
    descargarExcel(`Reporte_${tipo.toUpperCase()}_${new Date().toISOString().split('T')[0]}.xlsx`, libro);
}

function descargarPlantillaImportacion() {
    const filaEjemplo = {
        'Nombre_Razon_Social': 'Juan Pérez',
        'Documento': '100200300',
        'Fecha_Nacimiento_YYYY_MM_DD': '1990-05-15',
        'Telefono': '3001234567',
        'Correo': 'juan@ejemplo.com',
        'Tipo_Natural_Juridica': 'Natural',
        'Periodicidad_Ocasional_Mensual_Anual': 'Mensual',
        'Estado_Activo_Inactivo_Retirado': 'Activo',
        'Notas': 'Ejemplo de importación'
    };
    const anchos = [26, 16, 26, 14, 26, 22, 34, 28, 30];
    const libro = construirLibroExcel('Plantilla', [filaEjemplo], anchos);
    descargarExcel('Plantilla_Importacion_Donantes.xlsx', libro);
}

function descargarPlantillaDonaciones() {
    const filaEjemplo = {
        'Documento_Donante': '100200300',
        'Fecha_Donacion': '2026-03-15',
        'Monto': 150000,
        'Moneda': 'COP',
        'Medio_Pago': 'Transferencia',
        'Destinacion': 'Programa Educativo',
        'Comprobante': 'TRX-982341',
        'Notas': 'Aporte mensual correspondiente a marzo'
    };
    const anchos = [22, 18, 14, 10, 18, 24, 18, 35];
    const libro = construirLibroExcel('Plantilla Donaciones', [filaEjemplo], anchos);
    descargarExcel('Plantilla_Importacion_Donaciones.xlsx', libro);
}

// IMPORTACIÓN DONANTES
function procesarImportacionArchivo(event) {
    const archivo = event.target.files[0];
    if (!archivo) return;

    const nombreLower = archivo.name.toLowerCase();
    const esCSV = nombreLower.endsWith('.csv');
    const esExcel = nombreLower.endsWith('.xlsx') || nombreLower.endsWith('.xls');

    if (!esCSV && !esExcel) {
        mostrarNotificacion('peligro', 'Formato Inválido', 'Solo se aceptan archivos .xlsx, .xls o .csv.');
        event.target.value = '';
        return;
    }

    const statusEl = document.getElementById('status-db');
    if (statusEl) statusEl.innerText = 'Importando...';

    if (esCSV) {
        Papa.parse(archivo, {
            header: true,
            skipEmptyLines: true,
            transformHeader: h => h.trim(),
            complete: (resultados) => finalizarImportacionDonantes(resultados.data, event),
            error: () => manejarErrorLecturaArchivo(event)
        });
    } else {
        const lector = new FileReader();
        lector.onload = (e) => {
            try {
                const libro = XLSX.read(e.target.result, { type: 'array', cellDates: true });
                const hoja = libro.Sheets[libro.SheetNames[0]];
                const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false });
                finalizarImportacionDonantes(filas, event);
            } catch (err) {
                manejarErrorLecturaArchivo(event);
            }
        };
        lector.onerror = () => manejarErrorLecturaArchivo(event);
        lector.readAsArrayBuffer(archivo);
    }
}

function manejarErrorLecturaArchivo(event) {
    mostrarNotificacion('peligro', 'Archivo Inválido', 'No se pudo leer el archivo. Verifica que el formato y las columnas sean correctos.');
    const statusEl = document.getElementById('status-db');
    if (statusEl) statusEl.innerText = 'Sistema en línea';
    event.target.value = '';
}

async function finalizarImportacionDonantes(filas, event) {
    try {
        if (!filas || filas.length === 0) throw new Error('El archivo está vacío o no tiene el formato esperado.');

        const documentosExistentes = new Set(globalDonantes.map(d => String(d.documento || '').trim()));
        const documentosEnArchivo = new Set();
        const payload = [];
        const errores = [];

        const obtenerValor = (row, keys) => {
            for (const key of keys) {
                if (row[key] !== undefined && String(row[key]).trim() !== '') {
                    return String(row[key]).trim();
                }
            }
            return '';
        };

        filas.forEach((fila, i) => {
            const numFila = i + 2;
            const nombre = obtenerValor(fila, ['Nombre_Razon_Social', 'Nombre o Razón Social', 'Nombre', 'nombre']);
            const documento = obtenerValor(fila, ['Documento', 'Documento (CC o NIT)', 'documento', 'Cedula', 'NIT']);

            if (!nombre || !documento) {
                errores.push({ fila: numFila, causa: 'Campos incompletos', detalle: 'Falta el Nombre o el Documento.' });
                return;
            }

            if (documentosExistentes.has(documento) || documentosEnArchivo.has(documento)) {
                errores.push({ fila: numFila, causa: 'Documento duplicado', detalle: `El documento "${documento}" ya existe en la BD o en el archivo.` });
                return;
            }

            const rawTipo = obtenerValor(fila, ['Tipo_Natural_Juridica', 'Tipo de Persona', 'tipo']);
            const rawPeriodicidad = obtenerValor(fila, ['Periodicidad_Ocasional_Mensual_Anual', 'Periodicidad', 'periodicidad']);
            const rawEstado = obtenerValor(fila, ['Estado_Activo_Inactivo_Retirado', 'Estado', 'estado']);
            const fechaNac = obtenerValor(fila, ['Fecha_Nacimiento_YYYY_MM_DD', 'Fecha de Nacimiento', 'fecha_nac']);

            documentosEnArchivo.add(documento);
            payload.push({
                nombre,
                documento,
                fecha_nac: fechaNac || null,
                telefono: obtenerValor(fila, ['Telefono', 'Teléfono', 'telefono']),
                correo: obtenerValor(fila, ['Correo', 'Correo Electrónico', 'correo', 'Email']),
                tipo: CAMPOS_VALIDOS_DONANTE.tipo.includes(rawTipo) ? rawTipo : 'Natural',
                periodicidad: CAMPOS_VALIDOS_DONANTE.periodicidad.includes(rawPeriodicidad) ? rawPeriodicidad : 'Ocasional',
                estado: CAMPOS_VALIDOS_DONANTE.estado.includes(rawEstado) ? rawEstado : 'Activo',
                nota: obtenerValor(fila, ['Notas', 'nota']),
                fecha_registro: new Date().toISOString().split('T')[0]
            });
        });

        erroresImportacionActuales = errores;

        if (payload.length === 0) {
            mostrarModalReporteErrores(`No se importó ningún registro (${errores.length} errores encontrados).`);
            return;
        }

        const { error } = await donantesService.insertar(payload);
        if (error) throw error;

        await cargarDatosSupabase();

        if (errores.length > 0) {
            mostrarModalReporteErrores(`Importación parcial: Se agregaron ${payload.length} donante(s), pero ${errores.length} fila(s) tuvieron observaciones.`);
        } else {
            mostrarNotificacion('exito', 'Importación Exitosa', `Se agregaron ${payload.length} nuevo(s) donante(s) correctamente.`);
        }

    } catch (err) {
        mostrarNotificacion('peligro', 'Error de Importación', err.message || 'No se pudo completar la importación.');
    } finally {
        const statusEl = document.getElementById('status-db');
        if (statusEl) statusEl.innerText = 'Sistema en línea';
        if (event && event.target) event.target.value = '';
    }
}

// VISOR DE ERRORES DEDICADO (z-[50] para quedar debajo de las alertas y modales principales z-[60]/z-[70])
function mostrarModalReporteErrores(mensajeResumen) {
    let modal = document.getElementById('modal-reporte-errores');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-reporte-errores';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[50] flex items-center justify-center p-4 transition-all';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 flex flex-col overflow-hidden" style="max-height: 90vh;">
            <!-- HEADER DEL MODAL -->
            <div class="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                <div>
                    <h3 class="font-bold text-lg text-slate-800">Reporte de Errores / Observaciones</h3>
                    <p class="text-xs text-slate-500 mt-1">${mensajeResumen}</p>
                </div>
                <button onclick="cerrarModalReporteErrores()" class="text-slate-400 hover:text-rose-500 bg-white p-2 rounded-full shadow-sm border border-slate-200 transition-colors">
                    <i class="fa-solid fa-xmark w-4 h-4 flex items-center justify-center"></i>
                </button>
            </div>

            <!-- CUERPO DEL MODAL -->
            <div class="p-6 flex flex-col bg-white gap-4">
                
                <!-- BUSCADOR Y BOTONES -->
                <div class="shrink-0 flex gap-2">
                    <input type="text" id="buscar-error-reporte" onkeyup="filtrarErroresReporte()" placeholder="Buscar por fila, motivo o detalle..." class="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 shadow-sm">
                    <button onclick="abrirReporteEnNuevaVentana()" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shadow-sm border border-slate-200 transition-colors" title="Abrir en pantalla completa">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Nueva ventana
                    </button>
                    <button onclick="descargarReporteErroresTXT()" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shadow-sm border border-slate-200 transition-colors" title="Guardar como TXT">
                        <i class="fa-solid fa-download"></i> TXT
                    </button>
                </div>

                <!-- CONTENEDOR CON SCROLL EN LÍNEA DIRECTO (GARANTIZADO) -->
                <div class="border border-slate-200 rounded-xl shadow-inner bg-white relative block" style="height: 350px; overflow-y: auto; display: block;">
                    <table class="w-full text-left border-collapse">
                        <thead class="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 uppercase font-bold z-10 shadow-sm">
                            <tr>
                                <th class="py-3 px-4 whitespace-nowrap w-28">FILA</th>
                                <th class="py-3 px-4">MOTIVO</th>
                                <th class="py-3 px-4">DETALLE</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-reporte-errores" class="text-xs divide-y divide-slate-100">
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- FOOTER DEL MODAL -->
            <div class="p-5 border-t border-slate-100 flex justify-end bg-slate-50 shrink-0">
                <button onclick="cerrarModalReporteErrores()" class="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm rounded-xl transition-colors shadow-md">
                    Cerrar Reporte
                </button>
            </div>
        </div>
    `;

    renderizarFilasErrores(erroresImportacionActuales);
    modal.classList.remove('hidden');
}

function renderizarFilasErrores(lista) {
    const tbody = document.getElementById('tbody-reporte-errores');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="py-6 text-center text-slate-400">No se encontraron errores o la lista está vacía.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(err => `
        <tr class="hover:bg-slate-50">
            <td class="py-2.5 px-4 font-mono font-bold text-rose-600">#${err.fila}</td>
            <td class="py-2.5 px-4 font-semibold text-slate-700">${err.causa}</td>
            <td class="py-2.5 px-4 text-slate-500">${err.detalle}</td>
        </tr>
    `).join('');
}

function filtrarErroresReporte() {
    const q = document.getElementById('buscar-error-reporte').value.toLowerCase();
    const filtrados = erroresImportacionActuales.filter(e => 
        String(e.fila).includes(q) || 
        e.causa.toLowerCase().includes(q) || 
        e.detalle.toLowerCase().includes(q)
    );
    renderizarFilasErrores(filtrados);
}

function cerrarModalReporteErrores() {
    const modal = document.getElementById('modal-reporte-errores');
    if (modal) modal.classList.add('hidden');
}

function descargarReporteErroresTXT() {
    if (!erroresImportacionActuales.length) return;
    const contenido = erroresImportacionActuales.map(e => `[Fila ${e.fila}] ${e.causa}: ${e.detalle}`).join('\n');
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_Errores_Importacion_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
}

function abrirReporteEnNuevaVentana() {
    if (!erroresImportacionActuales.length) return;
    const win = window.open('', '_blank', 'width=800,height=600');
    const html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Reporte de Errores de Importación</title>
            <style>
                body { font-family: system-ui, sans-serif; padding: 24px; color: #1e293b; background: #f8fafc; }
                h2 { color: #0f172a; margin-bottom: 8px; }
                table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
                th { background: #f1f5f9; text-transform: uppercase; font-size: 12px; color: #64748b; }
                .fila { font-weight: bold; color: #e11d48; font-family: monospace; }
            </style>
        </head>
        <body>
            <h2>Detalle de Observaciones de Importación</h2>
            <p style="font-size:14px; color:#64748b;">Total de filas omitidas o con error: ${erroresImportacionActuales.length}</p>
            <table>
                <thead>
                    <tr><th>Fila</th><th>Motivo</th><th>Detalle</th></tr>
                </thead>
                <tbody>
                    ${erroresImportacionActuales.map(e => `
                        <tr>
                            <td class="fila">#${e.fila}</td>
                            <td><strong>${e.causa}</strong></td>
                            <td>${e.detalle}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;
    win.document.write(html);
    win.document.close();
}

// DESTINACIONES
function renderizarDestinaciones() {
    const cont = document.getElementById('contenedor-destinaciones');
    if (!cont) return;
    cont.innerHTML = '';
    globalDestinaciones.forEach((d, i) => {
        cont.innerHTML += `<div class="flex items-center bg-white text-slate-700 px-4 py-2 rounded-xl shadow-sm border border-slate-200"><span class="font-semibold text-sm">${d}</span><button onclick="eliminarDestinacion(${i})" class="text-rose-500 ml-2"><i class="fa-solid fa-times"></i></button></div>`;
    });
    const selF = document.getElementById('donacion-destinacion');
    const selT = document.getElementById('filtro-destinacion-donacion');
    if (selF) selF.innerHTML = globalDestinaciones.map(d => `<option value="${d}">${d}</option>`).join('');
    if (selT) selT.innerHTML = '<option value="">Cualquier Destinación</option>' + globalDestinaciones.map(d => `<option value="${d}">${d}</option>`).join('');
}

function agregarDestinacion() {
    const input = document.getElementById('nueva-destinacion');
    if (!input) return;
    const val = input.value.trim();
    if (val && !globalDestinaciones.includes(val)) {
        globalDestinaciones.push(val);
        localStorage.setItem('destinaciones', JSON.stringify(globalDestinaciones));
        input.value = '';
        renderizarDestinaciones();
    }
}

function eliminarDestinacion(i) {
    if (globalDestinaciones.length <= 1) return mostrarNotificacion('alerta', 'No permitido', 'Mínimo 1 destinación.');
    globalDestinaciones.splice(i, 1);
    localStorage.setItem('destinaciones', JSON.stringify(globalDestinaciones));
    renderizarDestinaciones();
}

// PANTALLA DE BLOQUEO Y AUTENTICACIÓN CON SUPABASE
function togglePasswordVisibility() {
    const input = document.getElementById('input-password');
    const icon = document.getElementById('icono-password');
    if (!input || !icon) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

async function verificarPassword() {
    const inputPwd = document.getElementById('input-password');
    const btnSubmit = document.getElementById('btn-desbloquear-crm');
    if (!inputPwd) return;

    const pass = inputPwd.value.trim();
    if (!pass) {
        mostrarNotificacion('alerta', 'Campo requerido', 'Por favor ingresa la contraseña.');
        inputPwd.focus();
        return;
    }

    // Feedback visual en el botón durante la autenticación
    let textoOriginal = '';
    if (btnSubmit) {
        textoOriginal = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Verificando...';
    }

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: AUTH_SYSTEM_EMAIL,
            password: pass
        });

        if (error) {
            console.error('Error de autenticación:', error);
            mostrarNotificacion('peligro', 'Acceso Denegado', 'La contraseña ingresada es incorrecta o el usuario no está configurado.');
            inputPwd.value = '';
            inputPwd.focus();
            return;
        }

        if (data?.session) {
            const lockScreen = document.getElementById('lock-screen');
            if (lockScreen) lockScreen.classList.add('hidden');
            inputPwd.value = '';
            await iniciarApp();
        }
    } catch (err) {
        console.error('Error inesperado de inicio de sesión:', err);
        mostrarNotificacion('peligro', 'Error de Conexión', 'Ocurrió un problema de red al conectar con Supabase Auth.');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = textoOriginal;
        }
    }
}

async function cerrarSesion() {
    try {
        await supabaseClient.auth.signOut();
    } catch (e) {
        console.error('Error al cerrar sesión:', e);
    }
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen) lockScreen.classList.remove('hidden');
    const inputPwd = document.getElementById('input-password');
    if (inputPwd) {
        inputPwd.value = '';
        inputPwd.focus();
    }
    toggleSidebar(false);
    mostrarNotificacion('informacion', 'Sesión cerrada', 'El CRM ha sido bloqueado correctamente.');
}

// INIT
async function iniciarApp() {
    const hoy = new Date();
    const filtroAnio = document.getElementById('filtro-anio');
    const filtroMes = document.getElementById('filtro-mes-select');
    const filtroTrimestre = document.getElementById('filtro-trimestre-select');

    if (filtroAnio) filtroAnio.value = hoy.getFullYear();
    if (filtroMes) filtroMes.value = hoy.getMonth() + 1;
    if (filtroTrimestre) filtroTrimestre.value = Math.floor(hoy.getMonth() / 3) + 1;

    actualizarControlesFiltro();

    if (!localStorage.getItem('destinaciones')) localStorage.setItem('destinaciones', JSON.stringify(['Apadrinamiento', 'Evento Especial', 'Donación General', 'Fondo de Emergencia']));
    globalDestinaciones = JSON.parse(localStorage.getItem('destinaciones'));
    renderizarDestinaciones();

    await cargarDatosSupabase();
    window.addEventListener('resize', () => { if (chartRecaudacionInstance) chartRecaudacionInstance.resize(); if (chartMediosPagoInstance) chartMediosPagoInstance.resize(); });
}

// ESCAPE PARA CERRAR MODALES O SIDEBAR
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cerrarModalReporteErrores();
        cerrarNotificacion();
        toggleSidebar(false);
    }
});

window.onload = async () => {
    // INICIALIZACIÓN COMPLETA DE IMPORTACIÓN DE DONACIONES
    initImportacionDonaciones({
        supabaseClient,
        getDonantes: () => globalDonantes,
        getDonaciones: () => globalDonaciones,
        getDestinaciones: () => globalDestinaciones,
        mostrarNotificacion,
        cargarDatosSupabase
    });

    const inputPwd = document.getElementById('input-password');
    if (inputPwd) {
        inputPwd.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') verificarPassword();
        });
    }

    // Escuchar cambios de estado de autenticación de Supabase
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            const lockScreen = document.getElementById('lock-screen');
            if (lockScreen) lockScreen.classList.remove('hidden');
        }
    });

    // Comprobar si existe sesión activa previa persistida en Supabase
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            const lockScreen = document.getElementById('lock-screen');
            if (lockScreen) lockScreen.classList.add('hidden');
            await iniciarApp();
        } else {
            const lockScreen = document.getElementById('lock-screen');
            if (lockScreen) lockScreen.classList.remove('hidden');
            if (inputPwd) inputPwd.focus();
        }
    } catch (e) {
        console.warn('Error al verificar sesión inicial:', e);
        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen) lockScreen.classList.remove('hidden');
        if (inputPwd) inputPwd.focus();
    }
};

// EXPORTACIÓN A WINDOW DE TODAS LAS FUNCIONES
Object.assign(window, {
    abrirModalDonacion, abrirModalDonante, abrirReporteEnNuevaVentana, actualizarControlesFiltro, actualizarKPIs, actualizarMetricasDetalle, agregarDestinacion, cambiarMonedaGlobal, cambiarTab, cargarDatosSupabase, cerrarModal, cerrarModalReporteErrores, cerrarNotificacion, cerrarSesion, confirmarEliminarDonacion, confirmarEliminarDonante, construirLibroExcel, descargarExcel, descargarPlantillaImportacion, descargarPlantillaDonaciones, descargarReporteErroresTXT, eliminarDestinacion, exportarExcel, filtrarErroresReporte, filtrarTablaDonaciones, filtrarTablaDonantes, finalizarImportacionDonantes, formatearMoneda, formatearMonedaEstatica, guardarDonacion, guardarDonante, imprimirRecibo, iniciarApp, manejarErrorLecturaArchivo, mostrarModalReporteErrores, mostrarNotificacion, normalizarACOP, poblarSelectDonantes, procesarImportacionArchivo, renderizarDestinaciones, renderizarGraficoAnillos, renderizarGraficos, renderizarTablaAlertas, renderizarTablaDonaciones, renderizarTablaDonantes, togglePasswordVisibility, toggleSidebar, verDetalleDonante, verificarPassword
});