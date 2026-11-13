/**
 * Módulo de Gestión de Destinaciones de Fondos
 * Responsable de la carga, renderizado y administración de las destinaciones del sistema.
 */
import { store } from '../../state/store.js';
import * as destinacionesService from '../../services/destinacionesService.js';
import { tienePermiso } from '../../utils/permissions.js';
import { mostrarNotificacion } from '../../components/toast.js';

export async function cargarDestinaciones() {
    try {
        const { data, error } = await destinacionesService.listar();
        if (error) {
            console.warn('Advertencia al cargar destinaciones:', error);
            return;
        }
        store.globalDestinacionesRegistros = data || [];
        store.globalDestinaciones = (data || []).map(d => d.nombre);
    } catch (err) {
        console.error('Error al cargar destinaciones:', err);
    }
}

export function renderizarDestinaciones() {
    const cont = document.getElementById('contenedor-destinaciones');
    if (!cont) return;
    cont.innerHTML = '';

    const puedeAdminDestinaciones = tienePermiso('administrar_destinaciones');

    store.globalDestinaciones.forEach((d, i) => {
        const item = document.createElement('div');
        item.className = 'flex items-center space-x-2 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full text-sm font-semibold';

        const span = document.createElement('span');
        span.textContent = d;
        item.appendChild(span);

        if (puedeAdminDestinaciones) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'text-slate-400 hover:text-rose-600 transition-colors p-1 leading-none flex items-center justify-center min-w-[24px] min-h-[24px] rounded-full focus-visible:outline-2 focus-visible:outline-rose-500';
            btn.title = 'Eliminar Destinación';
            btn.onclick = () => eliminarDestinacion(i);
            btn.innerHTML = '<i class="fa-solid fa-times text-[10px]"></i>';
            item.appendChild(btn);
        }

        cont.appendChild(item);
    });

    const selF = document.getElementById('donacion-destinacion');
    const selT = document.getElementById('filtro-destinacion-donacion');
    if (selF) {
        selF.innerHTML = '';
        store.globalDestinaciones.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            selF.appendChild(opt);
        });
    }
    if (selT) {
        selT.innerHTML = '<option value="">Cualquier Destinación</option><option value="incompletas">⚠️ Con campos faltantes</option>';
        store.globalDestinaciones.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            selT.appendChild(opt);
        });
    }
}

export async function agregarDestinacion() {
    if (!tienePermiso('administrar_destinaciones')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Tu rol no tiene autorización para agregar destinaciones.');
        return;
    }
    const input = document.getElementById('nueva-destinacion');
    if (!input) return;
    const val = input.value.trim();

    if (!val) return;
    if (store.globalDestinaciones.some(d => d.localeCompare(val, 'es', { sensitivity: 'base' }) === 0)) {
        return mostrarNotificacion('alerta', 'Destinación existente', 'Ya existe una destinación con ese nombre.');
    }

    const { error } = await destinacionesService.crear(val);
    if (error) {
        return mostrarNotificacion('peligro', error.titulo || 'No se pudo guardar', error.mensaje || 'No fue posible guardar la destinación.');
    }

    input.value = '';
    await cargarDestinaciones();
    renderizarDestinaciones();
}

export async function eliminarDestinacion(i) {
    if (!tienePermiso('administrar_destinaciones')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Tu rol no tiene autorización para eliminar destinaciones.');
        return;
    }
    if (store.globalDestinaciones.length <= 1) {
        return mostrarNotificacion('alerta', 'No permitido', 'El sistema debe mantener como mínimo 1 destinación activa.');
    }

    const registro = store.globalDestinacionesRegistros[i];
    if (!registro) {
        return mostrarNotificacion('alerta', 'Migración pendiente', 'Aplica la migración de Supabase para administrar las destinaciones compartidas.');
    }

    const { error } = await destinacionesService.eliminar(registro.id);
    if (error) {
        return mostrarNotificacion('peligro', error.titulo || 'No se pudo eliminar', error.mensaje || 'No fue posible eliminar la destinación.');
    }

    await cargarDestinaciones();
    renderizarDestinaciones();
}
