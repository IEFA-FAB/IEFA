-- Log de execuções do sync de tabelas nutricionais legadas.
-- A execução "test" roda contra produção, mas pode ser limitada para validar o
-- caminho sem varrer todo o legado.

create table if not exists kitchen.nutrition_sync_log (
  id                              bigserial primary key,
  started_at                      timestamptz not null default now(),
  finished_at                     timestamptz,
  triggered_by                    text not null check (triggered_by in ('test', 'manual', 'cron')),
  dry_run                         boolean not null default false,
  status                          text not null default 'running' check (status in ('running', 'success', 'error')),
  max_nutrients                   integer,
  max_ingredient_nutrients        integer,
  nutrients_read                  integer not null default 0,
  nutrients_skipped               integer not null default 0,
  nutrients_upserted              integer not null default 0,
  nutrient_lookups_upserted       integer not null default 0,
  ingredient_nutrients_read       integer not null default 0,
  ingredient_nutrients_skipped    integer not null default 0,
  ingredient_nutrients_upserted   integer not null default 0,
  error_message                   text,
  summary                         jsonb not null default '{}'::jsonb
);

create index if not exists nutrition_sync_log_started_at_idx
  on kitchen.nutrition_sync_log (started_at desc);

create index if not exists nutrition_sync_log_triggered_by_started_at_idx
  on kitchen.nutrition_sync_log (triggered_by, started_at desc);

alter table kitchen.nutrition_sync_log enable row level security;
