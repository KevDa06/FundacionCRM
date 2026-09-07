-- ==============================================================================
-- FIX AUTH IDENTITIES PARA SUPABASE AUTH (GoTrue)
-- Fecha: 2026-09-07
-- Descripción:
-- 1. Actualiza public.admin_crear_usuario para insertar en auth.identities.
-- 2. Repara usuarios existentes en auth.users que no tengan identidad vinculada.
-- ==============================================================================

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
    v_calling_user_id uuid;
BEGIN
    -- 1. Control estricto de permisos
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
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(documento) = v_doc) THEN
        RAISE EXCEPTION 'Ya existe un usuario registrado con el documento %.', v_doc;
    END IF;

    -- 4. Construir email interno determinístico
    v_email := v_doc || '@auth.fundacion.local';

    -- 5. Verificar si el email ya está en auth.users
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(v_email)) THEN
        -- Si existe en auth.users pero no tenía documento en profiles, vincular y actualizar contraseña
        SELECT id INTO v_new_id FROM auth.users WHERE lower(email) = lower(v_email);
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
            updated_at = now()
        WHERE id = v_new_id;
    ELSE
        -- Generar nuevo UUID para auth.users
        v_new_id := gen_random_uuid();

        -- Insertar en auth.users
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
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('nombre', v_nom, 'documento', v_doc),
            now(),
            now(),
            '',
            ''
        );
    END IF;

    -- 5.1 Asegurar identidad en auth.identities para autenticación con contraseña en GoTrue
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
    ) THEN
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

    -- 6. Insertar o actualizar en public.profiles
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

-- REPARAR USUARIOS EXISTENTES QUE NO TENGAN IDENTIDAD EN AUTH.IDENTITIES
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
