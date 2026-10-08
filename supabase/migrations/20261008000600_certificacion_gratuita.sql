-- Decisión de JC (2026-10-07): la certificación legal es GRATIS, como gancho para participar en la
-- plataforma, con límite de 3 al mes por persona (los Pioneros sin límite; el límite vive en
-- app/api/certificaciones). La monetización queda en los precios de cierre (índice, suscripción) y
-- en la fracción de la comisión al cierre (Documento Maestro V6.3, §16).
--
-- Sin pago, los estados 'solicitada' (pago pendiente) y 'pagada' sobran: una solicitud entra
-- directo 'en_revision' (Operación corre el dictamen y certifica o rechaza).
--   antes:  solicitada → pagada → certificada | rechazada
--   ahora:  en_revision → certificada | rechazada
-- pago_referencia se queda (sin uso) por si algún día se cobra el excedente del límite.
--
-- NOTA: se aplica a mano en el SQL Editor. Aplicarla y desplegar el código del mismo cambio juntos.

begin;

drop index if exists idx_certificaciones_abierta;

alter table certificaciones drop constraint if exists certificaciones_estado_check;
update certificaciones set estado = 'en_revision' where estado in ('solicitada', 'pagada');
alter table certificaciones add constraint certificaciones_estado_check
  check (estado in ('en_revision', 'certificada', 'rechazada'));
alter table certificaciones alter column estado set default 'en_revision';

-- Una sola certificación abierta por activo.
create unique index idx_certificaciones_abierta on certificaciones (activo_id) where estado = 'en_revision';

commit;
