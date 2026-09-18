-- A unicidade da linha da requisição passa a ser (requisição, ingrediente).
--
-- Com `meal_type_id` na chave, e ele nulo no caso comum, o índice único NUNCA
-- conflitava (em índice único NULL é distinto de NULL): cada carregamento da
-- tela acrescentava uma linha duplicada do mesmo insumo, e a variância passava
-- a comparar com uma sugestão partida em várias linhas.
alter table inventory.stock_issue_request_item
  drop constraint if exists stock_issue_request_item_key;

-- desduplica o que possa ter entrado antes da correção, somando a sugestão
with ranked as (
  select id, request_id, ingredient_id,
         row_number() over (partition by request_id, ingredient_id order by created_at) as rn,
         sum(coalesce(suggested_qty, 0)) over (partition by request_id, ingredient_id) as total
    from inventory.stock_issue_request_item
)
update inventory.stock_issue_request_item i
   set suggested_qty = ranked.total
  from ranked
 where ranked.id = i.id and ranked.rn = 1;

delete from inventory.stock_issue_request_item i
 using (
   select id, row_number() over (partition by request_id, ingredient_id order by created_at) as rn
     from inventory.stock_issue_request_item
 ) ranked
 where ranked.id = i.id and ranked.rn > 1;

alter table inventory.stock_issue_request_item
  add constraint stock_issue_request_item_key unique (request_id, ingredient_id);
