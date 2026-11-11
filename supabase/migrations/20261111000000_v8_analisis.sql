-- Análisis de propiedades para el comprador (Documento Maestro V8, Parte 2, §20; decisiones de JC del
-- 10 de noviembre de 2026).
--
--   analisis                el análisis que recibe un comprador al marcar "Me interesa" en una propiedad
--                           de su bandeja: precio contra mercado, plusvalía, cumplimiento de su ficha,
--                           solidez del dato, el análisis por tipo y propósito, y lo legal. Lo escribe
--                           solo el servidor (app/api/analisis). Lo lee SOLO el comprador (y Operación):
--                           "Me interesa" no revela al cliente (§20.5 regla 2), así que ni el dueño ni
--                           el broker lo pueden leer. Hasta 5 activos a la vez (los no descartados); el
--                           análisis por tipo tiene tope de 5 propiedades al mes (§20.5 regla 3).
--   propuestas.precio_mercado  precio contra mercado de la propiedad propuesta, calculado al proponer:
--                           es lo único del análisis que ve el broker (§20.5 regla 4), sin saber si
--                           alguien se interesó.
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

create table if not exists analisis (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  activo_id uuid not null references activos(id) on delete cascade,
  necesidad_id uuid references necesidades(id) on delete set null,
  resultado jsonb not null,
  por_tipo boolean not null default false,          -- incluyó el análisis por tipo (cuenta para el tope mensual)
  descartado boolean not null default false,        -- el comprador lo quitó de su comparativo
  es_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_analisis_usuario on analisis (usuario_id, created_at desc);
create index if not exists idx_analisis_activo on analisis (activo_id, created_at desc);

alter table propuestas add column if not exists precio_mercado jsonb;

create or replace function public.fija_mundo_analisis()
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
drop trigger if exists trg_analisis_fija_mundo on analisis;
create trigger trg_analisis_fija_mundo before insert or update on analisis
for each row execute function public.fija_mundo_analisis();
revoke all on function public.fija_mundo_analisis() from public, anon, authenticated;

alter table analisis enable row level security;
drop policy if exists "comprador lee sus analisis" on analisis;
create policy "comprador lee sus analisis" on analisis for select to authenticated using (usuario_id = auth.uid());
drop policy if exists "operacion lee analisis" on analisis;
create policy "operacion lee analisis" on analisis for select to authenticated using (public.es_operacion());

commit;
