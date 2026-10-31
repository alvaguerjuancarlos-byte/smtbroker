-- Documento Maestro V7 (2026-10-31): el cliente al centro, "libre para empezar, broker para
-- conectar" y un broker por lado (§15 y §17).
--
--   1. El comprador que llegó directo también elige un broker certificado: perfiles_intencion
--      gana `representado_por` (el broker que aceptó representarlo) y las oportunidades pueden ser
--      de un activo (propietario) o de un perfil de búsqueda (comprador).
--   2. Broker para conectar: Operación no puede poner en contacto un match si a algún lado le
--      falta broker (trigger en matches).
--   3. Interesados de la página pública: si la propiedad no tiene broker, su dueño ya no lee los
--      leads directo (traen nombre y contacto); los ve sin contacto vía app/api/leads hasta que
--      elija broker (decisión (a) de JC).
--
-- TODA la escritura nueva pasa por el servidor (app/api/oportunidades, service_role).
--
-- NOTA: se aplica a mano en el SQL Editor (este proyecto no tiene CLI de Supabase conectada).

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Broker del comprador
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- No toca el CHECK de origen (usuario_id XOR broker_id): un perfil sigue siendo del comprador
-- (usuario_id) o de un cliente de broker (broker_id). `representado_por` solo aplica al primero.
alter table perfiles_intencion
  add column if not exists representado_por uuid references usuarios(id) on delete set null;
create index if not exists idx_perfiles_intencion_representado_por on perfiles_intencion (representado_por);

-- La política "comprador administra su perfil" es FOR ALL: sin esto el comprador podría ponerse
-- solo el broker que quisiera. Solo el servidor (al aceptar la oportunidad) lo asigna.
create or replace function public.perfiles_protege_representacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' and new.representado_por is not null then
      raise exception 'El broker del comprador lo asigna la plataforma';
    end if;
    if tg_op = 'UPDATE' and new.representado_por is distinct from old.representado_por then
      raise exception 'El broker del comprador lo asigna la plataforma';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_perfiles_protege_representacion on perfiles_intencion;
create trigger trg_perfiles_protege_representacion
before insert or update on perfiles_intencion
for each row execute function public.perfiles_protege_representacion();

-- El broker ve a los compradores que representa (sus criterios; el contacto se lo da el servidor).
drop policy if exists "broker ve a los compradores que representa" on perfiles_intencion;
create policy "broker ve a los compradores que representa" on perfiles_intencion for select to authenticated
  using (representado_por = auth.uid());

-- Oportunidades: de un activo (propietario elige broker) o de un perfil (comprador elige broker).
-- `propietario_id` se queda con su nombre: es el cliente que elige, sea dueño o comprador.
alter table oportunidades alter column activo_id drop not null;
alter table oportunidades
  add column if not exists perfil_id uuid references perfiles_intencion(id) on delete cascade;
alter table oportunidades drop constraint if exists oportunidades_de_activo_o_perfil;
alter table oportunidades add constraint oportunidades_de_activo_o_perfil
  check ((activo_id is null) <> (perfil_id is null));

-- Igual que con los activos: el comprador espera la respuesta de un broker a la vez.
create unique index if not exists idx_oportunidades_perfil_abierta
  on oportunidades (perfil_id) where estado = 'ofrecida';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Broker para conectar: un broker por lado antes de "Poner en contacto"
-- ════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.matches_exige_broker_por_lado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'en_contacto' and old.estado is distinct from 'en_contacto' then
    if not exists (select 1 from activos a where a.id = new.activo_id and a.broker_id is not null) then
      raise exception 'Falta el broker del vendedor: no se puede poner en contacto';
    end if;
    if not exists (
      select 1 from perfiles_intencion p
      where p.id = new.perfil_id and (p.broker_id is not null or p.representado_por is not null)
    ) then
      raise exception 'Falta el broker del comprador: no se puede poner en contacto';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_matches_exige_broker_por_lado on matches;
create trigger trg_matches_exige_broker_por_lado
before update on matches
for each row execute function public.matches_exige_broker_por_lado();

revoke all on function public.perfiles_protege_representacion() from public, anon, authenticated;
revoke all on function public.matches_exige_broker_por_lado() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Leads: el dueño sin broker no lee el contacto de los interesados
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- Antes: cualquiera que viera el activo (dueño, broker, Operación). Ahora el dueño solo si su
-- propiedad ya tiene broker; sin broker los ve sin contacto desde app/api/leads (service_role).
drop policy if exists "ve los leads quien ve el activo" on leads;
create policy "ve los leads quien ve el activo" on leads for select to authenticated
  using (exists (
    select 1 from activos a
    where a.id = activo_id and (a.broker_id is not null or a.usuario_id is distinct from auth.uid())
  ));

commit;
