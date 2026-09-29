## ADDED Requirements

### Requirement: Modelo global só com quantidade relativa

Um modelo de cardápio global (`kitchen_id` nulo), de qualquer regime, SHALL guardar só quantidades
relativas: proporção por preparação (`recommended_proportion`) e quantidade de preparações por grupo.
Pax por preparação, efetivo de refeição e ocorrências por mês MUST ser recusados em modelo global, no
banco e no servidor, com o código `GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY`. As telas globais MUST NOT
oferecer esses campos.

#### Scenario: Pax num evento global

- **WHEN** alguém com `global:2` salva um evento global com uma preparação de 300 pax, pela tela ou por tool
- **THEN** o servidor recusa com a mensagem de que o efetivo é definido pela cozinha
- **AND** nada é gravado

#### Scenario: Escrita direta no banco

- **WHEN** uma escrita insere `base_headcount` numa refeição de modelo global sem passar pelo domínio
- **THEN** o banco recusa a escrita

#### Scenario: Tela global

- **WHEN** a SDAB abre o editor global de evento, de apoio ou semanal
- **THEN** a tela mostra proporção e quantidade por grupo
- **AND** não mostra pax, efetivo nem ocorrências por mês

### Requirement: Proporção é a quantidade relativa de todos os regimes

A quantidade relativa de uma preparação SHALL ser o `recommended_proportion`, lido como "% do efetivo"
no semanal e no evento e como "porções por kit" no apoio (valor ÷ 100, com decimal). O teto MUST ser
300% no semanal e no evento e 1000% (10 porções por kit) no apoio. Total de porções de apoio MUST ser
arredondado para cima.

#### Scenario: Dois sanduíches por kit

- **WHEN** um padrão de lanche tem "Sanduíche natural" com 2 porções por kit e o pedido aceito é de 15 kits
- **THEN** a produção recebe 30 porções de "Sanduíche natural"

#### Scenario: Meia porção por kit

- **WHEN** um apoio tem "Café" com 0,5 porção por kit e é aplicado com 3 kits
- **THEN** o dia recebe 2 porções de "Café"

### Requirement: Adaptar um modelo global não leva quantidade absoluta

A cópia de um modelo global SHALL levar preparações, grupos, proporções e refeições, e MUST deixar
pax, efetivo e ocorrências por mês vazios para a cozinha preencher. A cópia de um cardápio local MUST
continuar levando tudo.

#### Scenario: Adaptar evento global

- **WHEN** a cozinha adapta um evento global
- **THEN** a cópia chega com as refeições, os grupos e as proporções
- **AND** sem efetivo em nenhuma refeição
- **AND** a tela diz que o efetivo e as ocorrências são definidos na cozinha

#### Scenario: Copiar cardápio local

- **WHEN** a cozinha copia um cardápio semanal próprio com efetivo de 800 no almoço
- **THEN** a cópia chega com 800 no almoço

### Requirement: Aplicar ao calendário recebe o efetivo

Aplicar um cardápio semanal, de evento ou de apoio SHALL aceitar o efetivo de cada refeição (kits, no
apoio), preenchido com o do cardápio local e vazio no modelo global. O efetivo informado vale para
aquela aplicação e MUST NOT alterar o modelo. Efetivo vazio MUST ser aceito e gerar a pendência
"efetivo a definir" no dia, sem recusar a aplicação.

#### Scenario: Semanal da SDAB aplicado direto

- **WHEN** a cozinha aplica um semanal global informando 800 no almoço
- **THEN** o almoço de cada dia aplicado tem efetivo 800
- **AND** a preparação com 30% recebe 240 porções

#### Scenario: Aplicar sem saber o efetivo

- **WHEN** a cozinha aplica um semanal global sem informar efetivo
- **THEN** os dias são criados com as preparações e sem porções
- **AND** o calendário e o fluxo da cozinha mostram "efetivo a definir" nesses dias

#### Scenario: Kits do apoio

- **WHEN** a cozinha aplica um apoio informando 100 kits na refeição "Kit"
- **THEN** cada preparação recebe 100 × as porções por kit dela

### Requirement: Efetivo informado depois calcula as porções

Quando o efetivo de uma refeição do dia passa de vazio para um número, o sistema SHALL calcular as
porções de toda preparação daquela refeição que ainda não tem porção, pela proporção dela. Porção já
preenchida MUST ficar como está.

#### Scenario: Efetivo chegou na quarta

- **WHEN** o almoço de segunda está com "efetivo a definir" e a cozinha informa 600
- **THEN** a preparação com 30% passa a ter 180 porções
- **AND** a preparação com porção digitada à mão mantém a porção

### Requirement: Sem efetivo não some da compra em silêncio

A estimativa de quantidade e o fluxo "Prever demanda para compra" SHALL listar como pendência toda
preparação que não tem efetivo nem pax, em vez de descartá-la. Estimativa e previsão MUST recusar
modelo global no servidor, com `GLOBAL_TEMPLATE_NEEDS_ADAPTATION`.

#### Scenario: Semanal adaptado sem efetivo no jantar

- **WHEN** a cozinha monta a previsão de demanda com um semanal cujo jantar não tem efetivo
- **THEN** o fluxo avisa "cardápio sem efetivo" antes do envio, citando o jantar
- **AND** a estimativa mostra as preparações do jantar como fora do quantitativo

#### Scenario: Modelo global na estimativa por tool

- **WHEN** uma tool tenta incluir um modelo global numa estimativa
- **THEN** o servidor recusa pedindo para adaptar o modelo e informar o efetivo
