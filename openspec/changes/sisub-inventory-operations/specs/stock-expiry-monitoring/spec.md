# stock-expiry-monitoring (delta)

## ADDED Requirements

### Requirement: Limite de alerta por item ou classe
O sistema SHALL resolver o limite de alerta de validade (dias) de um lote nesta ordem: política do ingrediente na cozinha; política da classe de conservação na cozinha; política global da classe; default (resfriado 3, congelado 15, demais 30).

#### Scenario: Limite por item
- **WHEN** a cozinha define 2 dias para leite e 3 para a classe resfriado
- **THEN** o lote de leite usa 2 dias e o de queijo usa 3

### Requirement: Painel de vencimentos por faixa
O sistema SHALL listar lotes com saldo positivo em três faixas — **Vencido** (validade anterior a hoje), **Crítico** (até o limite) e **Atenção** (até o dobro do limite) — com item, lote, local, validade, dias restantes, quantidade, valor a custo médio e total por faixa, calculados no fuso `America/Sao_Paulo`. Lote sem validade MUST NOT aparecer como vencido e SHALL ser listado à parte quando a classe for resfriado ou congelado. A lista SHALL ter limite e devolver o total.

#### Scenario: Vencido separado de a vencer
- **WHEN** um lote venceu ontem e outro vence em 2 dias com limite 3
- **THEN** o primeiro aparece em Vencido e o segundo em Crítico

#### Scenario: Perecível sem validade
- **WHEN** um lote de frango foi recebido sem validade
- **THEN** aparece em "Perecíveis sem validade" para correção

### Requirement: Ações a partir do vencimento
Cada lote do painel SHALL oferecer: **Usar primeiro** (a alocação de saída passa a preferir o lote), **Transferir**, **Quarentena** e, para vencido, **Baixar** (ajuste `expired`). Lote vencido MUST NOT ser alocado automaticamente em saída.

#### Scenario: Usar primeiro
- **WHEN** o almoxarife marca "usar primeiro" num lote de iogurte crítico
- **THEN** a próxima saída de iogurte aloca esse lote antes dos outros

### Requirement: Aviso no módulo e no planejamento
O item de menu "Vencimentos" SHALL mostrar a contagem de lotes em Vencido + Crítico da cozinha; o painel da cozinha SHALL exibir essas contagens e o valor em risco; e a tela de planejamento de cardápio da cozinha SHALL exibir os ingredientes com lotes que vencem até o fim do período planejado, com quantidade, calculados na leitura.

#### Scenario: Nutricionista planejando a semana
- **WHEN** a nutricionista abre o planejamento da próxima semana e há 12 KG de iogurte vencendo na quarta
- **THEN** a tela mostra "Iogurte — 12 KG — vence quarta" no bloco de vencimentos
