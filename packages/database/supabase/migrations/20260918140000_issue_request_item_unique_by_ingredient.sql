-- A unicidade da linha da requisição passa a ser (requisição, ingrediente).
--
-- Com `meal_type_id` na chave, e ele nulo no caso comum, o índice único NUNCA
-- conflitava (em índice único NULL é distinto de NULL): cada carregamento da
-- tela acrescentava uma linha duplicada do mesmo insumo, e a variância passava
-- a comparar com uma sugestão partida em várias linhas.
alter table inventory.stock_issue_request_item
  drop constraint if exists stock_issue_request_item_key;

-- Desduplica o que possa ter entrado antes da correção.
--
-- As cópias vinham de cada carregamento da tela gravando a MESMA sugestão de
-- novo: são repetições, não parcelas. Uma versão anterior deste arquivo as
-- SOMAVA — multiplicando a sugestão pelo número de recarregamentos — e apagava
-- as cópias posteriores junto com o motivo de desvio que alguma delas pudesse
-- ter. Fica a cópia MAIS RECENTE, que reflete o último planejamento, com o
-- primeiro motivo registrado em qualquer cópia.
--
-- Esta migration foi aplicada em produção com 0 linhas na tabela — a versão
-- antiga nunca agiu sobre dado real. A correção vale para replay em banco limpo.
with ranked as (
  select id, request_id, ingredient_id,
         row_number() over (partition by request_id, ingredient_id order by created_at desc, id desc) as rn,
         first_value(variance_reason) over (
           partition by request_id, ingredient_id
           order by (variance_reason is null), created_at
         ) as reason
    from inventory.stock_issue_request_item
)
update inventory.stock_issue_request_item i
   set variance_reason = coalesce(i.variance_reason, ranked.reason)
  from ranked
 where ranked.id = i.id and ranked.rn = 1;

delete from inventory.stock_issue_request_item i
 using (
   select id, row_number() over (partition by request_id, ingredient_id order by created_at desc, id desc) as rn
     from inventory.stock_issue_request_item
 ) ranked
 where ranked.id = i.id and ranked.rn > 1;

alter table inventory.stock_issue_request_item
  add constraint stock_issue_request_item_key unique (request_id, ingredient_id);
