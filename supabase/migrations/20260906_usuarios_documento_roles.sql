-- ==============================================================================
-- MIGRACIÓN DE USUARIOS, DOCUMENTO, ESTADO Y PERMISOS DEFINITIVOS
-- Archivo: supabase/migrations/20260906_usuarios_documento_roles.sql
-- ==============================================================================

-- 1. EXTENSIÓN PGCRYPTO PARA HASHING SEGURO DE CONTRASEÑAS EN POSTGRESQL
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. AGREGAR COLUMNAS A LA TABLA PROFILES
-- documento: identificador único del usuario para login
-- activo: estado de la cuenta (true = Activa, false = Inactiva)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS documento TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

-- Índice único para documento (permite NULL para la cuenta legacy admin@fundacion.local si no tiene documento asignado)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_documento_unique 
ON public.profiles(documento) 
WHERE documento IS NOT NULL;

-- 3. AGREGAR COLUMNAS DE USUARIO A AUDITORIA_OPERACIONES
ALTER TABLE public.auditoria_operaciones ADD COLUMN IF NOT EXISTS usuario_nombre TEXT;
ALTER TABLE public.auditoria_operaciones ADD COLUMN IF NOT EXISTS usuario_documento TEXT;

-- 4. ACTUALIZAR FUNCIONES AUXILIARES DE ROL PARA VERIFICAR ESTADO ACTIVO
-- Un usuario inactivo (activo = false) no tendrá rol activo, bloqueando de raíz cualquier operación RLS
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT rol FROM public.profiles 
    WHERE id = auth.uid() AND activo = true;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 5. ACTUALIZAR TRIGGER DE REGISTRO DE AUDITORÍA CON NOMBRE Y DOCUMENTO
CREATE OR REPLACE FUNCTION public.registrar_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registro_id TEXT;
    v_usuario_email TEXT;
    v_usuario_nombre TEXT;
    v_usuario_documento TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_registro_id := OLD.id::text;
    ELSE
        v_registro_id := NEW.id::text;
    END IF;

    -- Obtener datos del usuario en sesión desde auth.users y public.profiles
    IF auth.uid() IS NOT NULL THEN
        SELECT email INTO v_usuario_email FROM auth.users WHERE id = auth.uid();
        SELECT nombre, documento INTO v_usuario_nombre, v_usuario_documento 
        FROM public.profiles WHERE id = auth.uid();
    ELSE
        v_usuario_email := 'sistema/anónimo';
        v_usuario_nombre := 'Sistema';
        v_usuario_documento := NULL;
    END IF;

    INSERT INTO public.auditoria_operaciones (
        tabla,
        operacion,
        registro_id,
        usuario_id,
        usuario_email,
        usuario_nombre,
        usuario_documento,
        datos_anteriores,
        datos_nuevos
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        v_registro_id,
        auth.uid(),
        v_usuario_email,
        v_usuario_nombre,
        v_usuario_documento,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_auditoria() FROM PUBLIC;

-- 6. ACTUALIZAR POLÍTICAS RLS EN DONANTES Y DONACIONES PARA PERMITIR DELETE A OPERADORES
-- Matriz: admin -> DELETE, operador -> DELETE, lector -> NO DELETE

DROP POLICY IF EXISTS "donantes_delete_admin_only" ON public.donantes;
DROP POLICY IF EXISTS "donantes_delete_admin_operador" ON public.donantes;
CREATE POLICY "donantes_delete_admin_operador" ON public.donantes
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('admin', 'operador'));

DROP POLICY IF EXISTS "donaciones_delete_admin_only" ON public.donaciones;
DROP POLICY IF EXISTS "donaciones_delete_admin_operador" ON public.donaciones;
CREATE POLICY "donaciones_delete_admin_operador" ON public.donaciones
    FOR DELETE TO authenticated
    USING (public.current_user_role() IN ('admin', 'operador'));

