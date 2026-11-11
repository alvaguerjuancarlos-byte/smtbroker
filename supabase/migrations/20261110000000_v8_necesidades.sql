-- Necesidades del comprador y propuestas de los brokers (Documento Maestro V8, Parte 1, §19;
-- decisiones de JC del 10 de noviembre de 2026).
--
-- La necesidad del comprador detona la búsqueda. El comprador captura su ficha (tipo,
-- características, ubicación y presupuesto) y elige cómo buscar: búsqueda directa (motor propio)
-- y/o publicar su necesidad en el panel de brokers. Los brokers proponen propiedades de su cartera
-- y esas propiedades se vuelven visibles para ESE comprador.
--
--   necesidades  una ficha por búsqueda; hasta 3 activas por comprador y 30 días de vigencia
--                (§19.5). La escribe el servidor (app/api/registro-cliente y app/api/necesidades);
--                el comprador lee las suyas. Los brokers nunca la leen directo: el panel
--                (app/api/necesidades?vista=broker) se la entrega ANÓNIMA, sin nombre ni contacto.
--   propuestas   necesidad ↔ propiedad ↔ broker. Al proponer, el broker acepta los términos
--                (§21.6: si cierra con ese cliente, SMTBROKER cobra un porcentaje de su comisión),
--                por eso terminos_aceptados_at es obligatorio. La escribe solo el servidor.
--
-- perfiles_intencion sigue existiendo: cada necesidad nueva actualiza el perfil del comprador (uno
-- por usuario) para que el matching, el Radar y las oportunidades actuales sigan funcionando.
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

create table if not exists necesidades (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tipo text not null,
  caracteristicas jsonb not null default '{}'::jsonb,
  estado text not null default 'Nuevo León',
  municipio text not null,
  zona text,
  colonias text[] not null default '{}',          -- vacío = cualquier colonia del municipio
  presupuesto_min numeric,
  presupuesto_max numeric not null,
  forma_pago text check (forma_pago in ('contado', 'credito', 'infonavit')),
  plazo text check (plazo in ('ya', '3_meses', '6_meses', 'explorando')),
  proposito text check (proposito in ('vivir', 'invertir')),
  busqueda_directa boolean not null default true,
  publicada_brokers boolean not null default true,
  activa boolean not null default true,
  vence_at timestamptz not null default now() + interval '30 days',
  es_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (presupuesto_min is null or presupuesto_min <= presupuesto_max)
);
create index if not exists idx_necesidades_usuario on necesidades (usuario_id);
create index if not exists idx_necesidades_panel on necesidades (es_demo, activa, publicada_brokers, vence_at);

create table if not exists propuestas (
  id uuid primary key default gen_random_uuid(),
  necesidad_id uuid not null references necesidades(id) on delete cascade,
  activo_id uuid not null references activos(id) on delete cascade,
  broker_id uuid not null references usuarios(id) on delete cascade,
  terminos_aceptados_at timestamptz not null,
  es_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (necesidad_id, activo_id)                 -- una propiedad, una propuesta por necesidad
);
create index if not exists idx_propuestas_broker on propuestas (broker_id, necesidad_id);

-- El mundo (demo/real) lo decide quien crea la fila, como en activos y perfiles_intencion.
create or replace function public.fija_mundo_necesidad()
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
drop trigger if exists trg_necesidades_fija_mundo on necesidades;
create trigger trg_necesidades_fija_mundo before insert or update on necesidades
for each row execute function public.fija_mundo_necesidad();

create or replace function public.fija_mundo_propuesta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.es_demo := coalesce((select es_demo from usuarios where id = new.broker_id), false);
  else
    new.es_demo := old.es_demo;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_propuestas_fija_mundo on propuestas;
create trigger trg_propuestas_fija_mundo before insert or update on propuestas
for each row execute function public.fija_mundo_propuesta();

revoke all on function public.fija_mundo_necesidad() from public, anon, authenticated;
revoke all on function public.fija_mundo_propuesta() from public, anon, authenticated;

-- Los anuncios de portales que encuentra la búsqueda directa (camino A, §19.2) se guardan en el
-- Radar del comprador con origen 'motor': sin "me interesa" (no disparan invitación a certificar).
alter table radar_opciones drop constraint if exists radar_opciones_origen_check;
alter table radar_opciones add constraint radar_opciones_origen_check check (origen in ('comprador', 'operacion', 'motor'));

alter table necesidades enable row level security;
alter table propuestas enable row level security;

drop policy if exists "comprador lee sus necesidades" on necesidades;
create policy "comprador lee sus necesidades" on necesidades for select to authenticated using (usuario_id = auth.uid());
drop policy if exists "operacion lee necesidades" on necesidades;
create policy "operacion lee necesidades" on necesidades for select to authenticated using (public.es_operacion());

drop policy if exists "broker lee sus propuestas" on propuestas;
create policy "broker lee sus propuestas" on propuestas for select to authenticated using (broker_id = auth.uid());
drop policy if exists "operacion lee propuestas" on propuestas;
create policy "operacion lee propuestas" on propuestas for select to authenticated using (public.es_operacion());

commit;
