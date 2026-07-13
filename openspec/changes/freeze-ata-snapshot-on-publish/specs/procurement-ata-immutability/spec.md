## ADDED Requirements

### Requirement: Composição e quantitativos imutáveis após publicação
Com a ATA em status diferente de `draft` (ou `wizard_step == null`), o sistema SHALL rejeitar qualquer mutação de composição, itens ou quantitativos, retornando um DomainError.

#### Scenario: Tentativa de salvar itens em ATA publicada
- **WHEN** `saveAtaDraftItems` (ou caminho de mutação de item) é chamado para uma ATA `published` ou `archived`
- **THEN** o sistema rejeita a operação com DomainError e não altera nenhuma linha

#### Scenario: Rascunho permanece editável
- **WHEN** as mesmas operações são chamadas para uma ATA `draft`
- **THEN** a mutação é aplicada normalmente

### Requirement: Preço unitário editável após publicação
O sistema SHALL permitir atualização de preço unitário (`updateAtaItemPrices`) em ATAs publicadas, sem exigir reabertura da ATA, para acomodar nova pesquisa dentro da janela de validade legal.

#### Scenario: Atualização de preço em ATA publicada
- **WHEN** `updateAtaItemPrices` é chamado para uma ATA `published`
- **THEN** os preços unitários são atualizados e os vínculos de pesquisa de preço reconciliados, sem alterar quantitativos

#### Scenario: Atualização de preço não altera composição
- **WHEN** um preço de item é atualizado em ATA publicada
- **THEN** nenhum snapshot de composição, seleção ou quantitativo é modificado

### Requirement: Transições de status controladas
O sistema SHALL validar as transições de status da ATA, permitindo `draft → published → archived` e proibindo reabertura (`published → draft`) nesta capacidade.

#### Scenario: Transição inválida rejeitada
- **WHEN** `updateAtaStatus` tenta transicionar uma ATA `published` de volta para `draft`
- **THEN** o sistema rejeita a transição com DomainError

#### Scenario: Publicação dispara snapshot
- **WHEN** `updateAtaStatus` transiciona uma ATA `draft` para `published`
- **THEN** o snapshot profundo da composição é materializado na mesma operação
