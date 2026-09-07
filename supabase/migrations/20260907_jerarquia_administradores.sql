-- ==============================================================================
-- MIGRACIÓN DE JERARQUÍA ESTRICTA PARA ADMINISTRADORES
-- Regla:
-- Un Administrador NO puede quitarle el rol de admin, modificar la cuenta, ni
-- desactivar a ningún otro Administrador que haya sido creado antes que él
-- o que esté por encima/al mismo nivel jerárquico inicial.
-- ==============================================================================

-- Función SECURITY DEFINER para verificar si el usuario autenticado tiene permisos
-- de jerarquía sobre el perfil objetivo.
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
    v_target_created TIMESTAMPTZ;
BEGIN
    v_current_user_id := auth.uid();
    IF v_current_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Obtener rol y fecha de creación del usuario en sesión
    SELECT rol, created_at INTO v_current_rol, v_current_created
    FROM public.profiles
    WHERE id = v_current_user_id;

    -- Solo un admin puede gestionar perfiles
    IF v_current_rol <> 'admin' THEN
        RETURN FALSE;
    END IF;

    -- Obtener rol y fecha de creación del usuario objetivo
    SELECT rol, created_at INTO v_target_rol, v_target_created
    FROM public.profiles
    WHERE id = target_id;

    -- Si no existe el usuario objetivo
    IF v_target_rol IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Si el usuario objetivo NO es admin, cualquier admin puede gestionarlo
    IF v_target_rol <> 'admin' THEN
        RETURN TRUE;
    END IF;

    -- Si el usuario objetivo ES admin:
    -- 1. No puede modificarse a sí mismo en acciones críticas de rol/estado
    IF v_current_user_id = target_id THEN
        RETURN FALSE;
    END IF;

    -- 2. Cadena de mando por antigüedad: solo puede modificar si el objetivo
    -- fue creado estrictamente después que el usuario actual (created_at)
    IF v_target_created > v_current_created THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.puede_modificar_perfil_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_modificar_perfil_admin(UUID) TO authenticated;

-- Actualizar política RLS en public.profiles para UPDATE y DELETE con validación jerárquica
DROP POLICY IF EXISTS "profiles_update_admin_only" ON public.profiles;
CREATE POLICY "profiles_update_admin_hierarchy" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        public.puede_modificar_perfil_admin(id)
    )
    WITH CHECK (
        public.puede_modificar_perfil_admin(id)
    );

DROP POLICY IF EXISTS "profiles_delete_admin_only" ON public.profiles;
CREATE POLICY "profiles_delete_admin_hierarchy" ON public.profiles
    FOR DELETE TO authenticated
    USING (
        public.puede_modificar_perfil_admin(id)
    );
