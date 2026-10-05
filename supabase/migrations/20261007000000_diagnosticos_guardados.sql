-- Diagnóstico guardado: los agentes Legal y Mercado dejan de recalcularse en cada visita a un
-- activo. Cada cálculo se guarda con su fecha y se reutiliza; solo se recalcula cuando el dueño o
-- su broker piden "Actualizar diagnóstico". Motivos: costo (Claude + Serper en cada apertura),
-- consistencia (el precio cambiaba entre visitas) y el Reporte de Transparencia (V6.1 §6.1), que
-- necesita un diagnóstico fijo y fechado.
--
-- NOTA: se aplica a mano en el SQL Editor (mismo criterio que las migraciones anteriores).

begin;

create table if not exists diagnosticos (
  id          uuid primary key default gen_random_uuid(),
  activo_id   uuid not null references activos(id) on delete cascade,
  agente      text not null check (agente in ('legal', 'mercado')),
  resultado   jsonb not null,
  modelo      text,
  creado_por  uuid references usuarios(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Historial: cada "Actualizar diagnóstico" agrega una fila; siempre se usa la más reciente.
create index if not exists idx_diagnosticos_activo_agente on diagnosticos (activo_id, agente, created_at desc);

alter table diagnosticos enable row level security;
revoke all on table diagnosticos from anon;
revoke insert, update, delete, truncate, trigger, references on table diagnosticos from authenticated;

-- Quien puede ver el activo puede ver su diagnóstico. La subconsulta corre con la RLS de activos,
-- así que reutiliza las reglas de dueño, broker que lo representa y Operación (Fase A). Solo el
-- servidor escribe (app/api/agentes/*, con service_role).
drop policy if exists "ve el diagnostico quien ve el activo" on diagnosticos;
create policy "ve el diagnostico quien ve el activo" on diagnosticos for select to authenticated
  using (exists (select 1 from activos a where a.id = activo_id));

commit;
