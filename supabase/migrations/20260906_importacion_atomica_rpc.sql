-- ==============================================================================
-- MIGRACIÓN: Función RPC transaccional para importación atómica de donaciones
-- Hallazgo: 2.2 — Importación masiva sin transacción/rollback atómico
-- ==============================================================================

-- Esta función recibe un arreglo JSON con las donaciones a importar y las inserta
-- dentro de un bloque de transacción atómico en PostgreSQL.
-- Si TODAS las filas son válidas y consistentes: se realiza COMMIT de todas.
-- Si CUALQUIER fila falla (monto inválido, fecha incorrecta, donante no existe, etc.):
-- se ejecuta un ROLLBACK total automático y NINGUNA donación es insertada.

CREATE OR REPLACE FUNCTION public.importar_donaciones_batch(donaciones_json jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_insertadas integer := 0;
    v_item jsonb;
    v_donante_id uuid;
    v_monto numeric;
    v_moneda text;
    v_fecha date;
    v_medio text;
    v_comprobante text;
    v_destinacion text;
    v_nota text;
    v_fila_num integer := 0;
BEGIN
    -- 1. Validar que el parámetro sea un arreglo JSON
    IF donaciones_json IS NULL OR jsonb_typeof(donaciones_json) <> 'array' THEN
        RAISE EXCEPTION 'El parámetro donaciones_json debe ser un arreglo JSON válido.';
    END IF;

    IF jsonb_array_length(donaciones_json) = 0 THEN
        RETURN jsonb_build_object('success', true, 'insertadas', 0);
    END IF;

    -- 2. Procesar e insertar cada donación en el contexto de la transacción
    FOR v_item IN SELECT * FROM jsonb_array_elements(donaciones_json)
    LOOP
        v_fila_num := v_fila_num + 1;

        -- Extraer valores
        v_donante_id := NULLIF(v_item->>'donante_id', '')::uuid;
        v_monto := NULLIF(v_item->>'monto', '')::numeric;
        v_moneda := COALESCE(NULLIF(v_item->>'moneda_aporte', ''), 'COP');
        v_fecha := NULLIF(v_item->>'fecha', '')::date;
        v_medio := NULLIF(v_item->>'medio', '');
        v_comprobante := COALESCE(NULLIF(v_item->>'comprobante', ''), 'S/N');
        v_destinacion := NULLIF(v_item->>'destinacion', '');
        v_nota := v_item->>'nota';

        -- Validaciones críticas
        IF v_donante_id IS NULL THEN
            RAISE EXCEPTION 'Fila %: El ID del donante es requerido.', v_fila_num;
        END IF;

        IF v_monto IS NULL OR v_monto <= 0 THEN
            RAISE EXCEPTION 'Fila %: El monto debe ser un número positivo.', v_fila_num;
        END IF;

        IF v_fecha IS NULL THEN
            RAISE EXCEPTION 'Fila %: La fecha de donación es requerida y debe ser válida.', v_fila_num;
        END IF;

        IF v_medio IS NULL THEN
            RAISE EXCEPTION 'Fila %: El medio de pago es requerido.', v_fila_num;
        END IF;

        IF v_destinacion IS NULL THEN
            RAISE EXCEPTION 'Fila %: La destinación es requerida.', v_fila_num;
        END IF;

        -- Verificar integridad referencial del donante en la base de datos
        IF NOT EXISTS (SELECT 1 FROM public.donantes WHERE id = v_donante_id) THEN
            RAISE EXCEPTION 'Fila %: El donante con ID "%" no existe en la base de datos.', v_fila_num, v_donante_id;
        END IF;

        -- Inserción en la tabla donaciones
        INSERT INTO public.donaciones (
            donante_id,
            monto,
            moneda_aporte,
            fecha,
            medio,
            comprobante,
            destinacion,
            nota
        ) VALUES (
            v_donante_id,
            v_monto,
            v_moneda,
            v_fecha,
            v_medio,
            v_comprobante,
            v_destinacion,
            v_nota
        );

        v_total_insertadas := v_total_insertadas + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'insertadas', v_total_insertadas
    );

EXCEPTION
    WHEN OTHERS THEN
        -- En PL/pgSQL cualquier excepción no capturada revierte automáticamente
        -- todas las operaciones realizadas dentro de la llamada (ROLLBACK atómico)
        RAISE EXCEPTION 'Transacción de importación abortada en fila %: %', v_fila_num, SQLERRM;
END;
$$;

-- Otorgar permisos de ejecución para usuarios autenticados
REVOKE EXECUTE ON FUNCTION public.importar_donaciones_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importar_donaciones_batch(jsonb) TO authenticated;
