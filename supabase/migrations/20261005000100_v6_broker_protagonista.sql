-- Documento Maestro V6.1 (aprobado por JC el 2026-10-04) + hallazgos de seguridad del 2026-10-05.
--
-- Estado previo: ver 20261005000000_snapshot_rls_previo.sql (snapshot real de pg_policies,
-- grants y RLS tomado del SQL Editor por JC el 2026-10-05).
--
-- NOTA: este proyecto no tiene CLI de Supabase conectada -- este archivo documenta el cambio en
-- el repo y se aplica a mano en el SQL Editor (mismo criterio que las migraciones anteriores).
-- Todo va en una transacción: si algo falla, no se aplica nada.

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — SEGURIDAD (hallazgos 2026-10-05)
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- 1.1 CRÍTICO, confirmado en vivo: la vista activos_publicos corre con los permisos de su dueño
--     (se salta la RLS de activos) y anon/authenticated tenían INSERT/UPDATE/DELETE sobre ella.
--     Con la clave anónima pública se modificó y borró un activo de prueba a través de la vista.
--     La vista es solo para listar columnas no sensibles a usuarios con sesión
--     (app/portal-inversion/page.tsx): queda en SELECT para authenticated y nada para anon.
revoke all on table activos_publicos from anon, authenticated;
grant select on table activos_publicos to authenticated;

-- 1.2 solicitudes: una política vieja ("anon_puede_insertar_solicitud", CHECK true) anulaba la
--     restricción status = 'pendiente' de la auditoría del 2026-10-03 (las políticas permisivas
--     se suman). Se elimina; queda solo la que exige status = 'pendiente'.
drop policy if exists "anon_puede_insertar_solicitud" on solicitudes;

-- 1.3 TRUNCATE no pasa por RLS. PostgREST no lo expone, pero ningún cliente lo necesita: se
--     retira como defensa en profundidad en todas las tablas de la app.
revoke truncate, trigger, references on table
  activos, perfiles_intencion, prospectos_broker, solicitudes, usuarios, verificaciones_broker
  from anon, authenticated;

-- 1.4 Operación MindBridge (rol interno 'broker_maestro', ver lib/roles.ts) necesita leer toda la
--     plataforma para su consola (/panel), pero la RLS solo dejaba ver lo propio. Se usa una
--     función SECURITY DEFINER para consultar el rol sin recursión en la política de usuarios.
create or replace function public.es_operacion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from usuarios where id = auth.uid() and rol = 'broker_maestro')
$$;
revoke all on function public.es_operacion() from public, anon;
grant execute on function public.es_operacion() to authenticated;

drop policy if exists "operacion lee activos" on activos;
create policy "operacion lee activos" on activos for select to authenticated using (es_operacion());

drop policy if exists "operacion lee usuarios" on usuarios;
create policy "operacion lee usuarios" on usuarios for select to authenticated using (es_operacion());

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — perfiles_intencion: tenía RLS activada y NINGUNA política, así que ningún cliente
-- podía leer ni guardar (el perfil del comprador en /portal-inversion fallaba en silencio).
-- Ahora: el comprador administra su propio perfil, el broker administra los de sus clientes
-- (V6 §6.2: alias, sin teléfono ni correo) y Operación los lee.
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table perfiles_intencion
  add column if not exists broker_id uuid references usuarios(id),
  add column if not exists alias_cliente text,
  add column if not exists consentimiento_declarado_at timestamptz;

alter table perfiles_intencion alter column usuario_id drop not null;

create index if not exists idx_perfiles_intencion_broker_id on perfiles_intencion (broker_id);

-- Un perfil es del propio comprador (usuario_id) o de un cliente de broker con consentimiento
-- declarado -- nunca ambos ni ninguno. unique(usuario_id) sigue valiendo: admite varios null.
alter table perfiles_intencion drop constraint if exists perfiles_intencion_origen_check;
alter table perfiles_intencion add constraint perfiles_intencion_origen_check
  check (
    (usuario_id is not null and broker_id is null)
    or (usuario_id is null and broker_id is not null and alias_cliente is not null and consentimiento_declarado_at is not null)
  );

drop policy if exists "comprador administra su perfil" on perfiles_intencion;
create policy "comprador administra su perfil" on perfiles_intencion for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

drop policy if exists "broker administra a sus clientes" on perfiles_intencion;
create policy "broker administra a sus clientes" on perfiles_intencion for all to authenticated
  using (broker_id = auth.uid() and usuario_id is null)
  with check (broker_id = auth.uid() and usuario_id is null);

drop policy if exists "operacion lee perfiles" on perfiles_intencion;
create policy "operacion lee perfiles" on perfiles_intencion for select to authenticated using (es_operacion());

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PARTE 3 — activos: el broker carga y trabaja las propiedades que representa (V6 §5.2, §6.2).
-- Convención: si la carga un broker, usuario_id = broker_id = broker y cargado_por = 'broker'
-- (pasa por la política existente "usuarios ven sus activos", auth.uid() = usuario_id). El
-- reclamo del propietario (transferir usuario_id) queda para una fase posterior, del servidor.
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table activos
  add column if not exists cargado_por text not null default 'propietario',
  add column if not exists representacion_tipo text,
  add column if not exists representacion_declarada_at timestamptz,
  add column if not exists propietario_nombre text;

alter table activos drop constraint if exists activos_cargado_por_check;
alter table activos add constraint activos_cargado_por_check
  check (cargado_por in ('propietario', 'broker'));

alter table activos drop constraint if exists activos_representacion_tipo_check;
alter table activos add constraint activos_representacion_tipo_check
  check (representacion_tipo is null or representacion_tipo in ('exclusiva', 'carta'));

-- Cargado por broker => representación declarada completa. Es CHECK (no solo RLS) para que
-- tampoco se salte desde el servidor por descuido.
alter table activos drop constraint if exists activos_representacion_broker_check;
alter table activos add constraint activos_representacion_broker_check
  check (
    cargado_por = 'propietario'
    or (
      broker_id is not null
      and representacion_tipo is not null
      and representacion_declarada_at is not null
      and propietario_nombre is not null
    )
  );

drop policy if exists "broker ve activos que representa" on activos;
create policy "broker ve activos que representa" on activos for select to authenticated
  using (broker_id = auth.uid());

drop policy if exists "broker edita activos que representa" on activos;
create policy "broker edita activos que representa" on activos for update to authenticated
  using (broker_id = auth.uid())
  with check (broker_id = auth.uid());

-- Las políticas de UPDATE no distinguen columnas: sin esto, el broker que representa un activo
-- de un propietario podría reescribir usuario_id y quedarse como dueño, o cambiar cargado_por
-- para saltarse el CHECK de representación. Ningún flujo del cliente cambia estas columnas.
create or replace function public.activos_protege_titularidad()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and (
       new.usuario_id  is distinct from old.usuario_id
    or new.cargado_por is distinct from old.cargado_por
  ) then
    raise exception 'No se puede cambiar el titular ni el origen de un activo desde la aplicación';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activos_protege_titularidad on activos;
create trigger trg_activos_protege_titularidad
before update on activos
for each row execute function public.activos_protege_titularidad();

-- usuarios: sin cambios de escritura -- se respeta el "grant update (nombre)" del 2026-10-03.

commit;
