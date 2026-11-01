-- Detalles de la búsqueda del comprador (Documento Maestro V7.2; maqueta del panel aprobada por JC el
-- 1 de noviembre de 2026): en su panel (/inicio) el comprador afina lo que busca -- recámaras,
-- baños, m² mínimos, zonas preferidas, estacionamientos e imprescindibles.
--
-- Por ahora el motor de matching sigue cruzando solo tipo, zona y presupuesto (lib/matching.ts);
-- los detalles le sirven al comprador, a Operación y a los brokers, y luego al motor.
-- Los escribe el propio comprador: la política "comprador administra su perfil" ya lo permite.
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

alter table perfiles_intencion add column if not exists detalles jsonb not null default '{}'::jsonb;
