-- ============================================================================
-- Inventário: a revisão inteira do PR (dez defeitos) — referência única,
-- rodadas, autor do ajuste, escopo do lançamento e transições sob trava
-- ============================================================================
--
-- O que mudou, e por quê:
--
--  1. **Aprovar contagem com divergência acima da alçada era impossível.** O
--     ajuste derivado nascia com `created_by = quem aprova`, e o
--     `post_stock_adjustment` via aí um autor aprovando o próprio ajuste: em
--     `strict` recusava sempre, em `dual` exigia exceção sempre. O autor do
--     ajuste é quem ABRIU a contagem — é dela que o documento sai; quem aprova
--     é o aprovador, e a segregação entre os dois já é conferida aqui.
--
--  2. **A referência de cada linha mora num lugar só: `count_lines`.** A folha
--     (TypeScript) e a aprovação (SQL) calculavam a linha sem lote de jeitos
--     diferentes — a tela mostrava diferença zero para "L1 com 10 + 5 KG
--     soltos" e a aprovação lançava 10 KG de perda. Agora as duas leem a mesma
--     função. A linha sem lote responde pelo saldo do ITEM menos o dos lotes
--     contados à parte na mesma rodada; e a falta nela é distribuída pelos
--     lotes que ninguém contou, em ordem FEFO, em vez de abortar a aprovação
--     com "saída de ajuste exige lote".
--
--  3. **Rodadas de recontagem.** A aprovação lia só os lançamentos da rodada
--     aprovada: as linhas não divergentes da rodada anterior nunca eram
--     lançadas. Agora cada item pertence à rodada MAIS RECENTE que o tem no
--     escopo, e a aprovação lança o conjunto inteiro, uma vez, marcando todas as
--     rodadas como aprovadas. A segregação olha a cadeia inteira: em `strict`,
--     quem contou na rodada 1 também não aprova a rodada 2.
--
--  4. **`not_counted_accepted` agora vale**: o item aceito como não contado vira
--     linha contada ZERO, e o saldo dele sai dos lotes.
--
--  5. **Lançamento só entra no escopo e na cozinha da contagem**, e com instante
--     entre a abertura e agora. Sem isso, lançar na contagem A um item que está
--     na contagem aberta B furava o índice de sobreposição (o item era ajustado
--     duas vezes), e lote de outra cozinha fazia a aprovação falhar.
--
--  6. **Transições de status sob trava**: aprovar só sai de `review` (coleta
--     encerrada), e o gatilho do lançamento trava a contagem `for share` — o
--     lançamento que chega durante a aprovação espera e é recusado, em vez de
--     cair numa contagem já aprovada, fora do ajuste. Rejeitar, abrir a
--     recontagem e incluir achado viram funções que travam e conferem o status
--     antes de mudar: por id, sem trava, uma rejeição podia desfazer uma
--     aprovação com o ajuste já lançado, e uma recontagem podia fazer a mesma
--     contagem ser aprovada duas vezes.
--
--  7. A pré-condição de produção usa a data CIVIL de Brasília da abertura.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Lançamento: status, escopo, cozinha e instante — sob trava da contagem
-- ----------------------------------------------------------------------------
create or replace function inventory.count_entry_requires_counting() returns trigger
language plpgsql as $$
declare
  v_count inventory.inventory_count%rowtype;
  v_lot inventory.stock_lot%rowtype;
  v_ingredient uuid;
  v_frozen uuid;
