# survey-contract-crosswalk

## ADDED Requirements

### Requirement: Sugestão derivada das contratações
O sistema SHALL derivar, para cada item do levantamento, uma sugestão contendo valor realizado no ano-base, situação anterior e prazo, a partir das contratações da OM cujo tópico corresponde ao da categoria. O valor sugerido SHALL somar o pago e, na ausência de pago, o liquidado, restrito ao ano-base da campanha. A sugestão SHALL vir acompanhada da lista das contratações que a sustentam. O cálculo MUST ser função pura, testável sem banco.

#### Scenario: Realizado somado do histórico
- **WHEN** a OM tem duas contratações de `utensilios` com pagamentos em 2025 somando R$ 88.106,95
- **THEN** o item "Utensílios" sugere esse valor como realizado, listando as duas contratações

#### Scenario: Situação anterior com ATA vigente
- **WHEN** existe ATA de climatização vigente na data de referência
- **THEN** a situação anterior sugerida traz número e vigência da ATA; não havendo nenhuma, sugere "Sem ATA vigente"

#### Scenario: Sem contratação no tópico
- **WHEN** nenhuma contratação da OM corresponde ao tópico da categoria
- **THEN** não há sugestão para aquele item, e o formulário não exibe valor algum como se fosse zero apurado

### Requirement: Sugestão nunca sobrescreve o informado
O sistema MUST NOT gravar sugestão automaticamente em item de levantamento. Gravar SHALL ocorrer apenas por aceite explícito do usuário, registrando a origem do preenchimento e um instantâneo do que foi sugerido e com base em quê. Item já informado MUST manter o valor informado quando a sugestão mudar.

#### Scenario: Aceite explícito
- **WHEN** o usuário aceita a sugestão de valor realizado
- **THEN** o valor é gravado nos campos normais, a origem passa a "sugestão aceita" e o instantâneo da sugestão fica registrado

#### Scenario: Contratação nova depois do preenchimento
- **WHEN** uma contratação é cadastrada depois de a OM já ter informado o valor daquela categoria
- **THEN** o valor informado permanece intacto e a divergência é exibida como alerta, com a diferença explicitada

#### Scenario: Nenhuma rotina preenche
- **WHEN** a resposta da OM é criada a partir da abertura da campanha
- **THEN** todos os itens nascem vazios, com sugestões oferecidas na tela e nenhum valor gravado

### Requirement: Vínculo entre item e contratação
O sistema SHALL permitir vincular um item do levantamento a uma ou mais contratações, e uma contratação a mais de um item, registrando a parcela atribuída e se o vínculo foi criado automaticamente ou pelo operador. Parcela não informada SHALL significar a contratação inteira. A soma das parcelas MUST NOT ser validada contra o valor total da contratação.

#### Scenario: Pregão que atende duas categorias
- **WHEN** um pregão de copa e cozinha é vinculado a "Utensílios" com R$ 60.000,00 e a "Mesas e Cadeiras" com R$ 28.000,00
- **THEN** os dois vínculos coexistem e cada item mostra apenas a parcela que lhe cabe

#### Scenario: Vínculo automático revisável
- **WHEN** o sistema vincula automaticamente uma contratação pelo tópico e o operador discorda
- **THEN** o operador remove o vínculo, e a remoção não apaga a contratação nem o valor já informado no item

#### Scenario: Rateio acima do total
- **WHEN** as parcelas atribuídas de uma contratação somam mais que seu valor total
- **THEN** os vínculos são aceitos e a inconsistência é apenas sinalizada — o rateio é decisão da OM
