-- Fork copy-on-write de templates de cardápio.
--
-- Ao salvar a edição de um template global a partir do contexto de uma cozinha, o servidor
-- procura um fork vivo daquela cozinha na mesma linhagem antes de decidir entre aplicar a
-- edição no fork existente e criar um novo. Essa busca está no caminho de ESCRITA — sem
-- índice, varre a tabela a cada save (e há auto-save nas telas de plano/evento/exceção).
--
-- Parcial em `base_template_id IS NOT NULL`: templates raiz nunca são alvo dessa busca.
-- ÚNICO, não só índice de lookup: a busca pré-insert e o insert são queries separadas, então
-- dois saves concorrentes forkando o mesmo template global para a mesma cozinha podem ambos
-- passar pela busca antes de qualquer um inserir. Sem unicidade os dois inserts vencem e a
-- cozinha fica com dois forks vivos, aparecendo duplicados na listagem e com o `findFirst`
-- das edições seguintes escolhendo um deles de forma não-determinística.
--
-- Parcial em `deleted_at is null` porque o soft delete tem de liberar nova bifurcação.
create unique index if not exists menu_template_kitchen_lineage_idx
	on kitchen.menu_template (kitchen_id, base_template_id)
	where base_template_id is not null and deleted_at is null;
