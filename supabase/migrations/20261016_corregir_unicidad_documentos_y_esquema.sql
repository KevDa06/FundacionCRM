-- ==============================================================================
-- MIGRACIÓN DE CORRECCIÓN INTEGRAL: UNICIDAD DE DOCUMENTOS Y ESQUEMA
-- Ejecuta este script en el Editor SQL de tu proyecto Supabase.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CORREGIR VALORES VACÍOS EN COLUMNA DOCUMENTO (DONANTES)
-- En PostgreSQL, los strings vacíos '' se consideran idénticos entre sí en un
-- índice UNIQUE, provocando el error "duplicate key violates unique constraint".
-- En cambio, los valores NULL están explícitamente permitidos múltiples veces.
-- ------------------------------------------------------------------------------
UPDATE public.donantes
SET documento = NULL
WHERE documento IS NOT NULL AND TRIM(documento) = '';

-- Asegurar que la columna 'documento' y 'nombre' permitan valores NULL (campos vacíos)
ALTER TABLE public.donantes ALTER COLUMN documento DROP NOT NULL;
DO $$ 
BEGIN
    ALTER TABLE public.donantes ALTER COLUMN nombre DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN 
    NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 2. DESAMBIGUAR REGISTROS DUPLICADOS PREEXISTENTES
-- Si ya existen donantes con el mismo documento en la base de datos, los
-- renombramos ordenadamente para no violar el índice de unicidad que crearemos.
-- ------------------------------------------------------------------------------
WITH duplicados AS (
    SELECT id, documento,
           ROW_NUMBER() OVER (
               PARTITION BY LOWER(TRIM(documento)) 
               ORDER BY created_at ASC NULLS LAST, id ASC
           ) as num_repeticion
    FROM public.donantes
    WHERE documento IS NOT NULL AND TRIM(documento) <> ''
)
UPDATE public.donantes d
SET documento = d.documento || '-dup-' || dup.num_repeticion
FROM duplicados dup
WHERE d.id = dup.id AND dup.num_repeticion > 1;

-- ------------------------------------------------------------------------------
-- 3. ELIMINAR RESTRICCIONES RÍGIDAS DE UNICIDAD
-- Eliminamos cualquier constraint o índice previo que falle con strings vacíos o mayúsculas.
-- ------------------------------------------------------------------------------
ALTER TABLE public.donantes DROP CONSTRAINT IF EXISTS donantes_documentos_unique;
ALTER TABLE public.donantes DROP CONSTRAINT IF EXISTS donantes_documento_key;
ALTER TABLE public.donantes DROP CONSTRAINT IF EXISTS donantes_documento_unique;
DROP INDEX IF EXISTS public.donantes_documentos_unique;
DROP INDEX IF EXISTS public.donantes_documento_key;
DROP INDEX IF EXISTS public.idx_donantes_documento_unique;

-- ------------------------------------------------------------------------------
-- 4. CREAR ÍNDICE DE UNICIDAD PARCIAL (GOLD STANDARD POSTGRESQL)
-- Este índice garantiza:
--   a) Si hay un documento real suministrado, no se admiten duplicados (insensible a mayúsculas/espacios).
--   b) Si el documento está vacío o es NULL, PERMITE importar infinitos registros sin ningún error.
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX idx_donantes_documento_unique 
ON public.donantes (LOWER(TRIM(documento))) 
WHERE documento IS NOT NULL AND TRIM(documento) <> '';

-- ------------------------------------------------------------------------------
-- 5. AGREGAR COLUMNAS OPCIONALES PARA EVITAR ERRORES DE SCHEMA CACHE
-- Corrige el error previo: "could not find the monto_habitual column of donantes in the schema cache"
-- ------------------------------------------------------------------------------
ALTER TABLE public.donantes ADD COLUMN IF NOT EXISTS monto_habitual NUMERIC DEFAULT NULL;
ALTER TABLE public.donantes ADD COLUMN IF NOT EXISTS proxima_donacion DATE DEFAULT NULL;
ALTER TABLE public.donantes ADD COLUMN IF NOT EXISTS fecha_nac DATE DEFAULT NULL;

-- ------------------------------------------------------------------------------
-- 6. FLEXIBILIZAR CAMPOS EN LA TABLA DONACIONES PARA PERMITIR CAMPOS VACÍOS
-- Permite que al importar donaciones con columnas incompletas no se rechace la inserción
-- ------------------------------------------------------------------------------
DO $$ 
BEGIN
    ALTER TABLE public.donaciones ALTER COLUMN comprobante DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE public.donaciones ALTER COLUMN destinacion DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE public.donaciones ALTER COLUMN medio DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE public.donaciones ALTER COLUMN fecha DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE public.donaciones ALTER COLUMN moneda_aporte SET DEFAULT 'COP';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 7. RECARGAR LA CACHÉ DEL ESQUEMA DE POSTGREST / SUPABASE
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
