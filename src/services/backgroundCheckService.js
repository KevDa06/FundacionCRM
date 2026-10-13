/**
 * Servicio de Verificación en Segundo Plano (Background Check System)
 * Monitorea y marca automáticamente donantes cuya próxima donación esperada sea dentro de 3 días (≤ 3 días)
 * y despacha alertas automáticas al Centro de Notificaciones del sistema.
 */

import { store, agregarNotificacionHistorial } from '../state/store.js';
import { sumarMesesCalendario, obtenerFechaActualLocal, esFechaValida } from '../utils/dates.js';
import { formatearMonedaEstatica } from '../utils/formatters.js';
import { mostrarNotificacion } from '../components/toast.js';

const MESES_POR_PERIODICIDAD = {
    'mensual': 1,
    'bimestral': 2,
    'trimestral': 3,
    'semestral': 6,
    'anual': 12
};

// Intervalo por defecto para revisiones periódicas en segundo plano: 3 minutos (180,000 ms)
const INTERVALO_CHECK_MS = 180000;
let timerVerificacionId = null;

/**
 * Calcula la próxima fecha de donación esperada para un donante específico.
 * Analiza:
 * 1. Recordatorios agendados pendientes (globalRecordatorios)
 * 2. Fechas de ciclo predictivo según periodicidad (Mensual, Trimestral, etc.) desde la última donación
 * 3. Fecha programada explícita en el registro del donante (si existe)
 * 
 * @param {Object} donante - Donante a evaluar
 * @param {Array} donaciones - Historial global de donaciones
 * @param {Array} recordatorios - Historial de recordatorios
 * @returns {Object|null} Información de la alerta si la próxima donación es dentro de 3 días (0 a 3 días), o null
 */
export function calcularProximaDonacionEsperada(donante, donaciones = [], recordatorios = []) {
    if (!donante || donante.estado !== 'Activo') return null;

    const hoy = new Date();
    const fechaHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);

    const candidatos = [];

    // --- FUENTE 1: Recordatorios de donación agendados pendientes ---
    const recsDonante = (recordatorios || []).filter(r => 
        r && 
        (r.donante_id === donante.id || String(r.donante_id).toLowerCase() === String(donante.id).toLowerCase()) &&
        r.estado_recordatorio !== 'Gestionado' &&
        r.fecha_recordatorio
    );

    recsDonante.forEach(r => {
        const strFecha = String(r.fecha_recordatorio).trim().split('T')[0].split(' ')[0];
        let fRec = null;
        if (strFecha.includes('-')) {
            const parts = strFecha.split('-');
            if (parts.length >= 3) {
                fRec = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 0, 0, 0, 0);
            }
        }
        if (fRec && !isNaN(fRec.getTime())) {
            const diffMs = fRec.getTime() - fechaHoy.getTime();
            const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
            // Considerar si cae en el umbral de los próximos 3 días (0 = hoy, 1 = mañana, 2, 3)
            if (diffDias >= 0 && diffDias <= 3) {
                candidatos.push({
                    diasFaltantes: diffDias,
                    fechaEsperada: fRec,
                    fechaEsperadaStr: strFecha,
                    origen: 'recordatorio',
                    motivo: r.nota_recordatorio || r.nota || 'Recordatorio de agenda programado',
                    montoEstimado: parseFloat(r.monto_recordatorio || r.monto || 0),
                    monedaEstimada: r.moneda_aporte || 'COP'
                });
            }
        }
    });

    // --- FUENTE 2: Fecha programada explícita en donante (proxima_donacion) ---
    if (donante.proxima_donacion && esFechaValida(donante.proxima_donacion)) {
        const parts = donante.proxima_donacion.split('-');
        const fProg = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 0, 0, 0, 0);
        if (!isNaN(fProg.getTime())) {
            const diffMs = fProg.getTime() - fechaHoy.getTime();
            const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
            if (diffDias >= 0 && diffDias <= 3) {
                candidatos.push({
                    diasFaltantes: diffDias,
                    fechaEsperada: fProg,
                    fechaEsperadaStr: donante.proxima_donacion,
                    origen: 'programada',
                    motivo: 'Fecha programada de aporte',
                    montoEstimado: parseFloat(donante.monto_habitual || 0),
                    monedaEstimada: 'COP'
                });
            }
        }
    }

    // --- FUENTE 3: Ciclo recurrente según periodicidad y última donación ---
    const periodicidadKey = (donante.periodicidad || '').trim().toLowerCase();
    const mesesCiclo = MESES_POR_PERIODICIDAD[periodicidadKey];

    if (mesesCiclo) {
        // Obtener la donación más reciente del donante o fecha de registro
        const donDonante = (donaciones || []).filter(d => d && d.donante_id === donante.id);
        let ultimaFechaStr = donante.fecha_registro || null;
        let montoUltimo = 0;
        let monedaUltima = 'COP';

        if (donDonante.length > 0) {
            donDonante.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
            ultimaFechaStr = donDonante[0].fecha;
            montoUltimo = parseFloat(donDonante[0].monto || 0);
            monedaUltima = donDonante[0].moneda_aporte || 'COP';
        }

        if (ultimaFechaStr) {
            const soloFecha = String(ultimaFechaStr).split('T')[0];
            const parts = soloFecha.split('-');
            if (parts.length >= 3) {
                const anio = parseInt(parts[0], 10);
                const mes = parseInt(parts[1], 10) - 1;
                const dia = parseInt(parts[2], 10);

                let fechaCiclo = sumarMesesCalendario(anio, mes, dia, mesesCiclo);
                
                // Si la fecha calculada quedó en el pasado, avanzar ciclos hasta el próximo ciclo esperado
                // para proyectar cuándo corresponde la siguiente donación recurrente
                let iteraciones = 0;
                while (fechaCiclo.getTime() < fechaHoy.getTime() && iteraciones < 24) {
                    fechaCiclo = sumarMesesCalendario(
                        fechaCiclo.getFullYear(),
                        fechaCiclo.getMonth(),
                        fechaCiclo.getDate(),
                        mesesCiclo
                    );
                    iteraciones++;
                }

                const diffMs = fechaCiclo.getTime() - fechaHoy.getTime();
                const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

                if (diffDias >= 0 && diffDias <= 3) {
                    const y = fechaCiclo.getFullYear();
                    const m = String(fechaCiclo.getMonth() + 1).padStart(2, '0');
                    const d = String(fechaCiclo.getDate()).padStart(2, '0');
                    candidatos.push({
                        diasFaltantes: diffDias,
                        fechaEsperada: fechaCiclo,
                        fechaEsperadaStr: `${y}-${m}-${d}`,
                        origen: 'ciclo_recurrente',
                        motivo: `Ciclo ${donante.periodicidad} de donación`,
                        montoEstimado: montoUltimo,
                        monedaEstimada: monedaUltima
                    });
                }
            }
        }
    }

    if (candidatos.length === 0) return null;

    // Tomar el candidato más inminente (menor diasFaltantes)
    candidatos.sort((a, b) => a.diasFaltantes - b.diasFaltantes);
    const masInminente = candidatos[0];

    return {
        activa: true,
        donanteId: donante.id,
        nombre: donante.nombre,
        documento: donante.documento,
        telefono: donante.telefono || '',
        correo: donante.correo || '',
        periodicidad: donante.periodicidad || 'Recurrente',
        diasFaltantes: masInminente.diasFaltantes,
        fechaEsperada: masInminente.fechaEsperada,
        fechaEsperadaStr: masInminente.fechaEsperadaStr,
        origen: masInminente.origen,
        motivo: masInminente.motivo,
        montoEstimado: masInminente.montoEstimado,
        monedaEstimada: masInminente.monedaEstimada
    };
}