-- 7. FUNCIÓN RPC PARA IDENTIFICAR EMAIL DE AUTH POR DOCUMENTO (LOGIN SEGURO)
-- Normaliza el documento, verifica si existe y si está activo sin exponer contraseñas
CREATE OR REPLACE FUNCTION public.obtener_login_info(p_documento text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_doc text := trim(p_documento);
    v_id uuid;
    v_email text;
    v_activo boolean;
    v_nombre text;
    v_rol text;
BEGIN
    IF v_doc IS NULL OR v_doc = '' THEN
        RETURN jsonb_build_object('encontrado', false);
    END IF;

    -- 1. Buscar coincidencia exacta por documento normalizado
    SELECT id, email, activo, nombre, rol 
    INTO v_id, v_email, v_activo, v_nombre, v_rol
    FROM public.profiles
    WHERE documento = v_doc;

    -- 2. Si no se encontró por documento, verificar si es la cuenta admin legacy
    IF v_id IS NULL AND (lower(v_doc) = 'admin' OR lower(v_doc) = 'admin@fundacion.local') THEN
        SELECT id, email, activo, nombre, rol 
        INTO v_id, v_email, v_activo, v_nombre, v_rol
        FROM public.profiles
        WHERE lower(email) = 'admin@fundacion.local';
    END IF;

    -- 3. Si aún no se encontró, verificar si coincide con el formato de email sintético
    IF v_id IS NULL THEN
        SELECT id, email, activo, nombre, rol 
        INTO v_id, v_email, v_activo, v_nombre, v_rol
        FROM public.profiles
        WHERE lower(email) = lower(v_doc || '@auth.fundacion.local');
    END IF;

    -- 4. Si el usuario no existe
    IF v_id IS NULL THEN
        RETURN jsonb_build_object('encontrado', false);
    END IF;

    -- 5. Si el usuario está inactivo
    IF v_activo = false THEN
        RETURN jsonb_build_object(
            'encontrado', true,
            'activo', false,
            'mensaje', 'Usuario desactivado'
        );
    END IF;

    -- 6. Usuario activo encontrado: retorna email interno para Supabase Auth
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

-- 8. FUNCIÓN RPC PARA CREAR USUARIO INDIVIDUAL DE FORMA SEGURA (SOLO ADMIN)
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
    v_doc text := trim(p_documento);
    v_nom text := trim(p_nombre);
    v_email text;
    v_new_id uuid;
    v_rol text := lower(trim(p_rol));
    v_caller_role text;
BEGIN
    -- 1. Control estricto de permisos: solo administradores activos
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: Solo un administrador puede crear usuarios.';
    END IF;

    -- 2. Validaciones de entrada
    IF v_nom IS NULL OR v_nom = '' THEN
        RAISE EXCEPTION 'El nombre del usuario es obligatorio.';
    END IF;

    IF v_doc IS NULL OR v_doc = '' THEN
        RAISE EXCEPTION 'El documento del usuario es obligatorio.';
    END IF;

    IF p_password IS NULL OR length(trim(p_password)) < 6 THEN
        RAISE EXCEPTION 'La contraseña inicial debe tener al menos 6 caracteres.';
    END IF;

    IF v_rol NOT IN ('admin', 'operador', 'lector') THEN
        RAISE EXCEPTION 'El rol especificado no es válido. Debe ser admin, operador o lector.';
    END IF;

    -- 3. Verificar que el documento no esté duplicado en profiles
    IF EXISTS (SELECT 1 FROM public.profiles WHERE documento = v_doc) THEN
        RAISE EXCEPTION 'Ya existe un usuario registrado con el documento %.', v_doc;
    END IF;

    -- 4. Construir email interno determinístico
    v_email := v_doc || '@auth.fundacion.local';

    -- 5. Verificar que el email no esté en auth.users
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(v_email)) THEN
        -- Si existe en auth.users pero no tenía documento en profiles, vincular
        SELECT id INTO v_new_id FROM auth.users WHERE lower(email) = lower(v_email);
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

