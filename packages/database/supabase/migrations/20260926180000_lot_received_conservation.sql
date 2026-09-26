-- Conservação é SUGESTÃO da especificação; o lote registra a que aconteceu.
--
-- A especificação de compra diz em que classe o item deve chegar (congelado, resfriado…),
-- e o lote copiava essa classe sem perguntar. A realidade não obedece: com o freezer
-- quebrado e a geladeira funcionando, a unidade compra carne a vácuo resfriada em vez de
-- congelada — e o sistema gravava um lote "congelado" de carne resfriada, com o alerta de
-- validade de 15 dias em vez de 3. Não se bloqueia a situação; ela é registrada.
--
-- 1. `goods_receipt_item_lot.conservation_class`: a classe em que o lote CHEGOU, informada
--    na conferência. Nula = seguiu a sugestão. Diferente da sugestão, o servidor preenche
--    `divergence_reason` ("Recebido resfriado (sugerido pela especificação: congelado)"),
--    e o recebimento termina como `divergent` — o mesmo caminho da temperatura fora da
--    faixa: registrado, nunca recusado.
-- 2. `finalize_goods_receipt`: o lote de estoque nasce com a classe recebida, ou a sugerida.
-- 3. `split_lot`: descongelado nasce `resfriado`; aberto/porcionado herdam a classe.
-- 4. `transfer_stock`: o lote de destino herda a classe.
-- 5. `open_inventory_count`: a contagem por classe usa a classe efetiva (lote ou
--    especificação padrão), como `v_lot_expiry` já fazia.
--
-- Aditiva e compatível com o código da main anterior: sem a classe informada, tudo segue
-- como antes. Funções recriadas a partir do `pg_get_functiondef` de produção, com a mudança
-- marcada em comentário; `create or replace` preserva dono, grants e comentários.
-- Edge cases: EST-REC-04 e EST-ARM-01 (.claude/skills/edge-cases/modules/estoque.md).

alter table inventory.goods_receipt_item_lot
  add column conservation_class text
  constraint goods_receipt_item_lot_conservation_class_check
  check (conservation_class in ('seco', 'resfriado', 'congelado', 'climatizado', 'nao_aplicavel'));

comment on column inventory.goods_receipt_item_lot.conservation_class is
  'Classe em que o lote chegou, informada na conferência. Nula = a sugerida pela especificação de compra. É a que o stock_lot recebe na efetivação.';

CREATE OR REPLACE FUNCTION inventory.finalize_goods_receipt(p_receipt_id uuid, p_user uuid)
 RETURNS TABLE(movements integer)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_receipt inventory.goods_receipt%rowtype;
  v_item record;
  v_lot record;
  v_lot_id uuid;
  v_movements int := 0;
  v_has_divergence boolean;
  v_lot_total numeric(14,4);
  v_unexplained text;
  v_conservation text;
  v_fallback_seq int;
  v_of_kitchen bigint;
  v_shortfall numeric(14,2);
