-- ============================================================================
-- Inventário: terceira passada — guarda com NULL, lote derivado e quarentena
-- ============================================================================
--  1. A guarda de itens sem decisão da `open_recount` comparava com `= any`
--     numa coluna NULL e deixava passar tudo; agora com `coalesce`.
--  2. A falta sem lote não EXCLUI mais lote recebido depois da contagem: a
--     compra nova vai para o fim da fila, e o lote derivado (aberto,
--     porcionado, descongelado) entra normal — o saldo dele estava na
--     prateleira contada, dentro do lote de origem.
--  3. Lote em quarentena com saldo e não contado por lote recusa a aprovação
--     da falta do item: a falta nem sai dele nem é jogada nos lotes sadios.
-- ============================================================================

create or replace function inventory.approve_inventory_count(
  p_count_id uuid,
  p_actor uuid,
  p_exception_reason text default null
) returns table (adjustment_id uuid, lines int, difference_value numeric)
language plpgsql as $$
declare
  v_count inventory.inventory_count%rowtype;
  v_settings record;
  v_pending record;
  v_line record;
  v_lot record;
  v_adjustment_id uuid;
  v_lines int := 0;
  v_value numeric(14, 4) := 0;
  v_diff numeric(14, 4);
  v_remaining numeric(14, 4);
  v_take numeric(14, 4);
  v_counted_by_actor boolean;
  v_opened_by_actor boolean;
  v_first_opened timestamptz;
  v_chain uuid[];
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  -- Só a coleta ENCERRADA se aprova. Aprovar em `counting` deixava lançamento
  -- chegando no meio cair numa contagem aprovada, fora do ajuste; e aprovar a
  -- rodada anterior, em `recount`, lançava o mesmo item duas vezes.
  if v_count.status <> 'review' then
    raise exception 'Contagem em "%" não está aguardando aprovação — encerre a coleta antes', v_count.status;
  end if;

  -- a cadeia de rodadas, desta até a primeira, travada na mesma ordem
  with recursive chain as (
    select c.id, c.parent_count_id from inventory.inventory_count c where c.id = p_count_id
    union all
    select c.id, c.parent_count_id from inventory.inventory_count c join chain ch on c.id = ch.parent_count_id
  )
  select array_agg(id) into v_chain from chain;
  perform 1 from inventory.inventory_count where id = any (v_chain) order by id for update;
  -- As rodadas ANTERIORES têm de estar esperando por esta (`recount`). Uma que
  -- venceu soltou o escopo dela: outra contagem pode ter pegado os itens, e
  -- aprovar aqui os ajustaria duas vezes — além de ressuscitar a vencida.
  if exists (
    select 1 from inventory.inventory_count c
     where c.id = any (v_chain) and c.id <> p_count_id and c.status <> 'recount'
  ) then
    raise exception 'Uma rodada anterior desta contagem não está mais aguardando (venceu ou foi encerrada): a cadeia não pode ser aprovada';
  end if;
  select min(created_at) into v_first_opened from inventory.inventory_count where id = any (v_chain);

  -- ── pré-condição: baixa de produção ainda não lançada ──────────────────────
  -- A data da abertura é a CIVIL de Brasília: `created_at::date` casta em UTC,
  -- e a contagem aberta depois das 21h pulava o dia anterior.
  select t.id, t.production_date into v_pending
    from kitchen.production_task t
   where t.kitchen_id = v_count.kitchen_id
     and t.status = 'DONE'
     and t.production_date >= (v_first_opened at time zone 'America/Sao_Paulo')::date - 1
     and not exists (
       select 1 from inventory.stock_issue_request r
        where r.kitchen_id = t.kitchen_id
          and r.issue_date = coalesce(t.issue_date, t.production_date)
          and r.origin = 'production'
          and r.status <> 'open'
     )
   limit 1;
  if found then
    raise exception 'Há produção concluída em % sem a requisição do dia fechada: a contagem acusaria falta do que já saiu. Feche a requisição antes de aprovar',
      to_char(v_pending.production_date, 'DD/MM');
  end if;

  -- ── pré-condição: recebimento provisório ──────────────────────────────────
  select r.id into v_pending
    from inventory.goods_receipt r
   where r.kitchen_id = v_count.kitchen_id and r.status = 'provisional'
   limit 1;
  if found then
    raise exception 'Há recebimento provisório em aberto: o material está na prateleira e não no saldo. Efetive-o antes de aprovar';
  end if;

  -- ── segregação, sobre a cadeia inteira ─────────────────────────────────────
  v_settings := inventory.kitchen_settings(v_count.kitchen_id);
  select exists (
    select 1 from inventory.inventory_count_entry e where e.count_id = any (v_chain) and e.counted_by = p_actor
  ) into v_counted_by_actor;
  select exists (
    select 1 from inventory.inventory_count c where c.id = any (v_chain) and c.created_by = p_actor
  ) into v_opened_by_actor;

  if v_settings.segregation = 'strict' then
    if v_counted_by_actor or v_opened_by_actor then
      raise exception 'Segregação estrita nesta cozinha: quem abriu ou contou em qualquer rodada desta contagem não pode aprová-la. Peça a aprovação a outro nível 3 de estoque';
    end if;
  elsif v_opened_by_actor and p_exception_reason is null then
    raise exception 'Quem abriu a contagem não a aprova: a aprovação precisa de outra pessoa, ou de uma exceção registrada';
  end if;

  -- ── o ajuste derivado ─────────────────────────────────────────────────────
  -- O AUTOR é quem abriu a contagem: o documento sai dela. Com o aprovador
  -- como autor, `post_stock_adjustment` via autoaprovação em toda divergência
  -- acima da alçada, e ninguém conseguia aprovar.
  insert into inventory.stock_adjustment (kitchen_id, inventory_count_id, notes, created_by, submitted_at)
    values (v_count.kitchen_id, p_count_id,
            'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY') || ' (' || v_count.type || ')',
            coalesce(v_count.created_by, p_actor), now())
    returning id into v_adjustment_id;

  for v_line in
    select * from inventory.count_lines(p_count_id) cl where cl.counted_qty is not null
  loop
    v_diff := v_line.counted_qty - v_line.ledger_qty;
    continue when v_diff = 0;

    if v_line.lot_id is not null then
      insert into inventory.stock_adjustment_item
        (adjustment_id, lot_id, direction, quantity, reason_code, note)
      values
        (v_adjustment_id, v_line.lot_id,
         case when v_diff > 0 then 'in' else 'out' end, abs(v_diff),
         case when v_diff > 0 then 'count_gain' else 'count_loss' end,
         'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY'));
      v_lines := v_lines + 1;
    elsif v_diff > 0 then
      -- sobra sem lote: entra num lote novo, como o ajuste de entrada sem lote
      insert into inventory.stock_adjustment_item
        (adjustment_id, ingredient_id, frozen_preparation_id, direction, quantity, reason_code, note)
      values
        (v_adjustment_id, v_line.ingredient_id, v_line.frozen_preparation_id, 'in', v_diff, 'count_gain',
         'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY'));
      v_lines := v_lines + 1;
    else
      -- Falta sem lote: sai dos lotes do item que a rodada NÃO contou por lote,
      -- o que vence antes primeiro. Saída de ajuste exige lote, e abortar a
      -- aprovação inteira por isso tornava inaprovável toda contagem de monte.
      v_remaining := -v_diff;
      -- Lote em QUARENTENA com saldo e não contado por lote: a falta não pode
      -- sair dele (o lançamento soltaria a quarentena) nem ser jogada nos lotes
      -- sadios (o suspeito ficaria com saldo que não existe). A quarentena já é
      -- separada na prateleira: conte-o por lote.
      select l.lot_code into v_pending
        from inventory.stock_lot l
       where l.kitchen_id = v_count.kitchen_id
         and l.ingredient_id is not distinct from v_line.ingredient_id
         and l.frozen_preparation_id is not distinct from v_line.frozen_preparation_id
         and l.quarantined_at is not null
         and not exists (
           select 1 from inventory.inventory_count_entry e
            where e.count_id = v_line.owner_count_id and e.lot_id = l.id
         )
         and (select coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                       then m.quantity else -m.quantity end), 0)
                from inventory.stock_movement m where m.lot_id = l.id) > 0
       limit 1;
      if found then
        raise exception 'O lote % está em quarentena e não foi contado por lote: conte-o por lote antes de aprovar a falta deste item', v_pending.lot_code;
      end if;
      for v_lot in
        select l.id,
               coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) as balance
          from inventory.stock_lot l
          left join inventory.stock_movement m on m.lot_id = l.id
         where l.kitchen_id = v_count.kitchen_id
           and l.ingredient_id is not distinct from v_line.ingredient_id
           and l.frozen_preparation_id is not distinct from v_line.frozen_preparation_id
           and not exists (
             select 1 from inventory.inventory_count_entry e
              where e.count_id = v_line.owner_count_id and e.lot_id = l.id
           )
           -- lote em quarentena não absorve falta: o lançamento do ajuste
           -- LIBERA a quarentena do lote que toca. Ele tem de ter sido contado
           -- por lote — a checagem logo acima recusa quando não foi.
           and l.quarantined_at is null
         group by l.id, l.expiry_date, l.received_at
        having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) > 0
         -- Compra que entrou DEPOIS do instante da contagem vai para o fim da
         -- fila: não estava na prateleira contada. Excluí-la de vez não serve —
         -- o lote aberto, porcionado ou descongelado depois da contagem também
         -- nasce depois, e o saldo dele ESTAVA na prateleira, dentro do lote de
         -- origem; sem ele a falta "não cabia" e a cadeia não se aprovava.
         order by (l.parent_lot_id is null and l.received_at > coalesce(v_line.counted_at, now())),
                  coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date), l.received_at, l.id
      loop
        exit when v_remaining <= 0;
        v_take := least(v_lot.balance, v_remaining);
        insert into inventory.stock_adjustment_item
          (adjustment_id, lot_id, direction, quantity, reason_code, note)
        values
          (v_adjustment_id, v_lot.id, 'out', v_take, 'count_loss',
           'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY') || ' — falta contada sem lote');
        v_lines := v_lines + 1;
        v_remaining := v_remaining - v_take;
      end loop;
      if v_remaining > 0 then
        raise exception 'A falta de % contada sem lote não cabe nos lotes que não foram contados por lote. Conte este item por lote',
          -v_diff;
      end if;
    end if;
  end loop;

  if v_lines = 0 then
    -- contagem sem diferença nenhuma não gera documento contábil vazio
    delete from inventory.stock_adjustment where id = v_adjustment_id;
    v_adjustment_id := null;
  else
    perform inventory.post_stock_adjustment(v_adjustment_id, p_actor, p_exception_reason);
    select coalesce(sum(posted_value), 0) into v_value
      from inventory.stock_adjustment where id = v_adjustment_id;
  end if;

  -- a rodada aprovada e as anteriores saem juntas: o ajuste é da cadeia
  update inventory.inventory_count
     set status = 'approved',
         approved_by = p_actor,
         approved_at = now(),
         adjustment_id = v_adjustment_id,
         confirmed_by = p_actor,
         confirmed_at = now()
   where id = any (v_chain);
  -- a marca vale para a CADEIA: quem contou numa rodada anterior e aprovou a
  -- última não pode aparecer como aprovação segregada naquela rodada
  update inventory.inventory_count
     set approved_by_own_entry = v_counted_by_actor
   where id = any (v_chain);
  update inventory.inventory_count
     set approval_exception_reason = p_exception_reason
   where id = p_count_id;

  return query select v_adjustment_id, v_lines, v_value;
