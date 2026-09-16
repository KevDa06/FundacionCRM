/**
 * Módulo Seguimiento (Periódico, Mensual, Semanal, Trimestral y Ocasionales)
 * Monitoreo de cumplimiento de compromisos recurrentes de donantes y exportación de informes analíticos en Excel.
 */
import { store } from '../../state/store.js';
import { escaparHTML, formatearMoneda, normalizarACOP, sanitizarFilaExcel, descargarExcel } from '../../utils/formatters.js';
import { mostrarNotificacion } from '../../components/toast.js';
import { generarEnlaceWhatsApp } from '../retencion/index.js';
import { verDetalleDonante } from '../donantes/index.js';

let estadoVistaSeguimiento = 'donaron';
let subTabSeguimientoActiva = 'periodicos';

export function obtenerSemanasDelMes(anio, mes) {
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

export function poblarSemanasSeguimiento(anio, mes) {
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

export function alCambiarTipoPeriodoSeguimiento() {
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
        if (contMes) contMes.classList.add('hidden');
        if (contSemana) contSemana.classList.add('hidden');
        if (contTrimestre) contTrimestre.classList.remove('hidden');
    }

    renderizarModuloSeguimiento();
}

export function alCambiarMesSeguimiento() {
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

export function alCambiarAnioSeguimiento() {
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

export function poblarSelectAnioSeguimiento() {
    const select = document.getElementById('seguimiento-anio');
    if (!select) return;
    if (select.children.length > 0) return;

    const aniosSet = new Set();
    const currentYear = new Date().getFullYear();
    aniosSet.add(currentYear);
    aniosSet.add(currentYear - 1);
    aniosSet.add(currentYear + 1);

    store.globalDonaciones.forEach(d => {
        if (d && d.fecha) {
            const y = parseInt(d.fecha.split('-')[0], 10);
            if (!isNaN(y)) aniosSet.add(y);
        }
    });

    store.globalDonantes.forEach(d => {
        if (d && d.fecha_registro) {
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

export function obtenerInfoPeriodoSeguimiento() {
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

export function esDonacionEnTrimestre(fechaStr, anio, trimestre) {
    if (!fechaStr) return false;
    const parts = fechaStr.split('-');
    if (parts.length < 2) return false;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (y !== parseInt(anio, 10)) return false;
    const q = Math.ceil(m / 3);
    return q === parseInt(trimestre, 10);
}

export function calcularMetricasSeguimiento(tipoPeriodo, anio, valorPeriodo) {
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

    const donantesValidos = store.globalDonantes.filter(d => {
        if (!d || d.estado !== 'Activo') return false;
        const p = (d.periodicidad || '').trim().toLowerCase();
        return p !== 'ocasional' && p !== '' && p !== 'ninguna';
    });

    const listaDonadores = [];
    let totalMontoRecaudadoCOP = 0;

    donantesValidos.forEach(donante => {
        const donacionesEnPeriodo = store.globalDonaciones.filter(d =>
            d &&
            d.donante_id === donante.id &&
            d.fecha &&
            d.fecha >= infoPeriodo.inicioStr &&
            d.fecha <= infoPeriodo.finStr
        );

        const dono = donacionesEnPeriodo.length > 0;
        const montoPeriodoCOP = donacionesEnPeriodo.reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio), 0);
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

export function renderizarModuloSeguimiento() {
    poblarSelectAnioSeguimiento();

    const infoPeriodo = obtenerInfoPeriodoSeguimiento();
    const metricas = calcularMetricasSeguimiento();

    const kpiEspEl = document.getElementById('kpi-seguimiento-esperados');
    if (kpiEspEl) kpiEspEl.innerText = metricas.totalEsperados;

    const kpiDonaronEl = document.getElementById('kpi-seguimiento-donaron');
    if (kpiDonaronEl) kpiDonaronEl.innerText = metricas.totalDonaron;

    const kpiPctDonaronEl = document.getElementById('kpi-seguimiento-pct-donaron');
    if (kpiPctDonaronEl) kpiPctDonaronEl.innerText = `${metricas.pctDonaron}%`;

    const kpiNoDonaronEl = document.getElementById('kpi-seguimiento-nodonaron');
    if (kpiNoDonaronEl) kpiNoDonaronEl.innerText = metricas.totalNoDonaron;

    const kpiPctNoDonaronEl = document.getElementById('kpi-seguimiento-pct-nodonaron');
    if (kpiPctNoDonaronEl) kpiPctNoDonaronEl.innerText = `${metricas.pctNoDonaron}%`;

    const kpiMontoEl = document.getElementById('kpi-seguimiento-monto');
    if (kpiMontoEl) kpiMontoEl.innerText = formatearMoneda(metricas.totalMontoRecaudadoCOP, store.monedaActual, store.tasasCambio, store.locMoneda);

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
    if (textoConteoDonaron) textoConteoDonaron.innerText = metricas.totalDonaron;

    const textoConteoNoDonaron = document.getElementById('texto-conteo-nodonaron');
    if (textoConteoNoDonaron) textoConteoNoDonaron.innerText = metricas.totalNoDonaron;

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
    if (countFiltroDonaron) countFiltroDonaron.innerText = metricas.totalDonaron;

    const countFiltroNoDonaron = document.getElementById('count-filtro-nodonaron');
    if (countFiltroNoDonaron) countFiltroNoDonaron.innerText = metricas.totalNoDonaron;

    const tituloTabla = document.getElementById('titulo-tabla-seguimiento');
    if (tituloTabla) {
        if (estadoVistaSeguimiento === 'donaron') {
            tituloTabla.innerText = `Donantes que Donaron en ${infoPeriodo.enPeriodoTexto}`;
        } else {
            tituloTabla.innerText = `Donantes con Donación Pendiente en ${infoPeriodo.enPeriodoTexto}`;
        }
    }

    renderizarTablaSeguimientoDonaron();

    const totalOcasionales = store.globalDonantes.filter(d => (d && d.periodicidad || '').trim().toLowerCase() === 'ocasional').length;
    const badgeOcasionales = document.getElementById('badge-count-ocasionales');
    if (badgeOcasionales) badgeOcasionales.innerText = totalOcasionales;

    renderizarTablaOcasionales();
}

export function cambiarFiltroVistaSeguimiento(filtro) {
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

export function renderizarTablaSeguimientoDonaron() {
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
                <div class="font-extrabold text-emerald-600 text-sm">${formatearMoneda(d.totalMontoPeriodoCOP, store.monedaActual, store.tasasCambio, store.locMoneda)}</div>
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
                    <a href="${escaparHTML(linkWhatsApp)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center space-x-1 p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 shadow-sm transition-colors text-xs font-bold" title="${d.dono ? 'Agradecer por WhatsApp' : 'Contactar por WhatsApp'}">
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

export function cambiarSubTabSeguimiento(subtab) {
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

export function renderizarTablaOcasionales() {
    const tbody = document.getElementById('tbody-donantes-ocasionales');
    if (!tbody) return;

    const infoPeriodo = obtenerInfoPeriodoSeguimiento();
    const filtroPeriodoEl = document.getElementById('filtro-periodo-ocasionales');
    const filtroPeriodo = filtroPeriodoEl ? filtroPeriodoEl.value : 'periodo';
    const buscarTermino = (document.getElementById('buscar-donante-ocasional')?.value || '').toLowerCase().trim();

    const donantesOcasionales = store.globalDonantes.filter(d => (d && d.periodicidad || '').trim().toLowerCase() === 'ocasional');

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
        const todasDonaciones = store.globalDonaciones.filter(d => d && d.donante_id === donante.id);
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

        const montoPeriodoCOP = donacionesPeriodo.reduce((sum, d) => sum + normalizarACOP(d.monto, d.moneda_aporte, store.tasasCambio), 0);
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
    if (kpiMontoOca) kpiMontoOca.innerText = formatearMoneda(totalRecaudadoOcasionalesCOP, store.monedaActual, store.tasasCambio, store.locMoneda);

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
            <td class="px-6 py-4 font-bold text-slate-700">${formatearMoneda(d.montoPeriodoCOP, store.monedaActual, store.tasasCambio, store.locMoneda)}</td>
            <td class="px-6 py-4 text-xs font-medium text-slate-600">${escaparHTML(d.ultimaDonacion)}</td>
            <td class="px-6 py-4 text-right space-x-2">
                ${linkWhatsApp !== '#' ? `
                    <a href="${escaparHTML(linkWhatsApp)}" target="_blank" rel="noopener noreferrer" class="inline-block p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-colors shadow-sm" title="Contactar por WhatsApp">
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

export function exportarInformeSeguimiento() {
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
        { Concepto: `Total Recaudado (${store.monedaActual})`, Valor: formatearMoneda(metricas.totalMontoRecaudadoCOP, store.monedaActual, store.tasasCambio, store.locMoneda) }
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

    const ocasionales = store.globalDonantes
        .filter(d => (d && d.periodicidad || '').trim().toLowerCase() === 'ocasional')
        .map(d => {
            const donacionesEnRango = store.globalDonaciones.filter(x =>
                x &&
                x.donante_id === d.id &&
                x.fecha &&
                x.fecha >= infoPeriodo.inicioStr &&
                x.fecha <= infoPeriodo.finStr
            );
            const montoCOP = donacionesEnRango.reduce((sum, x) => sum + normalizarACOP(x.monto, x.moneda_aporte, store.tasasCambio), 0);
            return {
                Nombre: d.nombre,
                Documento: d.documento || '',
                Telefono: d.telefono || '',
                Correo: d.correo || '',
                Aportes_En_Periodo: donacionesEnRango.length,
                Monto_Periodo_COP: montoCOP
            };
        });

    const XLSX = window.XLSX;
    if (!XLSX) {
        mostrarNotificacion('alerta', 'Exportación no disponible', 'La librería Excel (SheetJS) no está cargada.');
        return;
    }

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

export const exportarInformeTrimestral = exportarInformeSeguimiento;
