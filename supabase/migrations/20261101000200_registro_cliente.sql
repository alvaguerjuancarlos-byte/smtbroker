-- Registro inmediato para clientes (Documento Maestro V7.2: recorrido guiado; decisión de JC del
-- 1 de noviembre de 2026). Vendedores y compradores crean su cuenta en /empezar sin esperar la
-- aprobación de Operación; los brokers siguen pasando por /bienvenida y su aprobación.
--
-- contactos_cliente guarda lo que el cliente da al registrarse y NO va en `usuarios` (cuya
-- lectura es más amplia): su WhatsApp, y el hash de la IP para limitar registros por hora.
-- Lo escribe solo el servidor (app/api/registro-cliente, service_role); cada cliente lee el suyo y
-- Operación todos. El WhatsApp sale hacia la otra parte solo cuando Operación pone un match en
-- contacto (lib/contactoConexion.ts).
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

create table if not exists contactos_cliente (
  usuario_id uuid primary key references usuarios(id) on delete cascade,
  telefono text,
  registro_ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists idx_contactos_cliente_ip on contactos_cliente (registro_ip_hash, created_at desc);

alter table contactos_cliente enable row level security;

drop policy if exists "cliente lee su contacto" on contactos_cliente;
create policy "cliente lee su contacto" on contactos_cliente for select to authenticated using (usuario_id = auth.uid());
drop policy if exists "operacion lee contactos de clientes" on contactos_cliente;
create policy "operacion lee contactos de clientes" on contactos_cliente for select to authenticated using (public.es_operacion());

commit;
