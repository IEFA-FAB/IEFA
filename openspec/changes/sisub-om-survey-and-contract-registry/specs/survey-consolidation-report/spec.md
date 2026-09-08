# survey-consolidation-report

## ADDED Requirements

### Requirement: Consolidado por OM e por categoria
O sistema SHALL expor o consolidado da campanha com total realizado no ano-base e total necessário no ano-alvo, agregados por OM e por categoria, calculados a partir dos itens. O consolidado SHALL exigir `analytics` nível 2 e MUST ser somente leitura.

#### Scenario: Dois eixos do mesmo número
- **WHEN** o gestor abre o consolidado
- **THEN** vê a soma por OM e a soma por categoria, e os dois totais gerais coincidem

#### Scenario: Tentativa de correção pelo relatório
- **WHEN** o consolidado é aberto por usuário com `analytics` nível 3
- **THEN** nenhuma ação de edição de resposta é oferecida — a correção do dado é da OM

### Requirement: Cobertura da campanha
O consolidado SHALL informar quantas OMs responderam, quantas submeteram e quais não responderam, e MUST apresentar categoria sem resposta como não respondida, nunca como zero.

#### Scenario: OM silenciosa
- **WHEN** três OMs não abriram a resposta
- **THEN** o relatório as lista nominalmente como pendentes, e os totais indicam a cobertura sobre a qual foram calculados

#### Scenario: Categoria em branco
- **WHEN** uma OM deixa "Treinamento" sem valor
- **THEN** aquela categoria consta como não respondida no corte daquela OM, e o total da categoria informa sobre quantas OMs foi somado

### Requirement: Comparação entre o informado e o histórico
O consolidado SHALL destacar, por OM e categoria, a divergência entre o valor realizado informado e o valor apurado a partir das contratações registradas, quando houver contratação vinculada.

#### Scenario: Informado abaixo do apurado
- **WHEN** a OM informa R$ 10.000,00 de realizado e as contratações vinculadas somam R$ 16.483,00
- **THEN** a divergência aparece com os dois números e a lista das contratações, sem alterar o valor informado

#### Scenario: Sem contratação vinculada
- **WHEN** não há contratação vinculada àquele item
- **THEN** nenhuma divergência é apontada, e a ausência de base é explicitada

### Requirement: Apresentação sem faixa de acento lateral
As telas deste change MUST distinguir status, cobertura e divergência por badge, ícone, tint de fundo ou borda completa de 1px, e MUST NOT usar borda lateral colorida acima de 1px como acento em cartão, item de lista ou alerta, conforme a proibição global do repositório.

#### Scenario: Cartão de OM pendente
- **WHEN** uma OM aparece como pendente na lista de cobertura
- **THEN** é distinguida por badge e tint de fundo, sem barra colorida lateral
