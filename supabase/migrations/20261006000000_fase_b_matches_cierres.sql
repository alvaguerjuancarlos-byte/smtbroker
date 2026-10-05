-- Fase B del Documento Maestro V6.1: Matches v0 (validados por Operación) y reporte de cierres.
-- Ver C:\Users\Administrator\.claude\plans\snazzy-humming-treehouse.md y V6.1 §4, §6.1–§6.3.
--
-- NOTA: se aplica a mano en el SQL Editor (mismo criterio que las migraciones anteriores).
-- Requiere 20261005000100_v6_broker_protagonista.sql (usa es_operacion()).

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. matches: una solicitud de conexión entre un activo y un perfil de búsqueda. Se crean SOLO
--    desde el servidor (app/api/matches/route.ts), que recalcula el score con lib/matching.ts y
--    valida que quien la pide sea dueño de una de las dos partes -- por eso no hay política de
--    INSERT para clientes. Operación valida cada una a mano antes de poner en contacto a las
--    partes (V6.1, Fase 2: 2–3 matches/semana revisados a mano antes de automatizar).
-- ════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists matches (
  id               uuid primary key default gen_random_uuid(),
  activo_id        uuid not null references activos(id) on delete cascade,
  perfil_id        uuid not null references perfiles_intencion(id) on delete cascade,
  solicitado_por   uuid not null references usuarios(id) on delete cascade,
  score            int  not null check (score between 0 and 100),
  razones          jsonb not null default '[]'::jsonb,
  estado           text not null default 'solicitado'
                   check (estado in ('solicitado', 'en_contacto', 'descartado', 'cerrado')),
  notas_operacion  text,
  created_at       timestamptz not null default now(),
  actualizado_at   timestamptz not null default now(),
  unique (activo_id, perfil_id)
);

create index if not exists idx_matches_solicitado_por on matches (solicitado_por);
create index if not exists idx_matches_estado on matches (estado);

alter table matches enable row level security;
revoke all on table matches from anon;
revoke truncate, trigger, references on table matches from authenticated;

drop policy if exists "quien solicita ve sus matches" on matches;
create policy "quien solicita ve sus matches" on matches for select to authenticated
  using (solicitado_por = auth.uid());

drop policy if exists "operacion ve matches" on matches;
create policy "operacion ve matches" on matches for select to authenticated
  using (es_operacion());

drop policy if exists "operacion actualiza matches" on matches;
create policy "operacion actualiza matches" on matches for update to authenticated
  using (es_operacion())
  with check (es_operacion());

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. cierres_reportados: el broker reporta el cierre de una propiedad que representa; Operación
--    lo verifica. Es la defensa contra la fuga de transacciones (V6.1 §6.2) y la base de los
--    niveles de Broker Certificado SMT (§6.3). El broker solo puede crear reportes 'pendiente'
--    y no puede modificarlos después (sin política de UPDATE para él).
-- ════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists cierres_reportados (
  id                uuid primary key default gen_random_uuid(),
  activo_id         uuid not null references activos(id) on delete cascade,
  broker_id         uuid not null references usuarios(id) on delete cascade,
  match_id          uuid references matches(id) on delete set null,
  precio_cierre     numeric not null check (precio_cierre > 0),
  fecha_cierre      date not null,
  origen_comprador  text not null
                    check (origen_comprador in ('mi_cliente', 'otro_broker', 'comprador_directo', 'fuera_de_plataforma')),
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'verificado', 'rechazado')),
  verificado_at     timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_cierres_broker_id on cierres_reportados (broker_id);

alter table cierres_reportados enable row level security;
revoke all on table cierres_reportados from anon;
revoke truncate, trigger, references on table cierres_reportados from authenticated;

drop policy if exists "broker reporta cierres de sus activos" on cierres_reportados;
create policy "broker reporta cierres de sus activos" on cierres_reportados for insert to authenticated
  with check (
    broker_id = auth.uid()
    and estado = 'pendiente'
    and verificado_at is null
    and exists (select 1 from activos a where a.id = activo_id and a.broker_id = auth.uid())
  );

drop policy if exists "broker ve sus cierres" on cierres_reportados;
create policy "broker ve sus cierres" on cierres_reportados for select to authenticated
  using (broker_id = auth.uid());

drop policy if exists "operacion ve cierres" on cierres_reportados;
create policy "operacion ve cierres" on cierres_reportados for select to authenticated
  using (es_operacion());

drop policy if exists "operacion verifica cierres" on cierres_reportados;
create policy "operacion verifica cierres" on cierres_reportados for update to authenticated
  using (es_operacion())
  with check (es_operacion());

commit;
