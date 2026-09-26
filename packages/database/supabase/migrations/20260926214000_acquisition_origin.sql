-- ============================================================================
-- Contratação de origem, ARP sem anexo, nota de empenho com itens e import do
-- SIAFI sem perda (change `sisub-flexible-expense-execution`, D1–D5, D7)
-- ============================================================================
-- 1. `procurement.acquisition`: de onde vem o direito de gastar (ata, contrato,
--    dispensa, inexigibilidade, Contrata+Brasil, suprimento de fundos). Nasce
--    incompleta: só a OM e o tipo são obrigatórios; o resto vira pendência.
-- 2. `procurement.direct_contract_limit`: limites do art. 75, I e II, da
--    Lei 14.133/2021, atualizados todo ano por decreto. Tabela nacional, sem OM.
-- 3. ARP sem anexo quantitativo: `ata_id` anulável com SET NULL, contratação de
--    origem (o papel da OM na ata é `acquisition.srp_role`) e origem do cadastro.
-- 4. `finance.empenho_item`: a NE é o documento e tem um ou mais itens. As
--    colunas antigas do empenho (`arp_item_id`, `quantidade_empenhada`,
--    `valor_unitario`) ficam anuláveis (expand) e espelham o item quando ele é
--    único, para o código da `main` continuar lendo. Saem num contract posterior.
--    "Sem contratação de origem" é DERIVADO (acquisition_id nulo e nenhum item
--    com ARP), não coluna.
-- 5. Apagar anexo, ARP ou item de ARP nunca apaga empenho (RESTRICT no lugar
--    de CASCADE).
-- 6. OF aguardando empenho (`empenho_id` anulável) e limite da OF pelo VALOR
--    VIGENTE do empenho (reforço e anulação contam), recusando empenho anulado.
-- 7. Import do SIAFI sem perda: NS/OB cujo pai ainda não chegou fica estacionada
--    (`import_row.parse_status = 'waiting_parent'`) e é religada por UMA função,
--    chamada pelo import e pelo registro rápido/manual da NE ou da NS. O lote é
--    aplicado numa transação só: erro em qualquer linha não grava nada.
-- 8. O piso da anulação passa a ser o maior entre o liquidado e o já pedido em OF.
-- 9. A conciliação passa a mostrar a NS/OB estacionada (`aguardando_documento_pai`).
--
-- Compatível com a `main` enquanto este PR não mergeia: nenhuma coluna sai,
-- nada que a `main` grava nulo fica obrigatório, nomes mantidos. Tudo só do
-- servidor: RLS ligada, sem policy, sem grant a cliente; funções novas nascem
-- executáveis só por `service_role` (default desde 20260920210000).
--
-- Reset de treino: `procurement.acquisition` tem `unit_id` e entra em
-- RESET_STEPS neste mesmo PR, DEPOIS de empenho, ARP e designação. Toda FK que
-- aponta para ela é ON DELETE SET NULL, e ela não tem FK para tabela que o
-- reset apaga. `finance.empenho_item` não tem `unit_id` e cai pelo CASCADE do
-- empenho. `direct_contract_limit` é nacional (sem `unit_id`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Contratação de origem
-- ----------------------------------------------------------------------------
create table procurement.acquisition (
  id uuid primary key default gen_random_uuid(),
  unit_id integer not null references core.units (id),
  kind text not null check (kind in (
    'registro_precos', 'licitacao', 'dispensa', 'inexigibilidade',
    'contrata_mais_brasil', 'suprimento_fundos', 'outra'
  )),
  -- Papel da OM no registro de preços: gerenciador, participante ou não
  -- participante (adesão, a "carona").
  srp_role text check (srp_role in ('gerenciador', 'participante', 'nao_participante')),
  -- Instrumento que formaliza: a NE substitui o contrato nos casos do art. 95.
  instrument text check (instrument in ('ata', 'contrato', 'nota_empenho', 'outro')),
  legal_basis text,
  -- Inciso do art. 75 (só em dispensa); alimenta o somatório do § 1º.
  direct_contract_clause text check (direct_contract_clause ~ '^[IVX]{1,5}$'),
  -- Natureza de despesa até o subitem (ex.: 33903007), como em finance.empenho.nd.
  nd text check (nd ~ '^[0-9]{6,8}$'),
  -- Ramo de atividade do somatório (IN SEGES/ME 67/2021, art. 4º, § 2º): código da
  -- classe do PDM no CATMAT para bens ("8905"), descrição do serviço para serviços.
  activity_line text,
  -- Exercício da despesa (art. 75, § 1º, I): o do somatório.
  fiscal_year integer not null default extract(year from (now() at time zone 'America/Sao_Paulo'))::integer
    check (fiscal_year between 2000 and 2100),
  process_nup text,
  object text,
  supplier_cnpj text check (supplier_cnpj ~ '^([0-9]{11}|[0-9]{14})$'),
  supplier_name text,
  valid_from date,
  valid_to date,
  estimated_value numeric(14,2) check (estimated_value >= 0),
  pncp_control_number text,
  -- Justificativa gravada quando o somatório da dispensa passa do limite vigente.
  over_limit_justification text,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint acquisition_srp_role_ck check (srp_role is null or kind = 'registro_precos'),
  constraint acquisition_direct_contract_clause_ck check (direct_contract_clause is null or kind = 'dispensa'),
  constraint acquisition_validity_ck check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

comment on table procurement.acquisition is
  'Contratação de origem: o que sustenta o empenho (ata, contrato, dispensa, inexigibilidade, Contrata+Brasil, suprimento de fundos). Só OM e tipo são obrigatórios; o que falta é pendência, nunca recusa.';
comment on column procurement.acquisition.activity_line is
  'Ramo de atividade do somatório da dispensa (Lei 14.133/2021, art. 75, § 1º, II; IN SEGES/ME 67/2021, art. 4º, § 2º): classe do PDM (bens) ou descrição do serviço.';

create index acquisition_unit_idx on procurement.acquisition (unit_id) where deleted_at is null;
create index acquisition_dispensa_sum_idx
  on procurement.acquisition (unit_id, fiscal_year, direct_contract_clause)
  where kind = 'dispensa' and deleted_at is null;

alter table procurement.acquisition enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Limites da dispensa por valor (art. 75, I e II)
-- ----------------------------------------------------------------------------
create table procurement.direct_contract_limit (
  id uuid primary key default gen_random_uuid(),
  clause text not null check (clause in ('I', 'II')),
  valid_from date not null,
  value numeric(14,2) not null check (value > 0),
  source_act text not null,
  created_at timestamptz not null default now(),
  unique (clause, valid_from)
);

comment on table procurement.direct_contract_limit is
  'Limite da dispensa por valor (Lei 14.133/2021, art. 75, I e II), atualizado anualmente por decreto (art. 182). O limite de um exercício é a linha de maior valid_from até o fim dele.';

alter table procurement.direct_contract_limit enable row level security;

-- Valores conferidos em planalto.gov.br em 2026-09-26, no anexo de cada decreto
-- (linhas "Art. 75, caput, inciso I" e "inciso II"):
--   .../_ato2023-2026/2023/decreto/d11871.htm, .../2024/decreto/d12343.htm,
--   .../2025/decreto/d12807.htm
insert into procurement.direct_contract_limit (clause, valid_from, value, source_act) values
  ('I',  '2024-01-01', 119812.02, 'Decreto nº 11.871, de 29 de dezembro de 2023'),
  ('II', '2024-01-01',  59906.02, 'Decreto nº 11.871, de 29 de dezembro de 2023'),
  ('I',  '2025-01-01', 125451.15, 'Decreto nº 12.343, de 30 de dezembro de 2024'),
  ('II', '2025-01-01',  62725.59, 'Decreto nº 12.343, de 30 de dezembro de 2024'),
  ('I',  '2026-01-01', 130984.20, 'Decreto nº 12.807, de 29 de dezembro de 2025'),
  ('II', '2026-01-01',  65492.11, 'Decreto nº 12.807, de 29 de dezembro de 2025');

-- ----------------------------------------------------------------------------
-- 3. ARP sem anexo quantitativo
-- ----------------------------------------------------------------------------
alter table procurement.procurement_arp
  alter column ata_id drop not null,
  drop constraint procurement_arp_ata_id_fkey,
  add constraint procurement_arp_ata_id_fkey
    foreign key (ata_id) references procurement.procurement_list (id) on delete set null,
  add column acquisition_id uuid references procurement.acquisition (id) on delete set null,
  add column source text not null default 'compras_gov' check (source in ('compras_gov', 'manual'));

comment on column procurement.procurement_arp.source is
  'compras_gov = importada da API; manual = cadastrada à mão (API fora do ar, ata de outro órgão). "Não sincronizada" enquanto last_synced_at for nulo.';

create index procurement_arp_acquisition_idx on procurement.procurement_arp (acquisition_id) where acquisition_id is not null;

alter table procurement.procurement_arp_item
  add column source text not null default 'compras_gov' check (source in ('compras_gov', 'manual'));

comment on column procurement.procurement_arp_item.quantidade_empenhada is
  'Retrato OFICIAL do Compras.gov.br (inclui outros órgãos e caronas). Só a sincronização escreve. O comprometimento local é a soma de finance.empenho_item, calculada na leitura.';

-- A sincronização casa o item pelo número: dois itens com o mesmo número na mesma
-- ARP fariam o cadastro manual e o importado virarem linhas duplicadas.
create unique index procurement_arp_item_numero_uq
  on procurement.procurement_arp_item (arp_id, numero_item) where numero_item is not null;

-- ----------------------------------------------------------------------------
-- 4. Nota de empenho como documento, com itens
-- ----------------------------------------------------------------------------
alter table finance.empenho
  alter column arp_item_id drop not null,
  alter column quantidade_empenhada drop not null,
  alter column valor_unitario drop not null,
  drop constraint empenho_arp_item_id_fkey,
  add constraint empenho_arp_item_id_fkey
    foreign key (arp_item_id) references procurement.procurement_arp_item (id) on delete restrict,
  add column acquisition_id uuid references procurement.acquisition (id) on delete set null;

comment on column finance.empenho.arp_item_id is
  'LEGADO (expand): espelha o item quando a NE tem um só. A fonte é finance.empenho_item.';
comment on column finance.empenho.valor_total is
  'Valor original da NE. Imutável: reforço e anulação são eventos (finance.empenho_event).';

create index empenho_acquisition_idx on finance.empenho (acquisition_id) where acquisition_id is not null;

create table finance.empenho_item (
  id uuid primary key default gen_random_uuid(),
  empenho_id uuid not null references finance.empenho (id) on delete cascade,
  arp_item_id uuid references procurement.procurement_arp_item (id) on delete restrict,
  purchase_item_id uuid references procurement.purchase_item (id) on delete set null,
  position smallint not null default 1,
  description text,
  quantity numeric(14,4) check (quantity > 0),
  unit text,
  unit_price numeric(14,4) check (unit_price >= 0),
  value numeric(14,2) not null check (value >= 0),
  created_at timestamptz not null default now()
);

comment on table finance.empenho_item is
  'Item da nota de empenho. Aponta, se houver, para o item da ARP ou o item de compra. NE estimativa/global pode ter só o valor.';

create index empenho_item_empenho_idx on finance.empenho_item (empenho_id);
create index empenho_item_arp_item_idx on finance.empenho_item (arp_item_id) where arp_item_id is not null;

alter table finance.empenho_item enable row level security;

-- Backfill: toda NE existente ganha o item que ela já descreve.
insert into finance.empenho_item (empenho_id, arp_item_id, quantity, unit, unit_price, value, description)
select e.id, e.arp_item_id, e.quantidade_empenhada, ai.medida_catmat, e.valor_unitario, e.valor_total, ai.descricao_item
  from finance.empenho e
  left join procurement.procurement_arp_item ai on ai.id = e.arp_item_id
 where not exists (select 1 from finance.empenho_item i where i.empenho_id = e.id);

-- (4a) contratação da NE: mesma unidade ------------------------------------------
-- Segunda barreira, como em 20260921160400, para qualquer caminho de escrita.
create or replace function finance.empenho_check_acquisition_unit() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unit bigint;
begin
  if new.acquisition_id is null then return new; end if;
  select a.unit_id into v_unit from procurement.acquisition a where a.id = new.acquisition_id;
  if v_unit is distinct from new.unit_id then
    raise exception 'A contratação de origem é de outra unidade (empenho da unidade %, contratação da unidade %)', new.unit_id, v_unit
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger empenho_check_acquisition_unit
  before insert or update of acquisition_id, unit_id on finance.empenho
  for each row execute function finance.empenho_check_acquisition_unit();

-- (4b) item: mesma unidade da ARP ------------------------------------------------
create or replace function finance.empenho_item_check_unit() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_empenho_unit bigint;
  v_arp_unit bigint;
begin
  if new.arp_item_id is null then return new; end if;
  select e.unit_id into v_empenho_unit from finance.empenho e where e.id = new.empenho_id;
  select a.unit_id into v_arp_unit
    from procurement.procurement_arp_item ai
    join procurement.procurement_arp a on a.id = ai.arp_id
   where ai.id = new.arp_item_id;
  if v_arp_unit is distinct from v_empenho_unit then
    raise exception 'O item da ARP é de outra unidade (empenho da unidade %, ARP da unidade %)', v_empenho_unit, v_arp_unit
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger empenho_item_check_unit
  before insert or update of arp_item_id, empenho_id on finance.empenho_item
  for each row execute function finance.empenho_item_check_unit();

-- (4c) item → colunas antigas do empenho (expand) --------------------------------
-- Com um item só, o empenho espelha o item (o código da `main` lê `arp_item_id`,
-- `quantidade_empenhada` e `valor_unitario`). Com mais de um, as colunas antigas
-- ficam nulas: nenhum item fala pela NE inteira. `valor_total` nunca é tocado.
create or replace function finance.empenho_item_sync_header() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_empenho_id uuid := coalesce(new.empenho_id, old.empenho_id);
  v_count integer;
  v_item finance.empenho_item%rowtype;
begin
  -- Item que sai pelo CASCADE do próprio empenho: não há cabeçalho a espelhar.
  if not exists (select 1 from finance.empenho e where e.id = v_empenho_id) then return null; end if;
  select count(*) into v_count from finance.empenho_item where empenho_id = v_empenho_id;
  if v_count = 1 then
    select * into v_item from finance.empenho_item where empenho_id = v_empenho_id;
    update finance.empenho e
       set arp_item_id = v_item.arp_item_id,
           quantidade_empenhada = v_item.quantity,
           valor_unitario = v_item.unit_price
     where e.id = v_empenho_id
       and (e.arp_item_id is distinct from v_item.arp_item_id
         or e.quantidade_empenhada is distinct from v_item.quantity
         or e.valor_unitario is distinct from v_item.unit_price);
  elsif v_count > 1 then
    update finance.empenho e
       set arp_item_id = null, quantidade_empenhada = null, valor_unitario = null
     where e.id = v_empenho_id
       and (e.arp_item_id is not null or e.quantidade_empenhada is not null or e.valor_unitario is not null);
  end if;
  return null;
end;
$$;

create trigger empenho_item_sync_header
  after insert or update or delete on finance.empenho_item
  for each row execute function finance.empenho_item_sync_header();

-- (4d) empenho gravado pelo caminho antigo ganha o item -------------------------
-- DEFERRED: quem grava a NE e os itens na mesma transação (o código novo) chega ao
-- commit com itens e nada acontece; quem grava só o cabeçalho (a `main`, o registro
-- rápido, o import do SIAFI) ganha o item único que o cabeçalho descreve.
create or replace function finance.empenho_ensure_item() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from finance.empenho e where e.id = new.id) then return null; end if;
  if exists (select 1 from finance.empenho_item i where i.empenho_id = new.id) then return null; end if;
  insert into finance.empenho_item (empenho_id, arp_item_id, quantity, unit_price, value, unit, description)
  select e.id, e.arp_item_id, e.quantidade_empenhada, e.valor_unitario, e.valor_total, ai.medida_catmat, ai.descricao_item
    from finance.empenho e
    left join procurement.procurement_arp_item ai on ai.id = e.arp_item_id
   where e.id = new.id;
  return null;
end;
$$;

create constraint trigger empenho_ensure_item
  after insert on finance.empenho
  deferrable initially deferred
  for each row execute function finance.empenho_ensure_item();

-- ----------------------------------------------------------------------------
-- 5. ARP da contratação: mesma unidade
-- ----------------------------------------------------------------------------
create or replace function procurement.procurement_arp_check_acquisition() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unit bigint;
begin
  if new.acquisition_id is null then return new; end if;
  select a.unit_id into v_unit from procurement.acquisition a where a.id = new.acquisition_id;
  if v_unit is distinct from new.unit_id then
    raise exception 'A contratação de origem é de outra unidade (ARP da unidade %, contratação da unidade %)', new.unit_id, v_unit
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger procurement_arp_check_acquisition
  before insert or update of acquisition_id, unit_id on procurement.procurement_arp
  for each row execute function procurement.procurement_arp_check_acquisition();

-- ----------------------------------------------------------------------------
-- 6. OF aguardando empenho e limite pelo valor vigente
-- ----------------------------------------------------------------------------
alter table procurement.supply_order alter column empenho_id drop not null;

comment on column procurement.supply_order.empenho_id is
  'Nulo = OF aguardando empenho (a emergência acontece): pendência alta "regularize a NE" (Lei 4.320/1964, art. 60).';

create or replace function procurement.check_supply_order_empenho_unit() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_empenho_unit bigint;
  v_purchase_unit bigint;
begin
  -- OF aguardando empenho: a unidade se confere quando a NE for vinculada.
  if new.empenho_id is null then return new; end if;
  select e.unit_id into v_empenho_unit from finance.empenho e where e.id = new.empenho_id;
  select coalesce(k.purchase_unit_id, k.unit_id) into v_purchase_unit from kitchen.kitchen k where k.id = new.kitchen_id;
  if v_purchase_unit is null or v_empenho_unit is distinct from v_purchase_unit then
    raise exception 'A Ordem de Fornecimento só pode usar empenho da unidade compradora da cozinha (cozinha %, empenho da unidade %)', new.kitchen_id, v_empenho_unit
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Uso do empenho pelas OFs não canceladas. O valor da linha é ordered_qty × preço,
-- com o preço da própria linha, do item da NE que cobre o mesmo item de ARP, ou do
-- item da ARP, nesta ordem. Enquanto a NE do caminho antigo ainda não ganhou o item
-- (trigger 4d, no commit), o cabeçalho faz o papel do item único. Linha sem preço
-- nos três é conferida pela QUANTIDADE do empenho, quando ele tem quantidade; sem
-- nenhuma das duas, vira pendência "OF sem preço" (sem recusa).
create or replace function procurement.supply_order_empenho_usage(p_empenho_id uuid)
returns table (priced_total numeric, unpriced_qty numeric, unpriced_lines integer, empenho_qty numeric)
language sql
stable
set search_path = ''
as $$
  with lines as (
    select
      i.ordered_qty,
      coalesce(
        i.unit_price,
        (select x.unit_price from finance.empenho_item x
          where x.empenho_id = e.id and x.unit_price is not null
            and (x.arp_item_id = i.arp_item_id
              or (i.arp_item_id is null and (select count(*) from finance.empenho_item y where y.empenho_id = e.id) = 1))
          order by x.position limit 1),
        case when not exists (select 1 from finance.empenho_item y where y.empenho_id = e.id)
              and (i.arp_item_id is null or i.arp_item_id = e.arp_item_id)
             then e.valor_unitario end,
        ai.valor_unitario
      ) as price
    from procurement.supply_order_item i
    join procurement.supply_order so on so.id = i.supply_order_id
    join finance.empenho e on e.id = so.empenho_id
    left join procurement.procurement_arp_item ai on ai.id = i.arp_item_id
    where so.empenho_id = p_empenho_id and so.status <> 'cancelled'
  )
  select
    coalesce(sum(ordered_qty * price) filter (where price is not null), 0)::numeric,
    coalesce(sum(ordered_qty) filter (where price is null), 0)::numeric,
    (count(*) filter (where price is null))::integer,
    coalesce(
      (select sum(x.quantity) from finance.empenho_item x where x.empenho_id = p_empenho_id having count(x.quantity) > 0),
      (select e.quantidade_empenhada from finance.empenho e
        where e.id = p_empenho_id and not exists (select 1 from finance.empenho_item y where y.empenho_id = e.id))
    )::numeric
  from lines;
$$;

create or replace function procurement.supply_order_check_empenho() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_empenho_id uuid;
  v_status text;
  v_vigente numeric(14,2);
  v_usage record;
begin
  if tg_table_name = 'supply_order' then
    v_empenho_id := new.empenho_id;
  else
    select so.empenho_id into v_empenho_id from procurement.supply_order so where so.id = new.supply_order_id;
  end if;
  -- OF aguardando empenho: não há teto a conferir até a NE ser vinculada.
  if v_empenho_id is null then return null; end if;

  -- serializa OFs concorrentes do MESMO empenho
  perform pg_advisory_xact_lock(hashtextextended('of_empenho:' || v_empenho_id::text, 42));

  select e.status into v_status from finance.empenho e where e.id = v_empenho_id;
  if v_status = 'anulado' then
    raise exception 'Empenho anulado não sustenta Ordem de Fornecimento: vincule outra NE ou registre a nova'
      using errcode = '23514';
  end if;

  select v.valor_vigente into v_vigente from finance.v_empenho_vigente v where v.empenho_id = v_empenho_id;
  select * into v_usage from procurement.supply_order_empenho_usage(v_empenho_id);

  if v_usage.priced_total > coalesce(v_vigente, 0) + 0.005 then
    raise exception 'Soma das OFs (R$ %) excede o valor vigente do empenho (R$ %)', round(v_usage.priced_total, 2), coalesce(v_vigente, 0)
      using errcode = '23514';
  end if;
  if v_usage.unpriced_lines > 0 and v_usage.empenho_qty is not null and v_usage.unpriced_qty > v_usage.empenho_qty then
    raise exception 'Soma das OFs sem preço (%) excede a quantidade empenhada (%): informe o preço dos itens da OF', v_usage.unpriced_qty, v_usage.empenho_qty
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists supply_order_item_empenho_check on procurement.supply_order_item;
create constraint trigger supply_order_item_empenho_check
  after insert or update on procurement.supply_order_item
  not deferrable initially immediate
  for each row execute function procurement.supply_order_check_empenho();

-- Vincular a NE depois (OF aguardando empenho) confere o teto na hora do vínculo.
-- Só na troca de empenho: mudança de status (recebimento) não reavalia o teto.
create constraint trigger supply_order_empenho_check
  after update of empenho_id on procurement.supply_order
  not deferrable initially immediate
  for each row
  when (new.empenho_id is not null and new.empenho_id is distinct from old.empenho_id)
  execute function procurement.supply_order_check_empenho();

-- ----------------------------------------------------------------------------
-- 7. Import do SIAFI sem perda
-- ----------------------------------------------------------------------------
alter table siafi_integration.import_row
  drop constraint import_row_parse_status_check,
  add constraint import_row_parse_status_check
    check (parse_status in ('pending', 'parsed', 'unrecognized', 'invalid', 'waiting_parent'));

create index import_row_waiting_parent_idx on siafi_integration.import_row (batch_id) where parse_status = 'waiting_parent';

-- Data do relatório já normalizada pelo parser ("YYYY-MM-DD"); fora disso, nula.
create or replace function siafi_integration.parsed_date(p_value text) returns date
language sql
immutable
set search_path = ''
as $$
  select case when p_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then substr(p_value, 1, 10)::date end;
$$;

-- Aplica UMA linha reconhecida ao domínio e anota o resultado na própria linha.
-- Devolve: created | enriched | enriched_divergent | waiting | unlinked | skipped.
--
--   NE: número já no sisub (registro rápido, manual) → completa classificação
--       (ND, PTRES, fonte, UG) e favorecido onde falta; o valor NUNCA é
--       sobrescrito (é imutável; a diferença aparece na conciliação). Número novo
--       → NE sem contratação de origem, usável na OF e na liquidação.
--   NS: liquidação já no sisub → marca a origem; NE conhecida → cria a
--       liquidação; NE ainda ausente → estaciona (`waiting_parent`).
--   OB: idem, com a NS como pai.
--
-- Erro de gravação sobe: quem chama decide (o lote falha inteiro; a religação
-- isola a linha).
create or replace function siafi_integration.apply_document_row(
  p_unit_id bigint,
  p_report_type text,
  p_row_id uuid,
  p_batch_id uuid,
  p_parsed jsonb,
  p_competencia date,
  p_actor uuid
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_number text;
  v_parent_number text;
  v_value numeric;
  v_date date := coalesce(siafi_integration.parsed_date(p_parsed->>'data'), (now() at time zone 'America/Sao_Paulo')::date);
  v_cnpj text := case when p_parsed->>'favorecido_cnpj' ~ '^[0-9]{14}$' then p_parsed->>'favorecido_cnpj' end;
  v_tipo text := case
    when lower(coalesce(p_parsed->>'tipo_empenho', '')) like 'ordin%' then 'ordinario'
    when lower(coalesce(p_parsed->>'tipo_empenho', '')) like 'estim%' then 'estimativo'
    when lower(coalesce(p_parsed->>'tipo_empenho', '')) like 'glob%' then 'global'
  end;
  v_existing record;
  v_parent uuid;
  v_new uuid;
begin
  v_value := case when p_parsed->>'valor' ~ '^-?[0-9]+(\.[0-9]+)?$' then (p_parsed->>'valor')::numeric end;

  if p_report_type = 'ne' then
    v_number := upper(btrim(coalesce(p_parsed->>'numero_ne', '')));
    if v_number = '' then return 'skipped'; end if;

    select e.id, e.valor_total into v_existing
      from finance.empenho e where e.unit_id = p_unit_id and e.numero_empenho = v_number;
    if found then
      update finance.empenho e set
        nd = coalesce(e.nd, nullif(p_parsed->>'nd', '')),
        ptres = coalesce(e.ptres, nullif(p_parsed->>'ptres', '')),
        fonte = coalesce(e.fonte, nullif(p_parsed->>'fonte', '')),
        ug_emitente = coalesce(e.ug_emitente, nullif(p_parsed->>'ug', '')),
        favorecido_cnpj = coalesce(e.favorecido_cnpj, v_cnpj),
        favorecido_nome = coalesce(e.favorecido_nome, nullif(p_parsed->>'favorecido_nome', '')),
        tipo = coalesce(e.tipo, v_tipo),
        exercicio = coalesce(e.exercicio, extract(year from v_date)::integer),
        siafi_synced_at = now()
       where e.id = v_existing.id;
      update siafi_integration.import_row
         set parse_status = 'parsed', parse_error = null, applied_table = 'finance.empenho', applied_id = v_existing.id
       where id = p_row_id;
      return case when v_value is not null and abs(v_existing.valor_total - v_value) > 0.009 then 'enriched_divergent' else 'enriched' end;
    end if;

    if v_value is null then
      raise exception 'NE % sem valor no relatório', v_number;
    end if;
    insert into finance.empenho (
      unit_id, numero_empenho, data_empenho, valor_total, nd, ptres, fonte, ug_emitente,
      favorecido_cnpj, favorecido_nome, tipo, exercicio, origem, siafi_synced_at, import_batch_id, created_by
    ) values (
      p_unit_id, v_number, v_date, v_value, nullif(p_parsed->>'nd', ''), nullif(p_parsed->>'ptres', ''),
      nullif(p_parsed->>'fonte', ''), nullif(p_parsed->>'ug', ''), v_cnpj, nullif(p_parsed->>'favorecido_nome', ''),
      v_tipo, extract(year from v_date)::integer, 'siafi', now(), p_batch_id, p_actor
    ) returning id into v_new;
    update siafi_integration.import_row
       set parse_status = 'parsed', parse_error = null, applied_table = 'finance.empenho', applied_id = v_new
     where id = p_row_id;
    return 'created';
  end if;

  if p_report_type = 'ns' then
    v_number := upper(btrim(coalesce(p_parsed->>'numero_ns', '')));
    if v_number = '' then return 'skipped'; end if;

    select l.id into v_existing from finance.liquidacao l where l.unit_id = p_unit_id and l.numero_ns = v_number;
    if found then
      update finance.liquidacao set origem = 'siafi' where id = v_existing.id;
      update siafi_integration.import_row
         set parse_status = 'parsed', parse_error = null, applied_table = 'finance.liquidacao', applied_id = v_existing.id
       where id = p_row_id;
      return 'enriched';
    end if;

    v_parent_number := upper(btrim(coalesce(p_parsed->>'ne_origem', p_parsed->>'numero_ne', '')));
    if v_parent_number = '' then
      -- Sem o número da NE no relatório não há o que esperar: fica na conciliação.
      update siafi_integration.import_row
         set parse_error = 'NS sem a NE de origem no relatório: vincule pela conciliação'
       where id = p_row_id;
      return 'unlinked';
    end if;
    select e.id into v_parent from finance.empenho e where e.unit_id = p_unit_id and e.numero_empenho = v_parent_number;
    if v_parent is null then
      update siafi_integration.import_row
         set parse_status = 'waiting_parent', parse_error = 'Aguardando a NE ' || v_parent_number
       where id = p_row_id;
      return 'waiting';
    end if;
    if v_value is null or v_value <= 0 then
      raise exception 'NS % sem valor no relatório', v_number;
    end if;
    insert into finance.liquidacao (unit_id, empenho_id, numero_ns, data, valor, competencia, origem, import_batch_id, created_by)
    values (p_unit_id, v_parent, v_number, v_date, v_value, p_competencia, 'siafi', p_batch_id, p_actor)
    returning id into v_new;
    update siafi_integration.import_row
       set parse_status = 'parsed', parse_error = null, applied_table = 'finance.liquidacao', applied_id = v_new
     where id = p_row_id;
    return 'created';
  end if;

  if p_report_type = 'ob' then
    v_number := upper(btrim(coalesce(p_parsed->>'numero_ob', '')));
    if v_number = '' then return 'skipped'; end if;

    select p.id into v_existing from finance.pagamento p where p.unit_id = p_unit_id and p.numero_ob = v_number;
    if found then
      update finance.pagamento set origem = 'siafi' where id = v_existing.id;
      update siafi_integration.import_row
         set parse_status = 'parsed', parse_error = null, applied_table = 'finance.pagamento', applied_id = v_existing.id
       where id = p_row_id;
      return 'enriched';
    end if;

    v_parent_number := upper(btrim(coalesce(p_parsed->>'ns_origem', p_parsed->>'numero_ns', '')));
    if v_parent_number = '' then
      update siafi_integration.import_row
         set parse_error = 'OB sem a NS de origem no relatório: vincule pela conciliação'
       where id = p_row_id;
      return 'unlinked';
    end if;
    select l.id into v_parent from finance.liquidacao l where l.unit_id = p_unit_id and l.numero_ns = v_parent_number;
    if v_parent is null then
      update siafi_integration.import_row
         set parse_status = 'waiting_parent', parse_error = 'Aguardando a NS ' || v_parent_number
       where id = p_row_id;
      return 'waiting';
    end if;
    if v_value is null or v_value <= 0 then
      raise exception 'OB % sem valor no relatório', v_number;
    end if;
    insert into finance.pagamento (unit_id, liquidacao_id, numero_ob, data, valor, origem, import_batch_id, created_by)
    values (p_unit_id, v_parent, v_number, v_date, v_value, 'siafi', p_batch_id, p_actor)
    returning id into v_new;
    update siafi_integration.import_row
       set parse_status = 'parsed', parse_error = null, applied_table = 'finance.pagamento', applied_id = v_new
     where id = p_row_id;
    return 'created';
  end if;

  raise exception 'Tipo de relatório sem aplicação de documento: %', p_report_type;
end;
$$;

-- Religa as NS e OB estacionadas da unidade. Função ÚNICA: o import de lote a chama
-- ao terminar, e o registro rápido/manual de NE ou NS a chama depois de gravar.
-- NS antes de OB: a OB que espera uma NS religada agora entra na mesma volta.
-- Cada linha num subbloco: a que falha continua estacionada, com o motivo, e não
-- derruba o trabalho de quem chamou.
create or replace function siafi_integration.relink_waiting_rows(p_unit_id bigint, p_actor uuid default null)
returns table (relinked integer, still_waiting integer)
language plpgsql
set search_path = ''
as $$
declare
  r record;
  v_type text;
  v_outcome text;
  v_relinked integer := 0;
  v_waiting integer := 0;
begin
  foreach v_type in array array['ns', 'ob'] loop
    for r in
      select ir.id, ir.batch_id, ir.parsed, b.competencia
        from siafi_integration.import_row ir
        join siafi_integration.import_batch b on b.id = ir.batch_id
       where b.unit_id = p_unit_id and b.report_type = v_type and ir.parse_status = 'waiting_parent'
       order by b.created_at, ir.row_number
         for update of ir skip locked
    loop
      begin
        v_outcome := siafi_integration.apply_document_row(p_unit_id, v_type, r.id, r.batch_id, r.parsed, r.competencia, p_actor);
        if v_outcome = 'waiting' then v_waiting := v_waiting + 1; else v_relinked := v_relinked + 1; end if;
      exception when others then
        update siafi_integration.import_row set parse_error = 'Religação falhou: ' || sqlerrm where id = r.id;
        v_waiting := v_waiting + 1;
      end;
    end loop;
  end loop;
  return query select v_relinked, v_waiting;
end;
$$;

-- Aplica um lote NE/NS/OB numa transação só. Qualquer erro de gravação aborta o
-- lote inteiro (nada fica meio aplicado); quem chama marca o lote `failed` com a
-- mensagem, e ele pode ser aplicado de novo. Lote aplicado não se reaplica.
create or replace function siafi_integration.apply_document_batch(p_batch_id uuid, p_actor uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_batch siafi_integration.import_batch%rowtype;
  r record;
  v_outcome text;
  v_rows integer := 0;
  v_created integer := 0;
  v_enriched integer := 0;
  v_divergent integer := 0;
  v_waiting integer := 0;
  v_unlinked integer := 0;
  v_relink record;
begin
  -- dois cliques simultâneos não aplicam duas vezes
  perform pg_advisory_xact_lock(hashtextextended('siafi_batch:' || p_batch_id::text, 42));
  select * into v_batch from siafi_integration.import_batch where id = p_batch_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_batch.status = 'applied' then raise exception 'Lote já aplicado em %', v_batch.applied_at; end if;
  if v_batch.report_type not in ('ne', 'ns', 'ob') then raise exception 'Use a aplicação de crédito para este lote'; end if;

  for r in
    select ir.id, ir.parsed from siafi_integration.import_row ir
     where ir.batch_id = p_batch_id and ir.parse_status = 'parsed' and ir.applied_id is null
     order by ir.row_number
  loop
    v_rows := v_rows + 1;
    v_outcome := siafi_integration.apply_document_row(v_batch.unit_id, v_batch.report_type, r.id, p_batch_id, r.parsed, v_batch.competencia, p_actor);
    case v_outcome
      when 'created' then v_created := v_created + 1;
      when 'enriched' then v_enriched := v_enriched + 1;
      when 'enriched_divergent' then v_enriched := v_enriched + 1; v_divergent := v_divergent + 1;
      when 'waiting' then v_waiting := v_waiting + 1;
      when 'unlinked' then v_unlinked := v_unlinked + 1; v_divergent := v_divergent + 1;
      else null;
    end case;
  end loop;
  if v_rows = 0 then raise exception 'Lote sem linhas válidas para aplicar'; end if;

  -- NE nova religa NS estacionadas; NS nova religa OB estacionadas.
  select * into v_relink from siafi_integration.relink_waiting_rows(v_batch.unit_id, p_actor);

  update siafi_integration.import_batch
     set status = 'applied', applied_rows = v_created + v_enriched, applied_at = now(), error_message = null
   where id = p_batch_id;

  return jsonb_build_object(
    'created', v_created, 'enriched', v_enriched, 'divergent', v_divergent,
    'waiting', v_waiting, 'unlinked', v_unlinked,
    'relinked', v_relink.relinked, 'stillWaiting', v_relink.still_waiting
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Piso da anulação: o já liquidado E o já pedido ao fornecedor
-- ----------------------------------------------------------------------------
-- O teto "Σ OFs ≤ vigente" só era conferido quando a OF era gravada: uma anulação
-- parcial depois deixava o vigente abaixo do que as OFs já tinham pedido, sem aviso.
-- Anular abaixo do que a OF comprometeu é irregular — o fornecedor recebeu a ordem
-- e vai entregar —, então a anulação é RECUSADA com a instrução (cancele ou reduza
-- a OF antes), e não vira pendência.
--
-- Mesmas chaves de lock de antes, na mesma ordem (evento → liquidação), mais a da OF
-- por último: o trigger da OF só toma a chave dela, então não há ciclo de espera.
create or replace function finance.check_empenho_event_floor() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vigente numeric(14,2);
  v_liquidado numeric(14,2);
  v_ordered numeric(14,2);
begin
  if new.tipo not in ('anulacao', 'cancelamento') then return new; end if;

  -- serializa eventos concorrentes do mesmo empenho
  perform pg_advisory_xact_lock(hashtextextended('empenho_event:' || new.empenho_id::text, 42));
  -- ...e contra liquidação concorrente do mesmo empenho: é a chave que
  -- `check_liquidacao_within_empenho` toma. Ordem fixa evento → liquidação → OF.
  perform pg_advisory_xact_lock(hashtextextended('liq_empenho:' || new.empenho_id::text, 42));
  -- ...e contra OF concorrente: a chave de `procurement.supply_order_check_empenho`.
  perform pg_advisory_xact_lock(hashtextextended('of_empenho:' || new.empenho_id::text, 42));

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
-- 9. Conciliação enxerga o documento estacionado
-- ----------------------------------------------------------------------------
-- A NS/OB estacionada (`waiting_parent`) sumia da conciliação, que só lia `parsed`:
-- a divergência mais importante — o SIAFI tem o documento e o sisub não — ficava
-- invisível. Ela entra como `aguardando_documento_pai` (e deixa de aparecer quando
-- a religação a transforma em liquidação/pagamento).
--
-- O número do documento passa a ser o do TIPO do relatório: o relatório de NS traz
-- também a coluna da NE, e o `coalesce(numero_ne, numero_ns, …)` de antes tomava o
-- número da NE como se fosse o da NS.
create or replace view finance.v_siafi_reconciliation
with (security_invoker = true)
as
with siafi_rows as (
  select b.unit_id,
    b.report_type as documento_tipo,
    case b.report_type
      when 'ne' then r.parsed ->> 'numero_ne'
      when 'ns' then r.parsed ->> 'numero_ns'
      when 'ob' then r.parsed ->> 'numero_ob'
    end as numero_documento,
    (r.parsed ->> 'valor')::numeric as valor_siafi,
    b.created_at as lote_em,
    b.id as batch_id,
    r.parse_status,
    row_number() over (
      partition by b.unit_id, b.report_type,
        case b.report_type
          when 'ne' then r.parsed ->> 'numero_ne'
          when 'ns' then r.parsed ->> 'numero_ns'
          when 'ob' then r.parsed ->> 'numero_ob'
        end
      order by b.created_at desc
    ) as recencia
  from siafi_integration.import_row r
  join siafi_integration.import_batch b on b.id = r.batch_id
  where r.parse_status in ('parsed', 'waiting_parent') and b.report_type in ('ne', 'ns', 'ob')
), latest_siafi as (
  select unit_id, documento_tipo, numero_documento, valor_siafi, lote_em, batch_id, parse_status, recencia
  from siafi_rows
  where recencia = 1 and numero_documento is not null
), sisub_rows as (
  select e.unit_id, 'ne'::text as documento_tipo, e.numero_empenho as numero_documento, v.valor_vigente as valor_sisub
    from finance.empenho e
    join finance.v_empenho_vigente v on v.empenho_id = e.id
  union all
  select l.unit_id, 'ns'::text, l.numero_ns, l.valor from finance.liquidacao l
  union all
  select p.unit_id, 'ob'::text, p.numero_ob, p.valor from finance.pagamento p
)
select coalesce(s.unit_id, f.unit_id) as unit_id,
  coalesce(s.documento_tipo, f.documento_tipo) as documento_tipo,
  coalesce(s.numero_documento, f.numero_documento) as numero_documento,
  s.valor_sisub,
  f.valor_siafi,
  f.batch_id,
  f.lote_em,
  case
    when f.numero_documento is null then 'apenas_sisub'
    when s.numero_documento is null and f.parse_status = 'waiting_parent' then 'aguardando_documento_pai'
    when s.numero_documento is null then 'apenas_siafi'
    when abs(coalesce(s.valor_sisub, 0) - coalesce(f.valor_siafi, 0)) > 0.009 then 'divergente'
    else 'conciliado'
  end as situacao,
  coalesce(f.valor_siafi, 0) - coalesce(s.valor_sisub, 0) as diferenca,
  d.decisao,
  d.justificativa,
  (d.id is not null and not (d.valor_sisub is distinct from s.valor_sisub) and not (d.valor_siafi is distinct from f.valor_siafi)) as decisao_vigente
from sisub_rows s
full join latest_siafi f
  on f.unit_id = s.unit_id and f.documento_tipo = s.documento_tipo and f.numero_documento = s.numero_documento
left join finance.reconciliation_decision d
  on d.unit_id = coalesce(s.unit_id, f.unit_id)
 and d.documento_tipo = coalesce(s.documento_tipo, f.documento_tipo)
 and d.numero_documento = coalesce(s.numero_documento, f.numero_documento);

comment on view finance.v_siafi_reconciliation is
  'Documento a documento: apenas_sisub | apenas_siafi | aguardando_documento_pai (NS/OB estacionada à espera da NE/NS) | divergente | conciliado, comparando o domínio com o LOTE MAIS RECENTE de cada número.';

-- ----------------------------------------------------------------------------
-- Conferência depois de aplicar (esperado: zero linhas)
-- ----------------------------------------------------------------------------
-- select e.id from finance.empenho e
--  where not exists (select 1 from finance.empenho_item i where i.empenho_id = e.id);
