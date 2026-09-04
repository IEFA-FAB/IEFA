# goods-receipt Specification

## Purpose
TBD - created by archiving change sisub-inventory-cycle. Update Purpose after archive.
## Requirements
### Requirement: Ordem de Fornecimento por cozinha
O sistema SHALL manter `procurement.supply_order` (+ itens) vinculada a um empenho, com cozinha de destino (`kitchen_id` bigint), número, data de envio, **data prevista de entrega** e status (`draft | sent | partially_received | received | cancelled | expired`). A soma das quantidades das OFs de um empenho MUST NOT exceder a quantidade empenhada.

#### Scenario: Emissão de OF
- **WHEN** o gestor emite uma OF de 200 KG contra um empenho com 500 KG disponíveis
- **THEN** a OF é criada com status `sent` e o disponível para novas OFs passa a 300 KG

#### Scenario: OF excede o empenho
- **WHEN** o gestor tenta emitir OF cuja quantidade ultrapassa o saldo do empenho
- **THEN** o sistema rejeita indicando o saldo disponível

### Requirement: Recebimento em dois estágios (Lei 14.133, art. 140)
O recebimento SHALL seguir `draft → provisional → definitive`, com registros de autor e data em cada estágio, e estados de exceção `divergent` e `rejected`. Somente o recebimento **definitivo** SHALL criar lotes e movimentos de entrada no ledger e abater o saldo físico do empenho. O documento SHALL referenciar OF, NF-e e empenho quando existirem.

#### Scenario: Fluxo completo
- **WHEN** o operador registra recebimento provisório e depois o responsável confirma o definitivo
- **THEN** somente no definitivo são criados `stock_lot` + `stock_movement('receipt')` e o painel do empenho mostra a quantidade recebida

#### Scenario: Provisório não movimenta estoque
- **WHEN** um recebimento está em `provisional`
- **THEN** o saldo de estoque permanece inalterado

### Requirement: Conferência física por GTIN contra a NF-e
A conferência SHALL partir dos itens da NF-e já correlacionados (pipeline da capability `nfe-ingestion`); a leitura de código de barras (GTIN) MUST funcionar como verificação de que o produto físico corresponde ao item da nota, exibindo a conversão para unidade base. O operador SHALL registrar a quantidade fisicamente recebida e lote/validade (pré-preenchidos do grupo `rastro` quando houver).

#### Scenario: Conferência com scanner
- **WHEN** o operador escaneia o GTIN de uma caixa listada na NF-e
- **THEN** o sistema destaca o item correspondente e mostra "N caixas × conteúdo = total na unidade base"

#### Scenario: Produto escaneado não consta na nota
- **WHEN** o GTIN lido não corresponde a nenhum item da NF-e vinculada
- **THEN** o sistema alerta a divergência e não adiciona o item automaticamente

### Requirement: Tratamento de divergência
Quando a quantidade física diferir da faturada (NF-e) ou da autorizada (OF/empenho), o recebimento SHALL poder ser marcado `divergent` com motivo obrigatório por item, permitindo recebimento parcial (a menor) com registro do delta.

#### Scenario: Recebimento a menor
- **WHEN** a NF-e fatura 100 KG mas chegam 90 KG
- **THEN** o operador registra 90 KG com motivo, o documento fica `divergent`, e o definitivo movimenta apenas 90 KG

### Requirement: Lead time observado
O sistema SHALL registrar, por fornecedor×item, o lead time observado — intervalo entre o **envio da OF** (`sent_at`) e o **recebimento definitivo** — e o desvio contra `expected_delivery`, alimentando a estimativa de prazo usada pela capability `stock-replenishment-mrp`.

#### Scenario: Medição de lead time
- **WHEN** uma OF enviada em 01/08 com previsão 10/08 tem recebimento definitivo em 12/08
- **THEN** o sistema registra lead time observado de 11 dias e desvio de +2 dias sobre o previsto