begin
  -- `for share`: a aprovação trava a contagem `for update`; o lançamento que
  -- chega durante ela espera e encontra o status novo
  select * into v_count from inventory.inventory_count where id = coalesce(new.count_id, old.count_id) for share;
  if not found then
    -- CASCADE apagando a contagem
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'Contagem não encontrada';
  end if;
  if v_count.status not in ('draft', 'counting') then
    raise exception 'Contagem em "%" não aceita lançamento', v_count.status;
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if new.lot_id is not null then
    select * into v_lot from inventory.stock_lot where id = new.lot_id;
    if not found then raise exception 'Lote não encontrado'; end if;
    if v_lot.kitchen_id <> v_count.kitchen_id then
      raise exception 'O lote é de outra cozinha';
    end if;
    v_ingredient := v_lot.ingredient_id;
    v_frozen := v_lot.frozen_preparation_id;
  else
    v_ingredient := new.ingredient_id;
    v_frozen := new.frozen_preparation_id;
  end if;

  if not exists (
    select 1 from inventory.count_scope_item s
     where s.count_id = new.count_id
       and s.ingredient_id is not distinct from v_ingredient
       and s.frozen_preparation_id is not distinct from v_frozen
  ) then
    raise exception 'O item não está no escopo desta contagem — inclua-o como achado antes de contar';
  end if;

  -- o instante vale para a diferença: não pode ser antes da abertura (a
  -- contagem ainda não existia) nem no futuro
  if new.counted_at < v_count.created_at or new.counted_at > now() + interval '1 minute' then
    raise exception 'Instante do lançamento fora da contagem (% não está entre a abertura e agora)', new.counted_at;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- (2) Aceitar item não contado só com a contagem aberta, sob trava
-- ----------------------------------------------------------------------------
create or replace function inventory.count_scope_acceptance_requires_open() returns trigger
language plpgsql as $$
declare
  v_status text;
begin
  select status into v_status from inventory.inventory_count where id = new.count_id for share;
  if v_status not in ('draft', 'counting', 'review') then
    raise exception 'Contagem em "%" não aceita mais marcação de item', v_status;
  end if;
  return new;
end;
$$;

create trigger count_scope_acceptance_requires_open
  before update of not_counted_accepted on inventory.count_scope_item
  for each row
  when (new.not_counted_accepted is distinct from old.not_counted_accepted)
  execute function inventory.count_scope_acceptance_requires_open();

-- ----------------------------------------------------------------------------
-- (3) A referência de cada linha — a folha e a aprovação leem daqui
-- ----------------------------------------------------------------------------
create function inventory.count_lines(p_count_id uuid)
returns table (
  lot_id uuid,
  ingredient_id uuid,
  frozen_preparation_id uuid,
  -- a rodada dona do item (a mais recente cujo escopo o tem)
  owner_count_id uuid,
  -- nulo = ninguém contou; zero = contado zero ou aceito como não contado
  counted_qty numeric,
  entries int,
  counted_at timestamptz,
  ledger_qty numeric,
  accepted_not_counted boolean
)
language sql stable as $$
  with recursive chain as (
    select c.id, c.parent_count_id, c.round, c.kitchen_id
      from inventory.inventory_count c where c.id = p_count_id
    union all
    select c.id, c.parent_count_id, c.round, c.kitchen_id
      from inventory.inventory_count c join chain ch on c.id = ch.parent_count_id
  ),
  k as (select kitchen_id from chain where id = p_count_id),
  owner as (
    select distinct on (coalesce(s.ingredient_id, s.frozen_preparation_id))
           coalesce(s.ingredient_id, s.frozen_preparation_id) as item_key,
           s.ingredient_id, s.frozen_preparation_id, s.count_id, s.not_counted_accepted
      from inventory.count_scope_item s
      join chain ch on ch.id = s.count_id
     order by coalesce(s.ingredient_id, s.frozen_preparation_id), ch.round desc
  ),
  entry as (
    select e.count_id, e.lot_id, e.quantity, e.counted_at, e.overwrite,
           coalesce(e.ingredient_id, l.ingredient_id) as ing,
           coalesce(e.frozen_preparation_id, l.frozen_preparation_id) as fro
      from inventory.inventory_count_entry e
      left join inventory.stock_lot l on l.id = e.lot_id
      join owner o
        on o.count_id = e.count_id
       and o.item_key = coalesce(e.ingredient_id, l.ingredient_id, e.frozen_preparation_id, l.frozen_preparation_id)
  ),
  line as (
    -- a sobrescrita anula os lançamentos ANTERIORES a ela na mesma linha
    select e.count_id, e.lot_id, e.ing, e.fro,
           count(*)::int as entries,
           max(e.counted_at) as counted_at,
           sum(e.quantity) filter (
             where e.counted_at >= coalesce(
               (select max(o2.counted_at) from entry o2
                 where o2.overwrite and o2.count_id = e.count_id
                   and o2.lot_id is not distinct from e.lot_id
                   and o2.ing is not distinct from e.ing
                   and o2.fro is not distinct from e.fro),
               '-infinity'::timestamptz)
           ) as counted_qty
      from entry e
     group by e.count_id, e.lot_id, e.ing, e.fro
  )
  select l.lot_id, l.ing, l.fro, l.count_id, l.counted_qty, l.entries, l.counted_at,
         case
           when l.lot_id is not null then
             inventory.balance_at(k.kitchen_id, l.lot_id, null, null, l.counted_at)
           else
             -- sem lote: o saldo do ITEM menos o dos lotes contados à parte na
             -- mesma rodada, todos no instante desta linha
             inventory.balance_at(k.kitchen_id, null, l.ing, l.fro, l.counted_at)
             - coalesce((
                 select sum(inventory.balance_at(k.kitchen_id, x.lot_id, null, null, l.counted_at))
                   from line x
                  where x.lot_id is not null and x.count_id = l.count_id
                    and x.ing is not distinct from l.ing and x.fro is not distinct from l.fro
               ), 0)
         end,
         false
    from line l cross join k
  union all
  -- item do escopo sem lançamento nenhum na rodada dona dele
  select null::uuid, o.ingredient_id, o.frozen_preparation_id, o.count_id,
         case when o.not_counted_accepted then 0::numeric end,
         0, null::timestamptz,
         inventory.balance_at(k.kitchen_id, null, o.ingredient_id, o.frozen_preparation_id, now()),
         o.not_counted_accepted
    from owner o cross join k
   where not exists (
     select 1 from line x
      where x.count_id = o.count_id
        and x.ing is not distinct from o.ingredient_id
        and x.fro is not distinct from o.frozen_preparation_id
   );
