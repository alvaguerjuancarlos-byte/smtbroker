-- Paso 6 del plan técnico V6.3 (2026-10-07): Marketing y Leads nivel 1 (Documento Maestro §14).
--   - Ficha de venta con IA: se guarda en `diagnosticos` con agente 'ficha' (mismo patrón).
--   - Página pública por propiedad (/p/[id]): activos.publicada_at la enciende o apaga.
--   - Visitas a la página pública: `visitas_publicas`, solo las inserta el servidor.
--   - "Me interesa": `leads`, calificados por reglas (lib/calificacionLeads.ts); solo el servidor
--     los inserta (app/api/leads, con aviso de privacidad y límite por IP).
--   - Fotos: bucket público `fotos-activos`, carpeta = id del activo; suben y borran el dueño y el
--     broker que lo representa.
--
-- NOTA: se aplica a mano en el SQL Editor (este proyecto no tiene CLI de Supabase conectada).

begin;

-- 1. Ficha de venta en diagnosticos -------------------------------------------------------------
alter table diagnosticos drop constraint if exists diagnosticos_agente_check;
alter table diagnosticos add constraint diagnosticos_agente_check check (agente in ('legal', 'mercado', 'ficha'));

-- 2. Publicación ---------------------------------------------------------------------------------
alter table activos add column if not exists publicada_at timestamptz;

-- 3. Visitas a la página pública -----------------------------------------------------------------
create table if not exists visitas_publicas (
  id          uuid primary key default gen_random_uuid(),
  activo_id   uuid not null references activos(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists idx_visitas_activo on visitas_publicas (activo_id, created_at desc);

alter table visitas_publicas enable row level security;
revoke all on table visitas_publicas from anon;
revoke insert, update, delete, truncate, trigger, references on table visitas_publicas from authenticated;

drop policy if exists "ve las visitas quien ve el activo" on visitas_publicas;
create policy "ve las visitas quien ve el activo" on visitas_publicas for select to authenticated
  using (exists (select 1 from activos a where a.id = activo_id));

-- 4. Leads "Me interesa" -------------------------------------------------------------------------
create table if not exists leads (
  id                 uuid primary key default gen_random_uuid(),
  activo_id          uuid not null references activos(id) on delete cascade,
  nombre             text not null,
  contacto           text not null,
  presupuesto        text,
  plazo              text not null check (plazo in ('menos_3m', '3_6m', 'mas_6m', 'sin_definir')),
  forma_pago         text not null check (forma_pago in ('contado', 'credito_aprobado', 'credito_tramite', 'no_se')),
  mensaje            text,
  categoria          text not null check (categoria in ('serio', 'calificado', 'interesado', 'curioso')),
  razones            jsonb not null default '[]'::jsonb,
  consentimiento_at  timestamptz not null,
  ip_hash            text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_leads_activo on leads (activo_id, created_at desc);
create index if not exists idx_leads_ip on leads (ip_hash, created_at desc);

alter table leads enable row level security;
revoke all on table leads from anon;
revoke insert, update, delete, truncate, trigger, references on table leads from authenticated;

-- El dueño y el broker del activo (vía la RLS de activos) y Operación.
drop policy if exists "ve los leads quien ve el activo" on leads;
create policy "ve los leads quien ve el activo" on leads for select to authenticated
  using (exists (select 1 from activos a where a.id = activo_id));

-- 5. Fotos ---------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-activos', 'fotos-activos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Listar (y poder borrar) requiere SELECT; la descarga de una foto por su URL pública no pasa por aquí.
drop policy if exists "listan fotos dueño y broker" on storage.objects;
create policy "listan fotos dueño y broker" on storage.objects for select to authenticated
  using (
    bucket_id = 'fotos-activos'
    and exists (
      select 1 from public.activos a
      where a.id::text = (storage.foldername(name))[1]
        and (a.usuario_id = auth.uid() or a.broker_id = auth.uid())
    )
  );

drop policy if exists "suben fotos dueño y broker" on storage.objects;
create policy "suben fotos dueño y broker" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-activos'
    and exists (
      select 1 from public.activos a
      where a.id::text = (storage.foldername(name))[1]
        and (a.usuario_id = auth.uid() or a.broker_id = auth.uid())
    )
  );

drop policy if exists "borran fotos dueño y broker" on storage.objects;
create policy "borran fotos dueño y broker" on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos-activos'
    and exists (
      select 1 from public.activos a
      where a.id::text = (storage.foldername(name))[1]
        and (a.usuario_id = auth.uid() or a.broker_id = auth.uid())
    )
  );

commit;
