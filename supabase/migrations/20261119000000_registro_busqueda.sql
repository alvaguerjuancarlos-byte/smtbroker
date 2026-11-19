-- Registro de cada búsqueda (guion v12, momento 3; JC, 19-nov-2026): todo lo que SMT Match revisó al
-- guardar una necesidad, con su fuente y si pasó o por qué no:
--   - propiedades de la plataforma (cumplen o no la ficha, con el motivo);
--   - resultados de portales (los que se muestran y los descartados: dominio no reconocido, otra
--     operación, límite por zona…);
--   - comparables de precio que usó "lo que rinde tu dinero" (usados, atípicos, de otro tamaño…).
-- El cliente ve solo el resumen ("Revisamos N en N fuentes. N cumplen lo que pides"); Operación ve
-- el detalle en /panel ("Lo que encontró la búsqueda"). Lo escribe solo el servidor (service_role,
-- lib/necesidadServidor.ts) y lo leen el servidor y Operación.
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

create table if not exists busquedas_registro (
  necesidad_id uuid primary key references necesidades(id) on delete cascade,
  usuario_id   uuid not null references usuarios(id) on delete cascade,
  es_demo      boolean not null default false,
  resumen      jsonb not null,
  items        jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_busquedas_registro_fecha on busquedas_registro (es_demo, created_at desc);

alter table busquedas_registro enable row level security;

drop policy if exists "operacion lee registros de busqueda" on busquedas_registro;
create policy "operacion lee registros de busqueda" on busquedas_registro for select to authenticated using (public.es_operacion());

commit;
