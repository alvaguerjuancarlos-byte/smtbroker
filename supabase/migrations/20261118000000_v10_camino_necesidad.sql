-- EslAix V10 §27 (18-nov-2026): cómo quiere hacerlo el cliente, elegido en la entrada (§24.1).
-- "por_mi_cuenta" | "con_asesor". Las fichas existentes quedan "por_mi_cuenta" (§27, base de datos).
-- "Recibir propuestas de asesores" ya existe: es necesidades.publicada_brokers.
alter table public.necesidades add column if not exists camino text not null default 'por_mi_cuenta';
do $$ begin
  alter table public.necesidades add constraint necesidades_camino_valido check (camino in ('por_mi_cuenta', 'con_asesor'));
exception when duplicate_object then null; end $$;
