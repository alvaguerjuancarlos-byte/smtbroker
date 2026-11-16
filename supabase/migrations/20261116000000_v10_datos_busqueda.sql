-- V10 §29.3: datos que el buscador (MindBridge Search) necesita para filtrar.
-- Recámaras, baños (medio baño = 0.5), estacionamientos, antigüedad y amenidades (vocabulario
-- cerrado, el mismo de docs/schemas/property.json del motor). Todos opcionales: sin dato = NULL.
-- Aplicar una vez en el SQL Editor de Supabase. Idempotente.
alter table public.activos add column if not exists recamaras        int          check (recamaras >= 0);
alter table public.activos add column if not exists banos            numeric(4,1) check (banos >= 0);
alter table public.activos add column if not exists estacionamientos int          check (estacionamientos >= 0);
alter table public.activos add column if not exists antiguedad_anios int          check (antiguedad_anios >= 0);
alter table public.activos add column if not exists amenidades       text[]       not null default '{}';

do $$ begin
  alter table public.activos add constraint activos_amenidades_validas check (
    amenidades <@ array['alberca','jardin','seguridad_24h','pet_friendly','gimnasio','terraza','roof_garden','elevador','cuarto_de_servicio','area_de_juegos']::text[]);
exception when duplicate_object then null; end $$;
