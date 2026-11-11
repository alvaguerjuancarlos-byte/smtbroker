-- Lectura de anuncios de portales a petición del comprador (Documento Maestro V8, Parte 2; opción 2
-- decidida por JC el 10 de noviembre de 2026).
--
-- Cuando el comprador pega una liga o marca "Me interesa" en un anuncio de portal, la plataforma lee
-- ESA página (una sola, a petición suya; no hay extracción masiva) y saca precio, m², colonia y tipo.
-- Cada número se verifica contra el texto de la página. No se guarda nada del anunciante.
-- Muchos portales grandes bloquean la lectura (Inmuebles24, Mercado Libre, Lamudi, Propiedades.com:
-- verificación anti-robots); ahí NO se evade la protección: el comprador escribe el precio y los m²
-- que vio. Con esos datos el anuncio se analiza igual que una propiedad de la plataforma, marcado
-- "De portal · no certificada".
--
--   radar_anuncios.superficie/colonia/datos  lo leído o capturado (datos: recámaras, citas, etc.)
--   radar_anuncios.lectura                   'leido' | 'capturado' | 'bloqueado' | 'listado' | 'fallo'
--   analisis.anuncio_id                      el análisis puede ser de una propiedad o de un anuncio
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

alter table radar_anuncios add column if not exists superficie numeric;
alter table radar_anuncios add column if not exists colonia text;
alter table radar_anuncios add column if not exists datos jsonb not null default '{}'::jsonb;
alter table radar_anuncios add column if not exists lectura text
  check (lectura is null or lectura in ('leido', 'capturado', 'bloqueado', 'listado', 'fallo'));
alter table radar_anuncios add column if not exists lectura_at timestamptz;

alter table analisis alter column activo_id drop not null;
alter table analisis add column if not exists anuncio_id uuid references radar_anuncios(id) on delete cascade;
alter table analisis drop constraint if exists analisis_activo_o_anuncio;
alter table analisis add constraint analisis_activo_o_anuncio check ((activo_id is null) <> (anuncio_id is null));
create index if not exists idx_analisis_anuncio on analisis (anuncio_id, created_at desc);

commit;
