-- ============================================================================
-- Reset do ambiente de treino alcança o estoque da cozinha sentinela
-- ============================================================================
--
-- O reset apaga as tarefas de produção da cozinha de treino, e
-- `inventory.stock_movement.production_task_id` aponta para elas com ON DELETE SET
-- NULL. O ledger é append-only (`stock_movement_immutable` recusa UPDATE e DELETE):
-- bastou UMA baixa por produção na cozinha de treino para o reset inteiro falhar com
-- "stock_movement é append-only". O mesmo reset roda no gate de integração do CI —
-- que ficava vermelho para todo PR que toca o sisub.
--
-- O estoque ficou fora do reset em 2026-07 sob a premissa "o Conjunto Treino não
-- concede storage". Continua não concedendo — mas instrutor e conta de teste com
-- `storage` na cozinha de treino geram exatamente esse resíduo, e o resíduo quebra o
-- reset. Decisão do mantenedor (2026-09-22): o reset passa a limpar o estoque da
-- sentinela.
--
-- A imutabilidade continua valendo para toda cozinha real. A exceção é estreita:
--   * só DELETE (UPDATE segue recusado);
--   * só com `iefa.training_reset` aberto na transação (set_config local, que o
--     reset abre depois do advisory lock);
--   * só para linha cuja cozinha é a nomeada na flag E está marcada `is_training`.
-- Quem não é dono nem service_role não chega a executar DELETE nessas tabelas.
--
-- Os demais guards (contagem, requisição, itens e lotes do recebimento) já deixam
-- passar o DELETE em cascata do pai, e não precisam de exceção.
-- ============================================================================

create or replace function inventory.training_reset_allows(p_kitchen_id bigint)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
	select p_kitchen_id is not null
		and current_setting('iefa.training_reset', true) = p_kitchen_id::text
		and exists (select 1 from kitchen.kitchen k where k.id = p_kitchen_id and k.is_training)
$$;

comment on function inventory.training_reset_allows(bigint) is
	'Verdadeiro só dentro do reset do ambiente de treino e só para a cozinha sentinela: libera o DELETE que os guards de imutabilidade recusam.';

create or replace function inventory.stock_movement_immutable()
returns trigger
language plpgsql
as $$
begin
	if tg_op = 'DELETE' and inventory.training_reset_allows(old.kitchen_id) then
		return old;
	end if;
	raise exception 'stock_movement é append-only (MCASP): corrija com um movimento de ajuste justificado';
end;
$$;

create or replace function inventory.receipt_scan_event_immutable()
returns trigger
language plpgsql
as $$
begin
	if tg_op = 'DELETE'
		and inventory.training_reset_allows((select r.kitchen_id from inventory.goods_receipt r where r.id = old.receipt_id)) then
		return old;
	end if;
	raise exception 'receipt_scan_event é append-only: para desfazer uma leitura, grave um evento de estorno';
end;
$$;