begin
  perform set_config('inventory.via_rpc', 'on', true);
  select * into v_receipt from inventory.goods_receipt where id = p_receipt_id for update;
  if not found then raise exception 'Recebimento não encontrado'; end if;

  -- (20260730120000, guarda 1) Efetivação é única. Precede o gate de status:
  -- o recebimento divergente sai da efetivação com status que o gate aceita.
  if v_receipt.definitive_at is not null then
    raise exception 'Recebimento já efetivado em % — efetivação é única', v_receipt.definitive_at;
  end if;

  -- (20260920250000) Linha que difere da nota sem motivo não efetiva — e a
  -- checagem mora AQUI, depois da trava do recebimento: no servidor, antes da
  -- RPC, uma leitura que chegasse no meio passava uma falta sem motivo como
  -- `definitive`. A tolerância é a mesma do recálculo da linha (0,001).
  select string_agg(coalesce(i.description, gri.id::text), ', ' order by i.description)
    into v_unexplained
    from inventory.goods_receipt_item gri
    left join kitchen.ingredient i on i.id = gri.ingredient_id
   where gri.receipt_id = p_receipt_id
     and gri.invoiced_qty_base is not null
     and abs(gri.invoiced_qty_base - gri.received_qty_base) >= 0.001
     and nullif(btrim(coalesce(gri.divergence_reason, '')), '') is null;
  if v_unexplained is not null then
    raise exception 'Linha(s) diferem da nota sem motivo registrado (%) — informe o motivo da divergência antes de efetivar', v_unexplained;
  end if;

  if v_receipt.status not in ('provisional', 'divergent') then
    raise exception 'Recebimento precisa estar provisório (ou divergente) para efetivar — status atual: %', v_receipt.status;
  end if;

  -- (20260730120000, guarda 2) A OF tem de ser da cozinha do recebimento.
  if v_receipt.supply_order_id is not null then
    select kitchen_id into v_of_kitchen from procurement.supply_order where id = v_receipt.supply_order_id;
    if v_of_kitchen is distinct from v_receipt.kitchen_id then
      raise exception 'OF pertence à cozinha %, não à cozinha do recebimento (%)', v_of_kitchen, v_receipt.kitchen_id;
    end if;
  end if;

  for v_item in
    select * from inventory.goods_receipt_item where receipt_id = p_receipt_id
  loop
    if v_item.received_qty_base <= 0 then continue; end if;

    -- A soma dos lotes tem de fechar com a quantidade conferida. A checagem é
    -- AQUI e não numa constraint: durante a conferência a soma fica
    -- legitimamente parcial enquanto o operador digita, e uma constraint
    -- rejeitaria o primeiro lote de uma entrega de três.
    select coalesce(sum(quantity_base), 0) into v_lot_total
      from inventory.goods_receipt_item_lot where receipt_item_id = v_item.id;

    if v_lot_total = 0 then
      -- Nenhum lote informado: sintético com a quantidade inteira. Sufixo
      -- numérico porque duas linhas sem código na mesma entrega colidiriam no
      -- unique (receipt_item_id, lot_code) do mesmo dia.
      select count(*) + 1 into v_fallback_seq
        from inventory.goods_receipt_item_lot l
        join inventory.goods_receipt_item i on i.id = l.receipt_item_id
       where i.receipt_id = p_receipt_id and l.lot_code like 'SEM-LOTE-%';

      insert into inventory.goods_receipt_item_lot
        (receipt_item_id, lot_code, quantity_base, unit_cost)
      values
        (v_item.id, 'SEM-LOTE-' || to_char(now(), 'YYYY-MM-DD') || '-' || v_fallback_seq,
         v_item.received_qty_base, v_item.unit_cost);
    elsif v_lot_total <> v_item.received_qty_base then
      raise exception 'Soma dos lotes (%) difere da quantidade conferida (%) no item %',
        v_lot_total, v_item.received_qty_base, v_item.id;
    end if;

    -- Classe de conservação exigida pela especificação de compra da linha;
    -- sem purchase_item na linha, cai na especificação padrão do item.
    select pi.conservation_class into v_conservation
      from procurement.purchase_item pi
     where pi.id = v_item.purchase_item_id;

    if v_conservation is null and v_item.ingredient_id is not null then
      select pi.conservation_class into v_conservation
        from procurement.purchase_item_ingredient pii
        join procurement.purchase_item pi on pi.id = pii.purchase_item_id
       where pii.ingredient_id = v_item.ingredient_id and pii.is_default
         and pi.deleted_at is null
       limit 1;
    end if;

    for v_lot in
      -- lote zerado pela conferência (recusa, leitura desfeita) fica como
      -- registro — com código, validade e temperatura —, mas não vira estoque
      select * from inventory.goods_receipt_item_lot where receipt_item_id = v_item.id and quantity_base > 0
    loop
      insert into inventory.stock_lot
        (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, expiry_date,
         unit_cost, goods_receipt_item_id, goods_receipt_item_lot_id, conservation_class)
      values
        (v_receipt.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id,
         v_lot.lot_code, v_lot.expiry_date, coalesce(v_lot.unit_cost, v_item.unit_cost),
         -- A classe em que o lote CHEGOU, quando o conferente a informou; senão, a sugerida
         -- pela especificação. Ver goods_receipt_item_lot.conservation_class.
         v_item.id, v_lot.id, coalesce(v_lot.conservation_class, v_conservation))
      returning id into v_lot_id;

      insert into inventory.stock_movement
        (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity,
         unit_cost, goods_receipt_item_id, created_by)
      values
        (v_receipt.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id, v_lot_id,
         'receipt', v_lot.quantity_base, coalesce(v_lot.unit_cost, v_item.unit_cost, 0),
         v_item.id, p_user);

      v_movements := v_movements + 1;
    end loop;
  end loop;

  -- Divergência nasce da linha do item OU do lote (temperatura fora da faixa).
  select exists (
    select 1 from inventory.goods_receipt_item gri
    left join inventory.goods_receipt_item_lot l on l.receipt_item_id = gri.id
    where gri.receipt_id = p_receipt_id
      and (gri.divergence_reason is not null or l.divergence_reason is not null)
  ) into v_has_divergence;

  -- Pendência fiscal NA MESMA TRANSAÇÃO da efetivação. Recebido a MENOR que o
  -- faturado deixa a nota dizendo 100 e o estoque 90; até a devolução, a nota
  -- substituta ou a glosa, o recebimento não é liquidável. Gravada depois, por
  -- um segundo comando do servidor, havia uma janela em que o recebimento já
  -- estava efetivado e ainda sem pendência — liquidável — e um erro nesse
  -- segundo comando era descartado, deixando a janela aberta para sempre.
  -- A conta é a mesma de `fiscalShortfallValue` (sisub-domain): linha sem
  -- quantidade faturada ou sem custo não entra; só a falta, nunca a sobra.
  select round(coalesce(sum((gri.invoiced_qty_base - gri.received_qty_base) * gri.unit_cost), 0), 2)
    into v_shortfall
    from inventory.goods_receipt_item gri
   where gri.receipt_id = p_receipt_id
     and gri.invoiced_qty_base is not null
     and gri.unit_cost is not null
     and gri.invoiced_qty_base > gri.received_qty_base;

  update inventory.goods_receipt
    set status = case when v_has_divergence then 'divergent' else 'definitive' end,
        definitive_by = p_user,
        definitive_at = now(),
        fiscal_pending = case when v_shortfall > 0 then true else fiscal_pending end,
        fiscal_pending_value = case when v_shortfall > 0 then v_shortfall else fiscal_pending_value end
    where id = p_receipt_id;

  if v_receipt.supply_order_id is not null then
    update procurement.supply_order so
      set status = case
        when (select coalesce(sum(gri.received_qty_base), 0)
                from inventory.goods_receipt gr
                join inventory.goods_receipt_item gri on gri.receipt_id = gr.id
                where gr.supply_order_id = so.id and gr.definitive_at is not null)
             >= (select coalesce(sum(ordered_qty), 0) from procurement.supply_order_item where supply_order_id = so.id)
          then 'received' else 'partially_received' end,
          updated_at = now()
      where so.id = v_receipt.supply_order_id;
  end if;

  return query select v_movements;
