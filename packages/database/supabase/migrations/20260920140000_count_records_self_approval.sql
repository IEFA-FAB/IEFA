-- ============================================================================
-- Inventário: o afrouxamento do `dual` deixa de ser silencioso
-- ============================================================================
--
-- Em `dual`, quem aprova a contagem só não pode ser quem a ABRIU. Quem lançou
-- pode aprovar, e isso é deliberado: contar é trabalho de braço, e numa cozinha
-- de três pessoas todo mundo conta — desqualificar todo autor de lançamento
-- deixaria `dual` sem ninguém elegível e transformaria a exceção, que devia ser
-- rara, na regra.
--
-- O problema não era o afrouxamento: era ele não deixar RASTRO. No fluxo do
-- ajuste, o nível 3 que aprova o próprio documento grava a exceção com motivo.
-- Na contagem, o lançador aprovar o próprio lançamento era indistinguível de
-- uma aprovação com segregação de verdade — e daqui a um ano, numa auditoria,
-- ninguém conseguiria separar "duas pessoas participaram" de "a mesma pessoa
-- contou e abençoou".
--
-- É reconstruível hoje, cruzando `approved_by` com os `counted_by` dos
-- lançamentos. Mas reconstrução implícita é o tipo de coisa que some no
-- refactor seguinte, e o número já foi para o ledger. Fica gravado.
-- ============================================================================

alter table inventory.inventory_count
  add column approved_by_own_entry boolean not null default false;

comment on column inventory.inventory_count.approved_by_own_entry is
  'Verdadeiro quando quem aprovou também lançou contagem — permitido em `dual`, nunca em `strict`. Existe para o relatório de inventário conseguir separar aprovação COM segregação de aprovação sem.';

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
  v_adjustment_id uuid;
  v_lines int := 0;
  v_value numeric(14,4) := 0;
  v_counted_by_actor boolean;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_count from inventory.inventory_count where id = p_count_id for update;
  if not found then raise exception 'Contagem não encontrada'; end if;
  if v_count.status not in ('counting', 'review', 'recount') then
    raise exception 'Contagem em "%" não está aguardando aprovação', v_count.status;
  end if;

  -- ── pré-condição: baixa de produção ainda não lançada ──────────────────────
  select t.id, t.production_date into v_pending
    from kitchen.production_task t
   where t.kitchen_id = v_count.kitchen_id
     and t.status = 'DONE'
     and t.production_date >= v_count.created_at::date - 1
     and not exists (
       select 1 from inventory.stock_issue_request r
        where r.kitchen_id = t.kitchen_id
          and r.issue_date = coalesce(t.issue_date, t.production_date)
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

  -- ── segregação ────────────────────────────────────────────────────────────
  v_settings := inventory.kitchen_settings(v_count.kitchen_id);
  select exists (
    select 1 from inventory.inventory_count_entry e where e.count_id = p_count_id and e.counted_by = p_actor
  ) into v_counted_by_actor;

  if v_settings.segregation = 'strict' then
    if v_counted_by_actor or v_count.created_by is not distinct from p_actor then
      raise exception 'Segregação estrita nesta cozinha: quem abriu a contagem ou lançou nela não pode aprová-la. Peça a aprovação a outro nível 3 de estoque';
    end if;
  elsif v_count.created_by is not distinct from p_actor and p_exception_reason is null then
    raise exception 'Quem abriu a contagem não a aprova: a aprovação precisa de outra pessoa, ou de uma exceção registrada';
  end if;

  -- ── o ajuste derivado ─────────────────────────────────────────────────────
  insert into inventory.stock_adjustment (kitchen_id, inventory_count_id, notes, created_by, submitted_at)
    values (v_count.kitchen_id, p_count_id,
            'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY') || ' (' || v_count.type || ')',
            p_actor, now())
    returning id into v_adjustment_id;

  for v_line in
    with lancado as (
      select e.lot_id,
             coalesce(e.ingredient_id, l.ingredient_id) as ingredient_id,
             coalesce(e.frozen_preparation_id, l.frozen_preparation_id) as frozen_preparation_id,
             max(e.counted_at) as counted_at,
             sum(e.quantity) filter (
               where e.counted_at >= coalesce(
                 (select max(o.counted_at) from inventory.inventory_count_entry o
                   where o.count_id = e.count_id and o.overwrite
                     and o.lot_id is not distinct from e.lot_id
                     and o.ingredient_id is not distinct from e.ingredient_id
                     and o.frozen_preparation_id is not distinct from e.frozen_preparation_id),
                 '-infinity'::timestamptz)
             ) as counted_qty
        from inventory.inventory_count_entry e
        left join inventory.stock_lot l on l.id = e.lot_id
       where e.count_id = p_count_id
       group by e.count_id, e.lot_id, coalesce(e.ingredient_id, l.ingredient_id), coalesce(e.frozen_preparation_id, l.frozen_preparation_id)
    )
    select c.lot_id, c.ingredient_id, c.frozen_preparation_id, c.counted_qty,
           inventory.balance_at(v_count.kitchen_id, c.lot_id, c.ingredient_id, c.frozen_preparation_id, c.counted_at) as ledger_qty
      from lancado c
     where c.counted_qty is not null
  loop
    continue when v_line.counted_qty = v_line.ledger_qty;

    insert into inventory.stock_adjustment_item
      (adjustment_id, lot_id, ingredient_id, frozen_preparation_id, direction, quantity, reason_code, note)
    values
      (v_adjustment_id, v_line.lot_id,
       case when v_line.lot_id is null then v_line.ingredient_id end,
       case when v_line.lot_id is null then v_line.frozen_preparation_id end,
       case when v_line.counted_qty > v_line.ledger_qty then 'in' else 'out' end,
       abs(v_line.counted_qty - v_line.ledger_qty),
       case when v_line.counted_qty > v_line.ledger_qty then 'count_gain' else 'count_loss' end,
       'Inventário ' || to_char(v_count.competencia, 'DD/MM/YYYY'));
    v_lines := v_lines + 1;
  end loop;

  if v_lines = 0 then
    delete from inventory.stock_adjustment where id = v_adjustment_id;
    v_adjustment_id := null;
  else
    perform inventory.post_stock_adjustment(v_adjustment_id, p_actor, p_exception_reason);
    select coalesce(sum(posted_value), 0) into v_value
      from inventory.stock_adjustment where id = v_adjustment_id;
  end if;

  update inventory.inventory_count
     set status = 'approved',
         approved_by = p_actor,
         approved_at = now(),
         approval_exception_reason = p_exception_reason,
         -- o rastro: a aprovação sem segregação de verdade fica identificável
         approved_by_own_entry = v_counted_by_actor,
         adjustment_id = v_adjustment_id,
         confirmed_by = p_actor,
         confirmed_at = now()
   where id = p_count_id;

  return query select v_adjustment_id, v_lines, v_value;
end;
$$;

revoke all on function inventory.approve_inventory_count(uuid, uuid, text) from anon, authenticated;
