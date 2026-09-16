-- Destinaciones compartidas para todas las sesiones del CRM.
create table if not exists public.destinaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  constraint destinaciones_nombre_no_vacio check (char_length(btrim(nombre)) > 0)
);

create unique index if not exists destinaciones_nombre_unico
  on public.destinaciones ((lower(btrim(nombre))));

alter table public.destinaciones enable row level security;

drop policy if exists "Destinaciones legibles por usuarios autenticados" on public.destinaciones;
create policy "Destinaciones legibles por usuarios autenticados"
  on public.destinaciones for select
  to authenticated
  using (true);

drop policy if exists "Destinaciones administrables por administradores" on public.destinaciones;
create policy "Destinaciones administrables por administradores"
  on public.destinaciones for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.destinaciones (nombre)
values
  ('Apadrinamiento'),
  ('Evento Especial'),
  ('Donación General'),
  ('Fondo de Emergencia')
on conflict do nothing;
