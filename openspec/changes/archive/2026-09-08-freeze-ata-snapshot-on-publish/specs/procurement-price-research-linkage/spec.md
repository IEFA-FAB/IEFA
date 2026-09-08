## ADDED Requirements

### Requirement: Vínculo pesquisa↔item por chave de negócio
O sistema SHALL reconciliar o vínculo entre pesquisa de preço e item da ATA por chave de negócio (`catmat_item_codigo`, com fallback para `ingredient_id`), em vez de depender da sobrevivência do `ata_item_id` da linha.

#### Scenario: Recompute de quantidade preserva vínculo
- **WHEN** os itens de um rascunho são recalculados e regravados, e um ingrediente permanece na lista com a mesma chave CATMAT/ingrediente
- **THEN** a pesquisa de preço associada permanece vinculada ao item correspondente, mesmo que a identidade da linha (`ata_item_id`) mude

#### Scenario: Item removido desvincula pesquisa
- **WHEN** um ingrediente deixa de compor a ATA após recompute
- **THEN** a pesquisa de preço correspondente perde o vínculo com aquele item

### Requirement: Aviso e limpeza de pesquisas órfãs no replace-all
No replace-all de itens do rascunho, o sistema SHALL informar ao cliente quantas pesquisas perderão vínculo e SHALL remover as linhas de pesquisa órfãs (`ata_item_id IS NULL`) associadas àquela ATA.

#### Scenario: Contagem de desvínculos retornada ao cliente
- **WHEN** `persistDraftItems` executa um replace-all que removerá itens com pesquisa vinculada
- **THEN** a operação retorna a quantidade de pesquisas que serão desvinculadas para exibição de aviso na UI

#### Scenario: Órfãos removidos
- **WHEN** o replace-all conclui e existem linhas de pesquisa sem `ata_item_id` para aquela ATA
- **THEN** essas linhas são removidas na mesma transação

### Requirement: Sinalização de validade temporal da pesquisa
O sistema SHALL expor a data da pesquisa no snapshot da ATA e derivar um flag de expiração da janela legal (default 180 dias), de forma não-bloqueante.

#### Scenario: Pesquisa dentro da validade
- **WHEN** uma ATA é aberta e a pesquisa de preço tem menos de 180 dias
- **THEN** a UI não sinaliza expiração

#### Scenario: Pesquisa expirada
- **WHEN** a pesquisa de preço tem 180 dias ou mais
- **THEN** a UI sinaliza expiração da janela legal, sem bloquear a leitura ou o uso da ATA
