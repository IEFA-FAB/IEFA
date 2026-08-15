-- ============================================================================
-- Fase 1 (execução orçamentária): staging da importação SIAFI
-- ============================================================================
-- Primeiras tabelas do schema siafi_integration (reservado vazio desde
-- 20260624120000). O SIAFI não tem API pública de escrita e a leitura
-- programática depende de credencial institucional — nesta fase os dados
-- entram por ARQUIVO exportado do Tesouro Gerencial.
--
-- Papel deste schema: guardar o BRUTO. Cada linha do arquivo fica em jsonb
-- antes de qualquer normalização, para (a) rastrear "de onde veio este
-- número" e (b) reprocessar sem pedir novo upload quando o parser evoluir.
-- O domínio normalizado vive em `finance` (fases seguintes).
-- ============================================================================

create table siafi_integration.import_batch (
  id uuid primary key default gen_random_uuid(),
  unit_id bigint not null references core.units (id),
  report_type text not null
    check (report_type in ('credito', 'ne', 'ns', 'ob')),
  file_name text not null,
  -- sha-256 do conteúdo: reimportar o MESMO arquivo é no-op idempotente
  content_hash text not null,
  competencia date,
  status text not null default 'parsed'
    check (status in ('parsed', 'applied', 'failed')),
  total_rows integer not null default 0,
  recognized_rows integer not null default 0,
  applied_rows integer not null default 0,
  error_message text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint import_batch_hash_key unique (unit_id, content_hash)
);

comment on table siafi_integration.import_batch is
  'Lote de importação de relatório do Tesouro Gerencial (crédito/NE/NS/OB). content_hash único por unidade — reimportar o mesmo arquivo não cria lote novo.';

create index import_batch_unit_idx on siafi_integration.import_batch (unit_id, report_type, created_at desc);

create table siafi_integration.import_row (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references siafi_integration.import_batch (id) on delete cascade,
  row_number integer not null,
  -- linha CRUA como veio do arquivo (cabeçalho original → valor)
  raw jsonb not null,
  -- resultado do parse: campos normalizados (numero_documento, valores, datas…)
  parsed jsonb,
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'parsed', 'unrecognized', 'invalid')),
  parse_error text,
  -- vínculo com o domínio após a aplicação (fase 5)
  applied_table text,
  applied_id uuid,
  constraint import_row_batch_number_key unique (batch_id, row_number)
);

comment on table siafi_integration.import_row is
  'Linha crua do relatório + resultado do parse. Preservada para reprocessamento sem novo upload e para auditoria da origem de cada número.';

create index import_row_batch_status_idx on siafi_integration.import_row (batch_id, parse_status);

-- ----------------------------------------------------------------------------
-- RLS: DENY-ALL para anon/authenticated — acesso apenas via server fns
-- (service role) com PBAC `unit` escopado por unidade.
-- ----------------------------------------------------------------------------
alter table siafi_integration.import_batch enable row level security;
alter table siafi_integration.import_row enable row level security;
