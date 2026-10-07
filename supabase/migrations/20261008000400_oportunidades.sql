-- Paso 3B del plan técnico V6.3 (2026-10-07): el propietario elige un broker certificado
-- (Documento Maestro §15).
--
--   1. El propietario sin broker ve los brokers de su zona (nivel Plata o más, incluidos los
--      Pioneros) y elige uno → oportunidad "ofrecida".
--   2. El broker la acepta (pasa a representar el activo: activos.broker_id) o la rechaza (el
--      propietario puede elegir a otro).
--
-- TODA la escritura pasa por el servidor (app/api/oportunidades), que valida que quien ofrece es
-- el dueño, que el activo no tiene broker, que el broker es elegible y del mismo mundo
-- (demo/real), y que quien acepta es el broker elegido. Desde el cliente solo se lee lo propio.
--
-- NOTA: se aplica a mano en el SQL Editor (este proyecto no tiene CLI de Supabase conectada).

begin;

create table if not exists oportunidades (
  id              uuid primary key default gen_random_uuid(),
  activo_id       uuid not null references activos(id) on delete cascade,
  propietario_id  uuid not null references usuarios(id) on delete cascade,
  broker_id       uuid not null references usuarios(id) on delete cascade,
  estado          text not null default 'ofrecida'
                  check (estado in ('ofrecida', 'aceptada', 'rechazada')),
  created_at      timestamptz not null default now(),
  respondida_at   timestamptz
);

-- Una sola oportunidad abierta por activo: el propietario espera la respuesta de un broker a la vez.
create unique index if not exists idx_oportunidades_abierta
  on oportunidades (activo_id) where estado = 'ofrecida';
create index if not exists idx_oportunidades_broker on oportunidades (broker_id, estado);

alter table oportunidades enable row level security;
revoke all on table oportunidades from anon;
revoke insert, update, delete, truncate, trigger, references on table oportunidades from authenticated;

drop policy if exists "propietario ve sus oportunidades" on oportunidades;
create policy "propietario ve sus oportunidades" on oportunidades for select to authenticated
  using (propietario_id = auth.uid());

drop policy if exists "broker ve las oportunidades que recibe" on oportunidades;
create policy "broker ve las oportunidades que recibe" on oportunidades for select to authenticated
  using (broker_id = auth.uid());

drop policy if exists "operacion ve oportunidades" on oportunidades;
create policy "operacion ve oportunidades" on oportunidades for select to authenticated
  using (es_operacion());

commit;
