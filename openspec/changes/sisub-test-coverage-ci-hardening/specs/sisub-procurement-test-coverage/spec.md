## ADDED Requirements

### Requirement: Cálculo de necessidades de compra é testado
As funções que calculam necessidades de compra MUST ter testes cobrindo agregação por ingrediente, repetição de template/evento, `portion_yield`, arredondamento, ordenação e exclusão de itens marcados.

#### Scenario: Ingrediente repetido é agregado
- **WHEN** dois templates selecionados usam o mesmo ingrediente
- **THEN** o resultado MUST conter uma única linha com `total_quantity` somado

#### Scenario: Repetições multiplicam necessidade
- **WHEN** uma seleção tem `repetitions=3`
- **THEN** a quantidade calculada MUST ser três vezes a necessidade base daquela seleção

#### Scenario: Item excluído de procurement é ignorado
- **WHEN** `excluded_from_procurement` está ativo em um item de menu
- **THEN** `fetchProcurementNeedsFn` MUST NOT incluir seus ingredientes no total

### Requirement: Ciclo de vida de ATA tem cobertura de integração
O ciclo de vida de ATA MUST ser testado desde criação até listagem, detalhes, status e soft delete.

#### Scenario: Criar ATA persiste relações
- **WHEN** `createAtaFn()` recebe cozinhas, seleções e itens válidos
- **THEN** o sistema MUST persistir `procurement_list`, `procurement_list_kitchen`, `procurement_list_selection` e `procurement_list_item`

#### Scenario: Atualizar status registra transição
- **WHEN** `updateAtaStatusFn()` altera status para `published`
- **THEN** a ATA MUST refletir o novo status e atualizar `updated_at`

#### Scenario: Deletar ATA usa soft delete
- **WHEN** `deleteAtaFn()` é chamado
- **THEN** `deleted_at` MUST ser preenchido e `fetchAtaListFn()` MUST NOT retornar a ATA

### Requirement: ARP e empenho têm cobertura de integração
Importação/sync de ARP e registro/anulação de empenhos MUST ter testes com HTTP mockado ou fixtures controladas, sem depender da disponibilidade pública do Compras.gov no gate rápido.

#### Scenario: Importar ARP normaliza datas brasileiras
- **WHEN** a API externa retorna datas `DD/MM/YYYY`
- **THEN** `importArpItemsFn()` MUST persistir datas ISO `YYYY-MM-DD`

#### Scenario: Importar ARP vincula item por CATMAT
- **WHEN** item externo tem `codigoMaterial` igual a item interno da ATA
- **THEN** `procurement_arp_item.ata_item_id` MUST apontar para o item interno correto

#### Scenario: Empenho calcula valor total
- **WHEN** `createEmpenhoFn()` recebe quantidade e valor unitário
- **THEN** `valor_total` MUST ser salvo como quantidade multiplicada por valor unitário com arredondamento esperado

#### Scenario: Empenho duplicado retorna erro amigável
- **WHEN** `createEmpenhoFn()` recebe número já cadastrado para a unidade
- **THEN** a função MUST retornar erro indicando duplicidade

### Requirement: Dashboard de saldos tem cobertura
O dashboard de unidade MUST ter testes para ATAs publicadas, itens com consumo maior ou igual a 80%, saldo zerado e anotação de presença em cardápio futuro.

#### Scenario: Item com consumo alto aparece
- **WHEN** um item possui `quantidade_empenhada / quantidade_homologada >= 0.8`
- **THEN** `fetchUnitDashboardFn()` MUST incluí-lo em `low_balance_items`

#### Scenario: Item em cardápio futuro tem prioridade
- **WHEN** ingrediente crítico aparece em menu dos próximos 30 dias
- **THEN** o item MUST retornar com `in_upcoming_menu=true` e ser ordenado antes dos demais
