-- Paso 3A del plan técnico V6.3 (2026-10-07): nivel "Fundador" para los brokers del piloto
-- (Plan Piloto V1, sección 11, requisito 3).
--
-- usuarios.fundador lo activa SOLO Operación, desde app/api/operacion/fundador (service_role). El
-- broker no puede ponérselo a sí mismo: desde el 2026-10-03 authenticated solo tiene
-- "grant update (nombre)" sobre usuarios, y esta migración no lo cambia.
-- Efecto (lib/nivelesBroker.ts): garantiza como mínimo el nivel Plata.
--
-- NOTA: se aplica a mano en el SQL Editor (este proyecto no tiene CLI de Supabase conectada).

begin;

alter table usuarios add column if not exists fundador boolean not null default false;

commit;
