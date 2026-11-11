-- Conexión: del interés al cierre verificado (Documento Maestro V8, Parte 3, §21; decisiones de JC
-- del 10 de noviembre de 2026).
--
--   conexiones     nace cuando el comprador presiona "Quiero verla" en una propiedad que analizó: es
--                  el único momento en que se revela su nombre a la otra parte (§21.1). Con quién lo
--                  conecta depende del origen (§21.2): propuesta de broker → ese broker; particular →
--                  el dueño; con broker propio, también su broker. Validación automática cuando la
--                  propuso un broker verificado y cumple la ficha; manual (Operación) en lo demás.
--                  Guarda la visita (§21.4), la intención de oferta (§21.5), el registro de quién
--                  aportó qué (§21.6) y el cierre con su doble confirmación y seguimiento (§21.7).
--   mensajes       la conversación dentro de la plataforma (§21.3): los teléfonos se comparten
--                  solo al confirmar la visita.
--   calificaciones el comprador califica al broker al cerrar (atención, rapidez y honestidad).
--   cierres_reportados.conexion_id  el cierre que reporta un broker queda ligado a la conexión.
--
-- Todo lo escribe el servidor (app/api/conexiones). Cada parte lee lo suyo; Operación, todo.
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

create table if not exists conexiones (
  id uuid primary key default gen_random_uuid(),
  comprador_id uuid not null references usuarios(id) on delete cascade,
  activo_id uuid not null references activos(id) on delete cascade,
  necesidad_id uuid references necesidades(id) on delete set null,
  propuesta_id uuid references propuestas(id) on delete set null,
  contraparte_id uuid not null references usuarios(id) on delete cascade,   -- quien atiende la propiedad
  contraparte_es_broker boolean not null,
  broker_comprador_id uuid references usuarios(id) on delete set null,      -- si el comprador tiene broker
  origen text not null check (origen in ('propuesta', 'particular', 'red')),
  estado text not null default 'por_validar' check (estado in ('por_validar', 'activa', 'rechazada', 'cerrada', 'descartada')),
  validacion text not null check (validacion in ('automatica', 'manual')),
  validada_at timestamptz,
  aporte jsonb not null default '{}'::jsonb,                                 -- §21.6: qué aportó la plataforma y cuándo
  horarios_propuestos timestamptz[] not null default '{}',
  visita_at timestamptz,
  visita_confirmada_at timestamptz,
  recordatorio_enviado_at timestamptz,
  como_te_fue_enviado_at timestamptz,
  visita_resultado text check (visita_resultado in ('me_interesa', 'quiero_ofertar', 'descarto')),
  motivo_descarte text,
  oferta_monto numeric check (oferta_monto is null or oferta_monto > 0),
  oferta_forma_pago text,
  oferta_at timestamptz,
  cierre_precio numeric,
  cierre_fecha date,
  cierre_reportado_at timestamptz,
  cierre_confirmado_at timestamptz,                                          -- confirmación del comprador
  seguimientos_enviados smallint not null default 0,                         -- 30, 60 y 90 días
  compro_respuesta text check (compro_respuesta in ('si_esta', 'no_aun', 'otra')),
  compro_respuesta_at timestamptz,
  es_demo boolean not null default false,
  created_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  unique (comprador_id, activo_id)
);
create index if not exists idx_conexiones_comprador on conexiones (comprador_id);
create index if not exists idx_conexiones_contraparte on conexiones (contraparte_id);
create index if not exists idx_conexiones_estado on conexiones (es_demo, estado);

create table if not exists mensajes (
  id uuid primary key default gen_random_uuid(),
  conexion_id uuid not null references conexiones(id) on delete cascade,
  autor_id uuid not null references usuarios(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_mensajes_conexion on mensajes (conexion_id, created_at);

create table if not exists calificaciones (
  id uuid primary key default gen_random_uuid(),
  conexion_id uuid not null unique references conexiones(id) on delete cascade,
  broker_id uuid not null references usuarios(id) on delete cascade,
  comprador_id uuid not null references usuarios(id) on delete cascade,
  atencion smallint not null check (atencion between 1 and 5),
  rapidez smallint not null check (rapidez between 1 and 5),
  honestidad smallint not null check (honestidad between 1 and 5),
  comentario text check (comentario is null or char_length(comentario) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists idx_calificaciones_broker on calificaciones (broker_id);

alter table cierres_reportados add column if not exists conexion_id uuid references conexiones(id) on delete set null;

-- Mundo (demo/real): lo decide el comprador que crea la conexión.
create or replace function public.fija_mundo_conexion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.es_demo := coalesce((select es_demo from usuarios where id = new.comprador_id), false);
  else
    new.es_demo := old.es_demo;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_conexiones_fija_mundo on conexiones;
create trigger trg_conexiones_fija_mundo before insert or update on conexiones
for each row execute function public.fija_mundo_conexion();
revoke all on function public.fija_mundo_conexion() from public, anon, authenticated;

-- ¿El usuario es parte de la conexión? (para las políticas de mensajes, sin recursión)
create or replace function public.es_parte_conexion(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conexiones
    where id = c and auth.uid() in (comprador_id, contraparte_id, broker_comprador_id)
  )
$$;
revoke all on function public.es_parte_conexion(uuid) from public, anon;
grant execute on function public.es_parte_conexion(uuid) to authenticated;

alter table conexiones enable row level security;
alter table mensajes enable row level security;
alter table calificaciones enable row level security;

drop policy if exists "partes leen su conexion" on conexiones;
create policy "partes leen su conexion" on conexiones for select to authenticated
  using (auth.uid() in (comprador_id, contraparte_id, broker_comprador_id));
drop policy if exists "operacion lee conexiones" on conexiones;
create policy "operacion lee conexiones" on conexiones for select to authenticated using (public.es_operacion());

drop policy if exists "partes leen sus mensajes" on mensajes;
create policy "partes leen sus mensajes" on mensajes for select to authenticated using (public.es_parte_conexion(conexion_id));
drop policy if exists "operacion lee mensajes" on mensajes;
create policy "operacion lee mensajes" on mensajes for select to authenticated using (public.es_operacion());

drop policy if exists "broker y comprador leen su calificacion" on calificaciones;
create policy "broker y comprador leen su calificacion" on calificaciones for select to authenticated
  using (auth.uid() in (broker_id, comprador_id));
drop policy if exists "operacion lee calificaciones" on calificaciones;
create policy "operacion lee calificaciones" on calificaciones for select to authenticated using (public.es_operacion());

commit;
