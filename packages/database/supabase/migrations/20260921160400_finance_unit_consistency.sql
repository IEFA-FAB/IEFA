-- ============================================================================
-- Execução orçamentária: a unidade da linha filha é a unidade da linha mãe
-- ============================================================================
-- Achado da auditoria de 2026-09-19 (rodada 2). As server fns guardavam pela
-- unidade INFORMADA no corpo e gravavam ids de outra OM sem conferência:
--
--   * `createLiquidacaoFn`: NS da unidade A debitando o empenho da unidade B;
--   * `createPagamentoFn`:  OB da unidade A pagando a liquidação da unidade B;
--   * `createSupplyOrderFn`: OF da cozinha de A consumindo o empenho de B.
--
-- O código já confere (liquidation.fn.ts / supply-order.fn.ts) e se sustenta
-- sozinho; isto é a segunda barreira, para qualquer outro caminho de escrita
-- (importação SIAFI, SQL manual, uma fn futura). Só INSERT/UPDATE novos: as
-- linhas existentes não são revalidadas — conferir antes com as consultas do
-- fim deste arquivo.
--
-- E o piso do empenho: `check_empenho_event_floor` (anulação) e
-- `check_liquidacao_within_empenho` (liquidação) tomavam advisory locks de
-- chaves DIFERENTES. Anulação e liquidação do mesmo empenho, concorrentes, não
-- se serializavam: cada uma lia o valor da outra antes do commit e as duas
-- passavam, deixando vigente < liquidado. A anulação passa a tomar TAMBÉM a
-- chave da liquidação — sempre na ordem evento → liquidação, e o trigger de
-- liquidação só toma a segunda, então não há ciclo de espera.
-- ============================================================================

-- (1) liquidação: mesma unidade do empenho --------------------------------------
create or replace function finance.check_liquidacao_unit_matches_empenho() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_empenho_unit bigint;
begin
  select e.unit_id into v_empenho_unit from finance.empenho e where e.id = new.empenho_id;
  if v_empenho_unit is distinct from new.unit_id then
    raise exception 'Liquidação de uma unidade não pode debitar empenho de outra (liquidação: %, empenho: %)', new.unit_id, v_empenho_unit
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists liquidacao_unit_matches_empenho on finance.liquidacao;
create trigger liquidacao_unit_matches_empenho
  before insert or update of unit_id, empenho_id on finance.liquidacao
  for each row execute function finance.check_liquidacao_unit_matches_empenho();

-- (2) pagamento: mesma unidade da liquidação -----------------------------------
create or replace function finance.check_pagamento_unit_matches_liquidacao() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_liquidacao_unit bigint;
begin
  select l.unit_id into v_liquidacao_unit from finance.liquidacao l where l.id = new.liquidacao_id;
  if v_liquidacao_unit is distinct from new.unit_id then
    raise exception 'Pagamento de uma unidade não pode quitar liquidação de outra (pagamento: %, liquidação: %)', new.unit_id, v_liquidacao_unit
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists pagamento_unit_matches_liquidacao on finance.pagamento;
create trigger pagamento_unit_matches_liquidacao
  before insert or update of unit_id, liquidacao_id on finance.pagamento
  for each row execute function finance.check_pagamento_unit_matches_liquidacao();

-- (3) OF: o empenho é da unidade compradora da cozinha --------------------------
-- Mesmo critério de `listEmpenhosForKitchenFn` / `resolvePurchaseUnitId`:
-- `purchase_unit_id` quando existe, senão `unit_id`.
create or replace function procurement.check_supply_order_empenho_unit() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_empenho_unit bigint;
  v_purchase_unit bigint;
begin
  select e.unit_id into v_empenho_unit from finance.empenho e where e.id = new.empenho_id;
  select coalesce(k.purchase_unit_id, k.unit_id) into v_purchase_unit from kitchen.kitchen k where k.id = new.kitchen_id;
  if v_purchase_unit is null or v_empenho_unit is distinct from v_purchase_unit then
    raise exception 'A Ordem de Fornecimento só pode usar empenho da unidade compradora da cozinha (cozinha %, empenho da unidade %)', new.kitchen_id, v_empenho_unit
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists supply_order_empenho_unit on procurement.supply_order;
create trigger supply_order_empenho_unit
  before insert or update of empenho_id, kitchen_id on procurement.supply_order
  for each row execute function procurement.check_supply_order_empenho_unit();

-- (4) piso do empenho serializado contra a liquidação ---------------------------
create or replace function finance.check_empenho_event_floor() returns trigger
language plpgsql as $$
declare
  v_vigente numeric(14,2);
  v_liquidado numeric(14,2);
begin
  if new.tipo not in ('anulacao', 'cancelamento') then return new; end if;

  -- serializa eventos concorrentes do mesmo empenho
  perform pg_advisory_xact_lock(hashtextextended('empenho_event:' || new.empenho_id::text, 42));
  -- ...e contra liquidação concorrente do mesmo empenho: é a chave que
  -- `check_liquidacao_within_empenho` toma. Ordem fixa evento → liquidação.
  perform pg_advisory_xact_lock(hashtextextended('liq_empenho:' || new.empenho_id::text, 42));

  select valor_vigente into v_vigente from finance.v_empenho_vigente where empenho_id = new.empenho_id;
  select coalesce(sum(valor), 0) into v_liquidado from finance.liquidacao where empenho_id = new.empenho_id;

  -- v_vigente já inclui os eventos anteriores; o novo ainda não está gravado
  if coalesce(v_vigente, 0) - new.valor < v_liquidado then
    raise exception 'Anulação deixaria o empenho vigente (%) abaixo do já liquidado (%)',
      coalesce(v_vigente, 0) - new.valor, v_liquidado;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Conferência das linhas EXISTENTES (rodar antes de aplicar; esperado: zero)
-- ----------------------------------------------------------------------------
-- select l.id, l.unit_id, e.unit_id as empenho_unit
--   from finance.liquidacao l join finance.empenho e on e.id = l.empenho_id
--  where l.unit_id is distinct from e.unit_id;
--
-- select p.id, p.unit_id, l.unit_id as liquidacao_unit
--   from finance.pagamento p join finance.liquidacao l on l.id = p.liquidacao_id
--  where p.unit_id is distinct from l.unit_id;
--
-- select so.id, so.kitchen_id, e.unit_id as empenho_unit, coalesce(k.purchase_unit_id, k.unit_id) as purchase_unit
--   from procurement.supply_order so
--   join finance.empenho e on e.id = so.empenho_id
--   join kitchen.kitchen k on k.id = so.kitchen_id
--  where e.unit_id is distinct from coalesce(k.purchase_unit_id, k.unit_id);
