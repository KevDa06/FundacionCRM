import Chart from 'chart.js/auto';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabaseClient, AUTH_SYSTEM_EMAIL, isSupabaseConfigured } from './services/supabase.js';
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
let editandoDonacionId = null;
let guardandoDonante = false;
let guardandoDonacion = false;
let eliminandoDonante = false;
let eliminandoDonacion = false;

// Valores permitidos para validación de importación
const CAMPOS_VALIDOS_DONANTE = {
    tipo: ['Natural', 'Juridica'],
    periodicidad: ['Ocasional', 'Mensual', 'Anual'],
    estado: ['Activo', 'Inactivo', 'Retirado']
};

// Función auxiliar para sanitizar e impedir inyecciones XSS
function escaparHTML(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Función auxiliar para normalizar documentos y evitar falsos negativos por formato o espacios
function normalizarDocumento(doc) {
    if (!doc) return '';
    return String(doc)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}

// FETCH DESDE SUPABASE
async function cargarDatosSupabase() {
    try {
        const statusEl = document.getElementById('status-db');

        if (!isSupabaseConfigured) {
            console.warn('Supabase no está configurado. Verifique VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en su archivo .env');
            if (statusEl) {
                statusEl.innerText = 'Faltan credenciales Supabase';
                statusEl.className = 'text-xs font-semibold text-amber-600';
                if (statusEl.previousElementSibling) {
                    statusEl.previousElementSibling.className = 'w-2 h-2 rounded-full bg-amber-500';
                }
            }
            return;
        }

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
        const tabSeguimiento = document.getElementById('tab-seguimiento');
        const tabCumpleanos = document.getElementById('tab-cumpleanos');
        const tabAlertas = document.getElementById('tab-alertas');

        if (tabDonantes && !tabDonantes.classList.contains('hidden')) renderizarTablaDonantes();
        if (tabDonaciones && !tabDonaciones.classList.contains('hidden')) renderizarTablaDonaciones();
        if (tabSeguimiento && !tabSeguimiento.classList.contains('hidden')) renderizarModuloSeguimiento();
        if (tabCumpleanos && !tabCumpleanos.classList.contains('hidden')) renderizarModuloCumpleanos();
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
    actualizarKPIs(); 
    renderizarGraficos(); 
    renderizarTablaDonaciones();
    renderizarModuloSeguimiento();
    renderizarTablaOcasionales();
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

    const titulos = { 
        'dashboard': 'Panel General', 
        'donantes': 'Directorio', 
        'donaciones': 'Registro', 
        'seguimiento': 'Seguimiento de Donaciones',
        'cumpleanos': 'Cumpleaños de Donantes',
        'alertas': 'Centro de Retención', 
        'herramientas': 'Ajustes' 
    };
    const headerTitle = document.getElementById('header-titulo-vista');
    if (headerTitle) headerTitle.innerText = titulos[tabId] || 'Panel';

    if (tabId === 'donantes') renderizarTablaDonantes();
    if (tabId === 'donaciones') renderizarTablaDonaciones();
    if (tabId === 'seguimiento') renderizarModuloSeguimiento();
    if (tabId === 'cumpleanos') renderizarModuloCumpleanos();
    if (tabId === 'alertas') renderizarTablaAlertas();
    if (tabId === 'herramientas') renderizarDestinaciones();

    toggleSidebar(false);
}

function cerrarModal(modalId) { 
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden'); 
    if (modalId === 'modal-donacion') editandoDonacionId = null;
    if (modalId === 'modal-donante') editandoDonanteId = null;
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
                
                <h3 class="font-bold text-lg text-slate-800 text-center mb-4 shrink-0">${escaparHTML(titulo)}</h3>
                
                <!-- Scrollbar agregada con custom-scrollbar -->
                <div class="overflow-y-auto flex-1 min-h-0 custom-scrollbar text-sm text-slate-600 leading-relaxed px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 whitespace-pre-line">
                    ${escaparHTML(mensaje)}
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
        const btnConfirmar = document.getElementById('btn-confirmar-notif-action');
        if (btnConfirmar) {
            btnConfirmar.onclick = () => {
                if (btnConfirmar.disabled) return;
                btnConfirmar.disabled = true;
                btnConfirmar.classList.add('opacity-70', 'cursor-not-allowed');
                cerrarNotificacion();
                callbackConfirmacion();
            };
        }
    }

    modal.classList.remove('hidden');
}

function cerrarNotificacion() { 
    const modal = document.getElementById('modal-notificacion');
    if (modal) modal.classList.add('hidden'); 
}

// FECHAS CALENDARIO LOCALES
function obtenerFechaActualLocal() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function calcularDiasDesdeFecha(fechaStr) {
    if (!fechaStr) return 0;
    const soloFecha = String(fechaStr).split('T')[0];
    const parts = soloFecha.split('-');
    if (parts.length < 3) return 0;

    const anio = parseInt(parts[0], 10);
    const mes = parseInt(parts[1], 10) - 1;
    const dia = parseInt(parts[2], 10);

    const fechaEvento = new Date(anio, mes, dia, 0, 0, 0, 0);
    const hoy = new Date();
    const fechaHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);

    const diffMs = fechaHoy.getTime() - fechaEvento.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function sumarMesesCalendario(anio, mes, dia, mesesASumar) {
    const totalMeses = mes + mesesASumar;
    const targetYear = anio + Math.floor(totalMeses / 12);
    const targetMonth = ((totalMeses % 12) + 12) % 12;
    const maxDiasEnMes = new Date(targetYear, targetMonth + 1, 0).getDate();
    const targetDay = Math.min(dia, maxDiasEnMes);
    return new Date(targetYear, targetMonth, targetDay, 0, 0, 0, 0);
}

const MESES_POR_PERIODICIDAD = {
    'mensual': 1,
    'trimestral': 3,
    'semestral': 6,
    'anual': 12
};

function evaluarAlertaRetencionDonante(donante, donaciones, umbralDias) {
    if (donante.estado !== 'Activo') return null;

    const p = (donante.periodicidad || '').trim().toLowerCase();
    const mesesCiclo = MESES_POR_PERIODICIDAD[p];
    if (!mesesCiclo) return null; // Donantes Ocasionales o sin periodicidad fija quedan excluidos

    const donDonante = donaciones.filter(d => d.donante_id === donante.id);
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
    let countAlertas = 0;

    globalDonantes.filter(d => d.estado === 'Activo').forEach(donante => {
        const alerta = evaluarAlertaRetencionDonante(donante, globalDonaciones, umbralDias);
        if (alerta) countAlertas++;
    });

    const kpiAlertasEl = document.getElementById('kpi-alertas');
    if (kpiAlertasEl) kpiAlertasEl.innerText = countAlertas;

    const badge = document.getElementById('badge-alertas-sidebar');
    if (badge) {
        if (countAlertas > 0) { badge.innerText = countAlertas; badge.classList.remove('hidden'); }
        else { badge.classList.add('hidden'); }
    }

    const badgeCumple = document.getElementById('badge-cumpleanos-sidebar');
    if (badgeCumple) {
        let countProximos = 0;
        globalDonantes.forEach(d => {
            if (!d.fecha_nac) return;
            const diff = calcularDiasProximoCumple(d.fecha_nac);
            if (diff >= 0 && diff <= 7) countProximos++;
        });
        if (countProximos > 0) {
            badgeCumple.innerText = countProximos;
            badgeCumple.classList.remove('hidden');
        } else {
            badgeCumple.classList.add('hidden');
        }
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
    const form = document.getElementById('form-donante');
    if (form) form.reset();
    editandoDonanteId = id;
    const tituloModal = document.getElementById('titulo-modal-donante');
    const btnGuardar = document.getElementById('btn-guardar-donante');

    if (id) {
        if (tituloModal) tituloModal.innerText = 'Editar Donante';
        if (btnGuardar) btnGuardar.innerText = 'Guardar Cambios';
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
        if (tituloModal) tituloModal.innerText = 'Nuevo Donante';
        if (btnGuardar) btnGuardar.innerText = 'Guardar Datos';
    }
    const modal = document.getElementById('modal-donante');
    if (modal) modal.classList.remove('hidden');
}

async function guardarDonante() {
    const form = document.getElementById('form-donante');
    if (!form.checkValidity()) return mostrarNotificacion('alerta', 'Datos Incompletos', 'Completa los campos requeridos con (*).');

    const inputDoc = document.getElementById('donante-documento');
    const rawDocumento = inputDoc ? inputDoc.value : '';
    const documentoTrimmed = String(rawDocumento || '').trim();

    if (!documentoTrimmed) {
        return mostrarNotificacion('alerta', 'Campo Requerido', 'Debes ingresar el número de documento del donante.');
    }

    const docNorm = normalizarDocumento(documentoTrimmed);

    // 1. Verificación en memoria con normalización profunda sobre globalDonantes
    const duplicadoEnMemoria = globalDonantes.find(d => {
        if (editandoDonanteId && String(d.id) === String(editandoDonanteId)) {
            return false; // El donante no es considerado duplicado de sí mismo al editar
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

    // 2. Verificación adicional remota en Supabase para evitar colisiones concurrentes
    try {
        const { data: coincidenciasBD, error: errVerif } = await donantesService.buscarPorDocumento(documentoTrimmed);
        if (!errVerif && Array.isArray(coincidenciasBD) && coincidenciasBD.length > 0) {
            const duplicadoBD = coincidenciasBD.find(d => {
                if (editandoDonanteId && String(d.id) === String(editandoDonanteId)) {
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

    if (guardandoDonante) return;
    guardandoDonante = true;

    const btnGuardar = document.getElementById('btn-guardar-donante');
    const textoOriginal = btnGuardar ? btnGuardar.innerText : (editandoDonanteId ? 'Guardar Cambios' : 'Guardar Datos');
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.classList.add('opacity-70', 'cursor-not-allowed');
        btnGuardar.innerText = 'Guardando...';
    }

    const inputFechaNac = document.getElementById('donante-fecha-nac');
    const fechaNacValor = inputFechaNac && inputFechaNac.value ? inputFechaNac.value.trim() : '';

    const payload = {
        nombre: (document.getElementById('donante-nombre').value || '').trim(),
        documento: documentoTrimmed,
        fecha_nac: fechaNacValor ? fechaNacValor : null,
        telefono: (document.getElementById('donante-telefono').value || '').trim(),
        correo: (document.getElementById('donante-correo').value || '').trim(),
        tipo: document.getElementById('donante-tipo').value,
        periodicidad: document.getElementById('donante-periodicidad').value,
        estado: document.getElementById('donante-estado').value,
        nota: (document.getElementById('donante-nota').value || '').trim()
    };

    try {
        if (editandoDonanteId) {
            const { error } = await donantesService.actualizar(editandoDonanteId, payload);
            if (error) {
                if (error.code === '23505' || (error.message && error.message.toLowerCase().includes('unique'))) {
                    return mostrarNotificacion('alerta', 'Documento Duplicado', 'Ya existe un donante registrado con este documento en la base de datos.');
                }
                return mostrarNotificacion('peligro', 'Error Supabase', error.message);
            }
            cerrarModal('modal-donante');
            mostrarNotificacion('exito', 'Perfil Actualizado', 'Modificaciones guardadas en la base de datos.');
        } else {
            payload.fecha_registro = obtenerFechaActualLocal();
            const { error } = await donantesService.insertar([payload]);
            if (error) {
                if (error.code === '23505' || (error.message && error.message.toLowerCase().includes('unique'))) {
                    return mostrarNotificacion('alerta', 'Documento Duplicado', 'Ya existe un donante registrado con este documento en la base de datos.');
                }
                return mostrarNotificacion('peligro', 'Error Supabase', error.message);
            }
            cerrarModal('modal-donante');
            mostrarNotificacion('exito', 'Registro Exitoso', 'Donante ingresado a la base de datos.');
        }

        await cargarDatosSupabase();
    } catch (err) {
        mostrarNotificacion('peligro', 'Error Inesperado', err.message || 'Ocurrió un error al procesar el donante.');
    } finally {
        guardandoDonante = false;
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.classList.remove('opacity-70', 'cursor-not-allowed');
            btnGuardar.innerText = textoOriginal;
        }
    }
}

function confirmarEliminarDonante(id) {
    mostrarNotificacion('peligro', 'Eliminar Permanente', '¿Borrar este donante y sus transacciones asociadas?', async () => {
        if (eliminandoDonante) return;
        eliminandoDonante = true;
        try {
            const { error: errDonaciones } = await donacionesService.eliminarPorDonante(id);
            if (errDonaciones) {
                return mostrarNotificacion('peligro', 'Error', 'No se pudieron eliminar las transacciones asociadas: ' + errDonaciones.message);
            }

            const { error: errDonante } = await donantesService.eliminar(id);
            if (errDonante) {
                return mostrarNotificacion('peligro', 'Error', errDonante.message);
            }

            mostrarNotificacion('exito', 'Eliminado', 'Registro borrado permanentemente.');
            await cargarDatosSupabase();
        } catch (err) {
            mostrarNotificacion('peligro', 'Error Inesperado', err.message || 'Ocurrió un problema al eliminar el registro.');
        } finally {
            eliminandoDonante = false;
        }
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

        const idSeguro = escaparHTML(d.id);
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
                <button onclick="verDetalleDonante('${idSeguro}')" class="p-2 text-blue-500 hover:bg-blue-100 rounded-lg"><i class="fa-solid fa-eye"></i></button>
                <button onclick="abrirModalDonante('${idSeguro}')" class="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg"><i class="fa-solid fa-pen"></i></button>
                <button onclick="confirmarEliminarDonante('${idSeguro}')" class="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><i class="fa-solid fa-trash"></i></button>
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
function poblarSelectDonantes(donanteIdSeleccionado = null) {
    const select = document.getElementById('donacion-donante');
    if (!select) return;
    select.innerHTML = '<option value="">-- Seleccione donante activo --</option>';
    let donanteSeleccionadoIncluido = false;
    globalDonantes.filter(d => d.estado === 'Activo').forEach(d => {
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
        const donanteExistente = globalDonantes.find(d => d.id === donanteIdSeleccionado);
        if (donanteExistente) {
            const opt = document.createElement('option');
            opt.value = donanteExistente.id;
            opt.textContent = `${donanteExistente.nombre} (${donanteExistente.documento}) [${donanteExistente.estado}]`;
            opt.selected = true;
            select.appendChild(opt);
        }
    }
}

function abrirModalDonacion(id = null) {
    const form = document.getElementById('form-donacion');
    if (form) form.reset();
    editandoDonacionId = id;

    const tituloEl = document.getElementById('titulo-modal-donacion');
    const btnGuardarEl = document.getElementById('btn-guardar-donacion');

    if (id) {
        if (tituloEl) tituloEl.innerText = 'Editar Donación';
        if (btnGuardarEl) btnGuardarEl.innerText = 'Guardar Cambios';

        const d = globalDonaciones.find(x => x.id === id);
        if (d) {
            poblarSelectDonantes(d.donante_id);
            const donanteSelect = document.getElementById('donacion-donante');
            if (donanteSelect) donanteSelect.value = d.donante_id || '';

            const montoInput = document.getElementById('donacion-monto');
            if (montoInput) montoInput.value = d.monto;

            const monedaSelect = document.getElementById('donacion-moneda');
            if (monedaSelect) monedaSelect.value = d.moneda_aporte || 'COP';

            const fechaInput = document.getElementById('donacion-fecha');
            if (fechaInput) fechaInput.value = d.fecha || obtenerFechaActualLocal();

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
        const fechaInput = document.getElementById('donacion-fecha');
        if (fechaInput) fechaInput.value = obtenerFechaActualLocal();
        const monedaSelect = document.getElementById('donacion-moneda');
        if (monedaSelect) monedaSelect.value = 'COP';
        const medioSelect = document.getElementById('donacion-medio');
        if (medioSelect) medioSelect.value = 'Transferencia';
    }

    const modal = document.getElementById('modal-donacion');
    if (modal) modal.classList.remove('hidden');
}

async function guardarDonacion() {
    const form = document.getElementById('form-donacion');
    if (!form.checkValidity()) return mostrarNotificacion('alerta', 'Faltan Datos', 'Revisa los campos obligatorios (*).');

    const donanteId = document.getElementById('donacion-donante').value;
    if (!donanteId) return mostrarNotificacion('alerta', 'Faltan Datos', 'Debes seleccionar un donante.');

    const montoVal = parseFloat(document.getElementById('donacion-monto').value);
    if (isNaN(montoVal) || montoVal <= 0) {
        return mostrarNotificacion('alerta', 'Monto Inválido', 'El monto de la donación debe ser un número mayor a 0.');
    }

    const fechaVal = document.getElementById('donacion-fecha').value;
    if (!fechaVal) return mostrarNotificacion('alerta', 'Faltan Datos', 'Debes indicar la fecha de recepción.');

    const destinacionVal = document.getElementById('donacion-destinacion').value;
    if (!destinacionVal) return mostrarNotificacion('alerta', 'Faltan Datos', 'Debes seleccionar una destinación.');

    if (guardandoDonacion) return;
    guardandoDonacion = true;

    const btnGuardar = document.getElementById('btn-guardar-donacion');
    const textoOriginal = btnGuardar ? btnGuardar.innerText : (editandoDonacionId ? 'Guardar Cambios' : 'Registrar Aporte');
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
        if (editandoDonacionId) {
            const { error } = await donacionesService.actualizar(editandoDonacionId, payload);
            if (error) {
                return mostrarNotificacion('peligro', 'Error Supabase', error.message);
            }
            cerrarModal('modal-donacion');
            mostrarNotificacion('exito', 'Donación Actualizada', 'Los cambios han sido guardados correctamente en la base de datos.');
        } else {
            const { error } = await donacionesService.insertar([payload]);
            if (error) {
                return mostrarNotificacion('peligro', 'Error Supabase', error.message);
            }
            cerrarModal('modal-donacion');
            mostrarNotificacion('exito', 'Aporte Aprobado', 'Se insertó en la base de datos.');
        }

        await cargarDatosSupabase();
    } catch (err) {
        mostrarNotificacion('peligro', 'Error Inesperado', err.message || 'Ocurrió un error al procesar la donación.');
    } finally {
        guardandoDonacion = false;
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.classList.remove('opacity-70', 'cursor-not-allowed');
            btnGuardar.innerText = textoOriginal;
        }
    }
}

function confirmarEliminarDonacion(id) {
    mostrarNotificacion('peligro', 'Reversar Transacción', '¿Desea eliminar la transacción de la base de datos?', async () => {
        if (eliminandoDonacion) return;
        eliminandoDonacion = true;
        try {
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
        } catch (err) {
            mostrarNotificacion('peligro', 'Error Inesperado', err.message || 'No se pudo eliminar la donación.');
            await cargarDatosSupabase();
        } finally {
            eliminandoDonacion = false;
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

        const idSeguro = escaparHTML(donacionId);
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50/80 even:bg-slate-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-slate-700">${escaparHTML(fechaMostrar)}</td>
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800">${escaparHTML(nombreMostrar)}</div>
            </td>
            <td class="px-6 py-4 font-bold text-emerald-600">${escaparHTML(montoFormateado)} <span class="text-[10px] text-slate-400">${escaparHTML(moneda)}</span></td>
            <td class="px-6 py-4 text-sm text-slate-600">${escaparHTML(medioMostrar)}</td>
            <td class="px-6 py-4"><span class="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">${escaparHTML(destinacionMostrar)}</span></td>
            <td class="px-6 py-4 font-mono text-xs text-slate-500">${escaparHTML(compMostrar)}</td>
            <td class="px-6 py-4 text-right space-x-2">
                <button onclick="imprimirRecibo('${idSeguro}')" class="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg" title="Imprimir Recibo"><i class="fa-solid fa-print"></i></button>
                <button onclick="abrirModalDonacion('${idSeguro}')" class="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg" title="Editar Donación"><i class="fa-solid fa-pen"></i></button>
                <button onclick="confirmarEliminarDonacion('${idSeguro}')" class="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
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
    const donantesAlerta = [];

    globalDonantes.filter(d => d.estado === 'Activo').forEach(donante => {
        const alerta = evaluarAlertaRetencionDonante(donante, globalDonaciones, umbralDias);
        if (alerta) {
            donantesAlerta.push({
                ...donante,
                ultima_donacion: alerta.ultima_donacion,
                dias_ausencia: alerta.dias_ausencia
            });
        }
    });

    if (donantesAlerta.length === 0) return tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-10 text-center text-slate-400 font-medium">No hay donantes en alerta de retención.</td></tr>`;

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
                    <a href="${escaparHTML(linkWa)}" target="_blank" class="inline-block p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg shadow-sm border border-emerald-100 transition-colors" title="WhatsApp"><i class="fa-brands fa-whatsapp text-lg"></i></a>
                ` : ''}
                ${d.correo ? `
                    <a href="${escaparHTML(linkMail)}" target="_blank" class="inline-block p-2 text-blue-500 hover:bg-blue-50 rounded-lg shadow-sm border border-blue-100 transition-colors" title="Email"><i class="fa-solid fa-envelope text-lg"></i></a>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==================== COMUNICACIÓN Y WHATSAPP ====================
function generarEnlaceWhatsApp(telefono, mensaje) {
    if (!telefono) return '#';
    let telStr = String(telefono).replace(/\D/g, '');
    if (!telStr) return '#';
    // Si tiene 10 dígitos (ej. celular Colombia que empieza en 3), añadir indicativo 57
    if (telStr.length === 10 && telStr.startsWith('3')) {
        telStr = '57' + telStr;
    }
    const msg = encodeURIComponent(mensaje);
    return `https://wa.me/${telStr}?text=${msg}`;
}

// ==================== MÓDULO DE CUMPLEAÑOS ====================
function calcularDiasProximoCumple(fechaNacStr) {
    if (!fechaNacStr) return -1;
    const parts = fechaNacStr.split('-');
    if (parts.length < 3) return -1;
    const mes = parseInt(parts[1], 10) - 1;
    const dia = parseInt(parts[2], 10);

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let fechaCumple = new Date(hoy.getFullYear(), mes, dia);
    fechaCumple.setHours(0, 0, 0, 0);

    if (fechaCumple < hoy) {
        fechaCumple = new Date(hoy.getFullYear() + 1, mes, dia);
        fechaCumple.setHours(0, 0, 0, 0);
    }

    const diffMs = fechaCumple.getTime() - hoy.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function calcularEdadProxima(fechaNacStr) {
    if (!fechaNacStr) return null;
    const parts = fechaNacStr.split('-');
    if (parts.length < 3) return null;
    const anioNac = parseInt(parts[0], 10);
    const mesNac = parseInt(parts[1], 10) - 1;
    const diaNac = parseInt(parts[2], 10);

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let proxAnio = hoy.getFullYear();
    const fechaCumpleEsteAnio = new Date(proxAnio, mesNac, diaNac);
    if (fechaCumpleEsteAnio < hoy) {
        proxAnio++;
    }
    return proxAnio - anioNac;
}

function formatearFechaCumple(fechaNacStr) {
    if (!fechaNacStr) return '-';
    const parts = fechaNacStr.split('-');
    if (parts.length < 3) return fechaNacStr;
    const mesIndex = parseInt(parts[1], 10) - 1;
    const dia = parseInt(parts[2], 10);
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${dia} de ${meses[mesIndex] || parts[1]}`;
}

function renderizarModuloCumpleanos() {
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

    globalDonantes.forEach(donante => {
        if (!donante.fecha_nac) return;
        cumpleTotal++;

        const parts = donante.fecha_nac.split('-');
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
                    <a href="${escaparHTML(linkWhatsApp)}" target="_blank" class="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm transition-all" title="Felicitar por WhatsApp">
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
                    <a href="${escaparHTML(linkEmail)}" target="_blank" class="inline-flex items-center p-2 text-blue-600 hover:bg-blue-50 rounded-xl border border-blue-200 transition-colors" title="Enviar correo">
                        <i class="fa-solid fa-envelope text-xs"></i>
                    </a>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==================== MÓDULO DE SEGUIMIENTO TRIMESTRAL ====================
let estadoVistaSeguimiento = 'donaron';
let subTabSeguimientoActiva = 'periodicos';

function obtenerSemanasDelMes(anio, mes) {
    const y = parseInt(anio, 10);
    const m = parseInt(mes, 10);
    const diasEnMes = new Date(y, m, 0).getDate();
    const nombresMeses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const nombreMes = nombresMeses[m - 1] || 'mes';
    const pad = n => String(n).padStart(2, '0');

    const semanas = [
        {
            numero: 1,
            inicioStr: `${y}-${pad(m)}-01`,
            finStr: `${y}-${pad(m)}-07`,
            textoSelect: 'Semana 1',
            rangoTexto: `1 al 7 de ${nombreMes}`,
            textoCompleto: `Semana 1 (1 al 7 de ${nombreMes})`
        },
        {
            numero: 2,
            inicioStr: `${y}-${pad(m)}-08`,
            finStr: `${y}-${pad(m)}-14`,
            textoSelect: 'Semana 2',
            rangoTexto: `8 al 14 de ${nombreMes}`,
            textoCompleto: `Semana 2 (8 al 14 de ${nombreMes})`
        },
        {
            numero: 3,
            inicioStr: `${y}-${pad(m)}-15`,
            finStr: `${y}-${pad(m)}-21`,
            textoSelect: 'Semana 3',
            rangoTexto: `15 al 21 de ${nombreMes}`,
            textoCompleto: `Semana 3 (15 al 21 de ${nombreMes})`
        },
        {
            numero: 4,
            inicioStr: `${y}-${pad(m)}-22`,
            finStr: `${y}-${pad(m)}-28`,
            textoSelect: 'Semana 4',
            rangoTexto: `22 al 28 de ${nombreMes}`,
            textoCompleto: `Semana 4 (22 al 28 de ${nombreMes})`
        }
    ];

    if (diasEnMes > 28) {
        semanas.push({
            numero: 5,
            inicioStr: `${y}-${pad(m)}-29`,
            finStr: `${y}-${pad(m)}-${pad(diasEnMes)}`,
            textoSelect: 'Semana 5',
            rangoTexto: diasEnMes === 29 ? `29 de ${nombreMes}` : `29 al ${diasEnMes} de ${nombreMes}`,
            textoCompleto: diasEnMes === 29 ? `Semana 5 (29 de ${nombreMes})` : `Semana 5 (29 al ${diasEnMes} de ${nombreMes})`
        });
    }

    return semanas;
}

function poblarSemanasSeguimiento(anio, mes) {
    const select = document.getElementById('seguimiento-semana');
    if (!select) return;

    const selectAnio = document.getElementById('seguimiento-anio');
    const selectMes = document.getElementById('seguimiento-mes');
    const y = anio || (selectAnio ? parseInt(selectAnio.value, 10) : new Date().getFullYear());
    const m = mes || (selectMes ? parseInt(selectMes.value, 10) : (new Date().getMonth() + 1));

    const valorPrevio = parseInt(select.value, 10);
    const semanas = obtenerSemanasDelMes(y, m);
    select.innerHTML = '';

    semanas.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.numero;
        opt.textContent = s.textoSelect;
        select.appendChild(opt);
    });

    if (valorPrevio && valorPrevio <= semanas.length) {
        select.value = valorPrevio;
    } else {
        const hoy = new Date();
        if (hoy.getFullYear() === parseInt(y, 10) && (hoy.getMonth() + 1) === parseInt(m, 10)) {
            const semHoy = Math.min(Math.ceil(hoy.getDate() / 7), semanas.length);
            select.value = semHoy;
        } else {
            select.value = 1;
        }
    }
}

function alCambiarTipoPeriodoSeguimiento() {
    const tipo = (document.getElementById('seguimiento-tipo-periodo')?.value || 'mensual').toLowerCase();
    const contTrimestre = document.getElementById('contenedor-filtro-trimestre');
    const contMes = document.getElementById('contenedor-filtro-mes');
    const contSemana = document.getElementById('contenedor-filtro-semana');

    const selectAnio = document.getElementById('seguimiento-anio');
    const anio = selectAnio ? parseInt(selectAnio.value, 10) || new Date().getFullYear() : new Date().getFullYear();
    const selectMes = document.getElementById('seguimiento-mes');
    const mes = selectMes ? parseInt(selectMes.value, 10) || (new Date().getMonth() + 1) : (new Date().getMonth() + 1);

    if (tipo === 'mensual' || tipo === 'mes') {
        if (contMes) contMes.classList.remove('hidden');
        if (contSemana) contSemana.classList.add('hidden');
        if (contTrimestre) contTrimestre.classList.add('hidden');
    } else if (tipo === 'semanal' || tipo === 'semana') {
        if (contMes) contMes.classList.remove('hidden');
        if (contSemana) contSemana.classList.remove('hidden');
        if (contTrimestre) contTrimestre.classList.add('hidden');
        poblarSemanasSeguimiento(anio, mes);
    } else {
        // Trimestral
        if (contMes) contMes.classList.add('hidden');
        if (contSemana) contSemana.classList.add('hidden');
        if (contTrimestre) contTrimestre.classList.remove('hidden');
    }

    renderizarModuloSeguimiento();
}

function alCambiarMesSeguimiento() {
    const tipo = (document.getElementById('seguimiento-tipo-periodo')?.value || 'mensual').toLowerCase();
    const selectAnio = document.getElementById('seguimiento-anio');
    const anio = selectAnio ? parseInt(selectAnio.value, 10) || new Date().getFullYear() : new Date().getFullYear();
    const selectMes = document.getElementById('seguimiento-mes');
    const mes = selectMes ? parseInt(selectMes.value, 10) || (new Date().getMonth() + 1) : (new Date().getMonth() + 1);

    if (tipo === 'semanal' || tipo === 'semana') {
        poblarSemanasSeguimiento(anio, mes);
    }

    renderizarModuloSeguimiento();
}

function alCambiarAnioSeguimiento() {
    const selectAnio = document.getElementById('seguimiento-anio');
    const anio = selectAnio ? parseInt(selectAnio.value, 10) || new Date().getFullYear() : new Date().getFullYear();
    const selectMes = document.getElementById('seguimiento-mes');
    const mes = selectMes ? parseInt(selectMes.value, 10) || (new Date().getMonth() + 1) : (new Date().getMonth() + 1);
    const tipo = (document.getElementById('seguimiento-tipo-periodo')?.value || 'mensual').toLowerCase();

    if (tipo === 'semanal' || tipo === 'semana') {
        poblarSemanasSeguimiento(anio, mes);
    }

    renderizarModuloSeguimiento();
}

function poblarSelectAnioSeguimiento() {
    const select = document.getElementById('seguimiento-anio');
    if (!select) return;
    if (select.children.length > 0) return;

    const aniosSet = new Set();
    const currentYear = new Date().getFullYear();
    aniosSet.add(currentYear);
    aniosSet.add(currentYear - 1);
    aniosSet.add(currentYear + 1);

    globalDonaciones.forEach(d => {
        if (d.fecha) {
            const y = parseInt(d.fecha.split('-')[0], 10);
            if (!isNaN(y)) aniosSet.add(y);
        }
    });

    globalDonantes.forEach(d => {
        if (d.fecha_registro) {
            const y = parseInt(d.fecha_registro.split('-')[0], 10);
            if (!isNaN(y)) aniosSet.add(y);
        }
    });

    const sortedAnios = Array.from(aniosSet).sort((a, b) => b - a);
    select.innerHTML = '';
    sortedAnios.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === currentYear) opt.selected = true;
        select.appendChild(opt);
    });

    const selectTrimestre = document.getElementById('seguimiento-trimestre');
    if (selectTrimestre && !selectTrimestre.value) {
        const currentQ = Math.ceil((new Date().getMonth() + 1) / 3);
        selectTrimestre.value = currentQ;
    }

    const selectMes = document.getElementById('seguimiento-mes');
    const currentMonth = new Date().getMonth() + 1;
    if (selectMes && !selectMes.value) {
        selectMes.value = currentMonth;
    }

    const mActual = selectMes ? parseInt(selectMes.value, 10) || currentMonth : currentMonth;
    poblarSemanasSeguimiento(currentYear, mActual);
}

function obtenerInfoPeriodoSeguimiento() {
    const selectAnio = document.getElementById('seguimiento-anio');
    const anio = selectAnio ? parseInt(selectAnio.value, 10) || new Date().getFullYear() : new Date().getFullYear();
    const tipoPeriodoRaw = document.getElementById('seguimiento-tipo-periodo')?.value || 'mensual';
    const tipoPeriodo = tipoPeriodoRaw.toLowerCase();
    const pad = n => String(n).padStart(2, '0');
    const nombresMesesMayus = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const nombresMesesMinus = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    if (tipoPeriodo === 'mensual' || tipoPeriodo === 'mes') {
        const selectMes = document.getElementById('seguimiento-mes');
        const mes = selectMes ? parseInt(selectMes.value, 10) || (new Date().getMonth() + 1) : (new Date().getMonth() + 1);
        const ultimoDia = new Date(anio, mes, 0).getDate();
        const nombreMes = nombresMesesMayus[mes - 1] || 'Mes';
        const nombreMesMin = nombresMesesMinus[mes - 1] || 'mes';

        return {
            tipo: 'mensual',
            anio,
            mes,
            valor: mes,
            inicioStr: `${anio}-${pad(mes)}-01`,
            finStr: `${anio}-${pad(mes)}-${pad(ultimoDia)}`,
            nombre: `${nombreMes} ${anio}`,
            descripcion: `Período mensual de ${nombreMes} de ${anio}`,
            etiquetaCorta: `${nombreMes} ${anio}`,
            tipoTexto: 'Mensual',
            enPeriodoTexto: `el período mensual de ${nombreMesMin}`,
            agradecimientoTexto: `el mes de ${nombreMesMin}`
        };
    }

    if (tipoPeriodo === 'semanal' || tipoPeriodo === 'semana') {
        const selectMes = document.getElementById('seguimiento-mes');
        const mes = selectMes ? parseInt(selectMes.value, 10) || (new Date().getMonth() + 1) : (new Date().getMonth() + 1);
        const semanas = obtenerSemanasDelMes(anio, mes);
        const selectSemana = document.getElementById('seguimiento-semana');
        let numSemana = selectSemana ? parseInt(selectSemana.value, 10) || 1 : 1;
        let infoSem = semanas.find(s => s.numero === numSemana);
        if (!infoSem && semanas.length > 0) {
            infoSem = semanas[semanas.length - 1];
            numSemana = infoSem.numero;
        }

        const nombreMes = nombresMesesMayus[mes - 1] || 'Mes';
        const rangoFechas = infoSem ? infoSem.rangoTexto : '';

        return {
            tipo: 'semanal',
            anio,
            mes,
            valor: numSemana,
            inicioStr: infoSem ? infoSem.inicioStr : `${anio}-${pad(mes)}-01`,
            finStr: infoSem ? infoSem.finStr : `${anio}-${pad(mes)}-07`,
            nombre: `Semana ${numSemana} (${rangoFechas})`,
            descripcion: `Semana ${numSemana} (${rangoFechas}) de ${anio}`,
            etiquetaCorta: `Semana ${numSemana} (${nombreMes} ${anio})`,
            tipoTexto: 'Semanal',
            enPeriodoTexto: `esta semana (Semana ${numSemana}, ${rangoFechas})`,
            agradecimientoTexto: `esta semana (Semana ${numSemana}, ${rangoFechas})`
        };
    }

    // Default: Trimestral
    const selectTrimestre = document.getElementById('seguimiento-trimestre');
    const q = selectTrimestre ? parseInt(selectTrimestre.value, 10) || 1 : 1;
    const trimestresInfo = {
        1: { inicio: `${anio}-01-01`, fin: `${anio}-03-31`, texto: 'Trimestre 1 (Ene - Mar)', meses: 'Enero a Marzo' },
        2: { inicio: `${anio}-04-01`, fin: `${anio}-06-30`, texto: 'Trimestre 2 (Abr - Jun)', meses: 'Abril a Junio' },
        3: { inicio: `${anio}-07-01`, fin: `${anio}-09-30`, texto: 'Trimestre 3 (Jul - Sep)', meses: 'Julio a Septiembre' },
        4: { inicio: `${anio}-10-01`, fin: `${anio}-12-31`, texto: 'Trimestre 4 (Oct - Dic)', meses: 'Octubre a Diciembre' }
    };
    const tInfo = trimestresInfo[q] || trimestresInfo[1];

    return {
        tipo: 'trimestral',
        anio,
        valor: q,
        inicioStr: tInfo.inicio,
        finStr: tInfo.fin,
        nombre: tInfo.texto,
        descripcion: `Trimestre ${q} (${tInfo.meses}) de ${anio}`,
        etiquetaCorta: `Trimestre ${q} (${anio})`,
        tipoTexto: 'Trimestral',
        enPeriodoTexto: `este trimestre (${tInfo.texto})`,
        agradecimientoTexto: `este trimestre`
    };
}

function esDonacionEnTrimestre(fechaStr, anio, trimestre) {
    if (!fechaStr) return false;
    const parts = fechaStr.split('-');
    if (parts.length < 2) return false;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (y !== parseInt(anio, 10)) return false;
    const q = Math.ceil(m / 3);
    return q === parseInt(trimestre, 10);
}

function calcularMetricasSeguimiento(tipoPeriodo, anio, valorPeriodo) {
    let infoPeriodo;
    if (!tipoPeriodo) {
        infoPeriodo = obtenerInfoPeriodoSeguimiento();
    } else {
        const t = tipoPeriodo.toLowerCase();
        const pad = n => String(n).padStart(2, '0');
        const y = parseInt(anio, 10);
        const nombresMesesMayus = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const nombresMesesMinus = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

        if (t === 'mensual' || t === 'mes') {
            const m = parseInt(valorPeriodo, 10) || 1;
            const ultimoDia = new Date(y, m, 0).getDate();
            const nombreMes = nombresMesesMayus[m - 1] || 'Mes';
            const nombreMesMin = nombresMesesMinus[m - 1] || 'mes';
            infoPeriodo = {
                tipo: 'mensual',
                anio: y,
                mes: m,
                valor: m,
                inicioStr: `${y}-${pad(m)}-01`,
                finStr: `${y}-${pad(m)}-${pad(ultimoDia)}`,
                nombre: `${nombreMes} ${y}`,
                descripcion: `Período mensual de ${nombreMes} de ${y}`,
                etiquetaCorta: `${nombreMes} ${y}`,
                tipoTexto: 'Mensual',
                enPeriodoTexto: `el período mensual de ${nombreMesMin}`,
                agradecimientoTexto: `el mes de ${nombreMesMin}`
            };
        } else if (t === 'semanal' || t === 'semana') {
            const selectMes = document.getElementById('seguimiento-mes');
            const m = selectMes ? parseInt(selectMes.value, 10) || 1 : 1;
            const numSem = parseInt(valorPeriodo, 10) || 1;
            const semanas = obtenerSemanasDelMes(y, m);
            const infoSem = semanas.find(s => s.numero === numSem) || semanas[0];
            const nombreMes = nombresMesesMayus[m - 1] || 'Mes';
            const rangoFechas = infoSem ? infoSem.rangoTexto : '';
            infoPeriodo = {
                tipo: 'semanal',
                anio: y,
                mes: m,
                valor: numSem,
                inicioStr: infoSem ? infoSem.inicioStr : `${y}-${pad(m)}-01`,
                finStr: infoSem ? infoSem.finStr : `${y}-${pad(m)}-07`,
                nombre: `Semana ${numSem} (${rangoFechas})`,
                descripcion: `Semana ${numSem} (${rangoFechas}) de ${y}`,
                etiquetaCorta: `Semana ${numSem} (${nombreMes} ${y})`,
                tipoTexto: 'Semanal',
                enPeriodoTexto: `esta semana (Semana ${numSem}, ${rangoFechas})`,
                agradecimientoTexto: `esta semana (Semana ${numSem}, ${rangoFechas})`
            };
        } else {
            const q = parseInt(valorPeriodo, 10) || 1;
            const tInfo = {
                1: { inicio: `${y}-01-01`, fin: `${y}-03-31`, texto: 'Trimestre 1 (Ene - Mar)', meses: 'Enero a Marzo' },
                2: { inicio: `${y}-04-01`, fin: `${y}-06-30`, texto: 'Trimestre 2 (Abr - Jun)', meses: 'Abril a Junio' },
                3: { inicio: `${y}-07-01`, fin: `${y}-09-30`, texto: 'Trimestre 3 (Jul - Sep)', meses: 'Julio a Septiembre' },
                4: { inicio: `${y}-10-01`, fin: `${y}-12-31`, texto: 'Trimestre 4 (Oct - Dic)', meses: 'Octubre a Diciembre' }
            }[q] || { inicio: `${y}-01-01`, fin: `${y}-03-31`, texto: 'Trimestre 1 (Ene - Mar)', meses: 'Enero a Marzo' };
            infoPeriodo = {
                tipo: 'trimestral',
                anio: y,
                valor: q,
                inicioStr: tInfo.inicio,
                finStr: tInfo.fin,
                nombre: tInfo.texto,
                descripcion: `Trimestre ${q} (${tInfo.meses}) de ${y}`,
                etiquetaCorta: `Trimestre ${q} (${y})`,
                tipoTexto: 'Trimestral',
                enPeriodoTexto: `este trimestre (${tInfo.texto})`,
                agradecimientoTexto: `este trimestre`
            };
        }
    }

    // Donantes válidos para el seguimiento:
    // Activos con periodicidad fija (Mensual, Trimestral, Semestral, Anual, etc.)
    // EXCLUYE estrictamente a los Ocasionales.
    const donantesValidos = globalDonantes.filter(d => {
        if (d.estado !== 'Activo') return false;
        const p = (d.periodicidad || '').trim().toLowerCase();
        return p !== 'ocasional' && p !== '' && p !== 'ninguna';
    });

    const listaDonadores = [];
    let totalMontoRecaudadoCOP = 0;

    donantesValidos.forEach(donante => {
        // Donaciones realizadas por el donante dentro del rango de fechas del período
        const donacionesEnPeriodo = globalDonaciones.filter(d => 
            d.donante_id === donante.id && 
            d.fecha && 
            d.fecha >= infoPeriodo.inicioStr && 
            d.fecha <= infoPeriodo.finStr
        );

        const dono = donacionesEnPeriodo.length > 0;
        const montoPeriodoCOP = donacionesEnPeriodo.reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte), 0);
        totalMontoRecaudadoCOP += montoPeriodoCOP;

        listaDonadores.push({
            ...donante,
            dono,
            donacionesPeriodo: donacionesEnPeriodo,
            donacionesTrimestre: donacionesEnPeriodo,
            totalMontoPeriodoCOP: montoPeriodoCOP,
            totalMontoTrimestreCOP: montoPeriodoCOP,
            cantidadDonaciones: donacionesEnPeriodo.length
        });
    });

    const totalEsperados = listaDonadores.length; // Representa el "Total de Donadores"
    const donantesQueDonaron = listaDonadores.filter(d => d.dono);
    const donantesNoDonaron = listaDonadores.filter(d => !d.dono);
    const totalDonaron = donantesQueDonaron.length;
    const totalNoDonaron = donantesNoDonaron.length;

    const pctDonaron = totalEsperados > 0 ? ((totalDonaron / totalEsperados) * 100).toFixed(1) : '0';
    const pctNoDonaron = totalEsperados > 0 ? (100 - parseFloat(pctDonaron)).toFixed(1) : '0';

    return {
        infoPeriodo,
        anio: infoPeriodo.anio,
        periodoTipo: infoPeriodo.tipo,
        periodoValor: infoPeriodo.valor,
        totalEsperados,
        totalDonaron,
        totalNoDonaron,
        pctDonaron,
        pctNoDonaron,
        totalMontoRecaudadoCOP,
        listaEsperados: listaDonadores,
        donantesQueDonaron,
        donantesNoDonaron
    };
}

// Wrapper retrocompatible
function calcularMetricasSeguimientoTrimestral(anio, trimestre) {
    return calcularMetricasSeguimiento('trimestre', anio, trimestre);
}

function renderizarModuloSeguimiento() {
    poblarSelectAnioSeguimiento();

    const infoPeriodo = obtenerInfoPeriodoSeguimiento();
    const metricas = calcularMetricasSeguimiento();

    // 1. KPI: Total de Donadores (sin ocasionales)
    const kpiEspEl = document.getElementById('kpi-seguimiento-esperados');
    if (kpiEspEl) kpiEspEl.innerText = metricas.totalEsperados;

    // 2. KPI: Donaron + Porcentaje
    const kpiDonaronEl = document.getElementById('kpi-seguimiento-donaron');
    if (kpiDonaronEl) kpiDonaronEl.innerText = metricas.totalDonaron;

    const kpiPctDonaronEl = document.getElementById('kpi-seguimiento-pct-donaron');
    if (kpiPctDonaronEl) kpiPctDonaronEl.innerText = `${metricas.pctDonaron}%`;

    // 3. KPI: No Donaron + Porcentaje
    const kpiNoDonaronEl = document.getElementById('kpi-seguimiento-nodonaron');
    if (kpiNoDonaronEl) kpiNoDonaronEl.innerText = metricas.totalNoDonaron;

    const kpiPctNoDonaronEl = document.getElementById('kpi-seguimiento-pct-nodonaron');
    if (kpiPctNoDonaronEl) kpiPctNoDonaronEl.innerText = `${metricas.pctNoDonaron}%`;

    // 4. KPI: Recaudación del Período
    const kpiMontoEl = document.getElementById('kpi-seguimiento-monto');
    if (kpiMontoEl) kpiMontoEl.innerText = formatearMoneda(metricas.totalMontoRecaudadoCOP);

    const labelMonedaEl = document.getElementById('label-seguimiento-moneda');
    if (labelMonedaEl) labelMonedaEl.innerText = `Aportado en ${infoPeriodo.etiquetaCorta} (${monedaActual})`;

    // 5. Círculos Indicadores Visuales Destacados y Centrados
    const circuloDonaron = document.getElementById('circulo-pct-donaron');
    if (circuloDonaron) circuloDonaron.innerText = `${metricas.pctDonaron}%`;

    const circuloNoDonaron = document.getElementById('circulo-pct-nodonaron');
    if (circuloNoDonaron) circuloNoDonaron.innerText = `${metricas.pctNoDonaron}%`;

    const barraVisualDonaron = document.getElementById('barra-visual-donaron');
    if (barraVisualDonaron) barraVisualDonaron.style.width = `${metricas.pctDonaron}%`;

    const barraVisualNoDonaron = document.getElementById('barra-visual-nodonaron');
    if (barraVisualNoDonaron) barraVisualNoDonaron.style.width = `${metricas.pctNoDonaron}%`;

    // 6. Textos de Conteo
    const textoConteoDonaron = document.getElementById('texto-conteo-donaron');
    if (textoConteoDonaron) textoConteoDonaron.innerText = metricas.totalDonaron;

    const textoConteoNoDonaron = document.getElementById('texto-conteo-nodonaron');
    if (textoConteoNoDonaron) textoConteoNoDonaron.innerText = metricas.totalNoDonaron;

    // 7. Barra General Combinada
    const barraDonaron = document.getElementById('barra-progreso-donaron');
    if (barraDonaron) barraDonaron.style.width = `${metricas.pctDonaron}%`;

    const barraNoDonaron = document.getElementById('barra-progreso-nodonaron');
    if (barraNoDonaron) barraNoDonaron.style.width = `${metricas.pctNoDonaron}%`;

    const textoBarraDonaron = document.getElementById('texto-barra-pct-donaron');
    if (textoBarraDonaron) textoBarraDonaron.innerText = `${metricas.pctDonaron}%`;

    const textoBarraNoDonaron = document.getElementById('texto-barra-pct-nodonaron');
    if (textoBarraNoDonaron) textoBarraNoDonaron.innerText = `${metricas.pctNoDonaron}%`;

    // 8. Descripciones y Encabezados
    const labelCumplimientoTexto = document.getElementById('label-seguimiento-cumplimiento-texto');
    if (labelCumplimientoTexto) {
        labelCumplimientoTexto.innerText = `${metricas.totalDonaron} de ${metricas.totalEsperados} donadores (${metricas.pctDonaron}%)`;
    }

    const labelPeriodoDesc = document.getElementById('label-seguimiento-periodo-desc');
    if (labelPeriodoDesc) {
        labelPeriodoDesc.innerText = `Seguimiento de donaciones: ${infoPeriodo.descripcion}`;
    }

    const thAporte = document.getElementById('th-aporte-periodo');
    if (thAporte) {
        thAporte.innerText = `Aporte ${infoPeriodo.tipoTexto}`;
    }

    const tituloSubtabPeriodicos = document.getElementById('titulo-subtab-periodicos');
    if (tituloSubtabPeriodicos) {
        tituloSubtabPeriodicos.innerText = `Cumplimiento ${infoPeriodo.tipoTexto} (Periodicidad Fija)`;
    }

    // 9. Conteo en Filtros de Tabla
    const countFiltroDonaron = document.getElementById('count-filtro-donaron');
    if (countFiltroDonaron) countFiltroDonaron.innerText = metricas.totalDonaron;

    const countFiltroNoDonaron = document.getElementById('count-filtro-nodonaron');
    if (countFiltroNoDonaron) countFiltroNoDonaron.innerText = metricas.totalNoDonaron;

    // 10. Actualizar Título de la Tabla
    const tituloTabla = document.getElementById('titulo-tabla-seguimiento');
    if (tituloTabla) {
        if (estadoVistaSeguimiento === 'donaron') {
            tituloTabla.innerText = `Donantes que Donaron en ${infoPeriodo.enPeriodoTexto}`;
        } else {
            tituloTabla.innerText = `Donantes con Donación Pendiente en ${infoPeriodo.enPeriodoTexto}`;
        }
    }

    // 11. Renderizar Listados
    renderizarTablaSeguimientoDonaron();

    const totalOcasionales = globalDonantes.filter(d => (d.periodicidad || '').trim().toLowerCase() === 'ocasional').length;
    const badgeOcasionales = document.getElementById('badge-count-ocasionales');
    if (badgeOcasionales) badgeOcasionales.innerText = totalOcasionales;

    renderizarTablaOcasionales();
}

function cambiarFiltroVistaSeguimiento(filtro) {
    estadoVistaSeguimiento = filtro;
    const btnDonaron = document.getElementById('btn-vista-donaron');
    const btnNoDonaron = document.getElementById('btn-vista-nodonaron');
    const tituloTabla = document.getElementById('titulo-tabla-seguimiento');
    const infoPeriodo = obtenerInfoPeriodoSeguimiento();

    if (filtro === 'donaron') {
        if (btnDonaron) {
            btnDonaron.className = 'px-3 py-1.5 rounded-lg bg-white text-emerald-700 shadow-sm transition-all';
        }
        if (btnNoDonaron) {
            btnNoDonaron.className = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-800 transition-all';
        }
        if (tituloTabla) tituloTabla.innerText = `Donantes que Donaron en ${infoPeriodo.enPeriodoTexto}`;
    } else {
        if (btnDonaron) {
            btnDonaron.className = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-800 transition-all';
        }
        if (btnNoDonaron) {
            btnNoDonaron.className = 'px-3 py-1.5 rounded-lg bg-white text-rose-700 shadow-sm transition-all';
        }
        if (tituloTabla) tituloTabla.innerText = `Donantes con Donación Pendiente en ${infoPeriodo.enPeriodoTexto}`;
    }

    renderizarTablaSeguimientoDonaron();
}

function renderizarTablaSeguimientoDonaron() {
    const tbody = document.getElementById('tbody-seguimiento-donantes');
    if (!tbody) return;

    const infoPeriodo = obtenerInfoPeriodoSeguimiento();
    const metricas = calcularMetricasSeguimiento();
    const lista = estadoVistaSeguimiento === 'donaron' ? metricas.donantesQueDonaron : metricas.donantesNoDonaron;

    const termino = (document.getElementById('buscar-donante-seguimiento')?.value || '').toLowerCase().trim();
    let filtrados = lista;
    if (termino) {
        filtrados = lista.filter(d => 
            (d.nombre || '').toLowerCase().includes(termino) ||
            (d.documento || '').toLowerCase().includes(termino)
        );
    }

    tbody.innerHTML = '';
    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-slate-400 font-medium">No se encontraron donantes en esta categoría para ${escaparHTML(infoPeriodo.enPeriodoTexto)}.</td></tr>`;
        return;
    }

    filtrados.forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50 transition-colors';

        const badgePer = `<span class="bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-md text-xs font-semibold">${escaparHTML(d.periodicidad)}</span>`;

        let aporteInfo = '';
        let fechasInfo = '';

        if (d.dono) {
            aporteInfo = `
                <div class="font-extrabold text-emerald-600 text-sm">${formatearMoneda(d.totalMontoPeriodoCOP)}</div>
                <div class="text-[11px] text-slate-400 font-medium">${escaparHTML(d.cantidadDonaciones)} aporte${d.cantidadDonaciones > 1 ? 's' : ''}</div>
            `;
            const fechas = d.donacionesPeriodo.map(x => escaparHTML(x.fecha)).join(', ');
            fechasInfo = `
                <span class="text-xs font-medium text-slate-700">${fechas}</span>
            `;
        } else {
            aporteInfo = `<span class="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200/60 px-2.5 py-1 rounded-md">Sin aporte</span>`;
            fechasInfo = `<span class="text-xs text-slate-400 italic font-medium">Pendiente</span>`;
        }

        let msgWa = '';
        const textoAporteMsg = infoPeriodo.agradecimientoTexto || infoPeriodo.enPeriodoTexto;
        if (d.dono) {
            msgWa = `¡Hola ${d.nombre}! Queremos agradecerte de corazón por tu valiosa donación realizada en ${textoAporteMsg} a la Fundación. ¡Tu apoyo constante transforma vidas!`;
        } else {
            msgWa = `¡Hola ${d.nombre}! Te saludamos cordialmente de la Fundación. Nos comunicamos para agradecerte por tu compromiso y consultarte si requieres apoyo con la información para tu aporte de ${textoAporteMsg}. ¡Muchas gracias!`;
        }

        const linkWhatsApp = generarEnlaceWhatsApp(d.telefono, msgWa);
        const idSeguro = escaparHTML(d.id);

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800 text-sm">${escaparHTML(d.nombre)}</div>
                <div class="text-xs text-slate-400 font-medium">${d.tipo === 'Juridica' ? 'Persona Jurídica' : 'Persona Natural'}</div>
            </td>
            <td class="px-6 py-4 font-mono text-xs text-slate-600 font-medium">${escaparHTML(d.documento || '-')}</td>
            <td class="px-6 py-4">${badgePer}</td>
            <td class="px-6 py-4">${aporteInfo}</td>
            <td class="px-6 py-4">${fechasInfo}</td>
            <td class="px-6 py-4 text-right space-x-2">
                ${linkWhatsApp !== '#' ? `
                    <a href="${escaparHTML(linkWhatsApp)}" target="_blank" class="inline-flex items-center space-x-1 p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 shadow-sm transition-colors text-xs font-bold" title="${d.dono ? 'Agradecer por WhatsApp' : 'Contactar por WhatsApp'}">
                        <i class="fa-brands fa-whatsapp text-base"></i>
                    </a>
                ` : ''}
                <button type="button" onclick="verDetalleDonante('${idSeguro}')" class="inline-flex items-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 shadow-sm transition-colors text-xs font-bold" title="Ver ficha del donante">
                    <i class="fa-solid fa-eye text-xs"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function cambiarSubTabSeguimiento(subtab) {
    subTabSeguimientoActiva = subtab;
    const btnPer = document.getElementById('btn-subtab-periodicos');
    const btnOca = document.getElementById('btn-subtab-ocasionales');
    const secPer = document.getElementById('subseccion-periodicos');
    const secOca = document.getElementById('subseccion-ocasionales');

    if (subtab === 'periodicos') {
        if (btnPer) btnPer.className = 'px-5 py-3 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition-colors flex items-center space-x-2';
        if (btnOca) btnOca.className = 'px-5 py-3 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors flex items-center space-x-2';
        if (secPer) secPer.classList.remove('hidden');
        if (secOca) secOca.classList.add('hidden');
    } else {
        if (btnPer) btnPer.className = 'px-5 py-3 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors flex items-center space-x-2';
        if (btnOca) btnOca.className = 'px-5 py-3 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition-colors flex items-center space-x-2';
        if (secPer) secPer.classList.add('hidden');
        if (secOca) secOca.classList.remove('hidden');
        renderizarTablaOcasionales();
    }
}

function renderizarTablaOcasionales() {
    const tbody = document.getElementById('tbody-donantes-ocasionales');
    if (!tbody) return;

    const infoPeriodo = obtenerInfoPeriodoSeguimiento();
    const filtroPeriodoEl = document.getElementById('filtro-periodo-ocasionales');
    const filtroPeriodo = filtroPeriodoEl ? filtroPeriodoEl.value : 'periodo';
    const buscarTermino = (document.getElementById('buscar-donante-ocasional')?.value || '').toLowerCase().trim();

    const donantesOcasionales = globalDonantes.filter(d => (d.periodicidad || '').trim().toLowerCase() === 'ocasional');

    let totalRecaudadoOcasionalesCOP = 0;
    let conAportePeriodo = 0;

    const labelPeriodo = document.getElementById('label-ocasionales-periodo');
    if (labelPeriodo) {
        if (filtroPeriodo === 'periodo') labelPeriodo.innerText = `En ${infoPeriodo.descripcion}`;
        else if (filtroPeriodo === 'trimestre') labelPeriodo.innerText = `En Trimestre activo de ${infoPeriodo.anio}`;
        else if (filtroPeriodo === 'anio') labelPeriodo.innerText = `En el año ${infoPeriodo.anio}`;
        else labelPeriodo.innerText = 'Histórico total acumulado';
    }

    const listaOcasionales = [];

    donantesOcasionales.forEach(donante => {
        const todasDonaciones = globalDonaciones.filter(d => d.donante_id === donante.id);
        todasDonaciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        let donacionesPeriodo = todasDonaciones;
        if (filtroPeriodo === 'periodo') {
            donacionesPeriodo = todasDonaciones.filter(d => d.fecha && d.fecha >= infoPeriodo.inicioStr && d.fecha <= infoPeriodo.finStr);
        } else if (filtroPeriodo === 'trimestre') {
            const currentQ = Math.ceil((new Date().getMonth() + 1) / 3);
            donacionesPeriodo = todasDonaciones.filter(d => esDonacionEnTrimestre(d.fecha, infoPeriodo.anio, currentQ));
        } else if (filtroPeriodo === 'anio') {
            donacionesPeriodo = todasDonaciones.filter(d => {
                if (!d.fecha) return false;
                return parseInt(d.fecha.split('-')[0], 10) === infoPeriodo.anio;
            });
        }

        const montoPeriodoCOP = donacionesPeriodo.reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte), 0);
        totalRecaudadoOcasionalesCOP += montoPeriodoCOP;

        if (donacionesPeriodo.length > 0) conAportePeriodo++;

        listaOcasionales.push({
            ...donante,
            donacionesPeriodo,
            montoPeriodoCOP,
            totalAportesPeriodo: donacionesPeriodo.length,
            ultimaDonacion: todasDonaciones.length > 0 ? todasDonaciones[0].fecha : 'Ninguna'
        });
    });

    const kpiTotalOca = document.getElementById('kpi-ocasionales-total');
    if (kpiTotalOca) kpiTotalOca.innerText = donantesOcasionales.length;

    const kpiActivosOca = document.getElementById('kpi-ocasionales-activos');
    if (kpiActivosOca) kpiActivosOca.innerText = conAportePeriodo;

    const kpiMontoOca = document.getElementById('kpi-ocasionales-monto');
    if (kpiMontoOca) kpiMontoOca.innerText = formatearMoneda(totalRecaudadoOcasionalesCOP);

    let filtrados = listaOcasionales;
    if (buscarTermino) {
        filtrados = listaOcasionales.filter(d => 
            (d.nombre || '').toLowerCase().includes(buscarTermino) ||
            (d.documento || '').toLowerCase().includes(buscarTermino)
        );
    }

    filtrados.sort((a, b) => b.montoPeriodoCOP - a.montoPeriodoCOP);

    tbody.innerHTML = '';
    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-slate-400 font-medium">No hay donantes ocasionales registrados o coincidentes con la búsqueda.</td></tr>`;
        return;
    }

    filtrados.forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50 transition-colors';

        const msgWa = `¡Hola ${d.nombre}! Te saludamos cordialmente de la Fundación. Queremos agradecerte por haber formado parte de nuestros benefactores y compartirte el impacto positivo de nuestras actividades.`;
        const linkWhatsApp = generarEnlaceWhatsApp(d.telefono, msgWa);
        const idSeguro = escaparHTML(d.id);

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800 text-sm">${escaparHTML(d.nombre)}</div>
                <div class="text-xs text-slate-400 font-medium">${d.tipo === 'Juridica' ? 'Empresa' : 'Persona Natural'}</div>
            </td>
            <td class="px-6 py-4 font-mono text-xs text-slate-600 font-medium">${escaparHTML(d.documento || '-')}</td>
            <td class="px-6 py-4 text-xs text-slate-600">
                <div>${d.telefono ? escaparHTML(d.telefono) : '<span class="text-slate-400 italic">Sin tel</span>'}</div>
                <div class="text-slate-400 truncate max-w-[150px] font-medium">${escaparHTML(d.correo || '')}</div>
            </td>
            <td class="px-6 py-4">
                <span class="font-bold ${d.totalAportesPeriodo > 0 ? 'text-blue-600' : 'text-slate-400'}">${escaparHTML(d.totalAportesPeriodo)} aporte${d.totalAportesPeriodo !== 1 ? 's' : ''}</span>
            </td>
            <td class="px-6 py-4 font-bold text-slate-700">${formatearMoneda(d.montoPeriodoCOP)}</td>
            <td class="px-6 py-4 text-xs font-medium text-slate-600">${escaparHTML(d.ultimaDonacion)}</td>
            <td class="px-6 py-4 text-right space-x-2">
                ${linkWhatsApp !== '#' ? `
                    <a href="${escaparHTML(linkWhatsApp)}" target="_blank" class="inline-block p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-colors shadow-sm" title="Contactar por WhatsApp">
                        <i class="fa-brands fa-whatsapp text-sm"></i>
                    </a>
                ` : ''}
                <button type="button" onclick="verDetalleDonante('${idSeguro}')" class="inline-block p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors shadow-sm" title="Ver ficha">
                    <i class="fa-solid fa-eye text-xs"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function exportarInformeSeguimiento() {
    const infoPeriodo = obtenerInfoPeriodoSeguimiento();
    const metricas = calcularMetricasSeguimiento();

    const hojaResumenData = [
        { Concepto: 'Año Consultado', Valor: infoPeriodo.anio },
        { Concepto: 'Tipo de Período', Valor: infoPeriodo.tipoTexto },
        { Concepto: 'Período Consultado', Valor: infoPeriodo.nombre },
        { Concepto: 'Rango de Fechas', Valor: `${infoPeriodo.inicioStr} al ${infoPeriodo.finStr}` },
        { Concepto: 'Total de Donadores (sin ocasionales)', Valor: metricas.totalEsperados },
        { Concepto: 'Donantes que Donaron', Valor: metricas.totalDonaron },
        { Concepto: 'Porcentaje Cumplimiento (%)', Valor: `${metricas.pctDonaron}%` },
        { Concepto: 'Donantes que No Donaron', Valor: metricas.totalNoDonaron },
        { Concepto: 'Porcentaje Incumplimiento (%)', Valor: `${metricas.pctNoDonaron}%` },
        { Concepto: `Total Recaudado (${monedaActual})`, Valor: formatearMoneda(metricas.totalMontoRecaudadoCOP) }
    ];

    const hojaDonaronData = metricas.donantesQueDonaron.map(d => ({
        Nombre: d.nombre,
        Documento: d.documento || '',
        Tipo: d.tipo,
        Periodicidad: d.periodicidad,
        Telefono: d.telefono || '',
        Correo: d.correo || '',
        Cantidad_Aportes: d.cantidadDonaciones,
        Fechas_Donacion: d.donacionesPeriodo.map(x => x.fecha).join('; '),
        Total_Aportado_COP: d.totalMontoPeriodoCOP
    }));

    const hojaNoDonaronData = metricas.donantesNoDonaron.map(d => ({
        Nombre: d.nombre,
        Documento: d.documento || '',
        Tipo: d.tipo,
        Periodicidad: d.periodicidad,
        Telefono: d.telefono || '',
        Correo: d.correo || '',
        Fecha_Registro: d.fecha_registro || ''
    }));

    const ocasionales = globalDonantes
        .filter(d => (d.periodicidad || '').trim().toLowerCase() === 'ocasional')
        .map(d => {
            const donacionesEnRango = globalDonaciones.filter(x => 
                x.donante_id === d.id && 
                x.fecha && 
                x.fecha >= infoPeriodo.inicioStr && 
                x.fecha <= infoPeriodo.finStr
            );
            const montoCOP = donacionesEnRango.reduce((sum, x) => sum + normalizarACOP(x.monto, x.moneda_aporte), 0);
            return {
                Nombre: d.nombre,
                Documento: d.documento || '',
                Telefono: d.telefono || '',
                Correo: d.correo || '',
                Aportes_En_Periodo: donacionesEnRango.length,
                Monto_Periodo_COP: montoCOP
            };
        });

    const libro = XLSX.utils.book_new();

    const hoja1 = XLSX.utils.json_to_sheet(hojaResumenData.map(sanitizarFilaExcel));
    hoja1['!cols'] = [{ wch: 38 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(libro, hoja1, 'Resumen');

    const hoja2 = XLSX.utils.json_to_sheet((hojaDonaronData.length > 0 ? hojaDonaronData : [{ Mensaje: 'Sin donantes que donaron' }]).map(sanitizarFilaExcel));
    hoja2['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(libro, hoja2, 'Donaron');

    const hoja3 = XLSX.utils.json_to_sheet((hojaNoDonaronData.length > 0 ? hojaNoDonaronData : [{ Mensaje: 'Sin donantes pendientes' }]).map(sanitizarFilaExcel));
    hoja3['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(libro, hoja3, 'Pendientes');

    const hoja4 = XLSX.utils.json_to_sheet((ocasionales.length > 0 ? ocasionales : [{ Mensaje: 'Sin ocasionales' }]).map(sanitizarFilaExcel));
    hoja4['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(libro, hoja4, 'Ocasionales');

    const sufijoArchivo = (infoPeriodo.tipo === 'trimestral' || infoPeriodo.tipo === 'trimestre') ? `T${infoPeriodo.valor}_${infoPeriodo.anio}` :
                          (infoPeriodo.tipo === 'mensual' || infoPeriodo.tipo === 'mes') ? `Mes_${String(infoPeriodo.valor).padStart(2, '0')}_${infoPeriodo.anio}` :
                          `Semana_${infoPeriodo.valor}_Mes_${String(infoPeriodo.mes || '').padStart(2, '0')}_${infoPeriodo.anio}`;

    descargarExcel(`Informe_Seguimiento_${sufijoArchivo}.xlsx`, libro);
    mostrarNotificacion('exito', 'Informe Generado', `Se descargó el informe de ${infoPeriodo.descripcion} correctamente.`);
}

// Retrocompatibilidad
const exportarInformeTrimestral = exportarInformeSeguimiento;

// UTILIDADES EXCEL Y PROTECCIÓN CONTRA FORMULA INJECTION
function sanitizarValorExcel(valor) {
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
    const str = String(valor);
    if (str.length > 0) {
        const primerChar = str.charAt(0);
        if (primerChar === '=' || primerChar === '+' || primerChar === '-' || primerChar === '@') {
            return `'${str}`;
        }
    }
    return str;
}

function sanitizarFilaExcel(fila) {
    if (!fila || typeof fila !== 'object') return fila;
    const filaLimpia = {};
    for (const [clave, valor] of Object.entries(fila)) {
        filaLimpia[clave] = sanitizarValorExcel(valor);
    }
    return filaLimpia;
}

function construirLibroExcel(nombreHoja, filas, anchos = []) {
    const filasSeguras = Array.isArray(filas) ? filas.map(sanitizarFilaExcel) : [];
    const hoja = XLSX.utils.json_to_sheet(filasSeguras);
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
    descargarExcel(`Reporte_${tipo.toUpperCase()}_${obtenerFechaActualLocal()}.xlsx`, libro);
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
                fecha_registro: obtenerFechaActualLocal()
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
                    <p class="text-xs text-slate-500 mt-1">${escaparHTML(mensajeResumen)}</p>
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
            <td class="py-2.5 px-4 font-mono font-bold text-rose-600">#${escaparHTML(err.fila)}</td>
            <td class="py-2.5 px-4 font-semibold text-slate-700">${escaparHTML(err.causa)}</td>
            <td class="py-2.5 px-4 text-slate-500">${escaparHTML(err.detalle)}</td>
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
    link.download = `Reporte_Errores_Importacion_${obtenerFechaActualLocal()}.txt`;
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
                            <td class="fila">#${escaparHTML(e.fila)}</td>
                            <td><strong>${escaparHTML(e.causa)}</strong></td>
                            <td>${escaparHTML(e.detalle)}</td>
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
        const item = document.createElement('div');
        item.className = 'flex items-center bg-white text-slate-700 px-4 py-2 rounded-xl shadow-sm border border-slate-200';

        const span = document.createElement('span');
        span.className = 'font-semibold text-sm';
        span.textContent = d;

        const btn = document.createElement('button');
        btn.className = 'text-rose-500 ml-2';
        btn.onclick = () => eliminarDestinacion(i);
        btn.innerHTML = '<i class="fa-solid fa-times"></i>';

        item.appendChild(span);
        item.appendChild(btn);
        cont.appendChild(item);
    });

    const selF = document.getElementById('donacion-destinacion');
    const selT = document.getElementById('filtro-destinacion-donacion');
    if (selF) {
        selF.innerHTML = '';
        globalDestinaciones.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            selF.appendChild(opt);
        });
    }
    if (selT) {
        selT.innerHTML = '<option value="">Cualquier Destinación</option>';
        globalDestinaciones.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            selT.appendChild(opt);
        });
    }
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

// LIMPIEZA SEGURA DE DATOS AL CERRAR SESIÓN
function limpiarDatosSesion() {
    // 1. Limpieza de arreglos y variables de estado sensible en memoria
    globalDonantes = [];
    globalDonaciones = [];
    editandoDonanteId = null;
    editandoDonacionId = null;
    guardandoDonante = false;
    guardandoDonacion = false;
    eliminandoDonante = false;
    eliminandoDonacion = false;

    // 2. Destruir instancias activas de Chart.js
    if (chartRecaudacionInstance) {
        chartRecaudacionInstance.destroy();
        chartRecaudacionInstance = null;
    }
    if (chartMediosPagoInstance) {
        chartMediosPagoInstance.destroy();
        chartMediosPagoInstance = null;
    }

    // 3. Limpiar tablas y contenedores del DOM que muestran datos de donantes y donaciones
    const tablas = [
        'tabla-donantes',
        'tabla-donaciones',
        'tabla-alertas-retencion',
        'tabla-cumpleanos',
        'tabla-seguimiento-periodicos',
        'tabla-seguimiento-ocasionales'
    ];
    tablas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    // 4. Limpiar selectores que contengan nombres o datos de donantes
    const selectDonante = document.getElementById('donacion-donante-id');
    if (selectDonante) selectDonante.innerHTML = '<option value="">-- Seleccione donante activo --</option>';
    const filtroDonanteSeg = document.getElementById('filtro-donante-seguimiento');
    if (filtroDonanteSeg) filtroDonanteSeg.innerHTML = '<option value="">Todos los donantes periódicos</option>';

    // 5. Restablecer indicadores y KPIs en pantalla para no dejar cifras expuestas
    const kpisMoneda = ['kpi-total-recaudado', 'kpi-recaudado-mes'];
    kpisMoneda.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = '$ 0';
    });
    const kpisConteo = ['kpi-donantes-activos', 'kpi-total-donaciones', 'badge-alertas-count', 'badge-cumpleanos-count'];
    kpisConteo.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = '0';
    });

    // 6. Cerrar modales que pudieran haber quedado abiertos con datos
    const modales = ['modal-donante', 'modal-donacion', 'modal-detalle-donante', 'modal-reporte-errores'];
    modales.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('hidden');
    });

    // 7. Limpiar campos del recibo
    const camposRecibo = ['recibo-comp', 'recibo-fecha', 'recibo-donante-nombre', 'recibo-donante-doc', 'recibo-destinacion', 'recibo-medio', 'recibo-monto'];
    camposRecibo.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = '';
    });
}

async function cerrarSesion() {
    try {
        await supabaseClient.auth.signOut();
    } catch (e) {
        console.error('Error al cerrar sesión:', e);
    }
    limpiarDatosSesion();
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
            limpiarDatosSesion();
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
    abrirModalDonacion, abrirModalDonante, abrirReporteEnNuevaVentana, actualizarControlesFiltro, actualizarKPIs, actualizarMetricasDetalle, agregarDestinacion, alCambiarAnioSeguimiento, alCambiarMesSeguimiento, alCambiarTipoPeriodoSeguimiento, calcularDiasDesdeFecha, calcularDiasProximoCumple, calcularEdadProxima, calcularMetricasSeguimientoTrimestral, cambiarFiltroVistaSeguimiento, cambiarMonedaGlobal, cambiarSubTabSeguimiento, cambiarTab, cargarDatosSupabase, cerrarModal, cerrarModalReporteErrores, cerrarNotificacion, cerrarSesion, confirmarEliminarDonacion, confirmarEliminarDonante, construirLibroExcel, descargarExcel, descargarPlantillaImportacion, descargarPlantillaDonaciones, descargarReporteErroresTXT, eliminarDestinacion, esDonacionEnTrimestre, evaluarAlertaRetencionDonante, exportarExcel, exportarInformeSeguimiento, exportarInformeTrimestral, filtrarErroresReporte, filtrarTablaDonaciones, filtrarTablaDonantes, finalizarImportacionDonantes, formatearFechaCumple, formatearMoneda, formatearMonedaEstatica, generarEnlaceWhatsApp, guardarDonacion, guardarDonante, imprimirRecibo, iniciarApp, manejarErrorLecturaArchivo, mostrarModalReporteErrores, mostrarNotificacion, normalizarACOP, obtenerFechaActualLocal, obtenerSemanasDelMes, poblarSemanasSeguimiento, poblarSelectAnioSeguimiento, poblarSelectDonantes, procesarImportacionArchivo, renderizarDestinaciones, renderizarGraficoAnillos, renderizarGraficos, renderizarModuloCumpleanos, renderizarModuloSeguimiento, renderizarTablaAlertas, renderizarTablaDonaciones, renderizarTablaDonantes, renderizarTablaOcasionales, renderizarTablaSeguimientoDonaron, sumarMesesCalendario, togglePasswordVisibility, toggleSidebar, verDetalleDonante, verificarPassword
});