# expense-liquidation Specification

## Purpose
TBD - created by archiving change sisub-budget-execution. Update Purpose after archive.
## Requirements
### Requirement: Liquidação vinculada ao empenho
O sistema SHALL registrar `finance.liquidacao` com número da NS, data, valor, empenho, competência e origem (`manual` | `siafi`). Toda liquidação MUST referenciar um empenho e MUST NOT fazer o total liquidado exceder o valor vigente dele.

#### Scenario: Registro de liquidação
- **WHEN** o gestor registra NS de R$ 9.000 contra um empenho com R$ 15.000 vigentes
- **THEN** a liquidação é criada e o saldo a liquidar do empenho passa a R$ 6.000

#### Scenario: Número de NS duplicado na unidade
- **WHEN** o gestor registra uma NS com número já existente na mesma unidade e exercício
- **THEN** o sistema rejeita com mensagem clara

### Requirement: Elo com o recebimento definitivo
A liquidação SHALL poder referenciar `inventory.goods_receipt` e a NF-e. Ao efetivar um recebimento definitivo, o sistema SHALL sugerir uma liquidação pré-preenchida com o valor recebido (Σ quantidade recebida × custo unitário dos itens). A liquidação MUST NOT ser criada automaticamente — liquidar é ato do ordenador e a NS nasce no SIAFI.

#### Scenario: Sugestão após recebimento definitivo
- **WHEN** um recebimento definitivo totaliza R$ 4.800 em itens conferidos
- **THEN** a tela oferece registrar liquidação com valor R$ 4.800 pré-preenchido, faltando o número da NS

#### Scenario: Divergência entre recebido e liquidado
- **WHEN** o recebimento definitivo totaliza R$ 4.800 e a NS registrada é de R$ 5.000
- **THEN** o sistema registra a liquidação e sinaliza a divergência de R$ 200 no painel, sem corrigir nenhum dos lados

#### Scenario: Liquidação sem recebimento
- **WHEN** o gestor registra uma liquidação sem vincular recebimento
- **THEN** a liquidação é aceita e marcada como "sem lastro físico no sisub" no painel de conciliação

