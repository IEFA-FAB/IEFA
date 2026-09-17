# expense-liquidation (delta)

## ADDED Requirements

### Requirement: Prazo de liquidação
O painel de recebimentos efetivados sem liquidação SHALL mostrar os dias úteis decorridos desde o definitivo e alertar quando faltarem 3 dias úteis para o prazo de 10 dias úteis.

#### Scenario: Prazo se aproximando
- **WHEN** um recebimento definitivo completou 7 dias úteis sem liquidação
- **THEN** ele aparece destacado com "3 dias úteis restantes"

## MODIFIED Requirements

### Requirement: Elo com o recebimento definitivo
A liquidação SHALL poder referenciar `inventory.goods_receipt` e a NF-e por `finance.liquidacao.goods_receipt_id`, que é o único vínculo (um recebimento pode ter várias liquidações). Ao efetivar um recebimento com NF-e, a tela SHALL oferecer "Registrar liquidação" com empenho, NF-e, recebimento e valor recebido (Σ quantidade efetivada × custo unitário) pré-preenchidos, faltando o número da NS. A liquidação MUST NOT ser criada automaticamente: ela verifica o direito do credor (Lei 4.320, art. 63) e a NS nasce no SIAFI. Com vínculo, o servidor MUST validar que o recebimento pertence à mesma unidade, está `definitive` ou `divergent`, tem NF-e não cancelada com consulta de situação válida, referencia o mesmo empenho quando este estiver preenchido, e não tem pendência fiscal aberta (capability `goods-receipt`).

#### Scenario: Sugestão após recebimento definitivo
- **WHEN** um recebimento definitivo totaliza R$ 4.800 em itens conferidos
- **THEN** a tela oferece registrar liquidação com valor R$ 4.800, empenho e NF-e pré-preenchidos, faltando o número da NS

#### Scenario: Divergência entre recebido e liquidado
- **WHEN** o recebimento definitivo totaliza R$ 4.800 e a NS registrada é de R$ 5.000
- **THEN** o sistema registra a liquidação e sinaliza a divergência de R$ 200 no painel, sem corrigir nenhum dos lados

#### Scenario: Liquidação sem recebimento
- **WHEN** o gestor registra uma liquidação sem vincular recebimento
- **THEN** a liquidação é aceita e marcada como "sem lastro físico no sisub" no painel de conciliação

#### Scenario: Recebimento de outra unidade
- **WHEN** uma chamada tenta vincular liquidação da unidade A a recebimento da unidade B
- **THEN** o servidor recusa e nenhum dado do recebimento é alterado

#### Scenario: Vínculo com recebimento provisório
- **WHEN** uma chamada tenta vincular a liquidação a um recebimento `provisional`
- **THEN** o servidor recusa informando que só recebimento efetivado é liquidável

#### Scenario: Liquidação parcial em duas NS
- **WHEN** um recebimento de R$ 4.800 recebe NS de R$ 3.000 e de R$ 1.800
- **THEN** as duas ficam vinculadas e a conciliação mostra o recebimento como conciliado
