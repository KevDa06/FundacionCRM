/**
 * Componente y utilidades para Tablas Interactivas
 */
import { renderizarEstadoVacioTabla } from './loading.js';

export { renderizarEstadoVacioTabla };

/**
 * Filtra una lista de objetos por un término de búsqueda en campos especificados.
 */
export function filtrarColeccion(lista, termino, campos = []) {
    if (!Array.isArray(lista)) return [];
    const term = (termino || '').trim().toLowerCase();
    if (!term) return lista;

    return lista.filter(item => {
        if (!item) return false;
        return campos.some(campo => {
            const val = item[campo];
            if (val === null || val === undefined) return false;
            return String(val).toLowerCase().includes(term);
        });
    });
}
