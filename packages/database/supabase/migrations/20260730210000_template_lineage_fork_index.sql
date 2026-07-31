-- Fork copy-on-write de templates de cardápio.
--
-- Ao salvar a edição de um template global a partir do contexto de uma cozinha, o servidor
-- procura um fork vivo daquela cozinha na mesma linhagem antes de decidir entre aplicar a
-- edição no fork existente e criar um novo. Essa busca está no caminho de ESCRITA — sem
-- índice, varre a tabela a cada save (e há auto-save nas telas de plano/evento/exceção).
--
-- Parcial em `base_template_id IS NOT NULL`: templates raiz nunca são alvo dessa busca.
-- Índice de lookup, NÃO único. A revisão pediu unicidade em (kitchen_id, base_template_id)
-- para impedir forks concorrentes duplicados, mas isso contradiz uma funcionalidade que já
-- existe: `forkTemplate` é uma ação deliberada de "derive uma cópia deste modelo", e a mesma
-- cozinha legitimamente deriva vários templates de um mesmo original — a produção já tem um
-- caso assim. Uniquificar aqui quebraria esse uso.
--
-- A corrida que motivou o pedido está fechada de outra forma: em `saveTemplateEdit` a busca
-- pelo fork existente, as leituras da origem e o insert rodam na MESMA transação, sob
-- advisory lock de (cozinha, linhagem). Dois saves concorrentes serializam, então o segundo
-- enxerga o fork do primeiro em vez de criar outro.
create index if not exists menu_template_kitchen_lineage_idx
	on kitchen.menu_template (kitchen_id, base_template_id)
	where base_template_id is not null and deleted_at is null;
