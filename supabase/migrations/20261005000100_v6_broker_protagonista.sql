-- Documento Maestro V6.1 (aprobado por JC el 2026-10-04): el broker pasa a ser protagonista del
-- ecosistema como proveedor de oferta (su portafolio) y demanda (lo que buscan sus clientes).
-- Ver C:\Users\Administrator\Documents\SMTBROKER\SMTBROKER_Documento_Maestro_V6.1.docx, §5.2, §6.2 y §10.
--
-- NOTA: este proyecto no tiene CLI de Supabase conectada -- este archivo documenta el cambio en
-- el repo y se aplica a mano en el SQL Editor (mismo criterio que las migraciones anteriores).
-- Todo el archivo va en una transacción: si algo falla, no se aplica nada.
--
-- BORRADOR: falta confirmar contra el snapshot de políticas reales (paso 0 del plan) antes de
-- aplicarlo.

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. activos: el broker puede cargar la propiedad de un propietario sin cuenta, declarando
--    exclusiva o carta de representación (V6 §6.2). Convención: si la carga un broker,
--    usuario_id = broker_id = broker y cargado_por = 'broker'. El reclamo del propietario
--    (transferir usuario_id) queda para una fase posterior.
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

-- Un activo cargado por broker exige representación declarada y que el broker sea él mismo.
-- Es CHECK (no solo RLS) para que tampoco se pueda saltar con service_role por descuido.
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

-- El broker ve y edita las propiedades que representa (además de las políticas de dueño que ya
-- existen por usuario_id). Ver lib/accesoActivo.ts para la misma regla en el código.
drop policy if exists "broker ve activos que representa" on activos;
create policy "broker ve activos que representa"
on activos for select
to authenticated
using (broker_id = auth.uid());

drop policy if exists "broker edita activos que representa" on activos;
create policy "broker edita activos que representa"
on activos for update
to authenticated
using (broker_id = auth.uid())
with check (broker_id = auth.uid());

-- La política de UPDATE no distingue columnas: sin esto, el broker que representa un activo
-- cargado por el propietario podría reescribir usuario_id y quedarse como dueño (o cambiar
-- cargado_por para saltarse el CHECK de representación). Ningún flujo del cliente cambia estas
-- columnas; el futuro "reclamo del propietario" se hará del lado del servidor con service_role.
create or replace function activos_protege_titularidad()
returns trigger
language plpgsql
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
for each row execute function activos_protege_titularidad();

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. perfiles_intencion: además del perfil propio de un comprador (usuario_id), ahora un broker
--    registra lo que buscan sus clientes (usuario_id null, broker_id, alias). Sin teléfono ni
--    correo del cliente (V6 §6.2): el contacto sigue siendo del broker.
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table perfiles_intencion
  add column if not exists broker_id uuid references usuarios(id),
  add column if not exists alias_cliente text,
  add column if not exists consentimiento_declarado_at timestamptz;

alter table perfiles_intencion alter column usuario_id drop not null;

create index if not exists idx_perfiles_intencion_broker_id on perfiles_intencion (broker_id);

alter table perfiles_intencion drop constraint if exists perfiles_intencion_origen_check;
alter table perfiles_intencion add constraint perfiles_intencion_origen_check
  check (
    usuario_id is not null
    or (broker_id is not null and alias_cliente is not null and consentimiento_declarado_at is not null)
  );

drop policy if exists "broker administra a sus clientes (select)" on perfiles_intencion;
create policy "broker administra a sus clientes (select)"
on perfiles_intencion for select
to authenticated
using (broker_id = auth.uid() and usuario_id is null);

drop policy if exists "broker administra a sus clientes (insert)" on perfiles_intencion;
create policy "broker administra a sus clientes (insert)"
on perfiles_intencion for insert
to authenticated
with check (broker_id = auth.uid() and usuario_id is null);

drop policy if exists "broker administra a sus clientes (update)" on perfiles_intencion;
create policy "broker administra a sus clientes (update)"
on perfiles_intencion for update
to authenticated
using (broker_id = auth.uid() and usuario_id is null)
with check (broker_id = auth.uid() and usuario_id is null);

drop policy if exists "broker administra a sus clientes (delete)" on perfiles_intencion;
create policy "broker administra a sus clientes (delete)"
on perfiles_intencion for delete
to authenticated
using (broker_id = auth.uid() and usuario_id is null);

-- usuarios: sin cambios -- se respeta el "grant update (nombre)" de la auditoría del 2026-10-03.

commit;
