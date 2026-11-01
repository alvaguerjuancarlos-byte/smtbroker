-- Radar de mercado, fase 1 asistida (Documento Maestro V7.1, §18; decisión de JC del 1 de
-- noviembre de 2026: fuentes 1 y 2).
--
-- Para el comprador que va por su cuenta: opciones del mercado (anuncios de portales y otros
-- medios) marcadas como NO certificadas. Llegan por dos fuentes, ambas sin extracción automática:
--   1. el comprador pega la liga de un anuncio que vio;
--   2. Operación busca a mano con sus criterios y le agrega opciones.
-- Cuando el comprador se interesa, Operación invita al anunciante -- UNA vez por anuncio, aunque
-- haya varios compradores -- a certificar su propiedad en SMTBROKER. No intermedia ni negocia.
--
--   radar_anuncios  -> un anuncio externo (único por liga) y el estado de SU invitación.
--   radar_opciones  -> un anuncio en el Radar de un comprador (quién lo trajo, si le interesa).
--
-- El contacto del anunciante solo se guarda mientras dura la invitación (el servidor lo borra al
-- cerrarla) y nunca sale de Operación. TODO el acceso pasa por el servidor (app/api/radar,
-- service_role); la RLS solo deja leer a Operación.
--
-- NOTA: se aplica a mano en el SQL Editor del proyecto vdxadjaptothfgjrakij.

begin;

create table if not exists radar_anuncios (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  fuente text not null,                     -- dominio del anuncio (inmuebles24.com, facebook.com…)
  titulo text,
  precio numeric,
  tipo text,
  municipio text,
  es_demo boolean not null default false,
  anunciante_contacto text,                 -- solo mientras dura la invitación
  invitacion_estado text not null default 'sin_invitar'
    check (invitacion_estado in ('sin_invitar', 'pendiente', 'enviada', 'aceptada', 'rechazada', 'sin_respuesta')),
  invitacion_canal text check (invitacion_canal in ('correo', 'whatsapp', 'portal', 'telefono')),
  invitacion_enviada_at timestamptz,
  activo_id uuid references activos(id) on delete set null,  -- la propiedad ya registrada en SMTBROKER
  created_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  unique (url, es_demo)
);

create table if not exists radar_opciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles_intencion(id) on delete cascade,
  anuncio_id uuid not null references radar_anuncios(id) on delete cascade,
  origen text not null check (origen in ('comprador', 'operacion')),
  nota text,                                -- lo que el comprador escribió al pegar la liga
  interesado_at timestamptz,                -- "Me interesa": pide la invitación
  created_at timestamptz not null default now(),
  unique (perfil_id, anuncio_id)
);
create index if not exists idx_radar_opciones_anuncio on radar_opciones (anuncio_id);

alter table radar_anuncios enable row level security;
alter table radar_opciones enable row level security;

drop policy if exists "operacion lee el radar" on radar_anuncios;
create policy "operacion lee el radar" on radar_anuncios for select to authenticated using (public.es_operacion());
drop policy if exists "operacion lee las opciones del radar" on radar_opciones;
create policy "operacion lee las opciones del radar" on radar_opciones for select to authenticated using (public.es_operacion());

commit;
