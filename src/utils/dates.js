/**
 * Utilidades para fechas de calendario, manipulación sin desfases horarios y cálculos de períodos.
 */

// Devuelve la fecha actual en formato local YYYY-MM-DD
export function obtenerFechaActualLocal() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Valida si un string de fecha es una fecha válida de calendario (YYYY-MM-DD)
export function esFechaValida(fecha) {
    if (!fecha) return false;
    const str = String(fecha).trim().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const parts = str.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);

    if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
    if (y < 1000 || y > 9999) return false;
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;

    const date = new Date(y, m - 1, d, 0, 0, 0, 0);
    return (
        date.getFullYear() === y &&
        date.getMonth() === m - 1 &&
        date.getDate() === d
    );
}

// Determina si una fecha dada es estrictamente posterior a hoy
export function esFechaFutura(fecha) {
    if (!fecha) return false;
    let str = '';
    if (fecha instanceof Date) {
        if (isNaN(fecha.getTime())) return false;
        const y = fecha.getFullYear();
        const m = String(fecha.getMonth() + 1).padStart(2, '0');
        const d = String(fecha.getDate()).padStart(2, '0');
        str = `${y}-${m}-${d}`;
    } else {
        str = String(fecha).trim().split('T')[0];
    }
    if (!str) return false;
    const hoyLocal = obtenerFechaActualLocal();
    return str > hoyLocal;
}

