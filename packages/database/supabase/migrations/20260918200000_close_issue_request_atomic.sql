-- ============================================================================
-- Fechar o dia deixa de ser três idas ao banco sem trava
-- ============================================================================
--
-- O fechamento lia o status, montava o retrato da variância e gravava
-- `closed` em três viagens separadas. Entre a segunda e a terceira cabe uma
-- emissão inteira: o almoxarife retira mais 30 KG de um insumo enquanto o
-- gestor confirma o fechamento, a linha passa da tolerância e o dia fecha
-- assim mesmo, com a justificativa que aquela emissão exigiria nunca pedida.
--
-- A janela some por concorrência OTIMISTA, e não movendo a matemática da
-- tolerância para o SQL: a regra de variância (percentual + piso, com o piso
-- vencendo em item barato) mora no domínio e é testada lá. Duplicá-la aqui
-- criaria duas verdades sobre o que é desvio relevante, que é exatamente o
-- problema que este change passou a semana desfazendo.
--
-- O que o banco confere é mais simples e é suficiente: a requisição está
-- travada, segue aberta, e o número de movimentos dela é o MESMO que o
-- servidor viu quando montou o retrato. Qualquer emissão ou devolução no meio
-- muda esse número, e o fechamento é recusado pedindo que se confira de novo.
-- ============================================================================

create function inventory.close_issue_request(
  p_request_id uuid,
  p_user uuid,
  -- quantos movimentos a requisição tinha quando o retrato foi montado
  p_seen_movements int
) returns table (closed_at timestamptz, movements int)
language plpgsql as $$
declare
  v_request inventory.stock_issue_request%rowtype;
  v_movements int;
  v_now timestamptz := now();
begin
  perform set_config('inventory.via_rpc', 'on', true);

  select * into v_request from inventory.stock_issue_request where id = p_request_id for update;
  if not found then raise exception 'Requisição não encontrada'; end if;
  if v_request.status <> 'open' then raise exception 'Requisição já fechada'; end if;

  select count(*) into v_movements
    from inventory.stock_movement where issue_request_id = p_request_id;

  if v_movements <> p_seen_movements then
    raise exception 'A requisição mudou enquanto o fechamento era confirmado (% movimentos, esperados %). Recarregue e confira os desvios antes de fechar',
      v_movements, p_seen_movements;
  end if;

  -- a sugestão vira o número contra o qual a variância do mês é medida, e por
  -- isso é congelada no MESMO instante do fechamento: congelá-la antes, numa
  -- viagem separada, deixava o retrato do mês apontando para um estado que
  -- ainda podia mudar
  update inventory.stock_issue_request_item
     set suggested_frozen_at = v_now
   where request_id = p_request_id and suggested_frozen_at is null;

  update inventory.stock_issue_request
     set status = 'closed', closed_by = p_user, closed_at = v_now
   where id = p_request_id;

  return query select v_now, v_movements;
end;
$$;

comment on function inventory.close_issue_request is
  'Fecha a requisição do dia sob trava, recusando se algum movimento entrou depois do retrato de variância que o servidor conferiu.';

revoke all on function inventory.close_issue_request(uuid, uuid, int) from anon, authenticated;
