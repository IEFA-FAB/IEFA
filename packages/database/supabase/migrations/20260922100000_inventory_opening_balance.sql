-- ============================================================================
-- Carga de abertura do estoque (change sisub-inventory-operations, D14, tarefas 2.12–2.14)
-- ============================================================================
--
-- O problema: a cozinha que começa a usar o estoque do sisub já TEM estoque na
-- prateleira. Sem uma carga de abertura, o primeiro inventário sai vazio e cada
-- item teria de entrar como "achado" (`found_stock`), com custo digitado linha a
-- linha e contaminando o relatório de perdas e ganhos com o que não é ganho.
--
-- O `opening_balance` já existia como MOTIVO de ajuste (20260917160000), mas o
-- ajuste não serve de porta de entrada para a carga, por três razões:
--
--   1. LOTE. `post_stock_adjustment` cria, para entrada sem lote, um
--      `SEM-LOTE-<data>` sem validade e sem local. A carga precisa do lote, da
--      validade e do endereço de cada linha — sem validade o FEFO não funciona e
--      o painel de vencimentos nasce cego.
--   2. FONTE DO CUSTO. O spec exige gravar, por linha, de onde veio o custo
--      (ATA, pesquisa de preço ou digitado). O item de ajuste não tem onde.
--   3. ALÇADA. Uma carga inteira passa de qualquer alçada de ajuste, e em
--      segregação `strict` com um só nível 3 ela nunca seria lançada. A carga é
--      um ato único, aprovado por nível 3 (D14: "não cega, sem recontagem, uma
--      aprovação"), não um ajuste do dia a dia.
--
-- Então: documento próprio (`opening_balance` + itens), escrito só por funções,
-- e o lançamento gera os mesmos `adjustment_in` com motivo `opening_balance` que o
-- resto do módulo já sabe ler — natureza `implantation`, fora do relatório de
-- perdas.
--
-- REGRA QUE O BANCO GARANTE: só entra item SEM NENHUM movimento anterior na
-- cozinha. Carga sobre item que já movimentou contaria o saldo duas vezes. A
-- checagem roda no lançamento, com a linha de `stock_cost` do item travada — a
-- mesma trava que o gatilho de custeio toma em TODA inserção de movimento —, então
-- um recebimento concorrente do mesmo item ou foi visto (e a carga recusa) ou
-- espera a carga terminar (e entra depois dela, como deve).
--
-- ORDEM DE APLICAÇÃO: `inventory.opening_balance` tem `kitchen_id`, logo o
-- contrato de reset de treino (default-deny, varre o banco vivo) precisa tê-la
-- declarada NA MAIN antes desta migration ser aplicada. Declara → aplica →
-- mergeia.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Documento
-- ----------------------------------------------------------------------------
create table inventory.opening_balance (
  id uuid primary key default gen_random_uuid(),
  kitchen_id bigint not null references kitchen.kitchen (id),
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  -- de onde vieram as linhas: planilha livre ou a folha que o próprio sistema gerou
  source text not null check (source in ('spreadsheet', 'catalog_sheet')),
  source_filename text check (length(source_filename) <= 200),
  notes text check (length(notes) <= 1000),
  -- linhas recusadas na última importação, com o motivo. Ficam no documento para
  -- a correção não depender de a tela ainda estar aberta.
  import_rejections jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_by uuid references auth.users (id),
  posted_at timestamptz,
  posted_value numeric(14,4),
  cancelled_by uuid references auth.users (id),
  cancelled_at timestamptz,
  constraint opening_balance_posted_consistent
    check ((status = 'posted') = (posted_at is not null and posted_by is not null)),
  constraint opening_balance_cancelled_consistent
    check ((status = 'cancelled') = (cancelled_at is not null and cancelled_by is not null))
);

-- Um rascunho por cozinha. Dois rascunhos abertos para a mesma prateleira
-- são dois jeitos de lançar o mesmo saldo duas vezes.
create unique index opening_balance_one_draft_per_kitchen
  on inventory.opening_balance (kitchen_id) where status = 'draft';
create index opening_balance_kitchen_idx on inventory.opening_balance (kitchen_id, created_at desc);

comment on table inventory.opening_balance is
  'Carga de abertura do estoque de uma cozinha (D14). Escrita só por funções (save_opening_balance_draft, set_opening_balance_costs, post_opening_balance, cancel_opening_balance). O lançamento gera adjustment_in com motivo opening_balance, fora do relatório de perdas.';

-- ----------------------------------------------------------------------------
-- (2) Linhas
-- ----------------------------------------------------------------------------
create table inventory.opening_balance_item (
  id uuid primary key default gen_random_uuid(),
  opening_balance_id uuid not null references inventory.opening_balance (id) on delete cascade,
  -- linha da planilha de origem (1 = primeira linha de dados), para a mensagem
  -- de erro apontar onde corrigir
  line_number int not null check (line_number > 0),
  ingredient_id uuid not null references kitchen.ingredient (id),
  -- na unidade de medida do insumo (a unidade base do estoque)
  quantity numeric(14,4) not null check (quantity > 0),
  lot_code text check (length(lot_code) <= 60),
  expiry_date date,
  location text check (length(location) <= 60),
  -- custo por unidade base. Zero não é custo: entraria a R$ 0 e diluiria a média.
  unit_cost numeric(12,4) check (unit_cost > 0),
  cost_source text check (cost_source in ('ata', 'price_research', 'manual')),
  cost_reference text check (length(cost_reference) <= 200),
  -- preenchidos no lançamento
  lot_id uuid references inventory.stock_lot (id),
  movement_id uuid references inventory.stock_movement (id),
  constraint opening_balance_item_cost_has_source
    check ((unit_cost is null) = (cost_source is null))
);

create index opening_balance_item_doc_idx on inventory.opening_balance_item (opening_balance_id, line_number);
-- A mesma mercadoria (item + lote + validade) duas vezes no documento é linha
-- duplicada da planilha, não dois lotes.
create unique index opening_balance_item_unique_lot
  on inventory.opening_balance_item (opening_balance_id, ingredient_id, coalesce(lot_code, ''), coalesce(expiry_date, 'infinity'::date));

comment on column inventory.opening_balance_item.cost_source is
  'De onde veio o custo: ata (preço homologado em ARP), price_research (preço da pesquisa da ATA em planejamento) ou manual (digitado). Obrigatório junto com unit_cost.';

-- ----------------------------------------------------------------------------
-- (3) Linha só muda com o documento em rascunho; carga lançada não se apaga
-- ----------------------------------------------------------------------------
-- As funções abaixo já checam o status, mas a garantia fica no banco: um update
-- por PostgREST (service role, sem RLS) numa carga já lançada reescreveria o
-- custo que o ledger registrou.
--
-- O DELETE tem exceção, e é a mesma do resto do módulo (20260921191000): o reset
-- do ambiente de treino apaga o estoque da cozinha sentinela, e a carga de
-- abertura entra nesse caminho. Fora dele, documento lançado fica.
create function inventory.opening_balance_item_require_draft() returns trigger
language plpgsql as $$
declare
  v_status text;
  v_kitchen bigint;
  v_doc uuid := coalesce(new.opening_balance_id, old.opening_balance_id);
begin
  select status, kitchen_id into v_status, v_kitchen from inventory.opening_balance where id = v_doc for share;
  -- documento já apagado (cascade do pai): nada a proteger
  if not found then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' and inventory.training_reset_allows(v_kitchen) then
    return old;
  end if;
  if v_status <> 'draft' then
    raise exception 'Carga de abertura % já está % — linhas não podem mais mudar', v_doc, v_status;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger opening_balance_item_require_draft
  before insert or update or delete on inventory.opening_balance_item
  for each row execute function inventory.opening_balance_item_require_draft();

-- O documento lançado é o papel do saldo inicial: quem quer saber de onde veio o
-- lote de abertura chega aqui pelo `opening_balance_item.movement_id`. Apagá-lo
-- deixaria o movimento no ledger sem a carga que o explica.
create function inventory.opening_balance_posted_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if inventory.training_reset_allows(old.kitchen_id) then
      return old;
    end if;
    raise exception 'Carga de abertura lançada não se apaga: ela é a origem dos lotes e dos movimentos de implantação';
  end if;
  raise exception 'Carga de abertura lançada não se altera (status %)', old.status;
end;
$$;

-- Dois gatilhos, e não um com `when` composto: a condição de um trigger de DELETE
-- não pode olhar `new`, que ali não existe.
create trigger opening_balance_posted_no_update
  before update on inventory.opening_balance
  for each row when (old.status = 'posted') execute function inventory.opening_balance_posted_immutable();

create trigger opening_balance_posted_no_delete
  before delete on inventory.opening_balance
  for each row when (old.status = 'posted') execute function inventory.opening_balance_posted_immutable();

-- ----------------------------------------------------------------------------
-- (4) Salvar o rascunho (substitui as linhas, atomicamente)
-- ----------------------------------------------------------------------------
-- p_items: [{ line_number, ingredient_id, quantity, lot_code?, expiry_date?, location? }]
-- p_rejections: [{ line_number, reason, raw? }] — só guardado, para a tela.
--
-- Reimportar SUBSTITUI as linhas do rascunho: a planilha corrigida é a verdade
-- nova, e somar as duas importações duplicaria cada linha que não mudou. O custo
-- de linha que sobrevive à reimportação (mesmo item, lote e validade) é mantido —
-- senão cada correção de uma linha apagaria o custo de todas.
create function inventory.save_opening_balance_draft(
  p_kitchen_id bigint,
  p_actor uuid,
  p_source text,
  p_source_filename text,
  p_items jsonb,
  p_rejections jsonb
) returns uuid
language plpgsql as $$
declare
  v_doc uuid;
  v_kept jsonb;
begin
  if p_actor is null then raise exception 'Ator obrigatório'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Linhas devem ser uma lista'; end if;

  select id into v_doc from inventory.opening_balance
    where kitchen_id = p_kitchen_id and status = 'draft'
    for update;

  if v_doc is null then
    insert into inventory.opening_balance (kitchen_id, source, source_filename, import_rejections, created_by)
      values (p_kitchen_id, p_source, p_source_filename, coalesce(p_rejections, '[]'::jsonb), p_actor)
      returning id into v_doc;
  else
    update inventory.opening_balance
      set source = p_source,
          source_filename = p_source_filename,
          import_rejections = coalesce(p_rejections, '[]'::jsonb),
          updated_at = now()
      where id = v_doc;
  end if;

  -- custos já informados, pela identidade da mercadoria
  select coalesce(jsonb_agg(jsonb_build_object(
      'ingredient_id', ingredient_id, 'lot_code', coalesce(lot_code, ''),
      'expiry_date', coalesce(expiry_date, 'infinity'::date),
      'unit_cost', unit_cost, 'cost_source', cost_source, 'cost_reference', cost_reference)), '[]'::jsonb)
    into v_kept
    from inventory.opening_balance_item
    where opening_balance_id = v_doc and unit_cost is not null;

  delete from inventory.opening_balance_item where opening_balance_id = v_doc;

  -- O custo preservado entra por JOIN de igualdade sobre duas listas EXPANDIDAS, e não por
  -- `lateral` correlacionado varrendo o jsonb a cada linha: com o teto de 5.000 linhas, a
  -- varredura por linha é quadrática e a reimportação de uma planilha já custeada estourava
  -- o tempo da requisição. Assim o planejador resolve com hash join.
  with novo as (
    select (i->>'line_number')::int as line_number,
           (i->>'ingredient_id')::uuid as ingredient_id,
           (i->>'quantity')::numeric as quantity,
           nullif(i->>'lot_code', '') as lot_code,
           nullif(i->>'expiry_date', '')::date as expiry_date,
           nullif(i->>'location', '') as location,
           coalesce(nullif(i->>'lot_code', ''), '') as lot_key,
           coalesce(nullif(i->>'expiry_date', '')::date, 'infinity'::date) as expiry_key
      from jsonb_array_elements(p_items) i
  ), custo as (
    select distinct on (ingredient_id, lot_key, expiry_key)
           (k->>'ingredient_id')::uuid as ingredient_id,
           k->>'lot_code' as lot_key,
           (k->>'expiry_date')::date as expiry_key,
           (k->>'unit_cost')::numeric as unit_cost,
           k->>'cost_source' as cost_source,
           k->>'cost_reference' as cost_reference
      from jsonb_array_elements(v_kept) k
  )
  insert into inventory.opening_balance_item
    (opening_balance_id, line_number, ingredient_id, quantity, lot_code, expiry_date, location,
     unit_cost, cost_source, cost_reference)
  select v_doc, n.line_number, n.ingredient_id, n.quantity, n.lot_code, n.expiry_date, n.location,
         c.unit_cost, c.cost_source, c.cost_reference
    from novo n
    left join custo c
      on c.ingredient_id = n.ingredient_id and c.lot_key = n.lot_key and c.expiry_key = n.expiry_key;

  return v_doc;
end;
$$;

-- ----------------------------------------------------------------------------
-- (5) Custos
-- ----------------------------------------------------------------------------
-- p_costs: [{ item_id, unit_cost, cost_source, cost_reference? }]. Item de outro
-- documento é recusado: o id vem do cliente.
create function inventory.set_opening_balance_costs(
  p_opening_balance_id uuid,
  p_actor uuid,
  p_costs jsonb
) returns int
language plpgsql as $$
declare
  v_status text;
  v_expected int;
  v_updated int;
begin
  if p_actor is null then raise exception 'Ator obrigatório'; end if;
  select status into v_status from inventory.opening_balance where id = p_opening_balance_id for update;
  if not found then raise exception 'Carga de abertura não encontrada'; end if;
  if v_status <> 'draft' then raise exception 'Carga de abertura já está %', v_status; end if;

  v_expected := jsonb_array_length(p_costs);

  update inventory.opening_balance_item it
    set unit_cost = (c->>'unit_cost')::numeric,
        cost_source = c->>'cost_source',
        cost_reference = nullif(c->>'cost_reference', '')
    from jsonb_array_elements(p_costs) c
    where it.id = (c->>'item_id')::uuid
      and it.opening_balance_id = p_opening_balance_id;
  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    raise exception 'Custo de % linha(s) não aplicado: item fora desta carga', v_expected - v_updated;
  end if;

  update inventory.opening_balance set updated_at = now() where id = p_opening_balance_id;
  return v_updated;
end;
$$;

-- ----------------------------------------------------------------------------
-- (6) Lançamento
-- ----------------------------------------------------------------------------
create function inventory.post_opening_balance(
  p_opening_balance_id uuid,
  p_actor uuid
) returns table (movements int, value numeric)
language plpgsql as $$
declare
  v_doc inventory.opening_balance%rowtype;
  v_item record;
  v_lot_id uuid;
  v_movement_id uuid;
  v_count int := 0;
  v_missing int;
  v_blocked text;
  v_bad_unit text;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform set_config('inventory.via_rpc', 'on', true);
  if p_actor is null then raise exception 'Ator obrigatório'; end if;

  select * into v_doc from inventory.opening_balance where id = p_opening_balance_id for update;
  if not found then raise exception 'Carga de abertura não encontrada'; end if;
  if v_doc.status <> 'draft' then raise exception 'Carga de abertura já está %', v_doc.status; end if;
  if not exists (select 1 from inventory.opening_balance_item where opening_balance_id = p_opening_balance_id) then
    raise exception 'Carga de abertura sem linhas';
  end if;

  select count(*) into v_missing
    from inventory.opening_balance_item
    where opening_balance_id = p_opening_balance_id and unit_cost is null;
  if v_missing > 0 then
    raise exception '% linha(s) sem custo — informe o custo de todas antes de lançar', v_missing;
  end if;

  -- insumo sem unidade canônica não movimenta estoque (mesma regra do ajuste)
  select string_agg(distinct coalesce(ing.description, ing.id::text), ', ')
    into v_bad_unit
    from inventory.opening_balance_item it
    join kitchen.ingredient ing on ing.id = it.ingredient_id
    left join core.measure_unit mu on mu.code = ing.measure_unit
    where it.opening_balance_id = p_opening_balance_id and mu.code is null;
  if v_bad_unit is not null then
    raise exception 'Insumo(s) sem unidade de medida canônica: % — resolva na fila de revisão antes de lançar', v_bad_unit;
  end if;

  -- Trava a linha de custo de cada item, em ordem de id (sem deadlock entre
  -- duas cargas), e SÓ ENTÃO confere se o item já movimentou. É a mesma trava
  -- que o gatilho de custeio toma em toda inserção de movimento.
  for v_item in
    select distinct ingredient_id from inventory.opening_balance_item
     where opening_balance_id = p_opening_balance_id
     order by ingredient_id
  loop
    insert into inventory.stock_cost (kitchen_id, ingredient_id, frozen_preparation_id)
      values (v_doc.kitchen_id, v_item.ingredient_id, null)
      on conflict do nothing;
    perform 1 from inventory.stock_cost
      where kitchen_id = v_doc.kitchen_id and ingredient_id = v_item.ingredient_id
      for update;
  end loop;

  select string_agg(distinct coalesce(ing.description, ing.id::text), ', ')
    into v_blocked
    from inventory.opening_balance_item it
    join kitchen.ingredient ing on ing.id = it.ingredient_id
    where it.opening_balance_id = p_opening_balance_id
      and exists (select 1 from inventory.stock_movement m
                   where m.kitchen_id = v_doc.kitchen_id and m.ingredient_id = it.ingredient_id);
  if v_blocked is not null then
    raise exception 'Item(ns) já movimentado(s) nesta cozinha não entram na carga de abertura: %. Retire-os da planilha — o saldo deles se corrige por contagem', v_blocked;
  end if;

  for v_item in
    select * from inventory.opening_balance_item
     where opening_balance_id = p_opening_balance_id
     order by line_number, id
  loop
    insert into inventory.stock_lot
      (kitchen_id, ingredient_id, lot_code, expiry_date, location, unit_cost)
    values
      (v_doc.kitchen_id, v_item.ingredient_id,
       coalesce(v_item.lot_code, 'ABERTURA-' || to_char(v_today, 'YYYY-MM-DD')),
       v_item.expiry_date, v_item.location, v_item.unit_cost)
    returning id into v_lot_id;

    insert into inventory.stock_movement
      (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost, reason_code, justification, created_by)
    values
      (v_doc.kitchen_id, v_item.ingredient_id, v_lot_id, 'adjustment_in', v_item.quantity, v_item.unit_cost,
       'opening_balance', 'Carga de abertura ' || p_opening_balance_id || ', linha ' || v_item.line_number, p_actor)
    returning id into v_movement_id;

    update inventory.opening_balance_item
      set lot_id = v_lot_id, movement_id = v_movement_id
      where id = v_item.id;
    v_count := v_count + 1;
  end loop;

  update inventory.opening_balance
    set status = 'posted',
        posted_by = p_actor,
        posted_at = now(),
        updated_at = now(),
        posted_value = (select sum(quantity * unit_cost) from inventory.opening_balance_item
                         where opening_balance_id = p_opening_balance_id)
    where id = p_opening_balance_id;

  return query
    select v_count, (select posted_value from inventory.opening_balance where id = p_opening_balance_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- (7) Cancelamento do rascunho
-- ----------------------------------------------------------------------------
create function inventory.cancel_opening_balance(
  p_opening_balance_id uuid,
  p_actor uuid
) returns void
language plpgsql as $$
declare
  v_status text;
begin
  if p_actor is null then raise exception 'Ator obrigatório'; end if;
  select status into v_status from inventory.opening_balance where id = p_opening_balance_id for update;
  if not found then raise exception 'Carga de abertura não encontrada'; end if;
  if v_status <> 'draft' then raise exception 'Só rascunho pode ser cancelado (carga está %)', v_status; end if;
  update inventory.opening_balance
    set status = 'cancelled', cancelled_by = p_actor, cancelled_at = now(), updated_at = now()
    where id = p_opening_balance_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- (8) Acesso: só o servidor
-- ----------------------------------------------------------------------------
-- RLS ligada sem policy, como as irmãs. As funções nascem executáveis só por
-- postgres e service_role (default deny, 20260920210000) — nada a revogar.
alter table inventory.opening_balance enable row level security;
alter table inventory.opening_balance_item enable row level security;
revoke all on inventory.opening_balance from anon, authenticated;
revoke all on inventory.opening_balance_item from anon, authenticated;
