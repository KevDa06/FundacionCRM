/**
 * Controlador de Modales Genéricos y Gestión de Cambios sin Guardar (Dirty Checking)
 */
import { mostrarNotificacion } from './toast.js';

const estadosInicialesFormularios = {};

export function capturarEstadoInicialFormulario(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const datos = {};
    const elementos = form.querySelectorAll('input, select, textarea');
    elementos.forEach(el => {
        const clave = el.id || el.name;
        if (!clave) return;
        if (el.type === 'checkbox' || el.type === 'radio') {
            datos[clave] = el.checked;
        } else {
            datos[clave] = el.value ?? '';
        }
    });
    estadosInicialesFormularios[formId] = JSON.stringify(datos);
}

export function formularioTieneCambiosSinGuardar(formId) {
    const form = document.getElementById(formId);
    if (!form || !estadosInicialesFormularios[formId]) return false;
    const datosActuales = {};
    const elementos = form.querySelectorAll('input, select, textarea');
    elementos.forEach(el => {
        const clave = el.id || el.name;
        if (!clave) return;
        if (el.type === 'checkbox' || el.type === 'radio') {
            datosActuales[clave] = el.checked;
        } else {
            datosActuales[clave] = el.value ?? '';
        }
    });
    return JSON.stringify(datosActuales) !== estadosInicialesFormularios[formId];
}

export function limpiarEstadoFormulario(formId) {
    if (formId && estadosInicialesFormularios[formId]) {
        delete estadosInicialesFormularios[formId];
    }
}

export function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}

export function cerrarModal(modalId, forzar = false) {
    if (!forzar) {
        if (modalId === 'modal-donante' && formularioTieneCambiosSinGuardar('form-donante')) {
            mostrarNotificacion(
                'alerta',
                'Cambios sin guardar',
                'Tienes cambios sin guardar. ¿Seguro que deseas salir?',
                () => {
                    limpiarEstadoFormulario('form-donante');
                    cerrarModal('modal-donante', true);
                },
                {
                    labelConfirmar: 'Descartar cambios',
                    labelCancelar: 'Continuar editando',
                    btnClassConfirmar: 'bg-rose-600 hover:bg-rose-700 text-white'
                }
            );
            return;
        }
        if (modalId === 'modal-donacion' && formularioTieneCambiosSinGuardar('form-donacion')) {
            mostrarNotificacion(
                'alerta',
                'Cambios sin guardar',
                'Tienes cambios sin guardar. ¿Seguro que deseas salir?',
                () => {
                    limpiarEstadoFormulario('form-donacion');
                    cerrarModal('modal-donacion', true);
                },
                {
                    labelConfirmar: 'Descartar cambios',
                    labelCancelar: 'Continuar editando',
                    btnClassConfirmar: 'bg-rose-600 hover:bg-rose-700 text-white'
                }
            );
            return;
        }
    }

    if (modalId === 'modal-donante') limpiarEstadoFormulario('form-donante');
    if (modalId === 'modal-donacion') limpiarEstadoFormulario('form-donacion');

    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
}
