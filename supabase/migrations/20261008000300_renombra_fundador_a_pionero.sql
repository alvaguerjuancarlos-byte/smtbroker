-- La marca de los brokers del piloto se llamaba "Fundador" (20261008000100_broker_fundador.sql).
-- JC (2026-10-07): "Fundador" es un concepto muy fuerte (suena a socio de la empresa); se renombra
-- a "Pionero", en la línea de early adopter. Todavía no había ningún broker marcado.
--
-- Se renombra la columna (no se crea otra) para que no quede el nombre viejo escondido. Los
-- permisos no cambian: authenticated sigue pudiendo editar solo `nombre` en usuarios; la marca la
-- pone Operación desde app/api/operacion/pionero.
--
-- NOTA: se aplica a mano en el SQL Editor. Aplicarla y desplegar el código del mismo cambio juntos:
-- el código anterior lee `fundador` y el nuevo lee `pionero`.

begin;

alter table usuarios rename column fundador to pionero;

commit;
