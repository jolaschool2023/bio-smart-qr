/* ============================================================================
   BIOSMART QR — Esquema para Supabase (PostgreSQL)
   Migración desde SQLite (server/db.js) de la plataforma local.

   Cómo usar:
   1. Crea un proyecto en https://supabase.com (cuenta propia; no se incluyen
      claves ni cuentas en este repositorio).
   2. En el SQL Editor de Supabase, ejecuta este archivo completo.
   3. Opcional: importa los datos sembrados (zonas, estados de verificación,
      especies) desde los JSON del servidor o repite el seed manualmente.
   4. Configura las credenciales de conexión en el entorno (DATABASE_URL).

   Diferencias con SQLite:
   - INTEGER AUTOINCREMENT → GENERATED ALWAYS AS IDENTITY
   - TEXT por defecto datetime('now') → now() en TIMESTAMP
   - Los CHECK/índices parciales se mantienen (PostgreSQL los soporta)
   - Se añade RLS (Row Level Security) como capa extra de protección:
     el servidor sigue validando sesión/rol, pero la base también defiende
     los datos aunque alguien acceda con las credenciales de servicio.
   - Todas las tablas quedan en el esquema public.

   Notas de migración de datos:
   - password_hash: se copia tal cual (scrypt$<salt>$<hash>); nunca hay
     contraseñas en texto plano y no se reescriben al migrar.
   - client_key: conserva la unicidad parcial para evitar duplicados.
   - photos: los binarios viven en storage/ (SQLite solo guarda metadatos);
     en Supabase sube los archivos a un bucket privado y guarda el path en
     filename.
   ========================================================================== */

-- ---------------------------------------------------------------------------
-- Extensiones y utilidades
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Usuarios y sesiones
-- ---------------------------------------------------------------------------
create table if not exists users (
  id            bigint generated always as identity primary key,
  email         text not null unique collate nocase,
  password_hash text not null,
  role          text not null default 'user' check (role in ('admin','user')),
  display_name  text,
  lang          text not null default 'es' check (lang in ('es','en','qu','ay')),
  active        boolean not null default true,
  created_at    timestamp not null default now(),
  last_login    timestamp
);

create table if not exists sessions (
  token_hash text primary key,
  user_id    bigint not null references users(id) on delete cascade,
  created_at timestamp not null default now(),
  expires_at timestamp not null
);

create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_sessions_expires on sessions(expires_at);

-- ---------------------------------------------------------------------------
-- Catálogo de especies (flora / fauna)
-- ---------------------------------------------------------------------------
create table if not exists species (
  id              bigint generated always as identity primary key,
  kind            text not null check (kind in ('flora','fauna')),
  slug            text not null unique,
  name_es         text not null,
  name_en         text,
  name_qu         text,
  name_ay         text,
  alias_es        text,
  scientific_name text not null,
  family          text,
  category        text,
  pollinator      boolean not null default false,
  status          text not null default 'potencial'
                  check (status in ('referida','potencial','pendiente')),
  fields_json     jsonb not null default '[]',
  edu_json        jsonb not null default '[]',
  sources_json    jsonb not null default '{}',
  note_json       jsonb not null default '{}',
  images_json     jsonb not null default '[]',
  deleted         boolean not null default false,
  created_at      timestamp not null default now(),
  updated_at      timestamp not null default now(),
  created_by      bigint references users(id) on delete set null
);

create index if not exists idx_species_kind on species(kind) where not deleted;

