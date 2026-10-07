-- Paso 4 del plan técnico V6.3 (2026-10-07): diagnóstico en dos niveles (Documento Maestro §13).
--
-- El diagnóstico rápido (gratis) no se guarda aquí: se calcula al vuelo (lib/expediente.ts + GIS).
-- La CERTIFICACIÓN legal (de pago) sí es un proceso con estados:
--   solicitada → (Operación confirma el pago) pagada → (Operación corre el dictamen y lo revisa)
--   certificada | rechazada
-- En el piloto no hay pasarela de pago: Operación marca "pagada" a mano (transferencia, o cortesía
-- para los brokers Fundadores).
--
-- Quién hace qué:
--   - La solicitud la crea el servidor (app/api/certificaciones), tras verificar que quien la pide
--     es el dueño o el broker que representa el activo.
--   - Quien ve el activo ve su certificación (misma regla que diagnosticos).
--   - Solo Operación (es_operacion()) cambia el estado.
--
-- NOTA: se aplica a mano en el SQL Editor (este proyecto no tiene CLI de Supabase conectada).

begin;

create table if not exists certificaciones (
  id               uuid primary key default gen_random_uuid(),
  activo_id        uuid not null references activos(id) on delete cascade,
  solicitado_por   uuid not null references usuarios(id) on delete cascade,
  estado           text not null default 'solicitada'
                   check (estado in ('solicitada', 'pagada', 'certificada', 'rechazada')),
  pago_referencia  text,
  dictamen_id      uuid references diagnosticos(id) on delete set null,
  notas_operacion  text,
  revisado_por     uuid references usuarios(id) on delete set null,
  created_at       timestamptz not null default now(),
  actualizado_at   timestamptz not null default now()
);

-- Una sola certificación abierta (solicitada o pagada) por activo.
create unique index if not exists idx_certificaciones_abierta
  on certificaciones (activo_id) where estado in ('solicitada', 'pagada');
create index if not exists idx_certificaciones_activo on certificaciones (activo_id, created_at desc);

alter table certificaciones enable row level security;
revoke all on table certificaciones from anon;
revoke insert, delete, truncate, trigger, references on table certificaciones from authenticated;

drop policy if exists "ve la certificacion quien ve el activo" on certificaciones;
create policy "ve la certificacion quien ve el activo" on certificaciones for select to authenticated
  using (exists (select 1 from activos a where a.id = activo_id));

drop policy if exists "operacion ve certificaciones" on certificaciones;
create policy "operacion ve certificaciones" on certificaciones for select to authenticated
  using (es_operacion());

drop policy if exists "operacion actualiza certificaciones" on certificaciones;
create policy "operacion actualiza certificaciones" on certificaciones for update to authenticated
  using (es_operacion())
  with check (es_operacion());

commit;
