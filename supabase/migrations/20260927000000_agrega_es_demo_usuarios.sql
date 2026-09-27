-- Distingue cuentas de demo (scripts/seed-demo.mjs) de usuarios reales. Antes de esto, /panel
-- pasó de mostrar un arreglo hardcodeado con badge "Datos de ejemplo" a consultar Supabase real
-- (commit "Conecta /panel a datos reales y agrega personajes ficticios para demo") -- pero esa
-- consulta real incluye, sin ningún filtro, a los 9 personajes ficticios que seed-demo.mjs crea
-- como cuentas reales de Auth. Las métricas globales de /panel quedaron infladas con datos
-- inventados sin forma de saberlo desde la UI (hallazgo 2026-09-27).
--
-- NOTA: este proyecto no tiene CLI de Supabase conectada -- este archivo documenta el cambio en
-- el repo aunque haya que aplicarlo a mano en el SQL Editor (ver
-- 20260909000000_agrega_broker_id_activos.sql para el mismo criterio).

alter table usuarios
  add column if not exists es_demo boolean not null default false;

-- Backfill de las 9 cuentas ya sembradas por seed-demo.mjs (dominio demo.smtbroker.mx) -- no
-- depende de auth.users porque usuarios.id ya es el mismo id que auth.users.id (ver
-- HANDOFF.md), pero email vive en auth.users, no en el esquema public -- se resuelve via join.
update usuarios u
set es_demo = true
from auth.users a
where a.id = u.id
  and a.email like '%@demo.smtbroker.mx';
