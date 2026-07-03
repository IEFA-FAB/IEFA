-- ============================================================================
-- Nutrition reference tables (TACO, IBGE, USDA, TBCA, Tucunduva)
-- ============================================================================
-- External food composition tables live outside kitchen data. Ingredients link to
-- a food revision, while manually entered kitchen.ingredient_nutrient rows stay
-- intact and become active again if the link is removed.
-- ============================================================================

create schema if not exists nutrition_reference;

create table nutrition_reference.source (
  id              text primary key,
  display_name    text not null,
  publisher       text,
  country_code    text,
  license_name    text,
  license_url     text,
  citation        text,
  import_mode     text not null default 'disabled',
  sync_enabled    boolean not null default false,
  source_priority integer not null default 100,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint nutrition_source_import_mode_check
    check (import_mode in ('auto_download', 'manual_file', 'external_lookup', 'disabled'))
);

create table nutrition_reference.source_release (
  id             uuid primary key default gen_random_uuid(),
  source_id      text not null references nutrition_reference.source(id) on delete cascade,
  version_label  text not null,
  published_at   timestamptz,
  upstream_url   text,
  download_url   text,
  etag           text,
  last_modified  text,
  checksum_sha256 text,
  status         text not null default 'active',
  fetched_at     timestamptz,
  imported_at    timestamptz,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint nutrition_source_release_status_check
    check (status in ('active', 'superseded', 'blocked', 'failed'))
);

create unique index nutrition_source_release_source_version_key
  on nutrition_reference.source_release(source_id, version_label);

create table nutrition_reference.food_item (
  id                  uuid primary key default gen_random_uuid(),
  source_id           text not null references nutrition_reference.source(id) on delete cascade,
  external_code       text not null,
  current_revision_id uuid,
  created_at          timestamptz not null default now(),
  unique (source_id, external_code)
);

create table nutrition_reference.food_item_revision (
  id                    uuid primary key default gen_random_uuid(),
  food_item_id           uuid not null references nutrition_reference.food_item(id) on delete cascade,
  source_release_id      uuid not null references nutrition_reference.source_release(id) on delete restrict,
  display_name           text not null,
  original_name          text,
  group_code             text,
  group_name             text,
  food_type              text,
  brand_name             text,
  preparation_state      text,
  scientific_name        text,
  base_quantity          numeric not null default 100,
  base_unit              text not null default 'g',
  edible_portion_factor  numeric,
  normalized_name        text not null,
  content_hash           text not null,
  raw                    jsonb not null default '{}'::jsonb,
  is_current             boolean not null default false,
  created_at             timestamptz not null default now(),
  unique (food_item_id, source_release_id, content_hash)
);

alter table nutrition_reference.food_item
  add constraint food_item_current_revision_id_fkey
  foreign key (current_revision_id)
  references nutrition_reference.food_item_revision(id)
  on delete set null;

