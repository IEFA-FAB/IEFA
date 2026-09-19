-- ============================================================================
-- Saída do dia: recalcular a sugestão na MESMA ordem de trava do fechamento
-- ============================================================================
-- "Recalcular sugestão" gravava as linhas num upsert de várias linhas e depois
-- zerava as que saíram do plano, em dois comandos. No upsert, cada linha passa
-- pelo gatilho `issue_item_requires_open_request`, que pede `for share` na
-- requisição: depois da primeira linha o comando já segura a requisição e
-- trava a linha seguinte — ordem requisição → linha. O fechamento
-- (`close_issue_request`, 20260918220000) trava linhas → requisição. Os dois ao
-- mesmo tempo terminavam em "deadlock detected". Não corrompia nada (o retrato
-- recusaria o fechamento de todo jeito), mas a afirmação "mesma ordem em todo
-- lugar" só valia para quem escreve uma linha.
--
-- Agora o recálculo é uma função: trava as linhas existentes (por id), depois a
-- requisição, e grava as duas coisas — o upsert e o zerar — na mesma transação.
-- Com o dia fechado ela não grava nada: a sugestão já está congelada.
-- ============================================================================

create function inventory.refresh_issue_suggestion(p_request_id uuid, p_lines jsonb)
returns int
language plpgsql as $$
declare
  v_status text;
begin
  perform 1 from inventory.stock_issue_request_item where request_id = p_request_id order by id for update;
  select status into v_status from inventory.stock_issue_request where id = p_request_id for update;
  if not found then raise exception 'Requisição não encontrada'; end if;
  if v_status <> 'open' then return 0; end if;

  insert into inventory.stock_issue_request_item (request_id, ingredient_id, meal_type_id, suggested_qty)
    select p_request_id,
           (l->>'ingredient_id')::uuid,
           nullif(l->>'meal_type_id', '')::uuid,
           (l->>'suggested_qty')::numeric
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
  on conflict (request_id, ingredient_id)
    do update set meal_type_id = excluded.meal_type_id, suggested_qty = excluded.suggested_qty;

  -- insumo que saiu do plano fica com sugestão ZERO (e não é apagado: o motivo
  -- já registrado na linha segue sendo o registro do que aconteceu)
  update inventory.stock_issue_request_item i
     set suggested_qty = 0
   where i.request_id = p_request_id
     and i.suggested_qty is distinct from 0
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) l
        where (l->>'ingredient_id')::uuid = i.ingredient_id
     );

  return jsonb_array_length(coalesce(p_lines, '[]'::jsonb));
end;
$$;

revoke all on function inventory.refresh_issue_suggestion(uuid, jsonb) from anon, authenticated;
