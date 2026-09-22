## ADDED Requirements

### Requirement: Calculadora de classe como função pura

O sistema SHALL expor em `@iefa/sisub-domain` uma função pura `calculateSnackEntitlement(input)` que recebe os parâmetros da missão (`missionKind`, `flightMinutes`, `involvementMinutes`, `departureAt`, `stopsWithoutMess`, `isOperational`, `hasGalley`, `hasOven`, `crewCount`, `paxCount`) e devolve a lista de classes devidas, a dotação por público, a faixa calórica e a variante permitida. Cada item do resultado MUST carregar o identificador da regra aplicada (`R-A`, `R-B1`… do design) e o título da seção do Módulo 7 que a fundamenta. A mesma função MUST ser usada na tela (sugestão ao vivo) e no servidor (snapshot gravado no pedido).

#### Scenario: Voo curto recebe só Classe A

- **WHEN** a missão é aérea com `involvementMinutes = 150` e voo fora das janelas de refeição
- **THEN** o resultado contém apenas Classe A, para tripulação e passageiros
- **AND** a faixa calórica é 0–100 kcal

#### Scenario: Classe B é complemento da A

- **WHEN** a missão é aérea com `involvementMinutes = 300`
- **THEN** o resultado contém Classe A **e** Classe B
- **AND** nenhuma entrada de Classe B substitui a de Classe A

#### Scenario: Envolvimento, não voo, decide a Classe B

- **WHEN** `flightMinutes = 150` e `involvementMinutes = 200`
- **THEN** a Classe B é devida pela regra `R-B1`

#### Scenario: Voo de 1 a 3 h sobre horário de refeição

- **WHEN** `flightMinutes = 120`, `involvementMinutes = 150` e o intervalo da missão cobre a janela de almoço
- **THEN** a Classe B é sugerida pela regra `R-B2`
- **AND** o resultado informa a janela de refeição considerada

#### Scenario: Passageiro de voo não operacional fica fora da Classe B

- **WHEN** a Classe B é devida, `isOperational = false` e `paxCount = 4`
- **THEN** a dotação de Classe B cobre só a tripulação
- **AND** a Classe A cobre tripulação e os 4 passageiros

#### Scenario: Classe C por dia de missão

- **WHEN** a missão é aérea com `flightMinutes = 1800` (30 h)
- **THEN** o resultado contém Classe A e Classe C
- **AND** a dotação de Classe C é 2 cotas por tripulante
- **AND** a faixa calórica da Classe C é 1.200–2.000 kcal

#### Scenario: Fronteira de 6 horas

- **WHEN** `flightMinutes = 360` e `involvementMinutes = 360`
- **THEN** o resultado contém Classe C e não contém Classe B

#### Scenario: Passageiros opcionais na Classe C não operacional

- **WHEN** a Classe C é devida, `isOperational = false` e `paxCount > 0`
- **THEN** a dotação dos passageiros na Classe C é marcada como opcional, a critério da cozinha apoiadora

#### Scenario: Aeronave sem copa só recebe sanduíche

- **WHEN** `hasGalley = false`
- **THEN** a única variante permitida para B e C é `lanche`

#### Scenario: Refeição grande exige forno

- **WHEN** `hasGalley = true`, `hasOven = false` e a missão cobre a janela de almoço ou jantar
- **THEN** a variante `refeicao` não é permitida para aquela refeição
- **AND** o motivo cita o requisito de equipamento de reaquecimento

### Requirement: Regras do Lanche de Apoio com fronteiras definidas

Para `missionKind = 'terrestre'` a calculadora SHALL aplicar: até 2 h nenhum lanche; acima de 2 h e abaixo de 4 h Classe A; de 4 h a 8 h inclusive Classe B; acima de 8 h Classe B mais uma unidade adicional sugerida por bloco adicional de 4 h. As fronteiras de 4 h e 8 h MUST seguir a decisão N1 do design, e cada uma MUST ter teste próprio.

#### Scenario: Deslocamento de 2 horas

- **WHEN** a missão é terrestre com 120 minutos
- **THEN** o resultado não contém classe devida e explica o motivo

#### Scenario: Exatamente 4 horas

- **WHEN** a missão é terrestre com 240 minutos
- **THEN** o resultado contém Classe B de apoio, pela decisão N1

#### Scenario: Missão de 12 horas

- **WHEN** a missão é terrestre com 720 minutos
- **THEN** o resultado contém Classe B e 1 unidade adicional sugerida por pessoa, marcada como editável

### Requirement: Paradas sem rancho usam o deslocamento total

Quando `stopsWithoutMess = true`, a calculadora SHALL usar a duração total do deslocamento para decidir a classe.

#### Scenario: Escala sem rancho

- **WHEN** a missão tem duas pernas de 2 h com escala sem apoio de rancho e duração total de 5 h
- **THEN** a classificação considera 5 h
