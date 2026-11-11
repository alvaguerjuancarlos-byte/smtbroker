-- Rentas, parte B (Documento Maestro V9, §22.5 y §22.6; decisiones de JC del 11 de noviembre de 2026).
--
-- conexiones.solicitud_renta   En una conexión de renta, la "intención de oferta" es una SOLICITUD
--                              DE RENTA: la renta ofrecida va en oferta_monto (como el monto de la
--                              oferta) y aquí lo demás: { plazo_contrato, garantia, fecha_entrada }.
--                              El cierre verificado es el contrato firmado: cierre_precio es la renta
--                              mensual del contrato y cierre_fecha, la fecha de firma.
-- cierres_reportados.operacion 'venta' | 'renta': un cierre de renta cuenta para el nivel del broker,
--                              pero su precio (renta mensual) no se mezcla con precios de venta.
-- certificaciones.alcance      'venta' | 'renta'. La de renta es más ligera (§22.6): que quien renta
--                              pueda rentar (identidad o poder, escritura o constancia, predial al
--                              corriente) y el uso de suelo para el giro en locales, oficinas y
--                              bodegas. Una certificación de venta también sirve para rentar.
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

alter table conexiones add column if not exists solicitud_renta jsonb;

alter table cierres_reportados add column if not exists operacion text not null default 'venta';
alter table cierres_reportados drop constraint if exists cierres_reportados_operacion_check;
alter table cierres_reportados add constraint cierres_reportados_operacion_check check (operacion in ('venta', 'renta'));

alter table certificaciones add column if not exists alcance text not null default 'venta';
alter table certificaciones drop constraint if exists certificaciones_alcance_check;
alter table certificaciones add constraint certificaciones_alcance_check check (alcance in ('venta', 'renta'));

commit;
