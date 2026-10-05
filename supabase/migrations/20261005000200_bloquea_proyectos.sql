-- Hallazgo #5 del 2026-10-05 (ver 20261005000000_snapshot_rls_previo.sql): la tabla "proyectos"
-- (id, usuario_id, nombre, flujo, status, datos, created_at; 3 filas) tenía la RLS desactivada y
-- permisos completos para anon/authenticated -- cualquiera con la clave pública podía leerla,
-- modificarla o borrarla. SMTBROKER no la usa (parece venir de SMT Developer). Decisión de JC
-- (2026-10-05): bloquearla sin borrar nada. Con RLS activada y sin políticas, ningún cliente la
-- ve; service_role (servidor) sigue teniendo acceso si algún día hace falta.
--
-- NOTA: se aplica a mano en el SQL Editor (mismo criterio que las migraciones anteriores).

begin;

alter table proyectos enable row level security;
revoke all on table proyectos from anon, authenticated;

commit;
