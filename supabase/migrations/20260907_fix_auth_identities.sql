-- ==============================================================================
-- FIX DEFINITIVO: AUTH IDENTITIES, RLS Y OBTENER_LOGIN_INFO
-- Archivo: supabase/migrations/20260907_fix_auth_identities.sql
-- ==============================================================================

-- 1. FUNCIÓN IS_ADMIN SEGURA Y SIN RECURSIÓN
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
    -- Verificación rápida en JWT
    IF (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin' OR (auth.jwt() -> 'user_metadata' ->> 'rol') = 'admin' THEN
        RETURN true;
    END IF;

    -- Verificación en tabla profiles
    SELECT rol, activo
    INTO v_rol, v_activo
    FROM public.profiles
    WHERE id = auth.uid();

    RETURN (v_rol = 'admin' AND COALESCE(v_activo, true) = true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 2. FUNCIÓN RPC PARA CREACIÓN DE USUARIOS
-- NOTA CRÍTICA DE SEGURIDAD Y HASHING:
-- Para evitar problemas de doble hash o incompatibilidades con el algoritmo bcrypt nativo de GoTrue,
-- la creación oficial de usuarios se realiza a través de la Edge Function 'gestion-usuarios'
-- utilizando `supabase.auth.admin.createUser({ email, password, email_confirm: true, ... })`.
-- La API Admin de Supabase recibe la contraseña en TEXTO PLANO directo y genera internamente el hash nativo.
CREATE OR REPLACE FUNCTION public.admin_crear_usuario(
    p_nombre text,
    p_documento text,
    p_password text,
    p_rol text DEFAULT 'operador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_new_id uuid;
    v_email text;
    v_doc text;
    v_nom text;
    v_rol text := lower(trim(p_rol));
    v_has_provider_id boolean;
BEGIN
    -- 1. Control de permisos: solo administradores
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: Solo un administrador puede registrar nuevos usuarios.';
    END IF;

    -- 2. Normalizaciones y validaciones
    v_doc := lower(regexp_replace(trim(p_documento), '[^a-zA-Z0-9]', '', 'g'));
    v_nom := trim(p_nombre);

    IF v_doc IS NULL OR length(v_doc) < 3 THEN
        RAISE EXCEPTION 'El documento es obligatorio y debe tener al menos 3 caracteres alfanuméricos.';
    END IF;

    IF v_nom IS NULL OR length(v_nom) < 2 THEN
        RAISE EXCEPTION 'El nombre es obligatorio y debe tener al menos 2 caracteres.';
    END IF;

    IF p_password IS NULL OR length(trim(p_password)) < 6 THEN
        RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres.';
    END IF;

    IF v_rol NOT IN ('admin', 'operador', 'lector') THEN
        RAISE EXCEPTION 'Rol no válido. Debe ser admin, operador o lector.';
    END IF;

    -- 3. Verificar unicidad de documento en profiles
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE lower(regexp_replace(COALESCE(documento, ''), '[^a-zA-Z0-9]', '', 'g')) = v_doc
    ) THEN
        RAISE EXCEPTION 'Ya existe un usuario registrado con el documento %.', v_doc;
    END IF;

    -- 4. Construir email interno determinístico
    v_email := v_doc || '@auth.fundacion.local';

    -- 5. Sincronización en auth.users
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(v_email)) THEN
        SELECT id INTO v_new_id FROM auth.users WHERE lower(email) = lower(v_email);
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
            raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'rol', v_rol),
            raw_user_meta_data = jsonb_build_object('nombre', v_nom, 'documento', v_doc, 'rol', v_rol),
            updated_at = now()
        WHERE id = v_new_id;
    ELSE
        v_new_id := gen_random_uuid();

        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_new_id,
            'authenticated',
            'authenticated',
            v_email,
            extensions.crypt(p_password, extensions.gen_salt('bf')),
            now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'rol', v_rol),
            jsonb_build_object('nombre', v_nom, 'documento', v_doc, 'rol', v_rol),
            now(),
            now(),
            '',
            ''
        );
    END IF;

    -- 5.1 Sincronización en auth.identities (GoTrue requiere identidad para login con contraseña)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
    ) INTO v_has_provider_id;

    IF v_has_provider_id THEN
        EXECUTE '
            INSERT INTO auth.identities (
                id,
                user_id,
                identity_data,
                provider,
                provider_id,
                last_sign_in_at,
                created_at,
                updated_at
            ) VALUES (
                $1,
                $2,
                jsonb_build_object(''sub'', $1::text, ''email'', $3),
                ''email'',
                $1::text,
                now(),
                now(),
                now()
            )
            ON CONFLICT DO NOTHING
        ' USING v_new_id, v_new_id, v_email;
    ELSE
        EXECUTE '
            INSERT INTO auth.identities (
                id,
                user_id,
                identity_data,
                provider,
                last_sign_in_at,
                created_at,
                updated_at
            ) VALUES (
                $1,
                $2,
                jsonb_build_object(''sub'', $1::text, ''email'', $3),
                ''email'',
                now(),
                now(),
                now()
            )
            ON CONFLICT DO NOTHING
        ' USING v_new_id, v_new_id, v_email;
    END IF;

    -- 6. Sincronización en public.profiles
    INSERT INTO public.profiles (
        id,
        email,
        documento,
        nombre,
        rol,
        activo,
        created_at,
        updated_at
    ) VALUES (
        v_new_id,
        v_email,
        v_doc,
        v_nom,
        v_rol,
        true,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        documento = EXCLUDED.documento,
        nombre = EXCLUDED.nombre,
        rol = EXCLUDED.rol,
        activo = true,
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'id', v_new_id,
        'documento', v_doc,
        'nombre', v_nom,
        'rol', v_rol,
        'activo', true
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_crear_usuario(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_crear_usuario(text, text, text, text) TO authenticated;

-- 3. ACTUALIZACIÓN DE OBTENER_LOGIN_INFO (Normalización resiliente y case-insensitive)
CREATE OR REPLACE FUNCTION public.obtener_login_info(p_documento text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_raw text := trim(p_documento);
    v_clean text := lower(regexp_replace(trim(p_documento), '[^a-zA-Z0-9]', '', 'g'));
    v_id uuid;
    v_email text;
    v_activo boolean;
    v_nombre text;
    v_rol text;
BEGIN
    IF v_raw IS NULL OR v_raw = '' THEN
        RETURN jsonb_build_object('encontrado', false);
    END IF;

    -- Buscar por documento (limpio, directo o insensible a mayúsculas)
    SELECT id, email, activo, nombre, rol 
    INTO v_id, v_email, v_activo, v_nombre, v_rol
    FROM public.profiles
    WHERE lower(regexp_replace(COALESCE(documento, ''), '[^a-zA-Z0-9]', '', 'g')) = v_clean
       OR lower(trim(COALESCE(documento, ''))) = lower(v_raw)
       OR documento = v_raw
    LIMIT 1;

    -- Si no se encontró, verificar si es admin legacy
    IF v_id IS NULL AND (lower(v_raw) = 'admin' OR lower(v_clean) = 'admin' OR lower(v_raw) = 'admin@fundacion.local') THEN
        SELECT id, email, activo, nombre, rol 
        INTO v_id, v_email, v_activo, v_nombre, v_rol
        FROM public.profiles
        WHERE lower(email) = 'admin@fundacion.local'
        LIMIT 1;
    END IF;

    -- Si aún no se encontró, buscar por email sintético o directo
    IF v_id IS NULL THEN
        SELECT id, email, activo, nombre, rol 
        INTO v_id, v_email, v_activo, v_nombre, v_rol
        FROM public.profiles
        WHERE lower(email) = lower(v_clean || '@auth.fundacion.local')
           OR lower(email) = lower(v_raw)
        LIMIT 1;
    END IF;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object('encontrado', false);
    END IF;

    IF v_activo = false THEN
        RETURN jsonb_build_object(
            'encontrado', true,
            'activo', false,
            'mensaje', 'Usuario desactivado'
        );
    END IF;

    RETURN jsonb_build_object(
        'encontrado', true,
        'activo', true,
        'email', v_email,
        'nombre', v_nombre,
        'rol', v_rol
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obtener_login_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_login_info(text) TO anon, authenticated;

-- 4. POLÍTICAS RLS EN PROFILES (Garantiza que SELECT retorne todos los usuarios para autenticados sin recursión)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

CREATE POLICY "profiles_select_authenticated" ON public.profiles
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "profiles_insert_admin_only" ON public.profiles;
CREATE POLICY "profiles_insert_admin_only" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles_update_admin_only" ON public.profiles;
CREATE POLICY "profiles_update_admin_only" ON public.profiles
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles_delete_admin_only" ON public.profiles;
CREATE POLICY "profiles_delete_admin_only" ON public.profiles
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- 5. VISTA DE COMPATIBILIDAD PUBLIC.USUARIOS
CREATE OR REPLACE VIEW public.usuarios AS 
SELECT * FROM public.profiles;

GRANT SELECT ON public.usuarios TO authenticated;

-- 6. BLOQUE DE REPARACIÓN PARA USUARIOS EXISTENTES EN AUTH.USERS SIN IDENTIDAD
DO $$
DECLARE
    r RECORD;
    v_has_provider_id boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
    ) INTO v_has_provider_id;

    FOR r IN 
        SELECT u.id, u.email 
        FROM auth.users u
        LEFT JOIN auth.identities i ON i.user_id = u.id
        WHERE i.id IS NULL AND u.email LIKE '%@auth.fundacion.local'
    LOOP
        IF v_has_provider_id THEN
            EXECUTE '
                INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
                VALUES ($1, $2, jsonb_build_object(''sub'', $1::text, ''email'', $3), ''email'', $1::text, now(), now(), now())
                ON CONFLICT DO NOTHING
            ' USING r.id, r.id, r.email;
        ELSE
            EXECUTE '
                INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
                VALUES ($1, $2, jsonb_build_object(''sub'', $1::text, ''email'', $3), ''email'', now(), now(), now())
                ON CONFLICT DO NOTHING
            ' USING r.id, r.id, r.email;
        END IF;
    END LOOP;
END $$;
