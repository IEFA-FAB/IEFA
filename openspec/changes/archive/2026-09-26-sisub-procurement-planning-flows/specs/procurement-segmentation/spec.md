## ADDED Requirements

### Requirement: Contratações montadas pela unidade

O sistema SHALL permitir que quem tem `unit:2` na OM cadastre contratações (segmentos) com nome único na OM, descrição, mês previsto no calendário de contratação, antecedência do aviso em meses, vigência padrão em meses e identificador do PCA. Cada contratação MUST ter regras de inclusão ou exclusão por pasta do catálogo ou por item de compra.

#### Scenario: Montar "Carnes" por pastas

- **WHEN** o chefe do rancho cria "Carnes" incluindo as pastas Proteínas e Frios/Embutidos
- **THEN** todo insumo em qualquer subpasta dessas duas resolve para "Carnes"

#### Scenario: Exceção mais específica vence

- **WHEN** "Carnes" inclui Proteínas e exclui Pescados, e "Congelados" inclui Pescados
- **THEN** um insumo em Proteínas › Pescados resolve para "Congelados"

### Requirement: Item disputado bloqueia, item sem contratação avisa

O sistema SHALL resolver cada linha do anexo (o item de compra, ou o insumo sem item de compra) para exatamente uma contratação, pela regra mais específica. Regra de item de compra vale sobre qualquer pasta. Sem ela, se os insumos do mesmo item de compra resolvem para contratações diferentes, o item MUST ser conflito. Contratação apagada não entra na resolução. Empate de especificidade entre duas contratações MUST ser conflito bloqueante, porque o órgão não pode participar de duas atas com o mesmo objeto (Lei 14.133/2021, art. 82, VIII). Item que não casa com nenhuma contratação MUST aparecer como aviso.

#### Scenario: Item de compra com insumos em pastas de contratações diferentes

- **WHEN** "Frango inteiro" (Proteínas) e "Frango para caldo" (Congelados) usam o mesmo item de compra, e Proteínas está em "Carnes" e Congelados em "Congelados"
- **THEN** o item de compra aparece como conflito entre "Carnes" e "Congelados"

#### Scenario: Mesma pasta em duas contratações

- **WHEN** "Carnes" e "Congelados" incluem a mesma pasta Pescados
- **THEN** os insumos de Pescados aparecem como conflito, com os nomes das duas contratações
- **AND** a etapa de segmentação do fluxo fica bloqueada

### Requirement: Anexo de uma contratação

O wizard do anexo quantitativo SHALL permitir escolher a contratação no primeiro passo. Com contratação escolhida, o cálculo MUST devolver só os itens que resolvem para ela e informar quantos itens ficaram de fora, por motivo. A vigência do anexo MUST nascer da vigência da contratação.

#### Scenario: Planejar tudo, comprar só carnes

- **WHEN** o anexo é da contratação "Carnes" e os cardápios usam 180 itens, 42 deles de carnes
- **THEN** o anexo calcula os 42
- **AND** informa "138 itens ficaram para outras contratações ou sem contratação"
