-- ============================================================================
-- Fase 2 (execução orçamentária): crédito disponível
-- ============================================================================
-- SNAPSHOT datado, não saldo vivo: o sisub NÃO recalcula o saldo do SIAFI.
-- A tela exibe o oficial (deste snapshot) ao lado do comprometimento local
-- (empenhos do sisub lançados DEPOIS do snapshot) — nunca somados, mesmo
-- padrão que o painel de ARP usa para saldo oficial × local.
-- ============================================================================

create table finance.budget_credit (
  id uuid primary key default gen_random_uuid(),
  unit_id bigint not null references core.units (id),
  ug text,
  nd text not null,
  ptres text,
  fonte text,
  competencia date not null,
  dotacao numeric(14,2) not null default 0,
  empenhado_siafi numeric(14,2) not null default 0,
  saldo_siafi numeric(14,2) not null default 0,
  snapshot_at timestamptz not null default now(),
  import_batch_id uuid references siafi_integration.import_batch (id) on delete set null,
  created_at timestamptz not null default now(),
  -- uma linha por classificação × competência: novo snapshot SUBSTITUI
  constraint budget_credit_classification_key
    unique (unit_id, ug, nd, ptres, fonte, competencia)
);

comment on table finance.budget_credit is
  'Crédito disponível por classificação orçamentária — SNAPSHOT do SIAFI (Tesouro Gerencial), com a data em que foi tirado. O sisub nunca recalcula o saldo oficial; a tela mostra o comprometimento local separadamente.';
comment on column finance.budget_credit.snapshot_at is
  'Momento do dado no SIAFI. Empenhos locais posteriores a esta data compõem o comprometimento local exibido ao lado.';

create index budget_credit_unit_competencia_idx on finance.budget_credit (unit_id, competencia desc);
create index budget_credit_nd_idx on finance.budget_credit (unit_id, nd);

alter table finance.budget_credit enable row level security;
