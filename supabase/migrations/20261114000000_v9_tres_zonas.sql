-- Búsqueda en hasta tres zonas (Documento Maestro V9, Parte 2, §23; decisiones de JC del
-- 11 de noviembre de 2026).
--
-- Una ficha de necesidad puede buscar en hasta 3 zonas, cada una con su propio municipio (Valle en
-- San Pedro, Country y Carretera Nacional en Monterrey). Las tres valen igual y comparten un solo
-- presupuesto. Los resultados se muestran por zona: las 3 mejores de cada una.
--
--   zonas  [{ estado, municipio, nombre, colonias[], mercado? }]  de 1 a 3 elementos.
--          `mercado` lo escribe solo el servidor ("lo que rinde tu dinero", §23.2): precio por m²
--          típico de la zona con comparables reales, cuántos se usaron y la fecha.
--
-- Las columnas estado, municipio, zona y colonias se quedan como la PRIMERA zona, para que lo que
-- ya las lee (perfiles_intencion, Radar, análisis) siga funcionando.
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

alter table necesidades add column if not exists zonas jsonb not null default '[]'::jsonb;

-- Las fichas que ya existen pasan a tener una sola zona.
update necesidades
set zonas = jsonb_build_array(jsonb_build_object(
  'estado', estado, 'municipio', municipio, 'nombre', zona, 'colonias', to_jsonb(colonias)))
where zonas = '[]'::jsonb;

alter table necesidades drop constraint if exists necesidades_zonas_check;
alter table necesidades add constraint necesidades_zonas_check
  check (jsonb_typeof(zonas) = 'array' and jsonb_array_length(zonas) between 1 and 3);

commit;
