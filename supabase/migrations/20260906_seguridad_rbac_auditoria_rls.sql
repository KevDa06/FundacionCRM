-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD: Supabase Auth, RBAC, Auditoría y Hardened RLS
-- Hallazgos: 1.1 (Autenticación compartida / RBAC / Auditoría) y 1.4 (RLS permisivo)
-- ==============================================================================

-- 1. TABLA DE PERFILES DE USUARIO (RBAC)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nombre TEXT,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'operador', 'lector')) DEFAULT 'operador',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS en perfiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. FUNCIONES AUXILIARES DE ROL Y VERIFICACIÓN (SECURITY DEFINER)
-- NOTA: Se utiliza SECURITY DEFINER con search_path explícito para evitar recursión en RLS
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT rol FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- Función is_admin() para verificar rol sin provocar recursión infinita en profiles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND rol = 'admin'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 3. TRIGGER AUTOMÁTICO PARA NUEVOS USUARIOS EN SUPABASE AUTH
-- MITIGACIÓN CRÍTICA: Se asigna rol fijo 'operador' por defecto.
-- Se elimina cualquier lectura de raw_user_meta_data->>'rol' para evitar que un usuario
-- se autoasigne rol 'admin' desde el registro público del cliente.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, nombre, rol)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
        'operador' -- ROL FIJO Y SEGURO: Sólo un admin en BD puede promover a 'admin'
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
    RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. VINCULACIÓN AUTOMÁTICA DEL USUARIO ACTUAL (EVITA BLOQUEO)
-- Inserta o actualiza el usuario actual 'admin@fundacion.local' con rol 'admin'
-- extrayendo su UUID real directamente desde auth.users.
INSERT INTO public.profiles (id, email, nombre, rol)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'nombre', 'Administrador Principal'), 
    'admin'
FROM auth.users
WHERE lower(email) = lower('admin@fundacion.local')
ON CONFLICT (id) DO UPDATE
SET rol = 'admin',
    updated_at = now();

-- Si existen otros usuarios ya registrados previamente en auth.users, crearles perfil seguro como 'operador'
INSERT INTO public.profiles (id, email, nombre, rol)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'nombre', split_part(email, '@', 1)), 
    'operador'
FROM auth.users
WHERE lower(email) <> lower('admin@fundacion.local')
ON CONFLICT (id) DO NOTHING;

-- 5. TABLA DE AUDITORÍA DE OPERACIONES
CREATE TABLE IF NOT EXISTS public.auditoria_operaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tabla TEXT NOT NULL,
    operacion TEXT NOT NULL CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
    registro_id TEXT NOT NULL,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    usuario_email TEXT,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    fecha TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.auditoria_operaciones ENABLE ROW LEVEL SECURITY;

-- Función de trigger para registrar auditoría automáticamente (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.registrar_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_registro_id TEXT;
    v_usuario_email TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_registro_id := OLD.id::text;
    ELSE
        v_registro_id := NEW.id::text;
    END IF;

    -- Obtener email del usuario en sesión
    IF auth.uid() IS NOT NULL THEN
        SELECT email INTO v_usuario_email FROM auth.users WHERE id = auth.uid();
    ELSE
        v_usuario_email := 'sistema/anónimo';
    END IF;

    INSERT INTO public.auditoria_operaciones (
        tabla,
        operacion,
        registro_id,
        usuario_id,
        usuario_email,
        datos_anteriores,
        datos_nuevos
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        v_registro_id,
        auth.uid(),
        v_usuario_email,
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

-- Vincular triggers de auditoría a donantes y donaciones
DROP TRIGGER IF EXISTS trg_auditoria_donantes ON public.donantes;
CREATE TRIGGER trg_auditoria_donantes
    AFTER INSERT OR UPDATE OR DELETE ON public.donantes
    FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_donaciones ON public.donaciones;
CREATE TRIGGER trg_auditoria_donaciones
    AFTER INSERT OR UPDATE OR DELETE ON public.donaciones
    FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

-- 6. LIMPIEZA DINÁMICA DE POLÍTICAS EXISTENTES
-- Elimina de forma segura cualquier política previa en estas tablas para evitar conflictos o accesos permisivos residuales
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('donantes', 'donaciones', 'profiles', 'auditoria_operaciones')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 7. POLÍTICAS RLS EN PROFILES
-- Lectura: El usuario lee su propio perfil o el admin puede leer todos (resuelve recursión usando is_admin())
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id OR public.is_admin());

-- Modificación de perfiles: Exclusivamente administradores
CREATE POLICY "profiles_insert_admin_only" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY "profiles_update_admin_only" ON public.profiles
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "profiles_delete_admin_only" ON public.profiles
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- 8. POLÍTICAS RLS EN AUDITORIA_OPERACIONES
-- Solo administradores pueden consultar el historial de auditoría
CREATE POLICY "auditoria_select_admin_only" ON public.auditoria_operaciones
    FOR SELECT TO authenticated
    USING (public.is_admin());
-- Nota: No se crean políticas de INSERT/UPDATE/DELETE en auditoria para clientes REST.
-- Toda inserción se realiza exclusivamente por el trigger interno con SECURITY DEFINER.

-- 9. POLÍTICAS RLS EN DONANTES
ALTER TABLE public.donantes ENABLE ROW LEVEL SECURITY;

-- SELECT: admin, operador, lector
CREATE POLICY "donantes_select_authenticated" ON public.donantes
    FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('admin', 'operador', 'lector'));

-- INSERT: admin, operador (lector rechazado)
CREATE POLICY "donantes_insert_admin_operador" ON public.donantes
    FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('admin', 'operador'));

-- UPDATE: admin, operador (lector rechazado)
CREATE POLICY "donantes_update_admin_operador" ON public.donantes
    FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('admin', 'operador'))
    WITH CHECK (public.current_user_role() IN ('admin', 'operador'));

-- DELETE: solo admin (operador y lector rechazados)
CREATE POLICY "donantes_delete_admin_only" ON public.donantes
    FOR DELETE TO authenticated
    USING (public.current_user_role() = 'admin');

-- 10. POLÍTICAS RLS EN DONACIONES
ALTER TABLE public.donaciones ENABLE ROW LEVEL SECURITY;

-- SELECT: admin, operador, lector
CREATE POLICY "donaciones_select_authenticated" ON public.donaciones
    FOR SELECT TO authenticated
    USING (public.current_user_role() IN ('admin', 'operador', 'lector'));

-- INSERT: admin, operador (lector rechazado)
CREATE POLICY "donaciones_insert_admin_operador" ON public.donaciones
    FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role() IN ('admin', 'operador'));

-- UPDATE: admin, operador (lector rechazado)
CREATE POLICY "donaciones_update_admin_operador" ON public.donaciones
    FOR UPDATE TO authenticated
    USING (public.current_user_role() IN ('admin', 'operador'))
    WITH CHECK (public.current_user_role() IN ('admin', 'operador'));

-- DELETE: solo admin (operador y lector rechazados)
CREATE POLICY "donaciones_delete_admin_only" ON public.donaciones
    FOR DELETE TO authenticated
    USING (public.current_user_role() = 'admin');