$$;

comment on function inventory.count_lines is
  'Linhas da contagem com a referência do ledger no instante de cada uma. É a ÚNICA definição: a folha e a aprovação leem daqui. Sem lote = saldo do item menos o dos lotes contados à parte; cada item pertence à rodada mais recente que o tem no escopo.';

revoke all on function inventory.count_lines(uuid) from anon, authenticated;

-- ----------------------------------------------------------------------------
-- (4) Aprovação
-- ----------------------------------------------------------------------------
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
         group by l.id, l.expiry_date, l.received_at
        having coalesce(sum(case when m.type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                                 then m.quantity else -m.quantity end), 0) > 0
         order by coalesce(l.expiry_date, (l.received_at at time zone 'America/Sao_Paulo')::date), l.received_at, l.id
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
  update inventory.inventory_count
     set approval_exception_reason = p_exception_reason,
         approved_by_own_entry = v_counted_by_actor
   where id = p_count_id;

  return query select v_adjustment_id, v_lines, v_value;
end;
$$;

-- ----------------------------------------------------------------------------
-- (5) Rejeitar, recontar e incluir achado: sob trava, conferindo o status
-- ----------------------------------------------------------------------------
create function inventory.reject_inventory_count(p_count_id uuid, p_actor uuid, p_reason text)
returns void
language plpgsql as $$
declare
  v_count inventory.inventory_count%rowtype;
  v_chain uuid[];
begin
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'Rejeitar exige motivo'; end if;
  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status not in ('draft', 'counting', 'review') then
    raise exception 'Contagem em "%" não pode ser rejeitada', v_count.status;
  end if;
  with recursive chain as (
    select c.id, c.parent_count_id from inventory.inventory_count c where c.id = p_count_id
    union all
    select c.id, c.parent_count_id from inventory.inventory_count c join chain ch on c.id = ch.parent_count_id
  )
  select array_agg(id) into v_chain from chain;

  -- rejeitar a rodada rejeita o inventário: as anteriores estavam esperando por ela
  update inventory.inventory_count
     set status = 'rejected',
         notes = case when notes is null then 'Rejeitada: ' || trim(p_reason)
                      else notes || E'\n\nRejeitada: ' || trim(p_reason) end,
         confirmed_by = p_actor,
         confirmed_at = now()
   where id = any (v_chain) and status in ('draft', 'counting', 'review', 'recount');
