-- Hallazgo de seguridad del recorrido guiado (2026-10-07): la cuenta "Operación MindBridge (demo)"
-- (operacion@demo.smtbroker.mx, rol broker_maestro, es_demo) usa una contraseña que estuvo escrita en
-- scripts/seed-demo.mjs. es_operacion() solo miraba el rol, así que esa cuenta podía LEER Y EDITAR
-- datos reales por la API de datos (en pantalla solo veía la demo porque el filtro era de la UI).
-- Con los brokers del piloto entrando, eso exponía sus datos a cualquiera con acceso al repositorio.
--
-- Ahora la base lo hace cumplir:
--   es_operacion()       → Operación REAL (broker_maestro y NO demo): ve y opera todo, como antes.
--   es_operacion_demo()  → Operación DEMO: solo filas del mundo demo (para el video y los recorridos).
-- Lo que solo es de la operación real (solicitudes de registro, prospección AMPI, verificaciones de
-- brokers) deja de estar al alcance de la cuenta demo.
--
-- NOTA: se aplica a mano en el SQL Editor. No necesita despliegue de código para surtir efecto.

begin;

create or replace function public.es_operacion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from usuarios where id = auth.uid() and rol = 'broker_maestro' and not es_demo)
$$;

create or replace function public.es_operacion_demo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from usuarios where id = auth.uid() and rol = 'broker_maestro' and es_demo)
$$;
revoke all on function public.es_operacion_demo() from public, anon;
grant execute on function public.es_operacion_demo() to authenticated;

-- ¿El activo es del mundo demo? (security definer: no depende de lo que la RLS deje ver)
create or replace function public.activo_es_demo(p_activo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select es_demo from activos where id = p_activo), false)
$$;
revoke all on function public.activo_es_demo(uuid) from public, anon;
grant execute on function public.activo_es_demo(uuid) to authenticated;

-- ── Operación demo: solo el mundo demo ──────────────────────────────────────────────────────────
drop policy if exists "operacion demo lee activos demo" on activos;
create policy "operacion demo lee activos demo" on activos for select to authenticated
  using (es_operacion_demo() and es_demo);

drop policy if exists "operacion demo lee usuarios demo" on usuarios;
create policy "operacion demo lee usuarios demo" on usuarios for select to authenticated
  using (es_operacion_demo() and es_demo);

drop policy if exists "operacion demo lee perfiles demo" on perfiles_intencion;
create policy "operacion demo lee perfiles demo" on perfiles_intencion for select to authenticated
  using (es_operacion_demo() and es_demo);

drop policy if exists "operacion demo ve matches demo" on matches;
create policy "operacion demo ve matches demo" on matches for select to authenticated
  using (es_operacion_demo() and activo_es_demo(activo_id));
drop policy if exists "operacion demo actualiza matches demo" on matches;
create policy "operacion demo actualiza matches demo" on matches for update to authenticated
  using (es_operacion_demo() and activo_es_demo(activo_id))
  with check (es_operacion_demo() and activo_es_demo(activo_id));

drop policy if exists "operacion demo ve cierres demo" on cierres_reportados;
create policy "operacion demo ve cierres demo" on cierres_reportados for select to authenticated
  using (es_operacion_demo() and activo_es_demo(activo_id));
drop policy if exists "operacion demo verifica cierres demo" on cierres_reportados;
create policy "operacion demo verifica cierres demo" on cierres_reportados for update to authenticated
  using (es_operacion_demo() and activo_es_demo(activo_id))
  with check (es_operacion_demo() and activo_es_demo(activo_id));

drop policy if exists "operacion demo ve certificaciones demo" on certificaciones;
create policy "operacion demo ve certificaciones demo" on certificaciones for select to authenticated
  using (es_operacion_demo() and activo_es_demo(activo_id));

drop policy if exists "operacion demo ve oportunidades demo" on oportunidades;
create policy "operacion demo ve oportunidades demo" on oportunidades for select to authenticated
  using (es_operacion_demo() and activo_es_demo(activo_id));

-- ── Solo Operación real: solicitudes, prospección y verificaciones ──────────────────────────────
-- Antes: exists(rol = 'broker_maestro'), que incluía a la cuenta demo.
drop policy if exists "solo_broker_maestro_lee_solicitudes" on solicitudes;
create policy "solo_broker_maestro_lee_solicitudes" on solicitudes for select to authenticated
  using (es_operacion());
drop policy if exists "solo_broker_maestro_actualiza_solicitudes" on solicitudes;
create policy "solo_broker_maestro_actualiza_solicitudes" on solicitudes for update to authenticated
  using (es_operacion()) with check (es_operacion());

drop policy if exists "solo_broker_maestro_prospectos" on prospectos_broker;
create policy "solo_broker_maestro_prospectos" on prospectos_broker for all to authenticated
  using (es_operacion()) with check (es_operacion());

drop policy if exists "solo_broker_maestro_verificaciones" on verificaciones_broker;
create policy "solo_broker_maestro_verificaciones" on verificaciones_broker for all to authenticated
  using (es_operacion()) with check (es_operacion());

commit;
