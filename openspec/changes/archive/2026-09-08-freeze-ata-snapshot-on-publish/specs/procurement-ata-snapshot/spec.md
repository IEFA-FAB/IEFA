## ADDED Requirements

### Requirement: Snapshot profundo da composição ao sair do rascunho
Ao transicionar uma ATA de rascunho para publicada (`finalizeAtaDraft` / `updateAtaStatus` para `published`), o sistema SHALL materializar a composição resolvida da ATA em tabelas de snapshot próprias (`procurement_list_snapshot_selection` e `procurement_list_snapshot_component`), tornando a ATA autocontida e reproduzível independentemente de alterações posteriores em `menu_template`, receitas ou ingredientes.

#### Scenario: Publicação congela a composição
- **WHEN** uma ATA em rascunho é finalizada/publicada
- **THEN** o sistema grava, numa única transação, uma linha de snapshot por seleção (com nome do template, `template_type`, `headcount` e `repetitions` vigentes) e uma linha de componente por ingrediente que compôs cada item, incluindo `computed_at`

#### Scenario: Edição de cardápio após publicação não altera a ATA
- **WHEN** um `menu_template` usado por uma ATA publicada é editado ou soft-deletado
- **THEN** os itens, quantitativos e snapshot da ATA publicada permanecem inalterados

#### Scenario: Reprodução da memória de cálculo
- **WHEN** um auditor abre uma ATA publicada
- **THEN** o sistema exibe a composição a partir do snapshot (seleções resolvidas + componentes por ingrediente), sem depender de leitura de `menu_template`

### Requirement: Rebaixamento do vínculo com o cardápio de origem
O sistema SHALL tratar a referência ao `menu_template` como origem informativa (`origin_template_id`, nullable, `ON DELETE SET NULL`) e não como fonte de verdade da composição da ATA.

#### Scenario: Template de origem apagado
- **WHEN** o `menu_template` de origem de uma seleção é apagado
- **THEN** `origin_template_id` da seleção fica nulo e a ATA continua legível a partir do snapshot, sem exibir nome de template inexistente

#### Scenario: Detalhe da ATA não vaza template soft-deleted
- **WHEN** o detalhe de uma ATA é carregado (`fetchAtaDetails`)
- **THEN** nomes de cardápio exibidos vêm do snapshot (ATA publicada) ou filtram `deleted_at` (rascunho), nunca de um template escondido

### Requirement: Backfill de snapshot para ATAs legadas
O sistema SHALL gerar snapshot best-effort para ATAs já publicadas/arquivadas na migração, marcando a origem do snapshot para distinguir de snapshots nativos.

#### Scenario: ATA legada com template existente
- **WHEN** a migração processa uma ATA publicada cujo template de origem ainda existe
- **THEN** o snapshot é reconstruído a partir dos itens e seleções, com `snapshot_source = 'backfill'`

#### Scenario: ATA legada sem template resolvível
- **WHEN** a migração processa uma ATA publicada cujo template não existe mais
- **THEN** o snapshot é gravado parcialmente a partir dos `procurement_list_item` agregados, com `snapshot_source = 'backfill'`