/**
 * Ejecuta la verificación en segundo plano sobre todos los donantes de la base de datos.
 * Marca (flags) los donantes en el estado y genera las alertas en el Centro de Notificaciones.
 * 
 * @param {Object} opciones
 * @param {boolean} opciones.notificarToast - Si es true, emite un toast flotante en pantalla para donantes nuevos detectados
 * @param {boolean} opciones.silencioso - Si es true, solo actualiza flags e historial sin toasts
 * @returns {Object} Resumen de la verificación { totalVerificados, flaggedCount, donantesFlagged, alertasEnviadas }
 */
export function ejecutarVerificacionSegundoPlano(opciones = {}) {
    const { globalDonantes, globalDonaciones, globalRecordatorios } = store;
    if (!Array.isArray(globalDonantes) || globalDonantes.length === 0) {
        return { totalVerificados: 0, flaggedCount: 0, donantesFlagged: [], alertasEnviadas: 0 };
    }

    const donantesFlagged = [];
    let nuevasAlertasCount = 0;

    // Asegurar estructura del historial de notificaciones
    if (!Array.isArray(store.notificacionesRecientes)) {
        store.notificacionesRecientes = [];
    }

    globalDonantes.forEach(donante => {
        if (!donante) return;

        const infoAlerta = calcularProximaDonacionEsperada(donante, globalDonaciones, globalRecordatorios);

        if (infoAlerta) {
            // Flagging automático en el objeto donante en memoria
            donante._flagProximaDonacion = infoAlerta;
            donantesFlagged.push({
                donante,
                info: infoAlerta
            });

            // Idempotencia y deduplicación: verificar si ya existe una alerta activa para este donante y fecha esperada
            const alertaId = `alerta-prox-don-${donante.id}-${infoAlerta.fechaEsperadaStr}`;
            const yaRegistrada = store.notificacionesRecientes.some(n => n.id === alertaId);

            if (!yaRegistrada) {
                const diasTexto = infoAlerta.diasFaltantes === 0 
                    ? 'HOY' 
                    : infoAlerta.diasFaltantes === 1 
                        ? 'mañana' 
                        : `en ${infoAlerta.diasFaltantes} días`;

                const tituloNotif = infoAlerta.diasFaltantes === 0
                    ? `⚡ ¡Donación esperada HOY!: ${donante.nombre}`
                    : `⚡ Donación próxima en ${infoAlerta.diasFaltantes} días: ${donante.nombre}`;

                let textoMonto = '';
                if (infoAlerta.montoEstimado > 0) {
                    textoMonto = ` por ${formatearMonedaEstatica(infoAlerta.montoEstimado, infoAlerta.monedaEstimada || 'COP')}`;
                }

                const mensajeNotif = `${donante.nombre} (${donante.periodicidad || 'Recurrente'}) tiene programada su próxima contribución${textoMonto} para ${diasTexto} (${infoAlerta.fechaEsperadaStr}). Teléfono: ${donante.telefono || 'Sin teléfono'}.`;

                const nuevaNotificacion = {
                    id: alertaId,
                    tipo: 'alerta',
                    titulo: tituloNotif,
                    mensaje: mensajeNotif,
                    fecha: new Date().toISOString(),
                    categoria: 'proxima_donacion',
                    donante_id: donante.id,
                    donante_nombre: donante.nombre,
                    telefono: donante.telefono,
                    diasFaltantes: infoAlerta.diasFaltantes,
                    fechaEsperada: infoAlerta.fechaEsperadaStr,
                    leida: false
                };

                // Despachar al Centro de Notificaciones
                agregarNotificacionHistorial(nuevaNotificacion);
                nuevasAlertasCount++;

                // Opcional: mostrar toast no bloqueante si no es modo silencioso
                if (opciones.notificarToast) {
                    mostrarNotificacion('alerta', tituloNotif, mensajeNotif, {
                        duracion: 6000
                    });
                }
            }
        } else {
            // Limpiar flag si ya no aplica (ej. se registró la donación y el ciclo avanzó)
            donante._flagProximaDonacion = null;
        }
    });

    // Guardar referencia en el almacén de estado para acceso rápido
    store.donantesFlagProxima = donantesFlagged;

    // Actualizar badge del header si hay elementos y existe el DOM
    if (typeof document !== 'undefined') {
        const badgeHeader = document.getElementById('badge-resumen-header');
        if (badgeHeader) {
            const totalAlertas = (store.notificacionesRecientes || []).filter(n => !n.leida).length;
            if (totalAlertas > 0) {
                badgeHeader.innerText = totalAlertas > 99 ? '99+' : totalAlertas;
                badgeHeader.classList.remove('hidden');
            }
        }
    }

    return {
        totalVerificados: globalDonantes.length,
        flaggedCount: donantesFlagged.length,
        donantesFlagged,
        alertasEnviadas: nuevasAlertasCount
    };
}

