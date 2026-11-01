-- Documento Maestro V7.1 (2026-10-31, noche): dos caminos, por tu cuenta o con broker (§15, §17).
-- Reemplaza "broker para conectar" de la V7 (migración 20261031000000):
--
--   1. Operación ya puede poner en contacto un match aunque a un lado le falte broker: el cliente
--      que va por su cuenta se conecta directo. Se quita el trigger que lo impedía.
--   2. Interesados de la página pública: el dueño sin broker vuelve a leer sus leads completos
--      (nombre y contacto), como antes de la V7.
--
-- Se queda todo lo demás de la V7: el comprador puede elegir broker (representado_por,
-- oportunidades de perfil) y solo el servidor lo asigna.
--
-- El contacto entre las partes al conectar (decisión (a) de JC: ven sus datos cuando Operación
-- valida) lo entrega el servidor: app/api/matches/[id] (Operación) y app/api/matches (GET).
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

drop trigger if exists trg_matches_exige_broker_por_lado on matches;
drop function if exists public.matches_exige_broker_por_lado();

drop policy if exists "ve los leads quien ve el activo" on leads;
create policy "ve los leads quien ve el activo" on leads for select to authenticated
  using (exists (select 1 from activos a where a.id = activo_id));

commit;
