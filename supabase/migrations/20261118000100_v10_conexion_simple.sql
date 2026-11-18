-- EslAix V10 §25 (18-nov-2026): la plataforma solo conecta. Seguimiento ligero que marca el cliente
-- y pregunta automática a los 7 días. No se borra nada: visita, oferta y solicitud de renta se quedan
-- en la tabla; solo se retiran sus pantallas y avisos (§25.6).
alter table public.conexiones add column if not exists estado_cliente text not null default 'conectado';
alter table public.conexiones add column if not exists motivo_descarte text;
alter table public.conexiones add column if not exists estado_cliente_at timestamptz;
alter table public.conexiones add column if not exists siete_dias_enviado_at timestamptz;
do $$ begin
  alter table public.conexiones add constraint conexiones_estado_cliente_valido
    check (estado_cliente in ('conectado', 'visitada', 'negociando', 'cerrada', 'descartada'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.conexiones add constraint conexiones_motivo_descarte_valido
    check (motivo_descarte is null or motivo_descarte in ('precio', 'estado', 'ubicacion', 'otro'));
exception when duplicate_object then null; end $$;