end;
$function$;

CREATE OR REPLACE FUNCTION inventory.split_lot(p_lot_id uuid, p_quantity numeric, p_derivation text, p_user uuid, p_expiry_date date DEFAULT NULL::date, p_location text DEFAULT NULL::text)
 RETURNS TABLE(new_lot_id uuid, new_short_code text, new_expiry_date date)
 LANGUAGE plpgsql
AS $function$
declare
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_days int;
  v_expiry date;
  v_new_lot inventory.stock_lot%rowtype;
  v_unit_cost numeric(12,4);
begin
  perform set_config('inventory.via_rpc', 'on', true);

  if p_derivation not in ('opened', 'portioned', 'thawed') then
    raise exception 'Derivação inválida: %', p_derivation;
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.quarantined_at is not null then raise exception 'Lote em quarentena não pode ser fracionado'; end if;

  select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                           then quantity else -quantity end), 0)
    into v_balance
    from inventory.stock_movement where lot_id = p_lot_id;
  if v_balance < p_quantity then
    raise exception 'Saldo insuficiente no lote (% disponível)', v_balance;
  end if;

  -- validade do derivado: a MENOR entre a original e agora + prazo do item
  if v_lot.ingredient_id is not null then
    select case p_derivation
             when 'thawed' then i.shelf_life_after_thaw_days
             else i.shelf_life_after_opening_days
           end
      into v_days
      from kitchen.ingredient i where i.id = v_lot.ingredient_id;
  end if;

  v_expiry := coalesce(
    p_expiry_date,
    case when v_days is not null
      then least(coalesce(v_lot.expiry_date, 'infinity'::date),
                 ((now() at time zone 'America/Sao_Paulo')::date + v_days))
      else v_lot.expiry_date
    end
  );
  if v_expiry = 'infinity'::date then v_expiry := null; end if;

  -- custo médio vigente vale para os dois movimentos: o par não pode mudar valor
  select avg_unit_cost into v_unit_cost
    from inventory.stock_cost
    where kitchen_id = v_lot.kitchen_id
      and ingredient_id is not distinct from v_lot.ingredient_id
      and frozen_preparation_id is not distinct from v_lot.frozen_preparation_id;

  insert into inventory.stock_lot
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, expiry_date, unit_cost,
     location, parent_lot_id, derivation, opened_at, received_at, conservation_class)
  values
    (v_lot.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id,
     v_lot.lot_code || '-' || upper(substr(p_derivation, 1, 1)), v_expiry, coalesce(v_unit_cost, v_lot.unit_cost),
     coalesce(p_location, v_lot.location), v_lot.id, p_derivation, now(), now(),
     -- Descongelado é resfriado; aberto e porcionado seguem a classe do lote de origem.
     -- Antes o derivado nascia sem classe e a validade caía na especificação padrão:
     -- a carne descongelada aparecia como congelada.
     case when p_derivation = 'thawed' then 'resfriado' else v_lot.conservation_class end)
  returning * into v_new_lot;

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, justification, created_by)
  values
    (v_lot.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_lot.id, 'lot_split_out',
     p_quantity, coalesce(v_unit_cost, 0), 'Fracionamento (' || p_derivation || ') → ' || v_new_lot.short_code, p_user),
    (v_lot.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_new_lot.id, 'lot_split_in',
     p_quantity, coalesce(v_unit_cost, 0), 'Fracionamento (' || p_derivation || ') ← ' || v_lot.short_code, p_user);

  return query select v_new_lot.id, v_new_lot.short_code, v_new_lot.expiry_date;