end;
$$;

create or replace function inventory.open_recount(p_count_id uuid, p_ingredient_ids uuid[], p_frozen_preparation_ids uuid[], p_user uuid)
returns uuid
language plpgsql as $$
declare
  v_count inventory.inventory_count%rowtype;
  v_id uuid;
  v_missing int;
  v_ingredients uuid[] := coalesce(p_ingredient_ids, '{}');
  v_frozen uuid[] := coalesce(p_frozen_preparation_ids, '{}');
begin
  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status <> 'review' then raise exception 'A recontagem sai da revisão da rodada anterior'; end if;
  if coalesce(array_length(v_ingredients, 1), 0) + coalesce(array_length(v_frozen, 1), 0) = 0 then
    raise exception 'Escolha os itens a recontar';
  end if;

  -- só se reconta o que a rodada tinha no escopo
  select count(*) into v_missing
    from (select unnest(v_ingredients) as id) i
   where not exists (select 1 from inventory.count_scope_item s where s.count_id = p_count_id and s.ingredient_id = i.id);
  if v_missing = 0 then
    select count(*) into v_missing
      from (select unnest(v_frozen) as id) f
     where not exists (select 1 from inventory.count_scope_item s where s.count_id = p_count_id and s.frozen_preparation_id = f.id);
  end if;
  if v_missing > 0 then raise exception 'Item fora do escopo da rodada não se reconta'; end if;

  -- Os itens que NÃO vão para a recontagem ficam decididos AQUI: contados ou
  -- aceitos como não contados. Depois, a rodada passa a `recount` e não aceita
  -- mais nada — um não contado sem decisão ficaria para sempre sem zerar, e a
  -- aprovação o pularia calada.
  if exists (
    select 1 from inventory.count_scope_item s
     where s.count_id = p_count_id
       and not s.not_counted_accepted
       -- `coalesce`: em cada linha do escopo uma das duas colunas é NULL, e
       -- `NULL = any(...)` é NULL — sem ele a guarda deixava passar tudo
       and not (coalesce(s.ingredient_id = any (v_ingredients), false) or coalesce(s.frozen_preparation_id = any (v_frozen), false))
       and not exists (
         select 1 from inventory.inventory_count_entry e
           left join inventory.stock_lot l on l.id = e.lot_id
          where e.count_id = p_count_id
            and coalesce(e.ingredient_id, l.ingredient_id) is not distinct from s.ingredient_id
            and coalesce(e.frozen_preparation_id, l.frozen_preparation_id) is not distinct from s.frozen_preparation_id
       )
  ) then
    raise exception 'Há item desta rodada sem lançamento e sem decisão: conte-o, aceite-o como não contado ou inclua-o na recontagem';
  end if;

  -- A rodada anterior passa a `recount` na MESMA transação em que a nova entra.
  -- Ela continua segurando o escopo dos itens que não vão ser recontados; só os
  -- recontados passam para a rodada nova.
  update inventory.inventory_count set status = 'recount' where id = p_count_id;
  update inventory.count_scope_item set open = false
   where count_id = p_count_id
     and (ingredient_id = any (v_ingredients) or frozen_preparation_id = any (v_frozen));

  insert into inventory.inventory_count
    (kitchen_id, status, type, scope, scope_params, blind, round, parent_count_id, created_by)
  values
    (v_count.kitchen_id, 'counting', v_count.type, 'item_list',
     jsonb_build_object('ingredient_ids', to_jsonb(v_ingredients), 'frozen_preparation_ids', to_jsonb(v_frozen)),
     true, v_count.round + 1, p_count_id, p_user)
  returning id into v_id;

  insert into inventory.count_scope_item (count_id, kitchen_id, ingredient_id)
    select v_id, v_count.kitchen_id, i.id from (select distinct unnest(v_ingredients) as id) i;
  insert into inventory.count_scope_item (count_id, kitchen_id, frozen_preparation_id)
    select v_id, v_count.kitchen_id, f.id from (select distinct unnest(v_frozen) as id) f;

  return v_id;
end;
$$;
