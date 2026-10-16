import { supabaseClient } from './supabase.js';

const COLUMNAS_PERMITIDAS_DONANTES = [
    'id',
    'nombre',
    'documento',
    'tipo',
    'fecha_nac',
    'telefono',
    'correo',
    'periodicidad',
    'estado',
    'nota',
    'fecha_registro',
    'created_at'
];

export function sanearDatosDonante(item) {
    if (!item || typeof item !== 'object') return item;
    const saneado = {};
    for (const col of COLUMNAS_PERMITIDAS_DONANTES) {
        if (item[col] !== undefined) saneado[col] = item[col];
    }

    // Regla crucial para PostgreSQL: los documentos vacíos DEBEN ser null, NUNCA string vacío '',
    // ya que en SQL dos strings vacíos violan la restricción UNIQUE, mientras que múltiples NULL son permitidos.
    if (saneado.documento !== undefined) {
        const docStr = saneado.documento !== null ? String(saneado.documento).trim() : '';
        saneado.documento = docStr === '' ? null : docStr;
    }

    if (saneado.nombre !== undefined) {
        const nomStr = saneado.nombre !== null ? String(saneado.nombre).trim() : '';
        saneado.nombre = nomStr === '' ? 'Sin registrar' : nomStr;
    }

    if (saneado.telefono !== undefined && saneado.telefono !== null) {
        saneado.telefono = String(saneado.telefono).trim();
    }

    if (saneado.correo !== undefined && saneado.correo !== null) {
        saneado.correo = String(saneado.correo).trim();
    }

    return saneado;
}

export const listar = () => supabaseClient.from('donantes').select('*');

export const insertar = async (payload) => {
    const esArray = Array.isArray(payload);
    const datosSaneados = esArray ? payload.map(sanearDatosDonante) : sanearDatosDonante(payload);

    if (!esArray) {
        return supabaseClient.from('donantes').insert(datosSaneados).select();
    }

    if (datosSaneados.length === 0) {
        return { data: [], error: null };
    }

    // Intento 1: Inserción en lote directo
    const resBatch = await supabaseClient.from('donantes').insert(datosSaneados).select();
    if (!resBatch.error) {
        return resBatch;
    }

    const errorMsg = String(resBatch.error?.message || resBatch.error?.details || '').toLowerCase();
    const esDuplicado = resBatch.error?.code === '23505' || errorMsg.includes('unique') || errorMsg.includes('duplicate');

    // Si el fallo fue por clave única duplicada, procesar individualmente para que los válidos no se pierdan
    if (esDuplicado) {
        console.warn('Detectado conflicto de clave única en lote de donantes. Recuperando registros válidos fila por fila...');
        const insertados = [];
        const omitidosDuplicados = [];

        for (const item of datosSaneados) {
            try {
                const resIndividual = await supabaseClient.from('donantes').insert(item).select();
                if (!resIndividual.error && resIndividual.data) {
                    insertados.push(Array.isArray(resIndividual.data) ? resIndividual.data[0] : resIndividual.data);
                } else if (resIndividual.error) {
                    const indMsg = String(resIndividual.error.message || '').toLowerCase();
                    if (resIndividual.error.code === '23505' || indMsg.includes('unique')) {
                        omitidosDuplicados.push({ item, motivo: 'Documento ya existente en la base de datos' });
                    } else {
                        console.warn('Error en donante individual:', resIndividual.error);
                    }
                }
            } catch (errInd) {
                console.warn('Excepción al insertar donante individual:', errInd);
            }
        }

        return {
            data: insertados,
            error: insertados.length === 0 && omitidosDuplicados.length > 0 ? resBatch.error : null,
            duplicadosOmitidos: omitidosDuplicados
        };
    }

    return resBatch;
};

export const actualizar = (id, payload) => {
    const saneado = sanearDatosDonante(payload);
    return supabaseClient.from('donantes').update(saneado).eq('id', id);
};

export const eliminar = (id) => supabaseClient.from('donantes').delete().eq('id', id);

export const buscarPorDocumento = (documento) => {
    const docTrim = String(documento || '').trim();
    if (!docTrim) {
        // Si el documento está vacío, no consultar para no coincidir con todos ni causar falsos duplicados
        return Promise.resolve({ data: [], error: null });
    }
    const docEscapado = docTrim.replace(/[%_\\]/g, '\\$&');
    return supabaseClient.from('donantes').select('id, documento, nombre').ilike('documento', docEscapado);
};