/**
 * Retorna todos los donantes actualmente marcados con donación próxima dentro de 3 días,
 * ordenados por urgencia de proximidad (0 días primero, luego 1, 2, 3 días).
 */
export function obtenerDonantesFlaggedProximaDonacion() {
    const { globalDonantes } = store;
    if (!Array.isArray(globalDonantes)) return [];

    return globalDonantes
        .filter(d => d && d._flagProximaDonacion && d._flagProximaDonacion.activa)
        .map(d => ({
            ...d,
            flagInfo: d._flagProximaDonacion
        }))
        .sort((a, b) => a.flagInfo.diasFaltantes - b.flagInfo.diasFaltantes);
}

/**
 * Inicializa el sistema de chequeo en segundo plano con temporizador autónomo
 * y detección de cambio de visibilidad de pestaña.
 * 
 * @param {number} intervaloMs - Intervalo en milisegundos entre chequeos (default: 3 min)
 */
export function iniciarSistemaVerificacionSegundoPlano(intervaloMs = INTERVALO_CHECK_MS) {
    // Evitar temporizadores duplicados
    if (timerVerificacionId) {
        clearInterval(timerVerificacionId);
        timerVerificacionId = null;
    }

    // 1. Ejecución inicial inmediata
    ejecutarVerificacionSegundoPlano({ notificarToast: false });

    // 2. Temporizador cíclico autónomo en segundo plano
    timerVerificacionId = setInterval(() => {
        ejecutarVerificacionSegundoPlano({ notificarToast: true });
    }, intervaloMs);

    // 3. Chequeo proactivo cuando el usuario vuelve a enfocar la aplicación
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                ejecutarVerificacionSegundoPlano({ notificarToast: false });
            }
        });
    }
}

/**
 * Detiene el temporizador de verificación en segundo plano
 */
export function detenerSistemaVerificacionSegundoPlano() {
    if (timerVerificacionId) {
        clearInterval(timerVerificacionId);
        timerVerificacionId = null;
    }
}
