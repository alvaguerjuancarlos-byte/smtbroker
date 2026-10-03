-- Dos hallazgos críticos de la auditoría integral 2026-10-03, verificados en vivo contra la BD
-- real (cuenta de prueba creada y eliminada, nunca se dejó ningún dato de prueba en produccion).
--
-- NOTA: este proyecto no tiene CLI de Supabase conectada -- este archivo documenta el cambio en
-- el repo aunque haya que aplicarlo a mano en el SQL Editor (mismo criterio que
-- 20260909000000_agrega_broker_id_activos.sql y 20260927000000_agrega_es_demo_usuarios.sql).

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Escalación de privilegios: cualquier cuenta autenticada podía auto-otorgarse rol
--    broker_maestro con un UPDATE directo sobre su propio registro:
--
--      supabase.from('usuarios').update({ rol: 'broker_maestro' }).eq('id', miId)
--
--    La RLS existente permite auth.uid() = id en usuarios (necesario para que cada quien pueda
--    ver/editar su propio perfil), pero no distinguía QUÉ columnas se podían tocar -- y Postgres
--    sí lo distingue, a nivel de GRANT, independiente de la sintaxis de RLS. Único lugar del
--    código que hoy escribe en usuarios es app/api/invitar-usuario/route.ts, que ya usa
--    supabaseAdmin (service_role, bypassa esto a propósito) -- ningún flujo legítimo del cliente
--    depende de actualizar otra columna distinta a "nombre", así que restringir no rompe nada.
-- ════════════════════════════════════════════════════════════════════════════════════════════

revoke update on table usuarios from authenticated;
grant update (nombre) on table usuarios to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. El formulario público /bienvenida (única puerta de entrada para propietarios, brokers e
--    inversionistas nuevos) inserta directo en "solicitudes" con la clave anónima -- no existía
--    ninguna política de INSERT para el rol anon, así que cada envío fallaba con 401 ("new row
--    violates row-level security policy"). Confirmado: la tabla tiene 0 filas en producción.
--    Se acota el INSERT a status='pendiente' -- nadie externo debe poder crear una solicitud ya
--    aprobada.
-- ════════════════════════════════════════════════════════════════════════════════════════════

create policy "cualquiera puede enviar una solicitud desde /bienvenida"
on solicitudes for insert
to anon, authenticated
with check (status = 'pendiente');
