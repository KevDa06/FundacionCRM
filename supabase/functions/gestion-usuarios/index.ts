// Supabase Edge Function: gestion-usuarios
// Permite al Administrador gestionar cuentas de usuario de forma segura con la service_role key en el servidor.
// El navegador NUNCA recibe credenciales administrativas.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Verificar el token JWT del usuario que invoca la función
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado. Se requiere token de sesión." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientCaller = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await clientCaller.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o expirada." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Cliente administrativo con privilegios elevados (service_role)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 3. Comprobar que el usuario solicitante sea un Administrador ACTIVO
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, rol, activo")
      .eq("id", user.id)
      .single();

    if (profileError || !callerProfile || callerProfile.rol !== "admin" || callerProfile.activo !== true) {
      return new Response(
        JSON.stringify({ error: "Acceso denegado: Solo un administrador activo puede gestionar usuarios." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Procesar la solicitud según la acción
    const body = await req.json();
    const { accion } = body;

    if (accion === "crear") {
      const { nombre, documento, password, rol } = body;

      const docNormalizado = (documento || "").toString().trim().replace(/\s+/g, "");
      const nomNormalizado = (nombre || "").toString().trim();
      const rolNormalizado = (rol || "operador").toString().trim().toLowerCase();

      if (!docNormalizado) {
        return new Response(
          JSON.stringify({ error: "El documento es obligatorio." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!nomNormalizado) {
        return new Response(
          JSON.stringify({ error: "El nombre es obligatorio." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!password || password.trim().length < 6) {
        return new Response(
          JSON.stringify({ error: "La contraseña inicial debe tener al menos 6 caracteres." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!["admin", "operador", "lector"].includes(rolNormalizado)) {
        return new Response(
          JSON.stringify({ error: "Rol no válido. Debe ser admin, operador o lector." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Comprobar que el documento no esté registrado
      const { data: docExistente } = await adminClient
        .from("profiles")
        .select("id")
        .eq("documento", docNormalizado)
        .maybeSingle();

      if (docExistente) {
        return new Response(
          JSON.stringify({ error: `Ya existe un usuario con el documento ${docNormalizado}.` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Email sintético interno determinístico
      const internalEmail = `${docNormalizado}@auth.fundacion.local`;

      // Crear usuario en Supabase Auth
      const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
        email: internalEmail,
        password: password.trim(),
        email_confirm: true,
        user_metadata: {
          nombre: nomNormalizado,
          documento: docNormalizado
        }
      });

      if (createError) {
        return new Response(
          JSON.stringify({ error: `Error en Supabase Auth: ${createError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newUserId = newUserData.user.id;

      // Crear o actualizar en public.profiles
      const { error: upsertError } = await adminClient
        .from("profiles")
        .upsert({
          id: newUserId,
          email: internalEmail,
          documento: docNormalizado,
          nombre: nomNormalizado,
          rol: rolNormalizado,
          activo: true,
          updated_at: new Date().toISOString()
        });

      if (upsertError) {
        return new Response(
          JSON.stringify({ error: `Usuario Auth creado pero error en perfil: ${upsertError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          id: newUserId,
          documento: docNormalizado,
          nombre: nomNormalizado,
          rol: rolNormalizado,
          activo: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (accion === "cambiar_rol") {
      const { userId, nuevoRol } = body;
      const rolNorm = (nuevoRol || "").trim().toLowerCase();

      if (!["admin", "operador", "lector"].includes(rolNorm)) {
        return new Response(
          JSON.stringify({ error: "Rol no válido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Evitar que el admin se quite su propio rol si es el único
      if (user.id === userId && rolNorm !== "admin") {
        const { count } = await adminClient
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("rol", "admin")
          .eq("activo", true);

        if ((count || 0) <= 1) {
          return new Response(
            JSON.stringify({ error: "No puedes revocar tu propio rol de administrador porque eres el único administrador activo." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ rol: rolNorm, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, userId, nuevoRol: rolNorm }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (accion === "cambiar_estado") {
      const { userId, activo } = body;

      if (user.id === userId && activo === false) {
        return new Response(
          JSON.stringify({ error: "No puedes desactivar tu propia cuenta de usuario." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ activo: Boolean(activo), updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Revocar sesiones en auth.users si se desactiva
      if (!activo) {
        try {
          await adminClient.auth.admin.signOut(userId);
        } catch (_ignore) {
          // Si el método no está disponible en la versión específica, el chequeo RLS y de perfil en login se encargan
        }
      }

      return new Response(
        JSON.stringify({ success: true, userId, activo: Boolean(activo) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (accion === "cambiar_password") {
      const { userId, nuevaPassword } = body;
      if (!nuevaPassword || nuevaPassword.trim().length < 6) {
        return new Response(
          JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: pwdError } = await adminClient.auth.admin.updateUserById(userId, {
        password: nuevaPassword.trim()
      });

      if (pwdError) {
        return new Response(
          JSON.stringify({ error: pwdError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, userId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Acción desconocida: ${accion}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Error interno del servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
