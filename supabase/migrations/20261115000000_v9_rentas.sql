-- Rentas (Documento Maestro V9, Parte 1, §22; decisiones de JC del 11 de noviembre de 2026).
--
-- El mismo recorrido de la V8 sirve para rentar. La ficha de necesidad gana su operación
-- (comprar o rentar, obligatoria, una por ficha) y la propiedad la suya (venta, renta o las dos).
--
-- necesidades
--   operacion  'compra' | 'renta'. Las fichas que ya existen son de compra.
--   renta      solo en renta: { plazo_contrato, garantia, fecha_entrada, amueblada, mascotas }.
--              En renta, presupuesto_min/max son la renta MENSUAL; forma_pago, plazo y proposito
--              quedan en null (no aplican).
--
-- activos
--   operacion     'venta' | 'renta' | 'ambas'. Las que ya existen están en venta.
--   renta_mensual renta mensual en pesos (obligatoria si está en renta; lo valida la app).
--   renta         { incluye_mantenimiento, mantenimiento, deposito_meses, plazo_minimo, garantia,
--                   amueblada, mascotas }.
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

alter table necesidades add column if not exists operacion text not null default 'compra';
alter table necesidades drop constraint if exists necesidades_operacion_check;
alter table necesidades add constraint necesidades_operacion_check check (operacion in ('compra', 'renta'));
alter table necesidades add column if not exists renta jsonb;

alter table activos add column if not exists operacion text not null default 'venta';
alter table activos drop constraint if exists activos_operacion_check;
alter table activos add constraint activos_operacion_check check (operacion in ('venta', 'renta', 'ambas'));
alter table activos add column if not exists renta_mensual numeric;
alter table activos add column if not exists renta jsonb;

create index if not exists idx_necesidades_operacion on necesidades (operacion);

commit;
