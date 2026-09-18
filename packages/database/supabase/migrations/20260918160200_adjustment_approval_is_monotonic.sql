-- ============================================================================
-- Ajuste: a exigência de aprovação é monotônica, e reavaliada sob trava
-- ============================================================================
--
-- A 20260918160100 trocou "recalcular a regra" por "ler o fato gravado", e
-- abriu a porta oposta: o fato é calculado na CRIAÇÃO, antes de qualquer
-- lançamento, então dois ajustes do mesmo autor criados quase juntos eram
-- ambos marcados "sem aprovação" e ambos passavam — R$ 1.200 autoaprovados
-- contra um limite de R$ 1.000.
--
-- O conserto não é voltar a recalcular: é exigir as duas coisas. Fato gravado
-- OU regra reavaliada no lançamento, com os lançamentos do mesmo autor na mesma
-- cozinha serializados por trava consultiva, para que a regra de janela de 24 h
-- enxergue o lançamento concorrente.
-- ============================================================================

create or replace function inventory.post_stock_adjustment(
  p_adjustment_id uuid,
  p_actor uuid,
  p_approval_exception_reason text default null
) returns table (movements int, value numeric)
language plpgsql as $$
declare
  v_doc inventory.stock_adjustment%rowtype;
  v_settings inventory.kitchen_stock_settings;
  v_item record;
  v_lot inventory.stock_lot%rowtype;
  v_balance numeric(14,4);
  v_movement_id uuid;
  v_count int := 0;
  v_requires boolean;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_doc from inventory.stock_adjustment where id = p_adjustment_id for update;
  if not found then raise exception 'Ajuste não encontrado'; end if;
  if v_doc.status = 'posted' then raise exception 'Ajuste já lançado'; end if;
  if v_doc.status = 'rejected' then raise exception 'Ajuste rejeitado não pode ser lançado'; end if;
  if not exists (select 1 from inventory.stock_adjustment_item where adjustment_id = p_adjustment_id) then
    raise exception 'Ajuste sem itens';
  end if;

  v_settings := inventory.kitchen_settings(v_doc.kitchen_id);
  -- A exigência de aprovação é MONOTÔNICA: uma vez exigida, sempre exigida.
  --
  --   exige := fato gravado na criação  OR  regra reavaliada agora, sob trava
  --
  -- Nenhuma das duas metades basta sozinha, e este change já escorregou nas
  -- duas. Só a regra viva (versão anterior à 20260918160100) deixava o autor
  -- esperar 24 h, ou subir a alçada, e aprovar sozinho. Só o fato (a
  -- 20260918160100) deixava dois ajustes de R$ 600 do mesmo autor, criados quase
  -- juntos contra um limite de R$ 1.000, serem marcados "sem aprovação" antes de
  -- qualquer um lançar — e os dois passavam.
  --
  -- A trava consultiva serializa os lançamentos do MESMO autor na MESMA cozinha:
  -- a regra soma o que já foi LANÇADO nas últimas 24 h, e sem a trava dois
  -- lançamentos simultâneos não se enxergariam. Com ela, o segundo espera o
  -- primeiro terminar e o encontra na janela.
  perform pg_advisory_xact_lock(
    hashtextextended('adjustment_threshold:' || v_doc.kitchen_id || ':' || coalesce(v_doc.created_by::text, '-'), 42)
  );
  v_requires := coalesce(v_doc.approval_required, false) or inventory.adjustment_requires_approval(p_adjustment_id);

  if v_requires and v_doc.created_by is not distinct from p_actor then
    if v_settings.segregation = 'strict' then
      -- Em `strict` não há caminho de exceção: o ajuste espera a segunda pessoa.
      --
      -- A mensagem muda quando o documento veio de uma CONTAGEM, e não é
      -- detalhe: `confirm_inventory_count` cria o ajuste derivado com
      -- `created_by` = quem abriu a contagem e o lança aqui. Quem contou e
      -- tenta confirmar sozinho uma divergência acima da alçada é exatamente o
      -- que o `strict` recusa — mas a mensagem genérica falava de "o ajuste",
      -- um documento que o operador nunca criou e não encontra em tela
      -- nenhuma. O caminho existe e a mensagem passa a dizer qual é: outro
      -- nível 3 confirma a contagem.
      if v_doc.inventory_count_id is not null then
        raise exception 'Segregação estrita nesta cozinha: a contagem tem divergência acima da alçada e quem a registrou não pode confirmá-la. Peça a confirmação a outro nível 3 de estoque';
      end if;
      raise exception 'Segregação estrita nesta cozinha: quem lançou o ajuste não pode aprová-lo, nem com exceção registrada';
    end if;
    if p_approval_exception_reason is null then
      if v_doc.inventory_count_id is not null then
        raise exception 'Contagem com divergência acima da alçada precisa ser confirmada por alguém diferente de quem a registrou';
      end if;
      raise exception 'Ajuste acima da alçada (ou de motivo que sempre exige aprovação) precisa de aprovador diferente do autor';
    end if;
  end if;

  for v_item in
    select * from inventory.stock_adjustment_item where adjustment_id = p_adjustment_id order by id
  loop
    if v_item.lot_id is not null then
      select * into v_lot from inventory.stock_lot where id = v_item.lot_id for update;
      if not found then raise exception 'Lote % não encontrado', v_item.lot_id; end if;
      if v_lot.kitchen_id <> v_doc.kitchen_id then
        raise exception 'Lote % não pertence à cozinha do ajuste', v_item.lot_id;
      end if;
    else
      if v_item.direction = 'out' then raise exception 'Saída de ajuste exige lote'; end if;
      insert into inventory.stock_lot (kitchen_id, ingredient_id, frozen_preparation_id, lot_code, unit_cost)
        values (v_doc.kitchen_id, v_item.ingredient_id, v_item.frozen_preparation_id,
                'SEM-LOTE-' || to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
                v_item.unit_cost)
        returning * into v_lot;
      update inventory.stock_adjustment_item set lot_id = v_lot.id where id = v_item.id;
    end if;

    if v_item.direction = 'out' then
      select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
                               then quantity else -quantity end), 0)
        into v_balance
        from inventory.stock_movement where lot_id = v_lot.id;
      if v_balance < v_item.quantity then
        raise exception 'Saldo insuficiente no lote % (% disponível)', v_lot.lot_code, v_balance;
      end if;
    end if;

    insert into inventory.stock_movement
      (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost,
       reason_code, justification, inventory_count_id, created_by)
    values
      (v_doc.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, v_lot.id,
       case when v_item.direction = 'in' then 'adjustment_in' else 'adjustment_out' end,
       v_item.quantity, v_item.unit_cost, v_item.reason_code,
       coalesce(v_item.note, 'Ajuste ' || v_item.reason_code), v_doc.inventory_count_id, p_actor)
    returning id into v_movement_id;

    update inventory.stock_adjustment_item set movement_id = v_movement_id where id = v_item.id;
    v_count := v_count + 1;

    if v_lot.quarantined_at is not null then
      update inventory.stock_lot
        set quarantined_at = null, quarantined_by = null, quarantine_reason = null
        where id = v_lot.id;
    end if;
  end loop;

  update inventory.stock_adjustment
    set status = 'posted',
        decided_by = p_actor,
        decided_at = now(),
        approval_exception_reason = coalesce(p_approval_exception_reason, approval_exception_reason),
        posted_value = inventory.adjustment_value(p_adjustment_id)
    where id = p_adjustment_id;

  return query select v_count, inventory.adjustment_value(p_adjustment_id);
end;
$$;
