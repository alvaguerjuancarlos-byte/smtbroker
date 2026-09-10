-- Agrega broker_id a activos -- hasta hoy no existía ninguna forma de asignar un broker a un
-- activo, así que "Brokers aliados" en /panel no se podía calcular con datos reales (solo con el
-- arreglo hardcodeado que existía antes). Nullable: un activo puede no tener broker asignado
-- todavía (recién ingresado, en valoración).
--
-- NOTA: este proyecto no tiene CLI de Supabase conectada (ver smtbroker-logica-y-flujos.md,
-- Sección 2: "no hay migraciones versionadas, los cambios de esquema se hacen a mano en el SQL
-- Editor de Supabase") -- este archivo documenta el cambio en el repo aunque se aplique a mano.

alter table activos
  add column if not exists broker_id uuid references usuarios(id);

create index if not exists idx_activos_broker_id
  on activos (broker_id);
