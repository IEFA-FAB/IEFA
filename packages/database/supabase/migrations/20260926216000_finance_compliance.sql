-- ============================================================================
-- Execução financeira conforme (openspec/changes/sisub-flexible-expense-execution, tarefa 1.4)
-- ============================================================================
-- Achados da auditoria de 2026-09-26 sobre a cadeia crédito → empenho → liquidação → pagamento:
--
--   F5  `finance.budget_credit` é um retrato de saldo: a Nota de Crédito (NC) que trouxe o
--       crédito à UG não existia. Nasce `finance.credit_note`, e a linha de crédito ganha
--       PI e UGR.
--   F6  RP com um tipo só por empenho (`empenho.rp_tipo`): a parte liquidada e não paga
--       (processado) e a não liquidada (não processado) do MESMO empenho não cabiam
--       (Lei 4.320, art. 36). Nasce `finance.empenho_rp_inscription`, uma linha por parcela.
--   F7  Retenções: a OB paga o LÍQUIDO (bruto − IR/CSLL/COFINS/PIS/INSS/ISS), mas o teto do
--       pagamento era o bruto. Nasce `finance.liquidacao_deduction`, e o teto do pagamento
--       passa a ser o líquido.
--   F8  `empenho_event.tipo = 'cancelamento'` usado para a anulação total da NE; cancelamento é
--       termo de restos a pagar. Expand: aceita `anulacao_total`, lê os dois como o mesmo.
--   F2  Liquidação acima do recebido: com recebimento vinculado, Σ NS do recebimento ≤ valor
--       recebido (Lei 4.320, art. 63, § 2º, III). Sem recebimento continua aceita (pendência).
--
-- Nomes: identificador em inglês (AGENTS.md). Ficam como estão os códigos do SIAFI que já são
-- chave de junção nas tabelas antigas (`nd`, `ptres`, `fonte`, `ug`, `pi`, `ugr`) e os valores
-- de domínio na língua da norma (`descentralizacao`, `nao_processado`, `anulacao_total`).
--
-- COMPATÍVEL COM O CÓDIGO DA MAIN (a suíte dela roda contra este banco o tempo todo):
--   * só colunas anuláveis, tabelas novas e funções substituídas que preservam o
--     comportamento antigo quando não há linha nova (liquidação sem dedução paga até o bruto,
--     com a MESMA frase "excede a liquidação" que `createPagamentoFn` reconhece);
--   * a view `v_empenho_saldo` mantém as colunas na ordem; as novas entram no fim;
--   * a constraint única de `budget_credit` NÃO muda (o upsert da main usa
--     `onConflict: unit_id,ug,nd,ptres,fonte,competencia`); PI e UGR são descritivos por ora.
--
-- Guard de reset de treino (`training.operations.test.ts`, default-deny por `unit_id`):
--   * `finance.credit_note` tem `unit_id` e está em RESET_EXCLUSIONS desde o commit de
--     declaração; o PR do recurso a promove a RESET_STEPS. Não tem FK RESTRICT/NO ACTION para
--     nada que o reset apaga (`import_batch_id` é SET NULL).
--   * `finance.empenho_rp_inscription` e `finance.liquidacao_deduction` NÃO têm `unit_id`:
--     chegam pelo pai, com ON DELETE CASCADE (o reset apaga `finance.empenho` e
--     `finance.liquidacao` por unidade).
--
-- ORDEM: aplica DEPOIS de 20260926214000 (PR #473). Esta migration recria
-- `check_empenho_event_floor` com o piso das OFs daquela (e usa a função
-- `procurement.supply_order_empenho_usage` criada lá), e recria `v_empenho_vigente` com as
-- mesmas colunas que a 214000 lê (teto da OF) e que `v_siafi_reconciliation` usa.
--
-- Tudo só do servidor: RLS ligada, sem policy, sem grant a anon/authenticated (o default do
-- schema `finance` concede só a `service_role`). Nenhuma função nova é SECURITY DEFINER.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (F5) PI e UGR na linha de crédito
-- ----------------------------------------------------------------------------
alter table finance.budget_credit
  add column if not exists pi text,
  add column if not exists ugr text;

comment on column finance.budget_credit.dotacao is
  'Crédito RECEBIDO pela UG na classificação (provisão/destaque, somadas as NC). O nome da coluna é histórico: numa UG executora não há dotação (LOA), há crédito descentralizado. A tela rotula "Crédito recebido"; o crédito disponível é saldo_siafi.';
comment on column finance.budget_credit.pi is
  'Plano Interno da classificação (descritivo; fora da chave única nesta fase).';
comment on column finance.budget_credit.ugr is
  'UG Responsável (UGR) da classificação (descritivo; fora da chave única nesta fase).';

-- ----------------------------------------------------------------------------
-- (F5) Nota de Crédito
-- ----------------------------------------------------------------------------
create table finance.credit_note (
  id uuid primary key default gen_random_uuid(),
  unit_id bigint not null references core.units (id),
  number text not null check (btrim(number) <> ''),
  issued_on date not null,
  -- descentralizacao: a NC traz crédito à UG (provisão ou destaque);
  -- anulacao: a NC o devolve (anulação/devolução de provisão ou destaque)
  kind text not null default 'descentralizacao' check (kind in ('descentralizacao', 'anulacao')),
  issuer_ug text check (issuer_ug is null or issuer_ug ~ '^[0-9]{6}$'),
  beneficiary_ug text check (beneficiary_ug is null or beneficiary_ug ~ '^[0-9]{6}$'),
  -- esfera orçamentária: 1 fiscal, 2 seguridade social, 3 investimento
  budget_sphere text check (budget_sphere is null or budget_sphere in ('1', '2', '3')),
  ptres text,
  fonte text,
  nd text check (nd is null or nd ~ '^[0-9]{6}([0-9]{2})?$'),
  pi text,
  ugr text,
  amount numeric(14,2) not null check (amount > 0),
  notes text,
  origin text not null default 'manual' check (origin in ('manual', 'siafi')),
  import_batch_id uuid references siafi_integration.import_batch (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint credit_note_number_key unique nulls not distinct (unit_id, issuer_ug, number)
);

comment on table finance.credit_note is
  'Nota de Crédito (NC) recebida pela UG: o documento que descentraliza o crédito (provisão ou destaque) ou o devolve. finance.budget_credit continua sendo o SNAPSHOT do saldo no SIAFI; a NC é o fato que o explica.';
comment on column finance.credit_note.kind is
  'descentralizacao soma crédito; anulacao devolve. amount sempre positivo, o sinal vem do kind.';

create index credit_note_unit_issued_idx on finance.credit_note (unit_id, issued_on desc);

alter table finance.credit_note enable row level security;

-- ----------------------------------------------------------------------------
-- (F6) Restos a pagar por parcela
-- ----------------------------------------------------------------------------
-- Expand: `empenho.rp_inscrito`, `rp_tipo` e `rp_exercicio` continuam e são ESPELHADOS pela
-- inscrição nova (rp_inscrito = true; rp_tipo = nao_processado se houver essa parcela, senão
-- processado — a escolha da inscrição antiga; rp_exercicio = exercício). O evento
-- `rp_inscricao` em `empenho_event` continua sendo gravado, um por parcela, como histórico
-- (não altera o vigente). Contract posterior: ler só desta tabela e remover as três colunas.
create table finance.empenho_rp_inscription (
  id uuid primary key default gen_random_uuid(),
  empenho_id uuid not null references finance.empenho (id) on delete cascade,
  -- exercício de ORIGEM: o que se encerra em 31/12 com o saldo inscrito
  fiscal_year integer not null check (fiscal_year between 2000 and 2100),
  kind text not null check (kind in ('processado', 'nao_processado')),
  amount numeric(14,2) not null check (amount > 0),
  inscribed_on date not null,
  origin text not null default 'manual' check (origin in ('manual', 'siafi')),
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  -- trilha do recálculo: a inscrição é do exercício, sobre o saldo de 31/12. Se esse saldo muda
  -- (lançamento retroativo), o conjunto vigente é substituído, nunca somado: as linhas antigas
  -- ficam, marcadas como substituídas, com quem, quando e por quê.
  superseded_at timestamptz,
  superseded_by uuid references auth.users (id),
  supersede_reason text,
  constraint empenho_rp_inscription_superseded_check
    check ((superseded_at is null) = (supersede_reason is null))
);

comment on table finance.empenho_rp_inscription is
  'Inscrição em restos a pagar por parcela (Lei 4.320, art. 36), sobre o saldo de 31/12 do exercício: processado = liquidado e não pago; não processado = empenhado e não liquidado. O mesmo empenho pode ter as duas. Parcela vigente = superseded_at nulo. empenho.rp_inscrito/rp_tipo/rp_exercicio são espelho durante o expand.';

-- uma parcela VIGENTE por (empenho, exercício, tipo); as substituídas ficam como trilha
create unique index empenho_rp_inscription_active_parcel_key
  on finance.empenho_rp_inscription (empenho_id, fiscal_year, kind)
  where superseded_at is null;

create index empenho_rp_inscription_empenho_idx on finance.empenho_rp_inscription (empenho_id);

alter table finance.empenho_rp_inscription enable row level security;

-- ----------------------------------------------------------------------------
-- (F7) Deduções (retenções) da liquidação
-- ----------------------------------------------------------------------------
create table finance.liquidacao_deduction (
  id uuid primary key default gen_random_uuid(),
  liquidacao_id uuid not null references finance.liquidacao (id) on delete cascade,
  kind text not null check (kind in ('ir', 'csll', 'cofins', 'pis', 'inss', 'iss', 'outra')),
  amount numeric(14,2) not null check (amount > 0),
  document_kind text check (document_kind is null or document_kind in ('darf', 'dar', 'gps', 'outro')),
  document_number text,
  revenue_code text,
  -- data do recolhimento; nula = retida e ainda não recolhida
  paid_on date,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table finance.liquidacao_deduction is
  'Retenção na fonte registrada na NS (IR, CSLL, COFINS, PIS/PASEP, INSS, ISS). O credor recebe o líquido (bruto − deduções); a retenção é recolhida por DARF/DAR/GPS. paid_on nulo = retida, ainda não recolhida.';

create index liquidacao_deduction_liquidacao_idx on finance.liquidacao_deduction (liquidacao_id);

alter table finance.liquidacao_deduction enable row level security;

-- Pagamento: teto = LÍQUIDO. Sem dedução, líquido = bruto e a mensagem é a de antes.
create or replace function finance.check_pagamento_within_liquidacao() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_liquidado numeric(14,2);
  v_deducoes numeric(14,2);
  v_pago numeric(14,2);
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pag_liq:' || new.liquidacao_id::text, 42));

  select l.valor into v_liquidado from finance.liquidacao l where l.id = new.liquidacao_id;
  select coalesce(sum(d.amount), 0) into v_deducoes
    from finance.liquidacao_deduction d where d.liquidacao_id = new.liquidacao_id;
  select coalesce(sum(p.valor), 0) into v_pago
    from finance.pagamento p where p.liquidacao_id = new.liquidacao_id and p.id <> new.id;

  if v_pago + new.valor > coalesce(v_liquidado, 0) - v_deducoes then
    if v_deducoes = 0 then
      raise exception 'Pagamento excede a liquidação: liquidado % , já pago % , tentando pagar %',
        coalesce(v_liquidado, 0), v_pago, new.valor;
    end if;
    raise exception 'Pagamento excede a liquidação pelo líquido: bruto % , deduções % , líquido % , já pago % , tentando pagar %',
      coalesce(v_liquidado, 0), v_deducoes, coalesce(v_liquidado, 0) - v_deducoes, v_pago, new.valor;
  end if;
  return new;
end;
$$;

-- Dedução: Σ deduções + Σ pago ao credor ≤ bruto. Mesma chave de lock do pagamento, para as
-- duas escritas da mesma NS se serializarem.
create or replace function finance.check_liquidacao_deduction_within_liquidacao() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_liquidado numeric(14,2);
  v_deducoes numeric(14,2);
  v_pago numeric(14,2);
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pag_liq:' || new.liquidacao_id::text, 42));

  select l.valor into v_liquidado from finance.liquidacao l where l.id = new.liquidacao_id;
  select coalesce(sum(d.amount), 0) into v_deducoes
    from finance.liquidacao_deduction d where d.liquidacao_id = new.liquidacao_id and d.id <> new.id;
  select coalesce(sum(p.valor), 0) into v_pago
    from finance.pagamento p where p.liquidacao_id = new.liquidacao_id;

  if v_deducoes + new.amount + v_pago > coalesce(v_liquidado, 0) then
    raise exception 'Dedução excede a liquidação: bruto % , deduções % , já pago % , tentando deduzir %',
      coalesce(v_liquidado, 0), v_deducoes, v_pago, new.amount
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger liquidacao_deduction_within_liquidacao
  before insert or update of amount, liquidacao_id on finance.liquidacao_deduction
  for each row execute function finance.check_liquidacao_deduction_within_liquidacao();

-- ----------------------------------------------------------------------------
-- (F2) Liquidação ≤ valor recebido, quando há recebimento
-- ----------------------------------------------------------------------------
-- Mesma regra de `receiptLiquidationCeiling` (liquidation-math.ts): todos os itens com custo →
-- Σ quantidade × custo; algum sem custo → total da NF-e do recebimento; sem NF-e → teto
-- indeterminado, aceita (a server fn deixa a pendência). Sem recebimento: não se aplica.
create or replace function finance.check_liquidacao_within_receipt() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unpriced integer;
  v_recebido numeric(14,2);
  v_nfe numeric(14,2);
  v_teto numeric(14,2);
  v_ja numeric(14,2);
begin
  if new.goods_receipt_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.goods_receipt_id is not distinct from old.goods_receipt_id and new.valor <= old.valor then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('liq_receipt:' || new.goods_receipt_id::text, 42));

  select count(*) filter (where i.unit_cost is null),
         round(coalesce(sum(i.received_qty_base * i.unit_cost), 0), 2)
    into v_unpriced, v_recebido
    from inventory.goods_receipt_item i where i.receipt_id = new.goods_receipt_id;

  if v_unpriced = 0 then
    v_teto := v_recebido;
  else
    select d.total_value into v_nfe
      from inventory.goods_receipt gr
      join inventory.nfe_document d on d.id = gr.nfe_document_id
     where gr.id = new.goods_receipt_id;
    if v_nfe is null then return new; end if;
    v_teto := v_nfe;
  end if;

  select coalesce(sum(l.valor), 0) into v_ja
    from finance.liquidacao l where l.goods_receipt_id = new.goods_receipt_id and l.id <> new.id;

  if v_ja + new.valor > v_teto then
    raise exception 'Liquidação excede o valor recebido: recebido % , já liquidado % , tentando liquidar %',
      v_teto, v_ja, new.valor
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger liquidacao_within_receipt
  before insert or update of valor, goods_receipt_id on finance.liquidacao
  for each row execute function finance.check_liquidacao_within_receipt();

-- ----------------------------------------------------------------------------
-- (F8) `anulacao_total` como alias de `cancelamento` (expand)
-- ----------------------------------------------------------------------------
-- Contract (PR posterior, depois de um ciclo com todo escritor gravando `anulacao_total`):
--   update finance.empenho_event set tipo = 'anulacao_total' where tipo = 'cancelamento';
--   e `cancelamento` passa a significar só o cancelamento de RP (Decreto 93.872/1986, art. 68).
alter table finance.empenho_event
  drop constraint empenho_event_tipo_check,
  add constraint empenho_event_tipo_check
    check (tipo in ('reforco', 'anulacao', 'anulacao_total', 'cancelamento', 'rp_inscricao'));

create or replace view finance.v_empenho_vigente
  with (security_invoker = true) as
select
  e.id as empenho_id,
  e.unit_id,
  e.valor_total as valor_original,
  coalesce(sum(case when ev.tipo = 'reforco' then ev.valor
                    when ev.tipo in ('anulacao', 'anulacao_total', 'cancelamento') then -ev.valor
                    else 0 end), 0) as ajustes,
  e.valor_total + coalesce(sum(case when ev.tipo = 'reforco' then ev.valor
                                    when ev.tipo in ('anulacao', 'anulacao_total', 'cancelamento') then -ev.valor
                                    else 0 end), 0) as valor_vigente
from finance.empenho e
left join finance.empenho_event ev on ev.empenho_id = e.id
group by e.id, e.unit_id, e.valor_total;

-- Recria o piso de 20260926214000 (contratação de origem, PR #473) SEM perder nada dele: o
-- piso continua sendo max(já liquidado, já pedido em OFs não canceladas), com as três chaves de
-- lock na mesma ordem (evento → liquidação → OF). Só acrescenta `anulacao_total` aos tipos que
-- passam pelo piso. Depende de `procurement.supply_order_empenho_usage` (criada lá): esta
-- migration aplica DEPOIS da 20260926214000.
create or replace function finance.check_empenho_event_floor() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vigente numeric(14,2);
  v_liquidado numeric(14,2);
  v_ordered numeric(14,2);
begin
  if new.tipo not in ('anulacao', 'anulacao_total', 'cancelamento') then return new; end if;

  -- serializa eventos concorrentes do mesmo empenho
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('empenho_event:' || new.empenho_id::text, 42));
  -- ...e contra liquidação concorrente do mesmo empenho: é a chave que
  -- `check_liquidacao_within_empenho` toma. Ordem fixa evento → liquidação → OF.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('liq_empenho:' || new.empenho_id::text, 42));
  -- ...e contra OF concorrente: a chave de `procurement.supply_order_check_empenho`.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('of_empenho:' || new.empenho_id::text, 42));

  select v.valor_vigente into v_vigente from finance.v_empenho_vigente v where v.empenho_id = new.empenho_id;
  select coalesce(sum(l.valor), 0) into v_liquidado from finance.liquidacao l where l.empenho_id = new.empenho_id;
  select u.priced_total into v_ordered from procurement.supply_order_empenho_usage(new.empenho_id) u;

  -- v_vigente já inclui os eventos anteriores; o novo ainda não está gravado
  if coalesce(v_vigente, 0) - new.valor < v_liquidado then
    raise exception 'Anulação deixaria o empenho vigente (%) abaixo do já liquidado (%)',
      coalesce(v_vigente, 0) - new.valor, v_liquidado;
  end if;
  if coalesce(v_vigente, 0) - new.valor < coalesce(v_ordered, 0) - 0.005 then
    raise exception 'Anulação deixaria o empenho vigente (%) abaixo do já pedido em Ordens de Fornecimento (%): cancele ou reduza a OF antes de anular',
      coalesce(v_vigente, 0) - new.valor, coalesce(v_ordered, 0);
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Saldo do empenho com as retenções (colunas antigas na mesma ordem; novas no fim)
-- ----------------------------------------------------------------------------
-- valor_pago passa a somar a retenção RECOLHIDA (DARF/DAR/GPS pagos): para o empenho, a
-- obrigação se extingue pelo pago ao credor + o recolhido ao fisco. A retenção ainda não
-- recolhida continua em valor_a_pagar (e vira RP processado no encerramento). Sem dedução,
-- os valores são os de antes.
create or replace view finance.v_empenho_saldo
  with (security_invoker = true) as