-- 9. FUNCIÓN RPC PARA CAMBIAR ROL DE USUARIO (SOLO ADMIN)
CREATE OR REPLACE FUNCTION public.admin_cambiar_rol(
    p_user_id uuid,
    p_nuevo_rol text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol text := lower(trim(p_nuevo_rol));
    v_target_profile record;
BEGIN
    -- 1. Control estricto de permisos
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: Solo un administrador puede modificar roles.';
    END IF;

    -- 2. Validar rol destino
    IF v_rol NOT IN ('admin', 'operador', 'lector') THEN
        RAISE EXCEPTION 'Rol no válido. Debe ser admin, operador o lector.';
    END IF;

    -- 3. Obtener perfil del usuario destino
    SELECT id, rol, email INTO v_target_profile
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_target_profile.id IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado.';
    END IF;

    -- 4. Evitar que el admin se quite su propio rol de admin si es el único
    IF auth.uid() = p_user_id AND v_rol <> 'admin' THEN
        IF (SELECT count(*) FROM public.profiles WHERE rol = 'admin' AND activo = true) <= 1 THEN
            RAISE EXCEPTION 'No puedes revocar tu propio rol de administrador porque eres el único administrador activo.';
        END IF;
    END IF;

    -- 5. Actualizar rol
    UPDATE public.profiles
    SET rol = v_rol,
        updated_at = now()
    WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'id', p_user_id, 'nuevo_rol', v_rol);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_cambiar_rol(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_rol(uuid, text) TO authenticated;

-- 10. FUNCIÓN RPC PARA ACTIVAR / DESACTIVAR USUARIOS (SOLO ADMIN)
CREATE OR REPLACE FUNCTION public.admin_cambiar_estado(
    p_user_id uuid,
    p_activo boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- 1. Control estricto de permisos
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: Solo un administrador puede activar o desactivar usuarios.';
    END IF;

    -- 2. Evitar que un administrador desactive su propia cuenta
    IF auth.uid() = p_user_id AND p_activo = false THEN
        RAISE EXCEPTION 'No puedes desactivar tu propia cuenta de usuario.';
    END IF;

    -- 3. Actualizar estado en profiles
    UPDATE public.profiles
    SET activo = p_activo,
        updated_at = now()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado.';
    END IF;

    -- 4. Si se desactiva, invalidar tokens en auth.users
    IF p_activo = false THEN
        UPDATE auth.users
        SET raw_app_meta_data = jsonb_set(
            COALESCE(raw_app_meta_data, '{}'::jsonb),
            '{banned}',
            'true'::jsonb
        ),
        updated_at = now()
        WHERE id = p_user_id;
    ELSE
        UPDATE auth.users
        SET raw_app_meta_data = jsonb_set(
            COALESCE(raw_app_meta_data, '{}'::jsonb),
            '{banned}',
            'false'::jsonb
        ),
        updated_at = now()
        WHERE id = p_user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'id', p_user_id, 'activo', p_activo);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_cambiar_estado(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_estado(uuid, boolean) TO authenticated;

-- 11. FUNCIÓN RPC PARA CAMBIAR CONTRASEÑA DE UN USUARIO (SOLO ADMIN)
CREATE OR REPLACE FUNCTION public.admin_cambiar_password(
    p_user_id uuid,
    p_nueva_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
    -- 1. Control estricto de permisos
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: Solo un administrador puede restablecer contraseñas.';
    END IF;

    -- 2. Validar contraseña
    IF p_nueva_password IS NULL OR length(trim(p_nueva_password)) < 6 THEN
        RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres.';
    END IF;

    -- 3. Actualizar contraseña en auth.users
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(trim(p_nueva_password), extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado en el sistema de autenticación.';
    END IF;

    RETURN jsonb_build_object('success', true, 'id', p_user_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_cambiar_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_password(uuid, text) TO authenticated;

-- 12. ACTUALIZAR TRIGGER ON_AUTH_USER_CREATED PARA SINCRONIZAR DOCUMENTO SI VIENE EN METADATOS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, documento, nombre, rol, activo)
    VALUES (
        new.id,
        new.email,
        NULLIF(trim(new.raw_user_meta_data->>'documento'), ''),
        COALESCE(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
        'operador',
        true
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        documento = COALESCE(public.profiles.documento, EXCLUDED.documento),
        updated_at = now();
    RETURN new;
END;
$$;