create index nutrition_food_revision_search_idx
  on nutrition_reference.food_item_revision using gin (
    to_tsvector('portuguese', coalesce(normalized_name, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(group_name, ''))
  );

create index nutrition_food_revision_current_idx
  on nutrition_reference.food_item_revision(food_item_id)
  where is_current;

create table nutrition_reference.nutrient_component (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null references nutrition_reference.source(id) on delete cascade,
  external_code text not null,
  name          text not null,
  unit          text,
  infoods_tag   text,
  raw           jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (source_id, external_code)
);

create table nutrition_reference.nutrient_component_mapping (
  id                    uuid primary key default gen_random_uuid(),
  component_id           uuid not null references nutrition_reference.nutrient_component(id) on delete cascade,
  nutrient_id            uuid not null references kitchen.nutrient(id) on delete cascade,
  conversion_multiplier  numeric not null default 1,
  conversion_offset      numeric not null default 0,
  is_preferred           boolean not null default true,
  confidence             text not null default 'seeded',
  created_at             timestamptz not null default now(),
  constraint nutrition_component_mapping_confidence_check
    check (confidence in ('seeded', 'reviewed', 'inferred')),
  unique (component_id, nutrient_id)
);

create table nutrition_reference.food_nutrient_value (
  id               uuid primary key default gen_random_uuid(),
  food_revision_id uuid not null references nutrition_reference.food_item_revision(id) on delete cascade,
  component_id      uuid not null references nutrition_reference.nutrient_component(id) on delete cascade,
  value             numeric,
  value_kind        text not null default 'measured',
  raw_value         text,
  raw               jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint nutrition_food_nutrient_value_kind_check
    check (value_kind in ('measured', 'calculated', 'assumed', 'trace', 'not_analyzed', 'missing')),
  unique (food_revision_id, component_id)
);

create table kitchen.ingredient_nutrition_reference (
  ingredient_id    uuid primary key references kitchen.ingredient(id) on delete cascade,
  food_revision_id uuid not null references nutrition_reference.food_item_revision(id) on delete restrict,
  match_status     text not null default 'manual',
  linked_at        timestamptz not null default now(),
  linked_by        uuid,
  notes            text,
  constraint ingredient_nutrition_reference_status_check
    check (match_status in ('manual', 'suggested', 'reviewed'))
);

create index ingredient_nutrition_reference_food_idx
  on kitchen.ingredient_nutrition_reference(food_revision_id);

create table nutrition_reference.nutrition_sync_log (
  id                 bigserial primary key,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  triggered_by       text not null default 'cron',
  status             text not null default 'running',
  total_steps        integer not null default 0,
  completed_steps    integer not null default 0,
  successful_steps   integer not null default 0,
  failed_steps       integer not null default 0,
  total_upserted     integer not null default 0,
  total_deactivated  integer not null default 0,
  error_message      text,
  heartbeat_at       timestamptz,
  stop_requested     boolean not null default false
);

create index nutrition_sync_log_started_at_idx
  on nutrition_reference.nutrition_sync_log(started_at desc);

create table nutrition_reference.nutrition_sync_step (
  id                  bigserial primary key,
  sync_id              bigint not null references nutrition_reference.nutrition_sync_log(id) on delete cascade,
  step_name            text not null,
  status               text not null default 'pending',
  current_page         integer not null default 0,
  total_pages          integer,
  records_upserted     integer not null default 0,
  records_deactivated  integer not null default 0,
  error_message        text,
  started_at           timestamptz,
  finished_at          timestamptz,
  unique (sync_id, step_name)
);

create function nutrition_reference.nutrition_sync_step_success(p_sync_id bigint, p_upserted integer)
returns void language sql as $$
  update nutrition_reference.nutrition_sync_log
  set
    completed_steps  = completed_steps + 1,
    successful_steps = successful_steps + 1,
    total_upserted   = total_upserted + p_upserted
  where id = p_sync_id;
$$;

create function nutrition_reference.nutrition_sync_step_failure(p_sync_id bigint)
returns void language sql as $$
  update nutrition_reference.nutrition_sync_log
  set
    completed_steps = completed_steps + 1,
    failed_steps    = failed_steps + 1
  where id = p_sync_id;
$$;

alter table nutrition_reference.source enable row level security;
alter table nutrition_reference.source_release enable row level security;
alter table nutrition_reference.food_item enable row level security;
alter table nutrition_reference.food_item_revision enable row level security;
alter table nutrition_reference.nutrient_component enable row level security;
alter table nutrition_reference.nutrient_component_mapping enable row level security;
alter table nutrition_reference.food_nutrient_value enable row level security;
alter table nutrition_reference.nutrition_sync_log enable row level security;
alter table nutrition_reference.nutrition_sync_step enable row level security;
alter table kitchen.ingredient_nutrition_reference enable row level security;

insert into nutrition_reference.source
  (id, display_name, publisher, country_code, license_name, license_url, citation, import_mode, sync_enabled, source_priority, metadata)
values
  (
    'taco',
    'TACO',
    'NEPA/UNICAMP',
    'BR',
    'Uso institucional mediante fonte oficial',
    'https://nepa.unicamp.br/publicacoes/tabela-taco-excel/',
    'Tabela Brasileira de Composição de Alimentos, 4ª edição, NEPA/UNICAMP, 2011.',
    'auto_download',
    true,
    10,
    '{"default_version":"4a edicao 2011"}'
  ),
  (
    'ibge_pof_2008_2009',
    'IBGE POF 2008-2009',
    'IBGE',
    'BR',
    'Uso institucional mediante fonte oficial',
    'https://biblioteca.ibge.gov.br/index.php/biblioteca-catalogo?id=250002&view=detalhes',
    'Tabelas de Composição Nutricional dos Alimentos Consumidos no Brasil, POF 2008-2009, IBGE.',
    'auto_download',
    true,
    20,
    '{}'
  ),
  (
    'usda_fdc',
    'USDA FoodData Central',
    'USDA Agricultural Research Service',
    'US',
    'CC0 / domínio público',
    'https://fdc.nal.usda.gov/',
    'USDA FoodData Central.',
    'auto_download',
    true,
    30,
    '{"datasets":["foundation","sr_legacy","fndds"],"branded_foods":false}'
  ),
  (
    'tbca',
    'TBCA',
    'USP/FoRC',
    'BR',
    'CC BY-NC-ND',
    'https://www.tbca.net.br/',
    'Tabela Brasileira de Composição de Alimentos, USP/FoRC.',
    'manual_file',
    false,
    40,
    '{"requires_authorized_file":true}'
  ),
  (
    'tucunduva',
    'Tucunduva',
    'Editora Manole',
    'BR',
    'Fonte editorial licenciada',
    null,
    'Philippi, Sonia Tucunduva. Tabela de composição de alimentos: suporte para decisão nutricional.',
    'manual_file',
    false,
    50,
    '{"requires_authorized_file":true}'
  )
on conflict (id) do update
set
  display_name = excluded.display_name,
  publisher = excluded.publisher,
  country_code = excluded.country_code,
  license_name = excluded.license_name,
  license_url = excluded.license_url,
  citation = excluded.citation,
  import_mode = excluded.import_mode,
  sync_enabled = excluded.sync_enabled,
  source_priority = excluded.source_priority,
  metadata = excluded.metadata,
  updated_at = now();

notify pgrst, 'reload schema';
