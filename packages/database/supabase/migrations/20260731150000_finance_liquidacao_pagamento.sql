-- ============================================================================
-- Fase 4 (execução orçamentária): liquidação (NS) e pagamento (OB)
-- ============================================================================
-- A 2ª e a 3ª fases da despesa (Lei 4.320, art. 62-64). A liquidação é o elo
-- que faltava entre o FÍSICO (recebimento definitivo do almoxarifado, MCASP) e
-- o CONTÁBIL — por isso referencia goods_receipt e a NF-e.
--
-- Invariante da cadeia, garantida por trigger: pago ≤ liquidado ≤ vigente.
-- ============================================================================

create table finance.liquidacao (
  id uuid primary key default gen_random_uuid(),
  unit_id bigint not null references core.units (id),
  empenho_id uuid not null references finance.empenho (id),
  numero_ns text not null,
  data date not null,
  valor numeric(14,2) not null check (valor > 0),
  competencia date,
  goods_receipt_id uuid references inventory.goods_receipt (id) on delete set null,
  nfe_document_id uuid references inventory.nfe_document (id) on delete set null,
  observacao text,
  origem text not null default 'manual' check (origem in ('manual', 'siafi')),
  import_batch_id uuid references siafi_integration.import_batch (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint liquidacao_numero_key unique (unit_id, numero_ns)
);

comment on table finance.liquidacao is
  'Liquidação (NS) — 2ª fase da despesa. Vincula o recebimento definitivo (físico) ao empenho (orçamentário). Nunca criada automaticamente: liquidar é ato do ordenador e a NS nasce no SIAFI.';

create index liquidacao_empenho_idx on finance.liquidacao (empenho_id);
create index liquidacao_receipt_idx on finance.liquidacao (goods_receipt_id) where goods_receipt_id is not null;

create table finance.pagamento (
  id uuid primary key default gen_random_uuid(),
  unit_id bigint not null references core.units (id),
  liquidacao_id uuid not null references finance.liquidacao (id),
  numero_ob text not null,
  data date not null,
  valor numeric(14,2) not null check (valor > 0),
  banco text,
  agencia text,
  conta text,
  origem text not null default 'manual' check (origem in ('manual', 'siafi')),
  import_batch_id uuid references siafi_integration.import_batch (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint pagamento_numero_key unique (unit_id, numero_ob)
);

comment on table finance.pagamento is
  'Pagamento (OB) — 3ª fase da despesa, vinculado à liquidação.';

create index pagamento_liquidacao_idx on finance.pagamento (liquidacao_id);

-- recebimento definitivo passa a conhecer sua liquidação (vínculo opcional:
-- o módulo de estoque continua funcionando sem nenhuma liquidação)
alter table inventory.goods_receipt
  add column liquidacao_id uuid references finance.liquidacao (id) on delete set null;

-- ----------------------------------------------------------------------------
-- Invariante da cadeia: liquidado ≤ vigente, pago ≤ liquidado
-- ----------------------------------------------------------------------------
create function finance.check_liquidacao_within_empenho() returns trigger
language plpgsql as $$
declare
  v_vigente numeric(14,2);
  v_liquidado numeric(14,2);
begin
  -- serializa liquidações concorrentes do mesmo empenho
  perform pg_advisory_xact_lock(hashtextextended('liq_empenho:' || new.empenho_id::text, 42));

  select valor_vigente into v_vigente from finance.v_empenho_vigente where empenho_id = new.empenho_id;
  select coalesce(sum(valor), 0) into v_liquidado
    from finance.liquidacao where empenho_id = new.empenho_id and id <> new.id;

  if v_liquidado + new.valor > coalesce(v_vigente, 0) then
    raise exception 'Liquidação excede o empenho: vigente % , já liquidado % , tentando liquidar %',
      coalesce(v_vigente, 0), v_liquidado, new.valor;
  end if;
  return new;
end;
$$;

create trigger liquidacao_within_empenho
  before insert or update on finance.liquidacao
  for each row execute function finance.check_liquidacao_within_empenho();

create function finance.check_pagamento_within_liquidacao() returns trigger
language plpgsql as $$
declare
  v_liquidado numeric(14,2);
  v_pago numeric(14,2);
begin
  perform pg_advisory_xact_lock(hashtextextended('pag_liq:' || new.liquidacao_id::text, 42));

  select valor into v_liquidado from finance.liquidacao where id = new.liquidacao_id;
  select coalesce(sum(valor), 0) into v_pago
    from finance.pagamento where liquidacao_id = new.liquidacao_id and id <> new.id;

  if v_pago + new.valor > coalesce(v_liquidado, 0) then
    raise exception 'Pagamento excede a liquidação: liquidado % , já pago % , tentando pagar %',
      coalesce(v_liquidado, 0), v_pago, new.valor;
  end if;
  return new;
end;
$$;

create trigger pagamento_within_liquidacao
  before insert or update on finance.pagamento
  for each row execute function finance.check_pagamento_within_liquidacao();

-- ----------------------------------------------------------------------------
-- Saldos completos do empenho (o painel da ATA e a tela de empenhos leem daqui)
-- ----------------------------------------------------------------------------
create view finance.v_empenho_saldo
  with (security_invoker = true) as
select
  v.empenho_id,
  v.unit_id,
  v.valor_original,
  v.ajustes,
  v.valor_vigente,
  coalesce(l.liquidado, 0) as valor_liquidado,
  coalesce(p.pago, 0) as valor_pago,
  v.valor_vigente - coalesce(l.liquidado, 0) as saldo_a_liquidar,
  coalesce(l.liquidado, 0) - coalesce(p.pago, 0) as valor_a_pagar
from finance.v_empenho_vigente v
left join (
  select empenho_id, sum(valor) as liquidado from finance.liquidacao group by empenho_id
) l on l.empenho_id = v.empenho_id
left join (
  select li.empenho_id, sum(pg.valor) as pago
    from finance.pagamento pg
    join finance.liquidacao li on li.id = pg.liquidacao_id
   group by li.empenho_id
) p on p.empenho_id = v.empenho_id;

comment on view finance.v_empenho_saldo is
  'Execução por empenho: vigente, liquidado, pago, a liquidar e a pagar. Fonte única dos painéis (ATA e tela de empenhos).';

alter table finance.liquidacao enable row level security;
alter table finance.pagamento enable row level security;
