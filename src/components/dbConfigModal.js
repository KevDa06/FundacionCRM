/**
 * Componente Modal de Configuración y Diagnóstico de Base de Datos
 * Permite al usuario alternar fácilmente entre la Base de Datos Local (Mock)
 * y una instancia de Supabase en la nube con credenciales personalizadas.
 */
import {
    obtenerEstadoConexionActual,
    guardarCredencialesSupabase,
    activarModoLocalMock,
    restablecerConfiguracionDB
} from '../services/supabase.js';

import { mostrarNotificacion } from './toast.js';

export function abrirModalConfigDB() {
    let modal = document.getElementById('modal-config-db');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-config-db';
        modal.className = 'fixed inset-0 z-[270] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in';
        document.body.appendChild(modal);
    }

    const estado = obtenerEstadoConexionActual();

    modal.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 border border-slate-100 relative">
            <div class="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-xl ${estado.isMock ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} flex items-center justify-center text-lg">
                        <i class="fa-solid fa-database"></i>
                    </div>
                    <div>
                        <h3 class="text-base font-bold text-slate-900">Configuración de Base de Datos</h3>
                        <p class="text-xs text-slate-500">Estado de conexión y almacenamiento</p>
                    </div>
                </div>
                <button type="button" onclick="cerrarModalConfigDB()" class="text-slate-400 hover:text-slate-600 p-2 -mr-2 rounded-xl transition-colors">
                    <i class="fa-solid fa-times text-base"></i>
                </button>
            </div>

            <!-- Tarjeta de Estado Actual -->
            <div class="p-4 rounded-2xl ${estado.isMock ? 'bg-amber-50 border border-amber-200 text-amber-900' : 'bg-emerald-50 border border-emerald-200 text-emerald-900'} mb-5">
                <div class="flex items-center space-x-2 font-bold text-xs mb-1">
                    <span class="w-2.5 h-2.5 rounded-full ${estado.isMock ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}"></span>
                    <span>${estado.isMock ? 'Base de Datos Local (Modo Mock Activo)' : 'Conectado a Supabase en la Nube'}</span>
                </div>
                <p class="text-[11px] leading-relaxed opacity-90">
                    ${estado.isMock 
                        ? 'El sistema opera de forma local inmediata con persistencia completa en el navegador. Todos los donantes, aportes y estadísticas están disponibles.' 
                        : `Sincronizando registros en la nube con Supabase URL: <code>${estado.url}</code>`}
                </p>
            </div>

            <!-- Formulario para Conectar Proyecto Supabase Real -->
            <form id="form-config-db" onsubmit="event.preventDefault(); window.guardarConfiguracionSupabaseDesdeUI();" class="space-y-4">
                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">URL DE PROYECTO SUPABASE</label>
                    <input type="url" id="config-db-url" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://tu-id-proyecto.supabase.co" value="${estado.isMock ? '' : (estado.url || '')}">
                    <p class="text-[10px] text-slate-400 mt-1">Formato: https://[id-proyecto].supabase.co</p>
                </div>

                <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">ANON KEY DE SUPABASE</label>
                    <input type="password" id="config-db-key" class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...">
                    <p class="text-[10px] text-slate-400 mt-1">Token de clave anónima pública de Supabase</p>
                </div>

                <div class="pt-2 space-y-2">
                    <button type="submit" id="btn-guardar-config-db" class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center">
                        <i class="fa-solid fa-cloud-arrow-up mr-2"></i> Conectar a Supabase en la Nube
                    </button>
                    
                    ${!estado.isMock ? `
                    <button type="button" onclick="window.activarModoLocalMockDesdeUI();" class="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center">
                        <i class="fa-solid fa-laptop mr-2"></i> Cambiar a Base de Datos Local (Modo Mock)
                    </button>
                    ` : `
                    <button type="button" onclick="window.restablecerDatosLocalesDesdeUI();" class="w-full py-2 px-4 bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold text-xs rounded-xl border border-slate-200 transition-colors flex items-center justify-center">
                        <i class="fa-solid fa-rotate-left mr-2"></i> Restablecer Datos de Ejemplo Iniciales
                    </button>
                    `}
                </div>
            </form>
        </div>
    `;

    modal.classList.remove('hidden');
}

export function cerrarModalConfigDB() {
    const modal = document.getElementById('modal-config-db');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export async function guardarConfiguracionSupabaseDesdeUI() {
    const inputUrl = document.getElementById('config-db-url');
    const inputKey = document.getElementById('config-db-key');
    const btnSubmit = document.getElementById('btn-guardar-config-db');

    const url = inputUrl ? inputUrl.value.trim() : '';
    const key = inputKey ? inputKey.value.trim() : '';

    if (!url || !key) {
        return mostrarNotificacion('alerta', 'Campos Requeridos', 'Por favor ingresa tanto la URL como la Anon Key de tu proyecto Supabase.');
    }

    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Validando conexión...';
    }

    try {
        await guardarCredencialesSupabase(url, key);
    } catch (err) {
        mostrarNotificacion('peligro', 'Error de Credenciales', err.message || 'No se pudo conectar con el proyecto de Supabase indicado.');
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="fa-solid fa-cloud-arrow-up mr-2"></i> Conectar a Supabase en la Nube';
        }
    }
}

export function activarModoLocalMockDesdeUI() {
    activarModoLocalMock();
}

export function restablecerDatosLocalesDesdeUI() {
    try {
        localStorage.removeItem('fundacion_mock_donantes');
        localStorage.removeItem('fundacion_mock_donaciones');
        localStorage.removeItem('fundacion_mock_recordatorios_donacion');
        localStorage.removeItem('fundacion_mock_destinaciones');
        localStorage.removeItem('fundacion_mock_profiles');
        localStorage.removeItem('fundacion_mock_auditoria_operaciones');
        localStorage.removeItem('fundacion_mock_session');
        window.location.reload();
    } catch (e) {
        window.location.reload();
    }
}

// Vinculación en ventana global para accesibilidad desde HTML
if (typeof window !== 'undefined') {
    window.abrirModalConfigDB = abrirModalConfigDB;
    window.cerrarModalConfigDB = cerrarModalConfigDB;
    window.guardarConfiguracionSupabaseDesdeUI = guardarConfiguracionSupabaseDesdeUI;
    window.activarModoLocalMockDesdeUI = activarModoLocalMockDesdeUI;
    window.restablecerDatosLocalesDesdeUI = restablecerDatosLocalesDesdeUI;
}
