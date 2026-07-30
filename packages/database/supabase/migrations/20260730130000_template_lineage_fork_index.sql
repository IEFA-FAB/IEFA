-- Fork copy-on-write de templates de cardápio.
--
-- Ao salvar a edição de um template global a partir do contexto de uma cozinha, o servidor
-- procura um fork vivo daquela cozinha na mesma linhagem antes de decidir entre aplicar a
-- edição no fork existente e criar um novo. Essa busca está no caminho de ESCRITA — sem
-- índice, varre a tabela a cada save (e há auto-save nas telas de plano/evento/exceção).
--
-- Parcial em `base_template_id IS NOT NULL`: templates raiz nunca são alvo dessa busca.
create index if not exists menu_template_kitchen_lineage_idx
	on kitchen.menu_template (kitchen_id, base_template_id)
	where base_template_id is not null;