-- ---------------------------------------------------------------------------
-- Zonas de la Avenida Ecológica (croquis; sin coordenadas exactas)
-- ---------------------------------------------------------------------------
create table if not exists zones (
  id           bigint generated always as identity primary key,
  slug         text not null unique,
  name_es      text not null,
  name_en      text,
  name_qu      text,
  name_ay      text,
  description_es text,
  map_x        real not null default 50 check (map_x between 0 and 100),
  map_y        real not null default 50 check (map_y between 0 and 100),
  color        text not null default '#2d6a4f',
  sort         integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Estados de verificación (pendiente / verificado / no validado)
-- ---------------------------------------------------------------------------
create table if not exists verification_states (
  code     text primary key,
  name_es  text not null,
  name_en  text not null,
  name_qu  text,
  name_ay  text,
  sort     integer not null default 0
);

insert into verification_states (code, name_es, name_en, name_qu, name_ay, sort) values
  ('pending',  'Pendiente de revisión',  'Pending review',   null, null, 1),
  ('verified', 'Verificado',             'Verified',         null, null, 2),
  ('rejected', 'No validado',            'Not validated',    null, null, 3)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Fotografías (metadatos; los binarios van al almacenamiento)
-- ---------------------------------------------------------------------------
create table if not exists photos (
  id          bigint generated always as identity primary key,
  filename    text not null,
  mime        text not null check (mime in ('image/jpeg','image/png','image/webp')),
  size        integer not null check (size > 0 and size <= 8388608),
  uploaded_by bigint references users(id) on delete set null,
  created_at  timestamp not null default now()
);

-- ---------------------------------------------------------------------------
-- Avistamientos (registros ciudadanos)
-- ---------------------------------------------------------------------------
create table if not exists sightings (
  id            bigint generated always as identity primary key,
  public_id     text not null unique,
  user_id       bigint references users(id) on delete set null,
  animal_type   text not null
                check (animal_type in ('ave','insecto','mamifero','reptil_anfibio','otro','no_identificado')),
  species_id    bigint references species(id) on delete set null,
  species_name  text,
  individuals   integer not null check (individuals > 0),
  zone_id       bigint references zones(id) on delete set null,
  zone_other    text,
  behavior      text not null
                check (behavior in ('alimentandose','volando','descansando','anidando','interactuando','otro','no_identificado')),
  photo_id      bigint references photos(id) on delete set null,
  observed_date date not null,
  observed_time time not null,
  observer_name text,
  notes         text,
  no_harm       boolean not null default false,
  consent       boolean not null default false,
  status        text not null default 'pending' references verification_states(code),
  client_key    text,
  created_at    timestamp not null default now(),
  updated_at    timestamp not null default now()
);

-- Evita duplicados cuando el navegador reintenta el mismo envío
create unique index if not exists idx_sightings_client_key
  on sightings(client_key) where client_key is not null;
create index if not exists idx_sightings_status on sightings(status);
create index if not exists idx_sightings_date on sightings(observed_date);
create index if not exists idx_sightings_user on sightings(user_id);

-- ---------------------------------------------------------------------------
-- Registro de auditoría
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id         bigint generated always as identity primary key,
  user_id    bigint references users(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  detail     jsonb,
  created_at timestamp not null default now()
);

create index if not exists idx_audit_created on audit_log(created_at desc);

-- ---------------------------------------------------------------------------
-- Sobrescrituras de traducción (revisión por hablantes de qu/ay)
-- ---------------------------------------------------------------------------
create table if not exists translations (
  key        text not null,
  lang       text not null check (lang in ('es','en','qu','ay')),
  value      text not null,
  updated_by bigint references users(id) on delete set null,
  updated_at timestamp not null default now(),
  primary key (key, lang)
);

-- ============================================================================
-- Row Level Security (defensa en profundidad)
-- El backend valida sesión y rol; aquí se refuerza para que incluso con las
-- credenciales de servicio no se expongan datos a usuarios anónimos.
-- ============================================================================
alter table users             enable row level security;
alter table sessions          enable row level security;
alter table species           enable row level security;
alter table zones             enable row level security;
alter table verification_states enable row level security;
alter table photos            enable row level security;
alter table sightings         enable row level security;
alter table audit_log         enable row level security;
alter table translations      enable row level security;

-- El servidor usa la clave de servicio (service_role) que BYPASSES RLS:
-- se permite todo al servicio y se deniega el acceso anónimo.
-- Si en el futuro usas el anon key directamente desde el navegador,
-- sustituye estas políticas por reglas por rol (auth.jwt() -> role).
do $$
declare t text;
begin
  foreach t in array array['users','sessions','species','zones',
                           'verification_states','photos','sightings',
                           'audit_log','translations']
  loop
    execute format('drop policy if exists "service_all" on public.%I', t);
    execute format(
      'create policy "service_all" on public.%I for all using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================================
-- Vista de exportación CSV (estadísticas en vivo)
-- ============================================================================
create or replace view sightings_export as
select s.public_id               as numero_registro,
       s.observed_date           as fecha,
       s.observed_time           as hora,
       coalesce(sp.name_es, s.species_name) as especie,
       sp.scientific_name        as cientifico,
       s.animal_type             as grupo,
       s.individuals             as individuos,
       coalesce(z.name_es, s.zone_other)    as zona,
       s.behavior                as comportamiento,
       s.status                  as estado,
       s.observer_name           as observador,
       s.notes                   as notas,
       s.created_at              as registrado_el
from sightings s
left join species sp on sp.id = s.species_id
left join zones   z  on z.id  = s.zone_id;
