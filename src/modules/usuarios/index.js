/**
 * Módulo de Gestión de Usuarios y Roles (Panel de Administrador)
 */
import { store } from '../../state/store.js';
import * as usuariosService from '../../services/usuariosService.js';
import { getUsuarioActual, tienePermiso, puedeModificarUsuario } from '../../utils/permissions.js';
import { clasificarErrorSupabase } from '../../utils/supabaseErrors.js';
import { escaparHTML } from '../../utils/formatters.js';
import { mostrarNotificacion } from '../../components/toast.js';
import { cerrarModal } from '../../components/modal.js';

let listaUsuariosGlobal = [];

export function setListaUsuarios(lista) {
    listaUsuariosGlobal = Array.isArray(lista) ? lista : [];
}

export function getListaUsuarios() {
    return listaUsuariosGlobal;
}

export function actualizarUIPerfilUsuario(usuario) {
    if (!usuario) return;

    const nombreEl = document.getElementById('user-profile-name');
    const rolEl = document.getElementById('user-profile-role');
    const avatarEl = document.getElementById('user-avatar-initials');
    const seccionAdmin = document.getElementById('seccion-admin-sidebar');
    const btnNuevoDonante = document.getElementById('btn-nuevo-donante');
    const btnRegistrarDonacion = document.getElementById('btn-registrar-donacion');

    const displayNameEl = document.getElementById('user-display-name');
    const displayDocEl = document.getElementById('user-display-doc');
    const displayRoleEl = document.getElementById('user-display-role');
    const headerNameEl = document.getElementById('header-user-name');
    const headerRoleEl = document.getElementById('header-user-role');
    const headerAvatarEl = document.getElementById('header-avatar-initials');

    const rolCapitalizado = usuario.rol ? (usuario.rol.charAt(0).toUpperCase() + usuario.rol.slice(1)) : 'Operador';
    const partes = (usuario.nombre || 'Usuario').trim().split(/\s+/);
    const iniciales = (((partes[0]?.[0] || '') + (partes[1]?.[0] || '')) || 'U').toUpperCase();

    if (nombreEl) nombreEl.innerText = usuario.nombre || 'Usuario';
    if (rolEl) rolEl.innerText = rolCapitalizado;
    if (avatarEl) avatarEl.innerText = iniciales;

    if (displayNameEl) displayNameEl.innerText = usuario.nombre || 'Usuario';
    if (displayDocEl) displayDocEl.innerText = `Doc: ${usuario.documento || '---'}`;
    if (displayRoleEl) displayRoleEl.innerText = rolCapitalizado;

    if (headerNameEl) headerNameEl.innerText = usuario.nombre || 'Usuario';
    if (headerRoleEl) headerRoleEl.innerText = (usuario.rol || 'operador').toUpperCase();
    if (headerAvatarEl) headerAvatarEl.innerText = iniciales;

    if (seccionAdmin) {
        if (usuario.rol === 'admin') {
            seccionAdmin.classList.remove('hidden');
        } else {
            seccionAdmin.classList.add('hidden');
        }
    }

    if (btnNuevoDonante) {
        if (tienePermiso('crear_donantes')) {
            btnNuevoDonante.classList.remove('hidden');
        } else {
            btnNuevoDonante.classList.add('hidden');
        }
    }
    if (btnRegistrarDonacion) {
        if (tienePermiso('crear_donaciones')) {
            btnRegistrarDonacion.classList.remove('hidden');
        } else {
            btnRegistrarDonacion.classList.add('hidden');
        }
    }
}

export async function cargarYRenderizarUsuarios() {
    if (!tienePermiso('administrar_usuarios')) {
        mostrarNotificacion('peligro', 'Acceso Restringido', 'Solo los administradores pueden gestionar usuarios.');
        return;
    }

    const tbody = document.getElementById('tbody-usuarios');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-slate-400 font-medium"><i class="fa-solid fa-circle-notch fa-spin text-xl text-blue-500 mb-2 block"></i> Cargando usuarios...</td></tr>`;
    }

    try {
        const respuesta = await usuariosService.listarUsuarios();
        const data = Array.isArray(respuesta) ? respuesta : (respuesta?.data || []);
        const error = Array.isArray(respuesta) ? null : respuesta?.error;
        if (error) {
            const errInfo = clasificarErrorSupabase(error);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-rose-500 font-medium"><i class="fa-solid fa-circle-exclamation text-xl mb-2 block"></i> ${escaparHTML(errInfo.mensaje)}</td></tr>`;
            }
            return;
        }

        listaUsuariosGlobal = Array.isArray(data) ? data : [];
        filtrarTablaUsuarios();
    } catch (err) {
        console.error('Error al listar usuarios:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-rose-500 font-medium">Error inesperado al cargar la lista de usuarios.</td></tr>`;
        }
    }
}

