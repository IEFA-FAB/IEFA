# expense-liquidation (delta)

## ADDED Requirements

### Requirement: Prazo de liquidação
O painel de recebimentos efetivados sem liquidação SHALL contar os dias úteis a partir do **recebimento da nota fiscal pela Administração** (IN SEGES/ME 77/2022, art. 7º, I — 10 dias úteis), e não a partir do definitivo, e SHALL alertar quando faltarem 3 dias úteis. Recebimento sem nota SHALL aparecer como "aguardando nota", sem prazo correndo. O tempo com pendência fiscal aberta SHALL ser excluído da contagem (art. 7º, §4º). A redução do §2º (prazo à metade para contratação de valor até o limite ali fixado) SHALL ser aplicada com o limite conferido no texto vigente da norma na implementação, nunca de memória.

#### Scenario: Prazo se aproximando
- **WHEN** a nota de um recebimento definitivo chegou há 7 dias úteis e não há liquidação
- **THEN** ele aparece destacado com "3 dias úteis restantes"

#### Scenario: Entrega sem nota não conta prazo
- **WHEN** o pão foi recebido na segunda sem nota e a nota semanal chega na sexta
- **THEN** o prazo começa a contar na sexta

#### Scenario: Pendência fiscal suspende o prazo
- **WHEN** a nota chegou há 6 dias úteis, dos quais 2 com pendência fiscal aberta
- **THEN** o painel mostra 4 dias úteis consumidos

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
