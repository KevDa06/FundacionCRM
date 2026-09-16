/**
 * Componente de Paginación visual y utilidades de cálculo de páginas
 */

export function calcularPaginacion(totalItems, paginaActual = 1, itemsPorPagina = 10) {
    const totalPaginas = Math.max(1, Math.ceil(totalItems / itemsPorPagina));
    const pagina = Math.min(Math.max(1, paginaActual), totalPaginas);
    const inicio = (pagina - 1) * itemsPorPagina;
    const fin = Math.min(inicio + itemsPorPagina, totalItems);

    return {
        paginaActual: pagina,
        totalPaginas,
        inicio,
        fin,
        totalItems,
        tienePrev: pagina > 1,
        tieneNext: pagina < totalPaginas
    };
}