select
  v.empenho_id,
  v.unit_id,
  v.valor_original,
  v.ajustes,
  v.valor_vigente,
  coalesce(l.liquidado, 0) as valor_liquidado,
  coalesce(p.pago, 0) + coalesce(d.paid, 0) as valor_pago,
  v.valor_vigente - coalesce(l.liquidado, 0) as saldo_a_liquidar,
  coalesce(l.liquidado, 0) - coalesce(p.pago, 0) - coalesce(d.paid, 0) as valor_a_pagar,
  coalesce(d.total, 0) as deductions_total,
  coalesce(d.total, 0) - coalesce(d.paid, 0) as deductions_to_remit
from finance.v_empenho_vigente v
left join (
  select empenho_id, sum(valor) as liquidado from finance.liquidacao group by empenho_id
) l on l.empenho_id = v.empenho_id
left join (
  select li.empenho_id, sum(pg.valor) as pago
    from finance.pagamento pg
    join finance.liquidacao li on li.id = pg.liquidacao_id
   group by li.empenho_id
) p on p.empenho_id = v.empenho_id
left join (
  select li.empenho_id,
         sum(dd.amount) as total,
         sum(dd.amount) filter (where dd.paid_on is not null) as paid
    from finance.liquidacao_deduction dd
    join finance.liquidacao li on li.id = dd.liquidacao_id
   group by li.empenho_id
) d on d.empenho_id = v.empenho_id;

comment on view finance.v_empenho_saldo is
  'Execução por empenho: vigente, liquidado, pago (credor + retenção recolhida), a liquidar, a pagar, e as retenções (deductions_total, deductions_to_remit). Fonte única dos painéis (ATA, empenhos, restos a pagar).';

-- ----------------------------------------------------------------------------
-- Conferência antes de aplicar (esperado: zero linhas nas duas)
-- ----------------------------------------------------------------------------
-- NS com recebimento acima do valor recebido (o trigger novo só vale para escrita nova):
-- select l.goods_receipt_id, sum(l.valor) as liquidado, r.valor_recebido
--   from finance.liquidacao l
--   join (select receipt_id, sum(received_qty_base * unit_cost) as valor_recebido
--           from inventory.goods_receipt_item group by receipt_id having count(*) filter (where unit_cost is null) = 0) r
--     on r.receipt_id = l.goods_receipt_id
--  group by l.goods_receipt_id, r.valor_recebido
-- having sum(l.valor) > r.valor_recebido;
--
-- Eventos com tipo fora do CHECK novo:
-- select tipo, count(*) from finance.empenho_event
--  where tipo not in ('reforco', 'anulacao', 'anulacao_total', 'cancelamento', 'rp_inscricao') group by tipo;
