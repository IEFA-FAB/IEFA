-- ============================================================================
-- Contract do empenho: saem as colunas antigas do cabeçalho
-- (change `sisub-flexible-expense-execution`, D3, "Expand/contract no empenho")
-- ============================================================================
-- `20260926214000_acquisition_origin` fez da NE um documento com itens
-- (`finance.empenho_item`) e deixou em expand `finance.empenho.arp_item_id`,
-- `quantidade_empenhada` e `valor_unitario`, espelhadas do item único pelo
-- trigger `empenho_item_sync_header`. O código deixou de ler e gravar as três
-- (PR "read and write empenho items instead of the legacy header columns").
--
-- SÓ APLICAR DEPOIS DO DEPLOY DAQUELE PR. O código anterior a ele grava as
-- três colunas no `createEmpenhoFn` e as lê no painel da ARP, na OF e nos
-- relatórios: com elas fora, essas telas quebram.
--
-- O que referencia as três colunas no banco vivo (pg_proc.prosrc, pg_views,
-- pg_trigger e pg_depend, conferidos em 2026-09-26):
--   - `procurement.supply_order_empenho_usage`: o cabeçalho fazia o papel do
--     item único enquanto a NE do caminho antigo não tinha item (preço da OF e
--     quantidade do teto). Recriada só com os itens.
--   - `inventory.designations_covering`: casava a ARP da NE pelo cabeçalho OU
--     pelos itens. Recriada só com os itens.
--   - `finance.empenho_ensure_item`: criava o item a partir do cabeçalho.
--     Recriada só com o valor (ver abaixo por que fica).
--   - `finance.empenho_item_sync_header` + trigger: o espelho. Saem.
--   - índice `idx_empenho_arp_item`, FK `empenho_arp_item_id_fkey` e CHECK
--     `empenho_quantidade_empenhada_check`: caem com as colunas.
--   Nenhuma view usa as colunas (`v_empenho_*` e `v_siafi_reconciliation` leem
--   só `valor_total`, status e eventos). `check_empenho_event_floor` e o
--   trigger do teto da OF passam por `supply_order_empenho_usage`.
--
-- `empenho_ensure_item` FICA: a NE ainda nasce só com o cabeçalho em dois
-- caminhos — o registro rápido (`quickRegisterEmpenhoFn`, um insert PostgREST
-- só) e o import do SIAFI (`siafi_integration.apply_document_row`) — e em
-- qualquer insert manual. Todo leitor novo (teto da OF, comprometimento local,
-- conformidade) conta os itens: NE sem item seria NE sem valor. O trigger é
-- adiado; quem grava os itens na mesma transação (`createEmpenhoWithItemsFn`,
-- `createEmpenhoFn`) chega ao commit com item e ele não faz nada. O item que ele
-- cria é o da NE estimativa/global: só o valor, sem ARP, quantidade ou preço.
--
-- `analytics_reader` ganha SELECT em `finance.empenho_item`: o vínculo NE × item
-- da ARP que o assistente de analytics lia no cabeçalho passa a estar nos itens.
-- A lista de `ALLOWED_TABLES` (apps/sisub/src/lib/analytics-sql.ts) acompanha no
-- mesmo PR. O papel é `bypassrls` e só roda SELECT em transação somente leitura
-- (20260921160000); nenhum cliente (`anon`/`authenticated`) ganha nada.
--
-- Funções recriadas mantêm dono e ACL (`create or replace`): executáveis só por
-- `postgres` e `service_role`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O espelho item → cabeçalho sai
-- ----------------------------------------------------------------------------
drop trigger if exists empenho_item_sync_header on finance.empenho_item;
drop function if exists finance.empenho_item_sync_header();

-- ----------------------------------------------------------------------------
-- 2. NE que nasce só com o cabeçalho ganha o item do valor
-- ----------------------------------------------------------------------------
create or replace function finance.empenho_ensure_item() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- NE apagada na mesma transação: não há o que completar.
  if not exists (select 1 from finance.empenho e where e.id = new.id) then return null; end if;
  if exists (select 1 from finance.empenho_item i where i.empenho_id = new.id) then return null; end if;
  insert into finance.empenho_item (empenho_id, position, value)
  select e.id, 1, e.valor_total from finance.empenho e where e.id = new.id;
  return null;
end;
$$;

comment on function finance.empenho_ensure_item() is
  'Trigger adiado: a NE gravada só com o cabeçalho (registro rápido, import do SIAFI) ganha no commit um item com o valor total, sem ARP, quantidade ou preço.';