end;
$function$;

CREATE OR REPLACE FUNCTION inventory.transfer_stock(p_lot_id uuid, p_to_kitchen bigint, p_quantity numeric, p_user uuid)
 RETURNS TABLE(transfer_pair_id uuid)
 LANGUAGE plpgsql
AS $function$
declare
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_dest_lot_id uuid;
  v_pair uuid := gen_random_uuid();
  v_out_cost numeric(12,4);
begin
  perform set_config('inventory.via_rpc', 'on', true);

  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.kitchen_id = p_to_kitchen then raise exception 'Origem e destino são a mesma cozinha'; end if;
  if v_lot.quarantined_at is not null then raise exception 'Lote em quarentena não é transferível'; end if;

  select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                           then quantity else -quantity end), 0)
    into v_balance
    from inventory.stock_movement where lot_id = p_lot_id;
  if v_balance < p_quantity then
    raise exception 'Saldo insuficiente no lote (% disponível)', v_balance;
  end if;

  select id into v_dest_lot_id
    from inventory.stock_lot
    where kitchen_id = p_to_kitchen
      and lot_code = v_lot.lot_code
      and (ingredient_id = v_lot.ingredient_id or frozen_preparation_id = v_lot.frozen_preparation_id)
      and expiry_date is not distinct from v_lot.expiry_date
    limit 1;
  if v_dest_lot_id is null then
    -- O lote transferido leva a classe junto: antes nascia sem classe na cozinha de destino.
    insert into inventory.stock_lot (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, expiry_date, unit_cost, received_at, conservation_class)
      values (p_to_kitchen, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_lot.lot_code, v_lot.expiry_date, v_lot.unit_cost, now(), v_lot.conservation_class)
      returning id into v_dest_lot_id;
  end if;

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, transfer_pair_id, created_by)
  values
    (v_lot.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, p_lot_id, 'transfer_out', p_quantity, v_pair, p_user)
  returning unit_cost into v_out_cost;

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost, transfer_pair_id, created_by)
  values
    (p_to_kitchen, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_dest_lot_id, 'transfer_in', p_quantity, v_out_cost, v_pair, p_user);

  return query select v_pair;
end;
$function$;

CREATE OR REPLACE FUNCTION inventory.open_inventory_count(p_kitchen_id bigint, p_type text, p_scope text, p_scope_params jsonb, p_blind boolean, p_blind_waiver_reason text, p_user uuid)
 RETURNS TABLE(count_id uuid, scope_items integer)
 LANGUAGE plpgsql
AS $function$
declare
  v_id uuid;
  v_items int := 0;
  v_conflict record;
  v_class text := p_scope_params->>'conservation_class';
  v_location text := p_scope_params->>'location';
  v_days int := coalesce((p_scope_params->>'days')::int, 7);
