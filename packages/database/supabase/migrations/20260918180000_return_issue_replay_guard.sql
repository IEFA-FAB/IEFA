-- ============================================================================
-- Devolução de saída: idempotente, como a emissão já era
-- ============================================================================
--
-- `inventory.issue_stock` reconhece o retry da mesma emissão e devolve o que
-- já foi feito, sem sacar do estoque duas vezes. `inventory.return_issue`
-- nasceu sem essa guarda, e a devolução é o mesmo dinheiro indo para o outro
-- lado — repor duas vezes infla o saldo tanto quanto sacar duas vezes o
-- esvazia.
--
-- Duas frestas:
--
--  1. sem guarda de replay, o retry de rede batia no índice único
--     `stock_movement_emission_key` e voltava como violação de constraint. O
--     almoxarife lê "erro", conclui que não passou e lança de novo — agora com
--     outro `emission_id`, que nada impede. O erro técnico virava reposição
--     dobrada;
--  2. o índice é PARCIAL (`where emission_id is not null`). Devolução sem
--     identificador não é coberta por nada. `issue_stock` já exigia o
--     identificador; a devolução aceitava nulo.
--
-- Nada mais muda: a trava da requisição, a recusa de dia fechado, a conferência
-- de posse do lote e o teto pelo emitido líquido seguem iguais.
-- ============================================================================

CREATE OR REPLACE FUNCTION inventory.return_issue(p_request_id uuid, p_lot_id uuid, p_quantity numeric, p_user uuid, p_emission_id text)
 RETURNS TABLE(return_movement_id uuid, return_unit_cost numeric)
 LANGUAGE plpgsql
AS $function$
declare
  v_request inventory.stock_issue_request%rowtype;
  v_lot inventory.stock_lot%rowtype;
  v_issued numeric(14,4);
  v_returned numeric(14,4);
  v_cost numeric(12,4);
  v_id uuid;
begin
  perform set_config('inventory.via_rpc', 'on', true);

  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantidade deve ser positiva'; end if;
  -- Sem identificador não há como reconhecer o retry, e o índice único de
  -- emissão é PARCIAL (`where emission_id is not null`): devolução sem ele não
  -- é coberta por nada e pode repetir à vontade. `issue_stock` já exigia; a
  -- devolução ficou de fora, e é o mesmo dinheiro indo para o outro lado.
  if p_emission_id is null or length(p_emission_id) < 8 then raise exception 'Devolução sem identificador de emissão'; end if;

  -- Retry da MESMA devolução devolve o que já foi feito, sem repor de novo.
  -- Sem esta guarda o retry batia no índice único e voltava como violação de
  -- constraint: o almoxarife lia "erro", concluía que a devolução não passou e
  -- lançava outra — aí sim repondo duas vezes, agora com dois identificadores
  -- diferentes e nada para impedir. Espelha a guarda de `issue_stock`.
  select id, unit_cost into v_id, v_cost
    from inventory.stock_movement
    where emission_id = p_emission_id and type = 'issue_return'
    limit 1;
  if found then
    return query select v_id, v_cost;
    return;
  end if;

  select * into v_request from inventory.stock_issue_request where id = p_request_id for update;
  if not found then raise exception 'Requisição não encontrada'; end if;
  -- dia fechado é dia fechado: a variância foi medida e justificada contra o
  -- emitido líquido daquele momento, e devolver depois a reescreveria
  if v_request.status <> 'open' then raise exception 'Requisição já fechada — a devolução tem de ser lançada antes do fechamento do dia'; end if;

  select * into v_lot from inventory.stock_lot where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.kitchen_id <> v_request.kitchen_id then raise exception 'Lote de outra cozinha'; end if;

  -- só se devolve o que saiu POR ESTA requisição, e só deste lote
  select coalesce(sum(quantity), 0), coalesce(sum(quantity * unit_cost) / nullif(sum(quantity), 0), 0)
    into v_issued, v_cost
    from inventory.stock_movement
    where issue_request_id = p_request_id and lot_id = p_lot_id and type = 'production_issue';

  select coalesce(sum(quantity), 0) into v_returned
    from inventory.stock_movement
    where issue_request_id = p_request_id and lot_id = p_lot_id and type = 'issue_return';

  if v_issued - v_returned < p_quantity then
    raise exception 'Devolução maior que o emitido deste lote nesta requisição (% disponível)', v_issued - v_returned;
  end if;

  insert into inventory.stock_movement
    (kitchen_id, ingredient_id, frozen_preparation_id, lot_id, type, quantity, unit_cost,
     justification, issue_request_id, emission_id, created_by)
  values
    (v_request.kitchen_id, v_lot.ingredient_id, v_lot.frozen_preparation_id, p_lot_id, 'issue_return', p_quantity, v_cost,
     'Devolução de saída não utilizada', p_request_id, p_emission_id, p_user)
  returning id into v_id;

  return query select v_id, v_cost;
end;
$function$;


