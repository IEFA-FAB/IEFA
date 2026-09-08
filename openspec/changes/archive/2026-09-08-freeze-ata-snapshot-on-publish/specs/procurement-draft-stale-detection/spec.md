## ADDED Requirements

### Requirement: Rastreio de computed_at nos itens do rascunho
O sistema SHALL gravar `computed_at` em cada `procurement_list_item` no momento em que os quantitativos são calculados (`createAta` e recompute), para permitir detecção de defasagem.

#### Scenario: computed_at gravado no cálculo
- **WHEN** os quantitativos de uma ATA são calculados e persistidos
- **THEN** cada item recebe `computed_at` com o instante do cálculo

### Requirement: Detecção de quantitativo desatualizado no rascunho
Para uma ATA em rascunho, o sistema SHALL comparar o `computed_at` mais recente dos itens com o `updated_at` mais recente dos `menu_template` das seleções e sinalizar quando o cardápio foi editado após o último cálculo.

#### Scenario: Cardápio editado após cálculo
- **WHEN** um `menu_template` de uma seleção do rascunho tem `updated_at` posterior ao `computed_at` dos itens
- **THEN** a UI exibe um badge "quantitativos desatualizados — recalcular"

#### Scenario: Rascunho em dia
- **WHEN** nenhum `menu_template` das seleções foi editado após o último cálculo
- **THEN** a UI não exibe o badge de defasagem

### Requirement: Recompute manual
O recálculo dos quantitativos no rascunho SHALL ser uma ação manual disparada pelo usuário, sem recompute automático ao abrir a ATA.

#### Scenario: Recompute sob comando
- **WHEN** o usuário aciona "recalcular" no rascunho
- **THEN** o sistema recalcula via `calculateAtaNeeds`, regrava os itens preservando ajustes reconciliáveis e atualiza `computed_at`

#### Scenario: Abrir rascunho não recalcula
- **WHEN** o usuário apenas abre uma ATA em rascunho
- **THEN** o sistema não recalcula nem sobrescreve os itens existentes
