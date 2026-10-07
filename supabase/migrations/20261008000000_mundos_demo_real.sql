-- Bloque 1 del plan técnico V6.3 (2026-10-07): separar datos demo de reales antes del piloto.
--
-- Problema: usuarios.es_demo (20260927000000) solo lo usaban las métricas de /panel. El motor de
-- matching (app/api/matches) y la vista activos_publicos (portal del comprador) cruzaban TODO, así
-- que un broker real del piloto vería a Diego, Patricia y sus propiedades ficticias.
--
-- Regla: dos mundos que no se cruzan. Una cuenta real solo ve datos reales; una cuenta demo solo
-- ve datos demo (así el video demo sigue funcionando sin contaminar el piloto). El mundo de un
-- activo o un perfil lo fija el servidor al crearse, a partir de quien lo crea, y no se puede
-- cambiar desde la aplicación.
--
-- NOTA: se aplica a mano en el SQL Editor (este proyecto no tiene CLI de Supabase conectada).

begin;

-- 1. Columnas ------------------------------------------------------------------------------------
alter table activos            add column if not exists es_demo boolean not null default false;
alter table perfiles_intencion add column if not exists es_demo boolean not null default false;

-- 2. Backfill (ANTES de crear los triggers, que congelan el valor en los UPDATE) -----------------
-- activos: usuario_id es siempre quien lo creó (si lo carga un broker, usuario_id = broker_id).
update activos a set es_demo = true
from usuarios u
where u.id = a.usuario_id and u.es_demo;

-- perfiles: del propio comprador (usuario_id) o de un cliente de broker (broker_id).
update perfiles_intencion p set es_demo = true
from usuarios u
where u.id = coalesce(p.usuario_id, p.broker_id) and u.es_demo;

-- 3. Triggers: el mundo lo decide el creador, nunca el cliente ------------------------------------
create or replace function public.fija_mundo_activo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.es_demo := coalesce((select es_demo from usuarios where id = new.usuario_id), false);
  else
    new.es_demo := old.es_demo;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activos_fija_mundo on activos;
create trigger trg_activos_fija_mundo
before insert or update on activos
for each row execute function public.fija_mundo_activo();

create or replace function public.fija_mundo_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.es_demo := coalesce((select es_demo from usuarios where id = coalesce(new.usuario_id, new.broker_id)), false);
  else
    new.es_demo := old.es_demo;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_perfiles_fija_mundo on perfiles_intencion;
create trigger trg_perfiles_fija_mundo
before insert or update on perfiles_intencion
for each row execute function public.fija_mundo_perfil();

revoke all on function public.fija_mundo_activo() from public, anon, authenticated;
revoke all on function public.fija_mundo_perfil() from public, anon, authenticated;

-- 4. Vista activos_publicos: solo el mundo de quien consulta, y solo lo disponible ----------------
-- Mismas columnas que antes (app/portal-inversion/page.tsx). Sigue sin security_invoker a
-- propósito: la RLS de activos es solo-dueño y el comprador necesita ver activos ajenos; por eso
-- el filtro de mundo va DENTRO de la vista.
create or replace view activos_publicos as
select id, nombre, tipo, municipio, estado, superficie, precio_total, created_at
from activos
where es_demo = coalesce((select u.es_demo from usuarios u where u.id = auth.uid()), false)
  and coalesce(status, '') <> 'cerrado';

-- Se reemiten los permisos del hallazgo crítico del 2026-10-05 (20261005000100, parte 1.1):
-- solo lectura para usuarios con sesión, nada para anon.
revoke all on table activos_publicos from anon, authenticated;
grant select on table activos_publicos to authenticated;

commit;