-- ----------------------------------------------------------------------------
-- 3. Uso do empenho pelas OFs: só os itens da NE
-- ----------------------------------------------------------------------------
-- O preço da linha da OF é o da própria linha, o do item da NE que cobre o mesmo
-- item de ARP (ou o do item único, quando a linha não tem ARP), ou o do item da
-- ARP, nesta ordem. Linha sem preço nos três é conferida pela QUANTIDADE dos
-- itens da NE, quando eles têm quantidade; sem nenhuma das duas, vira pendência
-- "OF sem preço" (sem recusa).
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
          where x.empenho_id = so.empenho_id and x.unit_price is not null
            and (x.arp_item_id = i.arp_item_id
              or (i.arp_item_id is null and (select count(*) from finance.empenho_item y where y.empenho_id = so.empenho_id) = 1))
          order by x.position limit 1),
        ai.valor_unitario
      ) as price
    from procurement.supply_order_item i
    join procurement.supply_order so on so.id = i.supply_order_id
    left join procurement.procurement_arp_item ai on ai.id = i.arp_item_id
    where so.empenho_id = p_empenho_id and so.status <> 'cancelled'
  )
  select
    coalesce(sum(ordered_qty * price) filter (where price is not null), 0)::numeric,
    coalesce(sum(ordered_qty) filter (where price is null), 0)::numeric,
    (count(*) filter (where price is null))::integer,
    (select sum(x.quantity) from finance.empenho_item x where x.empenho_id = p_empenho_id having count(x.quantity) > 0)::numeric
  from lines;
$$;

-- ----------------------------------------------------------------------------
-- 4. Designação que cobre a NE: a ARP vem dos itens
-- ----------------------------------------------------------------------------
create or replace function inventory.designations_covering(p_unit_id bigint, p_empenho_id uuid, p_roles text[])
returns table (designation_id uuid, person_id uuid, by_empenho boolean, by_arp boolean, by_acquisition boolean, is_substitute boolean, valid_from date)
language sql
stable
set search_path = ''
as $$
  with arps as (
    select ai.arp_id
      from finance.empenho_item ei
      join procurement.procurement_arp_item ai on ai.id = ei.arp_item_id
     where ei.empenho_id = p_empenho_id
  ),
  acquisitions as (
    select e.acquisition_id from finance.empenho e where e.id = p_empenho_id and e.acquisition_id is not null
    union
    select a.acquisition_id from procurement.procurement_arp a
     where a.id in (select arp_id from arps) and a.acquisition_id is not null
  )
  select d.id, d.person_id, d.empenho_id is not null, d.arp_id is not null, d.acquisition_id is not null, d.is_substitute, d.valid_from
    from procurement.contract_designation d
   where d.unit_id = p_unit_id
     and d.role = any(p_roles)
     and d.valid_from <= (now() at time zone 'America/Sao_Paulo')::date
     and (d.valid_to is null or d.valid_to >= (now() at time zone 'America/Sao_Paulo')::date)
     and (d.empenho_id is null or d.empenho_id = p_empenho_id)
     and (d.arp_id is null or d.arp_id in (select arp_id from arps))
     and (d.acquisition_id is null or d.acquisition_id in (select acquisition_id from acquisitions));
$$;

-- ----------------------------------------------------------------------------
-- 5. As colunas saem (índice, FK e CHECK caem junto)
-- ----------------------------------------------------------------------------
alter table finance.empenho
  drop column arp_item_id,
  drop column quantidade_empenhada,
  drop column valor_unitario;

comment on table finance.empenho_item is
  'Item da nota de empenho: a fonte do que a NE cobre (item da ARP, item de compra, quantidade, preço, valor). Toda NE tem ao menos um; a estimativa/global pode ter só o valor.';

-- ----------------------------------------------------------------------------
-- 6. Assistente de analytics lê os itens da NE
-- ----------------------------------------------------------------------------
grant select on finance.empenho_item to analytics_reader;

-- ----------------------------------------------------------------------------
-- Conferência depois de aplicar (esperado: zero linhas em cada)
-- ----------------------------------------------------------------------------
-- select column_name from information_schema.columns
--  where table_schema = 'finance' and table_name = 'empenho'
--    and column_name in ('arp_item_id', 'quantidade_empenhada', 'valor_unitario');
-- select e.id from finance.empenho e
--  where not exists (select 1 from finance.empenho_item i where i.empenho_id = e.id);
