/**
 * Controlador de Sincronización de Datos y Métricas Globales (FundaciónCRM)
 * Coordina la obtención de registros remotos, mapeo relacional en memoria y refresco de estado.
 */
import { store } from '../state/store.js';
import { STORAGE_KEYS } from '../config/constants.js';
import { supabaseInitError, isMockActive } from '../services/supabase.js';
import * as donantesService from '../services/donantesService.js';
import * as donacionesService from '../services/donacionesService.js';
import * as recordatoriosService from '../services/recordatoriosService.js';
import { mostrarErrorConexionDB, actualizarIndicadorMockUI } from '../components/dbErrorScreen.js';
import { mostrarNotificacion } from '../components/toast.js';
import { clasificarErrorSupabase } from '../utils/supabaseErrors.js';

// Módulos para actualización de UI
import { actualizarKPIs, renderizarGraficos } from '../modules/dashboard/index.js';
import { renderizarTablaDonantes } from '../modules/donantes/index.js';
import { renderizarTablaDonaciones, poblarSelectDonantes } from '../modules/donaciones/index.js';
import { renderizarModuloSeguimiento, renderizarTablaOcasionales } from '../modules/seguimiento/index.js';
import { renderizarModuloCumpleanos } from '../modules/cumpleanos/index.js';
import { renderizarTablaAlertas, cambiarSubTabAlertas } from '../modules/retencion/index.js';
import { getSubTabAlertasActiva } from './navigation.js';

/**
 * Carga todos los datos maestros desde Supabase o el Mock Client local
 */
export async function cargarDatosSupabase() {
    try {
        if (supabaseInitError) {
            mostrarErrorConexionDB({
                titulo: supabaseInitError.message,
                mensaje: 'La aplicación no puede sincronizar datos porque no se detectó una conexión válida con Supabase en producción.',
                detalle: supabaseInitError.details,
                onReintentar: () => window.location.reload()
            });
            return;
        }

        actualizarIndicadorMockUI(isMockActive);

        const statusEl = document.getElementById('status-db');
        if (!isMockActive && statusEl) {
            statusEl.innerText = 'Sincronizando DB...';
        }

        const { data: donantes, error: errDonantes } = await donantesService.listar();
        if (errDonantes) throw errDonantes;
        store.globalDonantes = donantes || [];

        const { data: donaciones, error: errDonaciones } = await donacionesService.listar();
        if (errDonaciones) throw errDonaciones;
        store.globalDonaciones = donaciones || [];

        const { data: recordatorios, error: errRecordatorios } = await recordatoriosService.obtenerRecordatorios();
        if (errRecordatorios) {
            console.warn('Advertencia al cargar recordatorios:', errRecordatorios);
            store.globalRecordatorios = [];
        } else {
            // Asegurar que cada recordatorio tenga vinculada la información de donantes en memoria
            store.globalRecordatorios = (recordatorios || []).map(r => {
                if (!r.donantes && r.donante_id) {
                    const d = (store.globalDonantes || []).find(don => 
                        don.id === r.donante_id || 
                        (don.id && r.donante_id && String(don.id).toLowerCase() === String(r.donante_id).toLowerCase())
                    );
                    if (d) {
                        return {
                            ...r,
                            donantes: {
                                nombre: d.nombre,
                                documento: d.documento,
                                telefono: d.telefono,
                                correo: d.correo
                            }
                        };
                    }
                }
                return r;
            });
        }

        actualizarIndicadorMockUI(isMockActive);

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
        if (tabAlertas && !tabAlertas.classList.contains('hidden')) {
            const subtabActual = store.subTabAlertasActiva || localStorage.getItem(STORAGE_KEYS.SUBTAB_RETENCION) || getSubTabAlertasActiva() || 'alertas';
            cambiarSubTabAlertas(subtabActual);
        }
    } catch (err) {
        console.error('Error al sincronizar Supabase:', err);
        const statusEl = document.getElementById('status-db');
        if (statusEl) {
            statusEl.innerText = 'Error Conexión';
            statusEl.className = 'text-xs font-semibold text-rose-700';
            if (statusEl.previousElementSibling) {
                statusEl.previousElementSibling.className = 'w-2 h-2 rounded-full bg-rose-500';
            }
        }
        const infoError = clasificarErrorSupabase(err);
        mostrarNotificacion('peligro', infoError.titulo, infoError.mensaje);
    }
}

/**
 * Cambia la moneda activa del sistema y regenera cálculos monetarios
 */
export function cambiarMonedaGlobal() {
    const sel = document.getElementById('selector-moneda');
    if (sel) {
        store.monedaActual = sel.value;
    }
    actualizarKPIs();
    renderizarGraficos();
    renderizarTablaDonaciones();
    renderizarModuloSeguimiento();
    renderizarTablaOcasionales();
}