// Calcula los días transcurridos entre una fecha pasada y hoy (a medianoche local)
export function calcularDiasDesdeFecha(fechaStr) {
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

// Suma meses calendario preservando límites de fin de mes
export function sumarMesesCalendario(anio, mes, dia, mesesASumar) {
    const totalMeses = mes + mesesASumar;
    const targetYear = anio + Math.floor(totalMeses / 12);
    const targetMonth = ((totalMeses % 12) + 12) % 12;
    const maxDiasEnMes = new Date(targetYear, targetMonth + 1, 0).getDate();
    const targetDay = Math.min(dia, maxDiasEnMes);
    return new Date(targetYear, targetMonth, targetDay, 0, 0, 0, 0);
}

// Calcula los días que faltan para el próximo cumpleaños
export function calcularDiasProximoCumple(fechaNacStr) {
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

// Año bisiesto de referencia para almacenar fechas de cumpleaños sin año conocido
export const ANIO_CENTINELA_SIN_ANIO = 1904;

// Determina si una fecha corresponde a un cumpleaños registrado sin año (ej. ----01-18 o 1904-01-18)
export function esCumpleSinAnio(fechaNacStr) {
    if (!fechaNacStr) return false;
    const str = String(fechaNacStr).trim();
    if (str.startsWith('----') || str.startsWith('--') || str.startsWith('0000') || str.startsWith('XXXX') || str.startsWith('xxxx')) {
        return true;
    }
    const parts = str.split('-');
    if (parts.length >= 3) {
        const y = parseInt(parts[0], 10);
        if (y === ANIO_CENTINELA_SIN_ANIO || y === 1900 || y === 0) return true;
    }
    return false;
}

// Normaliza fechas de nacimiento de múltiples formatos, incluyendo sin año como "----01-18", "01-18", "18/01", etc.
export function normalizarFechaNacimiento(val) {
    if (!val) return null;
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        const yyyy = val.getFullYear();
        const mm = String(val.getMonth() + 1).padStart(2, '0');
        const dd = String(val.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    const raw = String(val).trim();
    if (!raw) return null;

    // Caso 1: Patrón sin año explícito tipo "----01-18", "--01-18", "-01-18", "XXXX-01-18", "0000-01-18"
    const matchSinAnio = raw.match(/^[-X*?_]{1,6}(\d{1,2})[-/](\d{1,2})$/i);
    if (matchSinAnio) {
        let m = parseInt(matchSinAnio[1], 10);
        let d = parseInt(matchSinAnio[2], 10);
        if (m > 12 && d <= 12) {
            const temp = m;
            m = d;
            d = temp;
        }
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return `${ANIO_CENTINELA_SIN_ANIO}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }

    // Caso 2: Patrón simple "MM-DD" o "MM/DD" (ej. "01-18" o "18-01")
    const matchMesDia = raw.match(/^(\d{1,2})[-/](\d{1,2})$/);
    if (matchMesDia) {
        let n1 = parseInt(matchMesDia[1], 10);
        let n2 = parseInt(matchMesDia[2], 10);
        let m = n1, d = n2;
        if (n1 > 12 && n2 <= 12) {
            d = n1;
            m = n2;
        }
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            return `${ANIO_CENTINELA_SIN_ANIO}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }

    // Caso 3: Formato ISO "YYYY-MM-DD" o "YYYY/MM/DD"
    const matchIso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (matchIso) {
        const y = parseInt(matchIso[1], 10);
        const m = parseInt(matchIso[2], 10);
        const d = parseInt(matchIso[3], 10);
        if (y === 0 || y === 1900 || y === ANIO_CENTINELA_SIN_ANIO) {
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                return `${ANIO_CENTINELA_SIN_ANIO}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            }
        }
        const isoStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (esFechaValida(isoStr) && !esFechaFutura(isoStr)) {
            return isoStr;
        }
    }

    // Caso 4: Formato "DD/MM/YYYY" o "DD-MM-YYYY"
    const matchLatam = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (matchLatam) {
        const d = parseInt(matchLatam[1], 10);
        const m = parseInt(matchLatam[2], 10);
        const y = parseInt(matchLatam[3], 10);
        const isoStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (esFechaValida(isoStr) && !esFechaFutura(isoStr)) {
            return isoStr;
        }
    }

    // Caso 5: Parse estándar fallback
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = parsed.getMonth() + 1;
        const d = parsed.getDate();
        const isoStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (esFechaValida(isoStr) && !esFechaFutura(isoStr)) {
            return isoStr;
        }
    }

    return null;
}

// Calcula la edad que cumplirá en su próximo cumpleaños (ignora fechas sin año conocido)
export function calcularEdadProxima(fechaNacStr) {
    if (!fechaNacStr) return null;
    if (esCumpleSinAnio(fechaNacStr)) return null;

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
    const edad = proxAnio - anioNac;
    return (edad > 0 && edad < 120) ? edad : null;
}

// Formatea la fecha de cumpleaños en formato amigable "15 de Marzo"
export function formatearFechaCumple(fechaNacStr) {
    if (!fechaNacStr) return '-';
    const parts = fechaNacStr.split('-');
    if (parts.length < 3) return fechaNacStr;
    const mesIndex = parseInt(parts[1], 10) - 1;
    const dia = parseInt(parts[2], 10);
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${dia} de ${meses[mesIndex] || parts[1]}`;
}

// Devuelve texto descriptivo de nacimiento con edad o aclaración de sin año
export function formatearFechaNacimientoCompleta(fechaNacStr) {
    if (!fechaNacStr) return 'Sin fecha de nacimiento';
    if (esCumpleSinAnio(fechaNacStr)) {
        return `🎂 ${formatearFechaCumple(fechaNacStr)} (Año no registrado)`;
    }
    let edadStr = '';
    try {
        const nac = new Date(fechaNacStr + 'T00:00:00');
        const hoy = new Date();
        let edad = hoy.getFullYear() - nac.getFullYear();
        const m = hoy.getMonth() - nac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) {
            edad--;
        }
        if (!isNaN(edad) && edad >= 0 && edad <= 120) {
            edadStr = ` (${edad} años)`;
        }
    } catch (_e) { /* ignore */ }
    return `${fechaNacStr}${edadStr}`;
}

// Divide un mes calendario en rangos de semanas
export function obtenerSemanasDelMes(anio, mes) {
    const semanas = [];
    const primerDia = new Date(anio, mes - 1, 1);
    const ultimoDia = new Date(anio, mes, 0);
    const totalDias = ultimoDia.getDate();

    let inicioSemana = 1;
    let numeroSemana = 1;

    while (inicioSemana <= totalDias) {
        const finSemana = Math.min(inicioSemana + 6, totalDias);
        const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-${String(inicioSemana).padStart(2, '0')}`;
        const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-${String(finSemana).padStart(2, '0')}`;

        semanas.push({
            numero: numeroSemana,
            inicio: inicioSemana,
            fin: finSemana,
            fechaInicio,
            fechaFin,
            label: `Semana ${numeroSemana} (${inicioSemana} al ${finSemana})`
        });

        inicioSemana = finSemana + 1;
        numeroSemana++;
    }

    return semanas;
}

// Comprueba si una donación ocurrió dentro de un trimestre específico
export function esDonacionEnTrimestre(fechaStr, anio, trimestre) {
    if (!fechaStr) return false;
    const f = String(fechaStr).split('T')[0];
    const parts = f.split('-');
    if (parts.length < 3) return false;
    const a = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (a !== anio) return false;
    const trimDeMes = Math.ceil(m / 3);
    return trimDeMes === trimestre;
}

// Helper para extraer fecha de registro de auditoría
export function obtenerFechaAuditoria(a) {
    if (!a) return null;
    return a.fecha || a.created_at || a.timestamp || a.fecha_operacion || a.date || null;
}

// Formatea fechas al estándar DD/MM/YYYY hh:mm A
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
