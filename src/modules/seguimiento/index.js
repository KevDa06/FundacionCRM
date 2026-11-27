/**
 * Módulo Seguimiento (Periódico, Mensual, Semanal, Trimestral y Ocasionales)
 * Monitoreo de cumplimiento de compromisos recurrentes de donantes y exportación de informes analíticos en Excel.
 */
import { store } from '../../state/store.js';
import { escaparHTML, formatearMoneda, normalizarACOP } from '../../utils/formatters.js';
import { generarEnlaceWhatsApp } from '../retencion/index.js';
import { generarInformeSeguimientoExcel } from './exportacion.js';
import { crearBotonNombreDonanteHTML } from '../../utils/ui.js';

let estadoVistaSeguimiento = 'donaron';
let subTabSeguimientoActiva = 'periodicos';

const NOMBRES_MESES_MAYUS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const NOMBRES_MESES_MINUS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Extrae y normaliza una fecha ISO YYYY-MM-DD incluso cuando viene con marca horaria (T... o espacio).
 */
export function extraerFechaISO(fecha) {
    if (!fecha) return '';
    const limpia = String(fecha).trim().split('T')[0].split(' ')[0];
    const match = limpia.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return '';
    const anio = match[1];
    const mes = match[2].padStart(2, '0');
    const dia = match[3].padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

/**
 * Normaliza texto para búsquedas sin distinguir tildes ni mayúsculas.
 */
export function normalizarTextoBusqueda(texto) {
    if (!texto) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function construirInfoPeriodoDesdeParametros(tipoRaw, anioParam, valorParam, mesParam) {
    const tipo = String(tipoRaw || 'mensual').toLowerCase();
    const yParsed = parseInt(anioParam, 10);
    const y = Number.isFinite(yParsed) && yParsed > 1900 ? yParsed : new Date().getFullYear();
    const pad = n => String(n).padStart(2, '0');

    if (tipo === 'mensual' || tipo === 'mes') {
        const mParsed = parseInt(valorParam, 10);
        const m = Number.isFinite(mParsed) && mParsed >= 1 && mParsed <= 12 ? mParsed : 1;
        const ultimoDia = new Date(y, m, 0).getDate();
        const nombreMes = NOMBRES_MESES_MAYUS[m - 1] || 'Mes';
        const nombreMesMin = NOMBRES_MESES_MINUS[m - 1] || 'mes';

        return {
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
    }

    if (tipo === 'semanal' || tipo === 'semana') {
        let mDefault = 1;
        if (typeof document !== 'undefined') {
            const selectMes = document.getElementById('seguimiento-mes');
            if (selectMes) {
                const mDom = parseInt(selectMes.value, 10);
                if (Number.isFinite(mDom) && mDom >= 1 && mDom <= 12) mDefault = mDom;
            }
        }
        const mParsed = parseInt(mesParam, 10);
        const m = Number.isFinite(mParsed) && mParsed >= 1 && mParsed <= 12 ? mParsed : mDefault;
        const semanas = obtenerSemanasDelMes(y, m);
        const semParsed = parseInt(valorParam, 10);
        let numSem = Number.isFinite(semParsed) && semParsed >= 1 ? semParsed : 1;
        let infoSem = semanas.find(s => s.numero === numSem);
        if (!infoSem && semanas.length > 0) {
            infoSem = semanas[semanas.length - 1];
            numSem = infoSem.numero;
        }
        const nombreMes = NOMBRES_MESES_MAYUS[m - 1] || 'Mes';
        const rangoFechas = infoSem ? infoSem.rangoTexto : '';

        return {
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
    }

    if (tipo === 'anual' || tipo === 'año') {
        return {
            tipo: 'anual',
            anio: y,
            valor: y,
            inicioStr: `${y}-01-01`,
            finStr: `${y}-12-31`,
            nombre: `Año ${y}`,
            descripcion: `Período anual ${y}`,
            etiquetaCorta: `Año ${y}`,
            tipoTexto: 'Anual',
            enPeriodoTexto: `el año ${y}`,
            agradecimientoTexto: `este año ${y}`
        };
    }

    const qParsed = parseInt(valorParam, 10);
    const q = Number.isFinite(qParsed) && qParsed >= 1 && qParsed <= 4 ? qParsed : 1;
    const trimestresInfo = {
        1: { inicio: `${y}-01-01`, fin: `${y}-03-31`, texto: 'Trimestre 1 (Ene - Mar)', meses: 'Enero a Marzo' },
        2: { inicio: `${y}-04-01`, fin: `${y}-06-30`, texto: 'Trimestre 2 (Abr - Jun)', meses: 'Abril a Junio' },
        3: { inicio: `${y}-07-01`, fin: `${y}-09-30`, texto: 'Trimestre 3 (Jul - Sep)', meses: 'Julio a Septiembre' },
        4: { inicio: `${y}-10-01`, fin: `${y}-12-31`, texto: 'Trimestre 4 (Oct - Dic)', meses: 'Octubre a Diciembre' }
    };
    const tInfo = trimestresInfo[q] || trimestresInfo[1];

    return {
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
        agradecimientoTexto: 'este trimestre'
    };
}

export function obtenerSemanasDelMes(anio, mes) {
    const yParsed = parseInt(anio, 10);
    const mParsed = parseInt(mes, 10);
    const y = Number.isFinite(yParsed) && yParsed > 1900 ? yParsed : new Date().getFullYear();
    const m = Number.isFinite(mParsed) && mParsed >= 1 && mParsed <= 12 ? mParsed : 1;
    const diasEnMes = new Date(y, m, 0).getDate();
    const nombreMes = NOMBRES_MESES_MINUS[m - 1] || 'mes';
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

export function poblarSemanasSeguimiento(anio, mes) {
    if (typeof document === 'undefined') return;
    const select = document.getElementById('seguimiento-semana');
    if (!select) return;

    const selectAnio = document.getElementById('seguimiento-anio');
    const selectMes = document.getElementById('seguimiento-mes');
    const y = parseInt(anio, 10) || (selectAnio ? parseInt(selectAnio.value, 10) : 0) || new Date().getFullYear();
    const m = parseInt(mes, 10) || (selectMes ? parseInt(selectMes.value, 10) : 0) || (new Date().getMonth() + 1);

    const valorPrevio = parseInt(select.value, 10);
    const semanas = obtenerSemanasDelMes(y, m);
    select.innerHTML = '';

    semanas.forEach(s => {
        const opt = document.createElement('option');
        opt.value = String(s.numero);
        opt.textContent = s.textoSelect;
        select.appendChild(opt);
    });

    if (valorPrevio && valorPrevio >= 1 && valorPrevio <= semanas.length) {
        select.value = String(valorPrevio);
    } else {
        const hoy = new Date();
        if (hoy.getFullYear() === y && (hoy.getMonth() + 1) === m) {
            const semHoy = Math.min(Math.ceil(hoy.getDate() / 7), semanas.length);
            select.value = String(semHoy);
        } else {
            select.value = '1';
        }
    }
}

export function sincronizarControlesPeriodoSeguimiento() {
    if (typeof document === 'undefined') return;
    const tipo = (document.getElementById('seguimiento-tipo-periodo')?.value || 'mensual').toLowerCase();
    const contTrimestre = document.getElementById('contenedor-filtro-trimestre');
    const contMes = document.getElementById('contenedor-filtro-mes');
    const contSemana = document.getElementById('contenedor-filtro-semana');

    if (tipo === 'mensual' || tipo === 'mes') {
        if (contMes) contMes.classList.remove('hidden');
        if (contSemana) contSemana.classList.add('hidden');
        if (contTrimestre) contTrimestre.classList.add('hidden');
    } else if (tipo === 'semanal' || tipo === 'semana') {
        if (contMes) contMes.classList.remove('hidden');
        if (contSemana) contSemana.classList.remove('hidden');
        if (contTrimestre) contTrimestre.classList.add('hidden');
    } else if (tipo === 'anual' || tipo === 'año') {
        if (contMes) contMes.classList.add('hidden');
        if (contSemana) contSemana.classList.add('hidden');
        if (contTrimestre) contTrimestre.classList.add('hidden');
    } else {
        if (contMes) contMes.classList.add('hidden');
        if (contSemana) contSemana.classList.add('hidden');
        if (contTrimestre) contTrimestre.classList.remove('hidden');
    }
}

export function alCambiarTipoPeriodoSeguimiento() {
    sincronizarControlesPeriodoSeguimiento();

    if (typeof document !== 'undefined') {
        const tipo = (document.getElementById('seguimiento-tipo-periodo')?.value || 'mensual').toLowerCase();
        if (tipo === 'semanal' || tipo === 'semana') {
            const selectAnio = document.getElementById('seguimiento-anio');
            const anio = selectAnio ? parseInt(selectAnio.value, 10) || new Date().getFullYear() : new Date().getFullYear();
            const selectMes = document.getElementById('seguimiento-mes');
            const mes = selectMes ? parseInt(selectMes.value, 10) || (new Date().getMonth() + 1) : (new Date().getMonth() + 1);
            poblarSemanasSeguimiento(anio, mes);
        }
    }

    renderizarModuloSeguimiento();
}

export function alCambiarMesSeguimiento() {
    if (typeof document !== 'undefined') {
        const tipo = (document.getElementById('seguimiento-tipo-periodo')?.value || 'mensual').toLowerCase();
        if (tipo === 'semanal' || tipo === 'semana') {
            const selectAnio = document.getElementById('seguimiento-anio');
            const anio = selectAnio ? parseInt(selectAnio.value, 10) || new Date().getFullYear() : new Date().getFullYear();
            const selectMes = document.getElementById('seguimiento-mes');
            const mes = selectMes ? parseInt(selectMes.value, 10) || (new Date().getMonth() + 1) : (new Date().getMonth() + 1);
            poblarSemanasSeguimiento(anio, mes);
        }
    }

    renderizarModuloSeguimiento();
}

export function alCambiarAnioSeguimiento() {
    if (typeof document !== 'undefined') {
        const tipo = (document.getElementById('seguimiento-tipo-periodo')?.value || 'mensual').toLowerCase();
        if (tipo === 'semanal' || tipo === 'semana') {
            const selectAnio = document.getElementById('seguimiento-anio');
            const anio = selectAnio ? parseInt(selectAnio.value, 10) || new Date().getFullYear() : new Date().getFullYear();
            const selectMes = document.getElementById('seguimiento-mes');
            const mes = selectMes ? parseInt(selectMes.value, 10) || (new Date().getMonth() + 1) : (new Date().getMonth() + 1);
            poblarSemanasSeguimiento(anio, mes);
        }
    }

    renderizarModuloSeguimiento();
}

export function poblarSelectAnioSeguimiento() {
    if (typeof document === 'undefined') return;
    const select = document.getElementById('seguimiento-anio');
    if (!select) return;

    const currentYear = new Date().getFullYear();
    const valorPrevio = parseInt(select.value, 10);
    const aniosSet = new Set([currentYear - 1, currentYear, currentYear + 1]);

    const donaciones = Array.isArray(store.globalDonaciones) ? store.globalDonaciones : [];
    const donantes = Array.isArray(store.globalDonantes) ? store.globalDonantes : [];

    donaciones.forEach(d => {
        const iso = extraerFechaISO(d?.fecha);
        if (iso) {
            const y = parseInt(iso.slice(0, 4), 10);
            if (Number.isFinite(y) && y > 1900) aniosSet.add(y);
        }
    });

    donantes.forEach(d => {
        const iso = extraerFechaISO(d?.fecha_registro);
        if (iso) {
            const y = parseInt(iso.slice(0, 4), 10);
            if (Number.isFinite(y) && y > 1900) aniosSet.add(y);
        }
    });

    const anioObjetivo = (Number.isFinite(valorPrevio) && aniosSet.has(valorPrevio)) ? valorPrevio : currentYear;
    const sortedAnios = Array.from(aniosSet).sort((a, b) => b - a);

    select.innerHTML = '';
    sortedAnios.forEach(y => {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        if (y === anioObjetivo) opt.selected = true;
        select.appendChild(opt);
    });
    select.value = String(anioObjetivo);

    const selectTrimestre = document.getElementById('seguimiento-trimestre');
    if (selectTrimestre && !selectTrimestre.value) {
        const currentQ = Math.ceil((new Date().getMonth() + 1) / 3);
        selectTrimestre.value = String(currentQ);
    }

    const selectMes = document.getElementById('seguimiento-mes');
    const currentMonth = new Date().getMonth() + 1;
    if (selectMes && !selectMes.value) {
        selectMes.value = String(currentMonth);
    }

    const mActual = selectMes ? (parseInt(selectMes.value, 10) || currentMonth) : currentMonth;
    poblarSemanasSeguimiento(anioObjetivo, mActual);
}

export function obtenerInfoPeriodoSeguimiento() {
    if (typeof document === 'undefined') {
        const hoy = new Date();
        return construirInfoPeriodoDesdeParametros('mensual', hoy.getFullYear(), hoy.getMonth() + 1, hoy.getMonth() + 1);
    }

    const hoy = new Date();
    const selectAnio = document.getElementById('seguimiento-anio');
    const anio = (selectAnio && parseInt(selectAnio.value, 10)) || hoy.getFullYear();
    const tipoPeriodo = (document.getElementById('seguimiento-tipo-periodo')?.value || 'mensual').toLowerCase();

    if (tipoPeriodo === 'mensual' || tipoPeriodo === 'mes') {
        const selectMes = document.getElementById('seguimiento-mes');
        const mes = (selectMes && parseInt(selectMes.value, 10)) || (hoy.getMonth() + 1);
        return construirInfoPeriodoDesdeParametros('mensual', anio, mes, mes);
    }

    if (tipoPeriodo === 'semanal' || tipoPeriodo === 'semana') {
        const selectMes = document.getElementById('seguimiento-mes');
        const mes = (selectMes && parseInt(selectMes.value, 10)) || (hoy.getMonth() + 1);
        const selectSemana = document.getElementById('seguimiento-semana');
        const numSemana = (selectSemana && parseInt(selectSemana.value, 10)) || 1;
        return construirInfoPeriodoDesdeParametros('semanal', anio, numSemana, mes);
    }

    if (tipoPeriodo === 'anual' || tipoPeriodo === 'año') {
        return construirInfoPeriodoDesdeParametros('anual', anio, anio);
    }

    const selectTrimestre = document.getElementById('seguimiento-trimestre');
    const defaultQ = Math.ceil((hoy.getMonth() + 1) / 3);
    const q = (selectTrimestre && parseInt(selectTrimestre.value, 10)) || defaultQ;
    return construirInfoPeriodoDesdeParametros('trimestral', anio, q);
}

export function esDonacionEnTrimestre(fechaStr, anio, trimestre) {
    const iso = extraerFechaISO(fechaStr);
    if (!iso) return false;
    const y = parseInt(iso.slice(0, 4), 10);
    const m = parseInt(iso.slice(5, 7), 10);
    if (y !== parseInt(anio, 10)) return false;
    const q = Math.ceil(m / 3);
    return q === parseInt(trimestre, 10);
}

export function calcularMetricasSeguimiento(tipoPeriodo, anio, valorPeriodo, mesOpcional) {
    const infoPeriodo = !tipoPeriodo
        ? obtenerInfoPeriodoSeguimiento()
        : construirInfoPeriodoDesdeParametros(tipoPeriodo, anio, valorPeriodo, mesOpcional);

    const donantes = Array.isArray(store.globalDonantes) ? store.globalDonantes : [];
    const donaciones = Array.isArray(store.globalDonaciones) ? store.globalDonaciones : [];

    const donantesValidos = donantes.filter(d => {
        if (!d || d.estado !== 'Activo') return false;
        const p = (d.periodicidad || '').trim().toLowerCase();
        return p !== 'ocasional' && p !== '' && p !== 'ninguna';
    });

    const listaDonadores = [];
    let totalMontoRecaudadoCOP = 0;

    donantesValidos.forEach(donante => {
        const donacionesEnPeriodo = donaciones.filter(d => {
            if (!d || d.donante_id === null || d.donante_id === undefined) return false;
            if (String(d.donante_id) !== String(donante.id)) return false;
            const fechaISO = extraerFechaISO(d.fecha);
            return Boolean(fechaISO && fechaISO >= infoPeriodo.inicioStr && fechaISO <= infoPeriodo.finStr);
        });

        const dono = donacionesEnPeriodo.length > 0;
        const montoPeriodoCOP = donacionesEnPeriodo.reduce(
            (sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio),
            0
        );
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

    const totalEsperados = listaDonadores.length;
    const donantesQueDonaron = listaDonadores.filter(d => d.dono);
    const donantesNoDonaron = listaDonadores.filter(d => !d.dono);
    const totalDonaron = donantesQueDonaron.length;
    const totalNoDonaron = donantesNoDonaron.length;

    const pctDonaron = totalEsperados > 0 ? ((totalDonaron / totalEsperados) * 100).toFixed(1) : '0';
    const pctNoDonaron = totalEsperados > 0 ? Math.max(0, 100 - parseFloat(pctDonaron)).toFixed(1) : '0';

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

function actualizarEstiloFiltroVistaSeguimiento(infoPeriodo) {
    if (typeof document === 'undefined') return;
    const btnDonaron = document.getElementById('btn-vista-donaron');
    const btnNoDonaron = document.getElementById('btn-vista-nodonaron');
    const tituloTabla = document.getElementById('titulo-tabla-seguimiento');

    const baseBtn = 'px-3 py-1.5 rounded-lg transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600';
    if (estadoVistaSeguimiento === 'donaron') {
        if (btnDonaron) btnDonaron.className = `${baseBtn} bg-white text-emerald-700 shadow-sm`;
        if (btnNoDonaron) btnNoDonaron.className = `${baseBtn} text-slate-600 hover:text-slate-800`;
        if (tituloTabla && infoPeriodo) {
            tituloTabla.innerText = `Donantes que Donaron en ${infoPeriodo.enPeriodoTexto}`;
        }
    } else {
        if (btnDonaron) btnDonaron.className = `${baseBtn} text-slate-600 hover:text-slate-800`;
        if (btnNoDonaron) btnNoDonaron.className = `${baseBtn} bg-white text-rose-700 shadow-sm`;
        if (tituloTabla && infoPeriodo) {
            tituloTabla.innerText = `Donantes con Donación Pendiente en ${infoPeriodo.enPeriodoTexto}`;
        }
    }
}

export function renderizarModuloSeguimiento() {
    if (typeof document === 'undefined') return;

    poblarSelectAnioSeguimiento();
    sincronizarControlesPeriodoSeguimiento();

    const infoPeriodo = obtenerInfoPeriodoSeguimiento();
    const metricas = calcularMetricasSeguimiento();

    const kpiEspEl = document.getElementById('kpi-seguimiento-esperados');
    if (kpiEspEl) kpiEspEl.innerText = String(metricas.totalEsperados);

    const kpiDonaronEl = document.getElementById('kpi-seguimiento-donaron');
    if (kpiDonaronEl) kpiDonaronEl.innerText = String(metricas.totalDonaron);

    const kpiPctDonaronEl = document.getElementById('kpi-seguimiento-pct-donaron');
    if (kpiPctDonaronEl) kpiPctDonaronEl.innerText = `${metricas.pctDonaron}%`;

    const kpiNoDonaronEl = document.getElementById('kpi-seguimiento-nodonaron');
    if (kpiNoDonaronEl) kpiNoDonaronEl.innerText = String(metricas.totalNoDonaron);

    const kpiPctNoDonaronEl = document.getElementById('kpi-seguimiento-pct-nodonaron');
    if (kpiPctNoDonaronEl) kpiPctNoDonaronEl.innerText = `${metricas.pctNoDonaron}%`;

    const kpiMontoEl = document.getElementById('kpi-seguimiento-monto');
    if (kpiMontoEl) {
        kpiMontoEl.innerText = formatearMoneda(
            metricas.totalMontoRecaudadoCOP,
            store.monedaActual,
            store.tasasCambio,
            store.locMoneda
        );
    }

    const labelMonedaEl = document.getElementById('label-seguimiento-moneda');
    if (labelMonedaEl) labelMonedaEl.innerText = `Aportado en ${infoPeriodo.etiquetaCorta} (${store.monedaActual})`;

    const circuloDonaron = document.getElementById('circulo-pct-donaron');
    if (circuloDonaron) circuloDonaron.innerText = `${metricas.pctDonaron}%`;

    const circuloNoDonaron = document.getElementById('circulo-pct-nodonaron');
    if (circuloNoDonaron) circuloNoDonaron.innerText = `${metricas.pctNoDonaron}%`;

    const barraVisualDonaron = document.getElementById('barra-visual-donaron');
    if (barraVisualDonaron) barraVisualDonaron.style.width = `${metricas.pctDonaron}%`;

    const barraVisualNoDonaron = document.getElementById('barra-visual-nodonaron');
    if (barraVisualNoDonaron) barraVisualNoDonaron.style.width = `${metricas.pctNoDonaron}%`;

    const textoConteoDonaron = document.getElementById('texto-conteo-donaron');
    if (textoConteoDonaron) textoConteoDonaron.innerText = String(metricas.totalDonaron);

    const textoConteoNoDonaron = document.getElementById('texto-conteo-nodonaron');
    if (textoConteoNoDonaron) textoConteoNoDonaron.innerText = String(metricas.totalNoDonaron);

    const barraDonaron = document.getElementById('barra-progreso-donaron');
    if (barraDonaron) barraDonaron.style.width = `${metricas.pctDonaron}%`;

    const barraNoDonaron = document.getElementById('barra-progreso-nodonaron');
    if (barraNoDonaron) barraNoDonaron.style.width = `${metricas.pctNoDonaron}%`;

    const textoBarraDonaron = document.getElementById('texto-barra-pct-donaron');
    if (textoBarraDonaron) textoBarraDonaron.innerText = `${metricas.pctDonaron}%`;

    const textoBarraNoDonaron = document.getElementById('texto-barra-pct-nodonaron');
    if (textoBarraNoDonaron) textoBarraNoDonaron.innerText = `${metricas.pctNoDonaron}%`;

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

    const countFiltroDonaron = document.getElementById('count-filtro-donaron');
    if (countFiltroDonaron) countFiltroDonaron.innerText = String(metricas.totalDonaron);

    const countFiltroNoDonaron = document.getElementById('count-filtro-nodonaron');
    if (countFiltroNoDonaron) countFiltroNoDonaron.innerText = String(metricas.totalNoDonaron);

    actualizarEstiloFiltroVistaSeguimiento(infoPeriodo);
    renderizarTablaSeguimientoDonaron(metricas, infoPeriodo);

    const donantes = Array.isArray(store.globalDonantes) ? store.globalDonantes : [];
    const totalOcasionales = donantes.filter(d => ((d && d.periodicidad) || '').trim().toLowerCase() === 'ocasional').length;
    const badgeOcasionales = document.getElementById('badge-count-ocasionales');
    if (badgeOcasionales) badgeOcasionales.innerText = String(totalOcasionales);

    renderizarTablaOcasionales(infoPeriodo);
}

export function cambiarFiltroVistaSeguimiento(filtro) {
    estadoVistaSeguimiento = filtro === 'nodonaron' ? 'nodonaron' : 'donaron';
    const infoPeriodo = obtenerInfoPeriodoSeguimiento();
    actualizarEstiloFiltroVistaSeguimiento(infoPeriodo);
    renderizarTablaSeguimientoDonaron(null, infoPeriodo);
}

export function renderizarTablaSeguimientoDonaron(metricasPrecalculadas = null, infoPeriodoPrecalculada = null) {
    if (typeof document === 'undefined') return;
    const tbody = document.getElementById('tbody-seguimiento-donantes');
    if (!tbody) return;

    const infoPeriodo = infoPeriodoPrecalculada || obtenerInfoPeriodoSeguimiento();
    const metricas = metricasPrecalculadas || calcularMetricasSeguimiento();
    const lista = estadoVistaSeguimiento === 'donaron' ? metricas.donantesQueDonaron : metricas.donantesNoDonaron;

    const termino = normalizarTextoBusqueda(document.getElementById('buscar-donante-seguimiento')?.value || '');
    let filtrados = lista;
    if (termino) {
        filtrados = lista.filter(d =>
            normalizarTextoBusqueda(d.nombre).includes(termino) ||
            normalizarTextoBusqueda(d.documento).includes(termino) ||
            normalizarTextoBusqueda(d.periodicidad).includes(termino) ||
            normalizarTextoBusqueda(d.correo).includes(termino)
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
                <div class="font-extrabold text-emerald-600 text-sm">${formatearMoneda(d.totalMontoPeriodoCOP, store.monedaActual, store.tasasCambio, store.locMoneda)}</div>
                <div class="text-[11px] text-slate-400 font-medium">${escaparHTML(d.cantidadDonaciones)} aporte${d.cantidadDonaciones > 1 ? 's' : ''}</div>
            `;
            const fechasOrdenadas = [...(d.donacionesPeriodo || [])]
                .map(x => extraerFechaISO(x?.fecha) || x?.fecha || '')
                .filter(Boolean)
                .sort((a, b) => b.localeCompare(a));
            const fechas = fechasOrdenadas.map(f => escaparHTML(f)).join(', ');
            fechasInfo = `<span class="text-xs font-medium text-slate-700">${fechas || '-'}</span>`;
        } else {
            aporteInfo = '<span class="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200/60 px-2.5 py-1 rounded-md">Sin aporte</span>';
            fechasInfo = '<span class="text-xs text-slate-400 italic font-medium">Pendiente</span>';
        }

        const textoAporteMsg = infoPeriodo.agradecimientoTexto || infoPeriodo.enPeriodoTexto;
        const msgWa = d.dono
            ? `¡Hola ${d.nombre}! Queremos agradecerte de corazón por tu valiosa donación realizada en ${textoAporteMsg} a la Fundación. ¡Tu apoyo constante transforma vidas!`
            : `¡Hola ${d.nombre}! Te saludamos cordialmente de la Fundación. Nos comunicamos para agradecerte por tu compromiso y consultarte si requieres apoyo con la información para tu aporte de ${textoAporteMsg}. ¡Muchas gracias!`;

        const linkWhatsApp = generarEnlaceWhatsApp(d.telefono, msgWa);
        const idSeguro = escaparHTML(d.id);
        const nombreSeguro = escaparHTML(d.nombre || 'donante');

        tr.innerHTML = `
            <td class="px-6 py-4">
                ${crearBotonNombreDonanteHTML(d.id, d.nombre, { className: 'font-bold text-slate-800 text-sm' })}
                <div class="text-xs text-slate-400 font-medium">${d.tipo === 'Juridica' ? 'Persona Jurídica' : 'Persona Natural'}</div>
            </td>
            <td class="px-6 py-4 font-mono text-xs text-slate-600 font-medium">${escaparHTML(d.documento || '-')}</td>
            <td class="px-6 py-4">${badgePer}</td>
            <td class="px-6 py-4">${aporteInfo}</td>
            <td class="px-6 py-4">${fechasInfo}</td>
            <td class="px-6 py-4 text-right space-x-2">
                ${linkWhatsApp !== '#' ? `
                    <a href="${escaparHTML(linkWhatsApp)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 shadow-sm transition-colors text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" title="${d.dono ? 'Agradecer por WhatsApp' : 'Contactar por WhatsApp'}" aria-label="${d.dono ? `Agradecer por WhatsApp a ${nombreSeguro}` : `Contactar por WhatsApp a ${nombreSeguro}`}">
                        <i class="fa-brands fa-whatsapp text-base"></i>
                    </a>
                ` : ''}
                <button type="button" onclick="verDetalleDonante('${idSeguro}')" class="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 shadow-sm transition-colors text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" title="Ver ficha del donante" aria-label="Ver ficha de ${nombreSeguro}">
                    <i class="fa-solid fa-eye text-xs"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

export function cambiarSubTabSeguimiento(subtab) {
    subTabSeguimientoActiva = subtab === 'ocasionales' ? 'ocasionales' : 'periodicos';
    if (typeof document === 'undefined') return;

    const btnPer = document.getElementById('btn-subtab-periodicos');
    const btnOca = document.getElementById('btn-subtab-ocasionales');
    const secPer = document.getElementById('subseccion-periodicos');
    const secOca = document.getElementById('subseccion-ocasionales');

    const baseSubtab = 'px-5 py-3 text-sm font-bold border-b-2 transition-colors flex items-center space-x-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600';

    if (subTabSeguimientoActiva === 'periodicos') {
        if (btnPer) btnPer.className = `${baseSubtab} border-blue-600 text-blue-600`;
        if (btnOca) btnOca.className = `${baseSubtab} border-transparent text-slate-500 hover:text-slate-700`;
        if (secPer) secPer.classList.remove('hidden');
        if (secOca) secOca.classList.add('hidden');
    } else {
        if (btnPer) btnPer.className = `${baseSubtab} border-transparent text-slate-500 hover:text-slate-700`;
        if (btnOca) btnOca.className = `${baseSubtab} border-blue-600 text-blue-600`;
        if (secPer) secPer.classList.add('hidden');
        if (secOca) secOca.classList.remove('hidden');
        renderizarTablaOcasionales();
    }
}

export function renderizarTablaOcasionales(infoPeriodoPrecalculada = null) {
    if (typeof document === 'undefined') return;
    const tbody = document.getElementById('tbody-donantes-ocasionales');
    if (!tbody) return;

    const infoPeriodo = infoPeriodoPrecalculada || obtenerInfoPeriodoSeguimiento();
    const filtroPeriodoEl = document.getElementById('filtro-periodo-ocasionales');
    const filtroPeriodo = filtroPeriodoEl ? filtroPeriodoEl.value : 'periodo';
    const buscarTermino = normalizarTextoBusqueda(document.getElementById('buscar-donante-ocasional')?.value || '');

    const donantes = Array.isArray(store.globalDonantes) ? store.globalDonantes : [];
    const donaciones = Array.isArray(store.globalDonaciones) ? store.globalDonaciones : [];
    const donantesOcasionales = donantes.filter(d => ((d && d.periodicidad) || '').trim().toLowerCase() === 'ocasional');

    const trimestreEl = document.getElementById('seguimiento-trimestre');
    const trimestreActivo = infoPeriodo.tipo === 'trimestral'
        ? infoPeriodo.valor
        : ((trimestreEl && parseInt(trimestreEl.value, 10)) || Math.ceil((new Date().getMonth() + 1) / 3));

    let totalRecaudadoOcasionalesCOP = 0;
    let conAportePeriodo = 0;

    const labelPeriodo = document.getElementById('label-ocasionales-periodo');
    if (labelPeriodo) {
        if (filtroPeriodo === 'periodo') labelPeriodo.innerText = `En ${infoPeriodo.descripcion}`;
        else if (filtroPeriodo === 'trimestre') labelPeriodo.innerText = `En Trimestre ${trimestreActivo} de ${infoPeriodo.anio}`;
        else if (filtroPeriodo === 'anio') labelPeriodo.innerText = `En el año ${infoPeriodo.anio}`;
        else labelPeriodo.innerText = 'Histórico total acumulado';
    }

    const listaOcasionales = [];

    donantesOcasionales.forEach(donante => {
        const todasDonaciones = donaciones
            .filter(d => d && d.donante_id !== null && d.donante_id !== undefined && String(d.donante_id) === String(donante.id))
            .sort((a, b) => extraerFechaISO(b.fecha).localeCompare(extraerFechaISO(a.fecha)));

        let donacionesPeriodo = todasDonaciones;
        if (filtroPeriodo === 'periodo') {
            donacionesPeriodo = todasDonaciones.filter(d => {
                const fechaISO = extraerFechaISO(d.fecha);
                return Boolean(fechaISO && fechaISO >= infoPeriodo.inicioStr && fechaISO <= infoPeriodo.finStr);
            });
        } else if (filtroPeriodo === 'trimestre') {
            donacionesPeriodo = todasDonaciones.filter(d => esDonacionEnTrimestre(d.fecha, infoPeriodo.anio, trimestreActivo));
        } else if (filtroPeriodo === 'anio') {
            donacionesPeriodo = todasDonaciones.filter(d => {
                const fechaISO = extraerFechaISO(d.fecha);
                return fechaISO ? parseInt(fechaISO.slice(0, 4), 10) === infoPeriodo.anio : false;
            });
        }

        const montoPeriodoCOP = donacionesPeriodo.reduce(
            (sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio),
            0
        );
        totalRecaudadoOcasionalesCOP += montoPeriodoCOP;

        if (donacionesPeriodo.length > 0) conAportePeriodo++;

        const fechaUltima = todasDonaciones.length > 0
            ? (extraerFechaISO(todasDonaciones[0].fecha) || todasDonaciones[0].fecha || 'Ninguna')
            : 'Ninguna';

        listaOcasionales.push({
            ...donante,
            donacionesPeriodo,
            montoPeriodoCOP,
            totalAportesPeriodo: donacionesPeriodo.length,
            ultimaDonacion: fechaUltima
        });
    });

    const kpiTotalOca = document.getElementById('kpi-ocasionales-total');
    if (kpiTotalOca) kpiTotalOca.innerText = String(donantesOcasionales.length);

    const kpiActivosOca = document.getElementById('kpi-ocasionales-activos');
    if (kpiActivosOca) kpiActivosOca.innerText = String(conAportePeriodo);

    const kpiMontoOca = document.getElementById('kpi-ocasionales-monto');
    if (kpiMontoOca) {
        kpiMontoOca.innerText = formatearMoneda(
            totalRecaudadoOcasionalesCOP,
            store.monedaActual,
            store.tasasCambio,
            store.locMoneda
        );
    }

    let filtrados = listaOcasionales;
    if (buscarTermino) {
        filtrados = listaOcasionales.filter(d =>
            normalizarTextoBusqueda(d.nombre).includes(buscarTermino) ||
            normalizarTextoBusqueda(d.documento).includes(buscarTermino) ||
            normalizarTextoBusqueda(d.correo).includes(buscarTermino) ||
            normalizarTextoBusqueda(d.telefono).includes(buscarTermino)
        );
    }

    filtrados.sort((a, b) => b.montoPeriodoCOP - a.montoPeriodoCOP);

    tbody.innerHTML = '';
    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-slate-400 font-medium">No hay donantes ocasionales registrados o coincidentes con la búsqueda.</td></tr>';
        return;
    }

    filtrados.forEach(d => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50 transition-colors';

        const msgWa = `¡Hola ${d.nombre}! Te saludamos cordialmente de la Fundación. Queremos agradecerte por haber formado parte de nuestros benefactores y compartirte el impacto positivo de nuestras actividades.`;
        const linkWhatsApp = generarEnlaceWhatsApp(d.telefono, msgWa);
        const idSeguro = escaparHTML(d.id);
        const nombreSeguro = escaparHTML(d.nombre || 'donante');
        const estadoBadge = d.estado && d.estado !== 'Activo'
            ? ` <span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">${escaparHTML(d.estado)}</span>`
            : '';

        tr.innerHTML = `
            <td class="px-6 py-4">
                <div class="flex items-center flex-wrap gap-1">
                    ${crearBotonNombreDonanteHTML(d.id, d.nombre, { className: 'font-bold text-slate-800 text-sm' })}
                    ${estadoBadge}
                </div>
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
            <td class="px-6 py-4 font-bold text-slate-700">${formatearMoneda(d.montoPeriodoCOP, store.monedaActual, store.tasasCambio, store.locMoneda)}</td>
            <td class="px-6 py-4 text-xs font-medium text-slate-600">${escaparHTML(d.ultimaDonacion)}</td>
            <td class="px-6 py-4 text-right space-x-2">
                ${linkWhatsApp !== '#' ? `
                    <a href="${escaparHTML(linkWhatsApp)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" title="Contactar por WhatsApp" aria-label="Contactar por WhatsApp a ${nombreSeguro}">
                        <i class="fa-brands fa-whatsapp text-sm"></i>
                    </a>
                ` : ''}
                <button type="button" onclick="verDetalleDonante('${idSeguro}')" class="inline-flex items-center justify-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" title="Ver ficha" aria-label="Ver ficha de ${nombreSeguro}">
                    <i class="fa-solid fa-eye text-xs"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

export function exportarInformeSeguimiento() {
    if (typeof document !== 'undefined') {
        const selectAnio = document.getElementById('seguimiento-anio');
        if (!selectAnio || selectAnio.children.length === 0) {
            poblarSelectAnioSeguimiento();
        }
    }
    return generarInformeSeguimientoExcel(obtenerInfoPeriodoSeguimiento, calcularMetricasSeguimiento);
}

export const exportarInformeTrimestral = exportarInformeSeguimiento;

export function resetearEstadoSeguimiento() {
    estadoVistaSeguimiento = 'donaron';
    subTabSeguimientoActiva = 'periodicos';

    if (typeof document === 'undefined') return;

    const buscarSeg = document.getElementById('buscar-donante-seguimiento');
    if (buscarSeg) buscarSeg.value = '';

    const buscarOca = document.getElementById('buscar-donante-ocasional');
    if (buscarOca) buscarOca.value = '';

    const selectAnio = document.getElementById('seguimiento-anio');
    if (selectAnio) selectAnio.innerHTML = '';

    const selectTipo = document.getElementById('seguimiento-tipo-periodo');
    if (selectTipo) selectTipo.value = 'mensual';

    const filtroOca = document.getElementById('filtro-periodo-ocasionales');
    if (filtroOca) filtroOca.value = 'periodo';

    sincronizarControlesPeriodoSeguimiento();
    actualizarEstiloFiltroVistaSeguimiento();
    cambiarSubTabSeguimiento('periodicos');
}