end;
$$;

create function inventory.open_recount(p_count_id uuid, p_ingredient_ids uuid[], p_user uuid)
returns uuid
language plpgsql as $$
declare
  v_count inventory.inventory_count%rowtype;
  v_id uuid;
  v_missing int;
begin
  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status <> 'review' then raise exception 'A recontagem sai da revisão da rodada anterior'; end if;
  if coalesce(array_length(p_ingredient_ids, 1), 0) = 0 then raise exception 'Escolha os itens a recontar'; end if;

  -- só se reconta o que a rodada tinha no escopo
  select count(*) into v_missing
    from unnest(p_ingredient_ids) i(id)
   where not exists (select 1 from inventory.count_scope_item s where s.count_id = p_count_id and s.ingredient_id = i.id);
  if v_missing > 0 then raise exception 'Item fora do escopo da rodada não se reconta'; end if;

  -- A rodada anterior passa a `recount` na MESMA transação em que a nova entra:
  -- falhando no meio, nada muda. Ela continua segurando o escopo — os itens
  -- que NÃO vão ser recontados ainda esperam a aprovação da cadeia, e liberar
  -- tudo deixaria outra contagem pegá-los e ajustá-los de novo. Só os itens
  -- recontados passam para a rodada nova.
  update inventory.inventory_count set status = 'recount' where id = p_count_id;
  update inventory.count_scope_item set open = false
   where count_id = p_count_id and ingredient_id = any (p_ingredient_ids);

  insert into inventory.inventory_count
    (kitchen_id, status, type, scope, scope_params, blind, round, parent_count_id, created_by)
  values
    (v_count.kitchen_id, 'counting', v_count.type, 'item_list',
     jsonb_build_object('ingredient_ids', to_jsonb(p_ingredient_ids)),
     -- recontagem é SEMPRE cega: quem reconta sabendo o que a anterior deu
     -- confirma o número dela em vez de contar de novo
     true, v_count.round + 1, p_count_id, p_user)
  returning id into v_id;

  insert into inventory.count_scope_item (count_id, kitchen_id, ingredient_id)
    select v_id, v_count.kitchen_id, i.id from (select distinct unnest(p_ingredient_ids) as id) i;

  return v_id;
end;
$$;

create function inventory.add_found_item(p_count_id uuid, p_ingredient_id uuid, p_frozen_preparation_id uuid)
returns boolean
language plpgsql as $$
declare
  v_count inventory.inventory_count%rowtype;
begin
  if (p_ingredient_id is null) = (p_frozen_preparation_id is null) then
    raise exception 'Informe o insumo OU a preparação';
  end if;
  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status not in ('draft', 'counting') then
    raise exception 'Contagem em "%" não aceita achado', v_count.status;
  end if;

  if exists (
    select 1 from inventory.count_scope_item s
     where s.count_id = p_count_id
       and s.ingredient_id is not distinct from p_ingredient_id
       and s.frozen_preparation_id is not distinct from p_frozen_preparation_id
  ) then
    return false;
  end if;

  begin
    insert into inventory.count_scope_item (count_id, kitchen_id, ingredient_id, frozen_preparation_id, found)
      values (p_count_id, v_count.kitchen_id, p_ingredient_id, p_frozen_preparation_id, true);
  exception when unique_violation then
    -- é o índice de sobreposição: o item está em OUTRA contagem aberta
    raise exception 'Este item está em outra contagem aberta nesta cozinha — conte-o lá';
  end;
  return true;
end;
$$;

revoke all on function inventory.reject_inventory_count(uuid, uuid, text) from anon, authenticated;
revoke all on function inventory.open_recount(uuid, uuid[], uuid) from anon, authenticated;
revoke all on function inventory.add_found_item(uuid, uuid, uuid) from anon, authenticated;