begin
  if p_blind is false and p_blind_waiver_reason is null then
    raise exception 'Contagem não cega exige o motivo registrado';
  end if;

  -- contagem vencida deixa de segurar o escopo dela
  -- Contagem vencida deixa de segurar o escopo dela — e vence com a CADEIA. A
  -- rodada anterior, em `recount`, não vence sozinha enquanto a recontagem dela
  -- estiver viva: soltaria os itens para outra contagem, e a aprovação da
  -- recontagem os ajustaria de novo. Quando a última rodada vence, as
  -- anteriores vencem com ela.
  with recursive vencidas as (
    update inventory.inventory_count
       set status = 'expired'
     where kitchen_id = p_kitchen_id
       and status in ('draft', 'counting', 'review')
       and expires_at < now()
    returning id, parent_count_id
  ),
  acima as (
    select parent_count_id as id from vencidas where parent_count_id is not null
    union
    select c.parent_count_id from inventory.inventory_count c join acima a on c.id = a.id where c.parent_count_id is not null
  )
  update inventory.inventory_count c
     set status = 'expired'
    from acima a
   where c.id = a.id and c.status = 'recount';

  insert into inventory.inventory_count (kitchen_id, status, type, scope, scope_params, blind, blind_waiver_reason, created_by)
    values (p_kitchen_id, 'counting', p_type, p_scope, coalesce(p_scope_params, '{}'::jsonb), p_blind, p_blind_waiver_reason, p_user)
    returning id into v_id;

  -- Itens da cozinha: os que têm lote, e os que já se moveram alguma vez. O
  -- segundo conjunto importa porque item com saldo ZERO também se conta — é
  -- assim que a sobra esquecida na prateleira aparece.
  with candidatos as (
    -- Classe EFETIVA, a mesma de inventory.v_lot_expiry: a do lote, ou a da especificação
    -- padrão do insumo. Com a classe crua, lote sem classe (saldo de abertura, ajuste)
    -- sumia da contagem por classe.
    select distinct l.ingredient_id, l.frozen_preparation_id,
           coalesce(l.conservation_class, (
             select pi.conservation_class
               from procurement.purchase_item_ingredient pii
               join procurement.purchase_item pi on pi.id = pii.purchase_item_id
              where pii.ingredient_id = l.ingredient_id and pii.is_default
              limit 1
           )) as conservation_class,
           l.location
      from inventory.stock_lot l
     where l.kitchen_id = p_kitchen_id
    union
    select distinct m.ingredient_id, m.frozen_preparation_id, null::text, null::text
      from inventory.stock_movement m
     where m.kitchen_id = p_kitchen_id
  ),
  filtrados as (
    select c.ingredient_id, c.frozen_preparation_id
      from candidatos c
     where case p_scope
             when 'full' then true
             when 'conservation_class' then c.conservation_class is not distinct from v_class
             when 'location' then c.location is not distinct from v_location
             when 'item_list' then c.ingredient_id::text = any (
               select jsonb_array_elements_text(coalesce(p_scope_params->'ingredient_ids', '[]'::jsonb))
             )
             when 'menu_cycle' then c.ingredient_id in (
               -- ingredientes dos cardápios dos próximos N dias, lidos do
               -- snapshot da receita gravado no item de cardápio
               select (ing->>'ingredient_id')::uuid
                 from kitchen.production_task t
                 join kitchen.menu_items mi on mi.id = t.menu_item_id,
                      -- `menu_items.recipe` é `json`, não `jsonb`: sem o cast o
                      -- `coalesce` não tipa, e o erro aparece mesmo quando o
                      -- escopo escolhido nem é `menu_cycle` — o planner checa
                      -- todos os ramos do `case`
                      lateral jsonb_array_elements(coalesce(mi.recipe::jsonb->'ingredients', '[]'::jsonb)) ing
                where t.kitchen_id = p_kitchen_id
                  and t.production_date between (now() at time zone 'America/Sao_Paulo')::date
                                            and (now() at time zone 'America/Sao_Paulo')::date + v_days
                  and (ing->>'ingredient_id') is not null
             )
             else false
           end
       and (c.ingredient_id is not null or c.frozen_preparation_id is not null)
  )
  insert into inventory.count_scope_item (count_id, kitchen_id, ingredient_id, frozen_preparation_id)
    select v_id, p_kitchen_id, f.ingredient_id, f.frozen_preparation_id from filtrados f;
  get diagnostics v_items = row_count;

  if v_items = 0 then
    raise exception 'O escopo escolhido não tem nenhum item nesta cozinha';
  end if;

  return query select v_id, v_items;
exception
  when unique_violation then
    -- traduz o índice de sobreposição no nome da contagem que conflita
    select c.id, c.type, c.scope, c.created_at into v_conflict
      from inventory.inventory_count c
      join inventory.count_scope_item s on s.count_id = c.id
     where c.kitchen_id = p_kitchen_id and s.open and c.id <> v_id
     limit 1;
    if found then
      raise exception 'Já existe contagem aberta nesta cozinha com itens em comum (% de %, escopo %). Encerre-a antes de abrir outra',
        v_conflict.type, to_char(v_conflict.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), v_conflict.scope;
    end if;
    raise;
end;
$function$;