export function filtrarTablaUsuarios() {
    const tbody = document.getElementById('tbody-usuarios');
    if (!tbody) return;

    const busquedaInput = document.getElementById('filtro-usuarios-busqueda');
    const rolSelect = document.getElementById('filtro-usuarios-rol');
    const estadoSelect = document.getElementById('filtro-usuarios-estado');

    const busqueda = (busquedaInput?.value || '').trim().toLowerCase();
    const rolFiltro = (rolSelect?.value || '').trim();
    const estadoFiltro = (estadoSelect?.value || '').trim();

    const filtrados = listaUsuariosGlobal.filter(u => {
        const matchBusqueda = !busqueda ||
            (u.nombre && u.nombre.toLowerCase().includes(busqueda)) ||
            (u.documento && u.documento.toLowerCase().includes(busqueda));

        const matchRol = !rolFiltro || u.rol === rolFiltro;
        const matchEstado = !estadoFiltro ||
            (estadoFiltro === 'activo' && u.activo === true) ||
            (estadoFiltro === 'inactivo' && u.activo === false);

        return matchBusqueda && matchRol && matchEstado;
    });

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-slate-400 font-medium">No se encontraron usuarios con los criterios indicados.</td></tr>`;
        return;
    }

    const usuarioSesion = getUsuarioActual();

    tbody.innerHTML = filtrados.map(u => {
        const idSeguro = escaparHTML(u.id);
        const nombreSeguro = escaparHTML(u.nombre || 'Sin nombre');
        const docSeguro = escaparHTML(u.documento || '-');
        const fechaReg = u.created_at ? new Date(u.created_at).toLocaleDateString() : '-';

        let badgeRol = '';
        if (u.rol === 'admin') {
            badgeRol = '<span class="bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm">Administrador</span>';
        } else if (u.rol === 'operador') {
            badgeRol = '<span class="bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm">Operador</span>';
        } else {
            badgeRol = '<span class="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm">Lector</span>';
        }

        let badgeEstado = '';
        if (u.activo) {
            badgeEstado = '<span class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Activo</span>';
        } else {
            badgeEstado = '<span class="inline-flex items-center gap-1 bg-rose-100 text-rose-700 px-2.5 py-1 rounded-full text-xs font-bold"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Inactivo</span>';
        }

        const esMismoUsuario = usuarioSesion && usuarioSesion.id === u.id;
        const checkJerarquia = puedeModificarUsuario(usuarioSesion, u);
        const jerarquiaPermitida = checkJerarquia.permitido;

        let btnCambiarRol = '';
        let btnCambiarPassword = '';
        let btnToggleEstado = '';

        if (!jerarquiaPermitida) {
            btnCambiarRol = `
                <button type="button" disabled class="ui-icon-btn opacity-30 cursor-not-allowed text-slate-300" title="Acceso Denegado: No tienes permisos para modificar el rol de un administrador de mayor o igual jerarquía." aria-label="Cambiar rol no permitido">
                    <i class="fa-solid fa-shield-halved"></i>
                </button>
            `;
            btnCambiarPassword = `
                <button type="button" disabled class="ui-icon-btn warn opacity-30 cursor-not-allowed text-slate-300" title="Acceso Denegado: No tienes permisos para modificar a un administrador de mayor o igual jerarquía." aria-label="Restablecer contraseña no permitido">
                    <i class="fa-solid fa-key"></i>
                </button>
            `;
            btnToggleEstado = `
                <button type="button" disabled class="ui-icon-btn opacity-30 cursor-not-allowed text-slate-300" title="Acceso Denegado: No tienes permisos para desactivar a un administrador de mayor o igual jerarquía." aria-label="Modificar estado no permitido">
                    <i class="fa-solid fa-user-lock"></i>
                </button>
            `;
        } else {
            btnCambiarRol = `
                <button type="button" onclick="abrirModalCambiarRol('${idSeguro}', '${nombreSeguro}', '${docSeguro}', '${u.rol}')" class="ui-icon-btn" title="Cambiar Rol" aria-label="Cambiar rol">
                    <i class="fa-solid fa-shield-halved"></i>
                </button>
            `;
            btnCambiarPassword = `
                <button type="button" onclick="abrirModalCambiarPassword('${idSeguro}', '${nombreSeguro}', '${docSeguro}')" class="ui-icon-btn warn" title="Restablecer Contraseña" aria-label="Restablecer contraseña">
                    <i class="fa-solid fa-key"></i>
                </button>
            `;
            if (u.activo) {
                btnToggleEstado = `<button type="button" onclick="alternarEstadoUsuario('${idSeguro}', true, '${nombreSeguro}')" class="ui-icon-btn danger" title="Desactivar usuario" aria-label="Desactivar usuario"><i class="fa-solid fa-user-slash"></i></button>`;
            } else {
                btnToggleEstado = `<button type="button" onclick="alternarEstadoUsuario('${idSeguro}', false, '${nombreSeguro}')" class="ui-icon-btn" title="Activar usuario" aria-label="Activar usuario"><i class="fa-solid fa-user-check"></i></button>`;
            }
        }

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                <td class="px-6 py-4" data-label="Usuario">
                    <div class="font-bold text-slate-800">${nombreSeguro}</div>
                    ${esMismoUsuario ? '<span class="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full">Tu cuenta actual</span>' : ''}
                </td>
                <td class="px-6 py-4 font-mono text-sm text-slate-600" data-label="Documento">${docSeguro}</td>
                <td class="px-6 py-4" data-label="Rol">${badgeRol}</td>
                <td class="px-6 py-4" data-label="Estado">${badgeEstado}</td>
                <td class="px-6 py-4 text-xs text-slate-500" data-label="Registrado">${fechaReg}</td>
                <td class="px-6 py-4 text-right space-x-1" data-label="Acciones">
                    ${btnCambiarRol}
                    ${btnCambiarPassword}
                    ${btnToggleEstado}
                </td>
            </tr>
        `;
    }).join('');
}

export function abrirModalNuevoUsuario() {
    if (!tienePermiso('administrar_usuarios')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'No tienes autorización para crear usuarios.');
        return;
    }
    const form = document.getElementById('form-usuario');
    if (form) form.reset();
    const modal = document.getElementById('modal-usuario');
    if (modal) modal.classList.remove('hidden');
    const inputNombre = document.getElementById('usuario-nombre');
    if (inputNombre) inputNombre.focus();
}

export async function guardarUsuario() {
    if (!tienePermiso('administrar_usuarios')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'No tienes autorización para registrar usuarios.');
        return;
    }

    const inputNombre = document.getElementById('usuario-nombre');
    const inputDoc = document.getElementById('usuario-documento');
    const inputPwd = document.getElementById('usuario-password');
    const selectRol = document.getElementById('usuario-rol');
    const btnGuardar = document.getElementById('btn-guardar-usuario');

    const nombre = inputNombre ? inputNombre.value.trim() : '';
    const documento = inputDoc ? inputDoc.value.trim() : '';
    const password = inputPwd ? inputPwd.value : '';
    const rol = selectRol ? selectRol.value : 'operador';

    if (!nombre) {
        mostrarNotificacion('alerta', 'Campo requerido', 'Por favor ingresa el nombre completo del usuario.');
        if (inputNombre) inputNombre.focus();
        return;
    }

    if (!documento) {
        mostrarNotificacion('alerta', 'Campo requerido', 'Por favor ingresa el documento de identidad.');
        if (inputDoc) inputDoc.focus();
        return;
    }

    if (!password || password.length < 6) {
        mostrarNotificacion('alerta', 'Contraseña débil', 'La contraseña inicial debe tener como mínimo 6 caracteres.');
        if (inputPwd) inputPwd.focus();
        return;
    }

    let textoOriginal = '';
    if (btnGuardar) {
        textoOriginal = btnGuardar.innerHTML;
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1.5"></i> Creando usuario...';
    }

    try {
        const { data, error } = await usuariosService.crearUsuario({ nombre, documento, password, rol });
        if (error) {
            const errInfo = clasificarErrorSupabase(error);
            mostrarNotificacion('peligro', errInfo.titulo || 'Error al crear', errInfo.mensaje);
            return;
        }

        cerrarModal('modal-usuario');
        mostrarNotificacion('exito', 'Usuario Creado', `La cuenta para ${nombre} (Doc: ${documento}) ha sido habilitada exitosamente.`);
        await cargarYRenderizarUsuarios();
    } catch (err) {
        console.error('Error inesperado al crear usuario:', err);
        mostrarNotificacion('peligro', 'Error Inesperado', err?.mensaje || err?.message || 'Error al procesar la solicitud.');
    } finally {
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.innerHTML = textoOriginal;
        }
    }
}

export function abrirModalCambiarRol(id, nombre, documento, rolActual) {
    if (!tienePermiso('administrar_usuarios')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Solo administradores pueden modificar roles.');
        return;
    }

    const usuarioSesion = getUsuarioActual();
    const target = listaUsuariosGlobal.find(u => u.id === id);
    const checkJerarquia = puedeModificarUsuario(usuarioSesion, target);
    if (!checkJerarquia.permitido) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Acceso Denegado: No tienes permisos para modificar el rol de un administrador de mayor o igual jerarquía.');
        return;
    }

    const inputId = document.getElementById('cambiar-rol-user-id');
    const nombreEl = document.getElementById('cambiar-rol-user-nombre');
    const docEl = document.getElementById('cambiar-rol-user-doc');
    const selectNuevoRol = document.getElementById('cambiar-rol-nuevo-select');

    if (inputId) inputId.value = id;
    if (nombreEl) nombreEl.innerText = nombre;
    if (docEl) docEl.innerText = `Documento: ${documento}`;
    if (selectNuevoRol) selectNuevoRol.value = rolActual || 'operador';

    const modal = document.getElementById('modal-cambiar-rol');
    if (modal) modal.classList.remove('hidden');
}

export async function confirmarCambiarRol() {
    if (!tienePermiso('administrar_usuarios')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Solo administradores pueden modificar roles.');
        return;
    }

    const inputId = document.getElementById('cambiar-rol-user-id');
    const selectNuevoRol = document.getElementById('cambiar-rol-nuevo-select');
    const btnConfirmar = document.getElementById('btn-confirmar-cambiar-rol');

    const id = inputId ? inputId.value : '';
    const nuevoRol = selectNuevoRol ? selectNuevoRol.value : '';

    if (!id || !nuevoRol) return;

    const usuarioSesion = getUsuarioActual();
    const target = listaUsuariosGlobal.find(u => u.id === id);
    const checkJerarquia = puedeModificarUsuario(usuarioSesion, target);
    if (!checkJerarquia.permitido) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Acceso Denegado: No tienes permisos para modificar el rol de un administrador de mayor o igual jerarquía.');
        cerrarModal('modal-cambiar-rol');
        return;
    }

    let textoOriginal = '';
    if (btnConfirmar) {
        textoOriginal = btnConfirmar.innerHTML;
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1.5"></i> Actualizando...';
    }

    try {
        const { error } = await usuariosService.cambiarRolUsuario(id, nuevoRol);
        if (error) {
            const errInfo = clasificarErrorSupabase(error);
            mostrarNotificacion('peligro', errInfo.titulo || 'Error al cambiar rol', errInfo.mensaje);
            return;
        }

        cerrarModal('modal-cambiar-rol');
        mostrarNotificacion('exito', 'Rol Actualizado', `El rol del usuario ha sido cambiado a ${nuevoRol}.`);
        await cargarYRenderizarUsuarios();
    } catch (err) {
        console.error('Error al cambiar rol:', err);
        mostrarNotificacion('peligro', 'Error Inesperado', 'No se pudo actualizar el rol.');
    } finally {
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = textoOriginal;
        }
    }
}

export function abrirModalCambiarPassword(id, nombre, documento) {
    if (!tienePermiso('administrar_usuarios')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Solo administradores pueden restablecer contraseñas.');
        return;
    }

    const usuarioSesion = getUsuarioActual();
    const target = listaUsuariosGlobal.find(u => u.id === id);
    const checkJerarquia = puedeModificarUsuario(usuarioSesion, target);
    if (!checkJerarquia.permitido) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Acceso Denegado: No tienes permisos para modificar el rol de un administrador de mayor o igual jerarquía.');
        return;
    }

    const inputId = document.getElementById('cambiar-pwd-user-id');
    const nombreEl = document.getElementById('cambiar-pwd-user-nombre');
    const docEl = document.getElementById('cambiar-pwd-user-doc');
    const inputPwd = document.getElementById('cambiar-pwd-nueva');

    if (inputId) inputId.value = id;
    if (nombreEl) nombreEl.innerText = nombre;
    if (docEl) docEl.innerText = `Documento: ${documento}`;
    if (inputPwd) inputPwd.value = '';

    const modal = document.getElementById('modal-cambiar-password');
    if (modal) modal.classList.remove('hidden');
    if (inputPwd) inputPwd.focus();
}

export async function confirmarCambiarPassword() {
    if (!tienePermiso('administrar_usuarios')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Solo administradores pueden restablecer contraseñas.');
        return;
    }

    const inputId = document.getElementById('cambiar-pwd-user-id');
    const inputPwd = document.getElementById('cambiar-pwd-nueva');
    const btnConfirmar = document.getElementById('btn-confirmar-cambiar-pwd');

    const id = inputId ? inputId.value : '';
    const nuevaPassword = inputPwd ? inputPwd.value.trim() : '';

    if (!nuevaPassword || nuevaPassword.length < 6) {
        mostrarNotificacion('alerta', 'Contraseña débil', 'La nueva contraseña debe contener al menos 6 caracteres.');
        if (inputPwd) inputPwd.focus();
        return;
    }

    const usuarioSesion = getUsuarioActual();
    const target = listaUsuariosGlobal.find(u => u.id === id);
    const checkJerarquia = puedeModificarUsuario(usuarioSesion, target);
    if (!checkJerarquia.permitido) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Acceso Denegado: No tienes permisos para modificar el rol de un administrador de mayor o igual jerarquía.');
        cerrarModal('modal-cambiar-password');
        return;
    }

    let textoOriginal = '';
    if (btnConfirmar) {
        textoOriginal = btnConfirmar.innerHTML;
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1.5"></i> Actualizando...';
    }

    try {
        const { error } = await usuariosService.cambiarPasswordUsuario(id, nuevaPassword);
        if (error) {
            const errInfo = clasificarErrorSupabase(error);
            mostrarNotificacion('peligro', errInfo.titulo || 'Error al actualizar', errInfo.mensaje);
            return;
        }

        cerrarModal('modal-cambiar-password');
        mostrarNotificacion('exito', 'Contraseña Actualizada', 'La nueva contraseña ha sido establecida exitosamente.');
    } catch (err) {
        console.error('Error al cambiar contraseña:', err);
        mostrarNotificacion('peligro', 'Error Inesperado', 'No se pudo actualizar la contraseña.');
    } finally {
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = textoOriginal;
        }
    }
}

export function alternarEstadoUsuario(id, estaActivo, nombre) {
    if (!tienePermiso('administrar_usuarios')) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Solo administradores pueden cambiar el estado de usuarios.');
        return;
    }

    const usuarioSesion = getUsuarioActual();
    const target = listaUsuariosGlobal.find(u => u.id === id);
    const checkJerarquia = puedeModificarUsuario(usuarioSesion, target);
    if (!checkJerarquia.permitido) {
        mostrarNotificacion('peligro', 'Acceso Denegado', 'Acceso Denegado: No tienes permisos para modificar el rol de un administrador de mayor o igual jerarquía.');
        return;
    }

    const nuevoEstado = !estaActivo;
    const accion = nuevoEstado ? 'Activar' : 'Desactivar';
    const advertencia = nuevoEstado
        ? `¿Deseas reactivar el acceso de "${nombre}" al CRM?`
        : `¿Estás seguro de desactivar a "${nombre}"? El usuario no podrá iniciar sesión.`;

    mostrarNotificacion(
        nuevoEstado ? 'informacion' : 'peligro',
        `${accion} Usuario`,
        advertencia,
        async () => {
            try {
                const { error } = await usuariosService.cambiarEstadoUsuario(id, nuevoEstado);
                if (error) {
                    const errInfo = clasificarErrorSupabase(error);
                    mostrarNotificacion('peligro', errInfo.titulo || 'Error de estado', errInfo.mensaje);
                    return;
                }

                mostrarNotificacion('exito', 'Estado Actualizado', `La cuenta de ${nombre} ha sido ${nuevoEstado ? 'activada' : 'desactivada'}.`);
                await cargarYRenderizarUsuarios();
            } catch (err) {
                console.error('Error al cambiar estado de usuario:', err);
                mostrarNotificacion('peligro', 'Error Inesperado', 'No se pudo actualizar el estado del usuario.');
            }
        }
    );
}

export function togglePasswordVisibility() {
    toggleVisibilidadPasswordUsuario('input-password', 'icono-password');
}

export function toggleVisibilidadPasswordUsuario(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
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
