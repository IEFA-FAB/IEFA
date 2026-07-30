## ADDED Requirements

### Requirement: Edição local de ativo global produz fork, não erro

Quando um usuário edita um ativo global a partir de um contexto local (cozinha), o sistema SHALL preservar o ativo global intacto e criar um fork local pertencente àquela cozinha, contendo as alterações. O comportamento é copy-on-write, análogo a um branch de git: o upstream não é tocado.

#### Scenario: Global permanece intacto

- **WHEN** um usuário edita, a partir do contexto de uma cozinha, uma receita cujo `kitchen_id` é nulo
- **THEN** a linha global original permanece inalterada, com o mesmo conteúdo e a mesma versão
- **AND** uma nova linha é criada com `kitchen_id` da cozinha do contexto

#### Scenario: Fork registra a linhagem

- **WHEN** um fork local de um ativo global é criado
- **THEN** o fork referencia o ativo global como base, tornando a linhagem rastreável

#### Scenario: Fork copia o conteúdo dependente

- **WHEN** um fork de receita global é criado
- **THEN** os ingredientes e o fluxo de produção da receita são copiados para o fork, com as referências remapeadas para as linhas do fork

#### Scenario: Edição local não exige permissão global

- **WHEN** um usuário com `kitchen:2` escopado na sua cozinha e sem permissão global edita um ativo global daquele contexto
- **THEN** a operação é permitida e resulta em fork local

#### Scenario: Fork de template global

- **WHEN** um usuário edita, a partir do contexto de uma cozinha, um template de cardápio cujo `kitchen_id` é nulo
- **THEN** o template global permanece intacto e um fork local é criado referenciando-o como base

### Requirement: O contexto decide entre fork e versão global

O sistema SHALL decidir entre criar fork local e versionar o ativo global com base no **contexto explícito da edição**, informado pela requisição, e não inferido a partir das permissões do usuário.

#### Scenario: Contexto de cozinha sempre forka

- **WHEN** um usuário que possui `global:2` **e** `kitchen:2` edita um ativo global a partir do contexto de uma cozinha
- **THEN** um fork local é criado
- **AND** o ativo global permanece intacto

#### Scenario: Contexto global versiona o global

- **WHEN** um usuário com `global:2` edita um ativo global a partir do contexto da administração global
- **THEN** uma nova versão global é criada e nenhum fork local é gerado

#### Scenario: Contexto ausente é rejeitado

- **WHEN** uma edição de ativo global é submetida sem declarar o contexto
- **THEN** a operação é rejeitada, sem escolher um comportamento por padrão

### Requirement: Um fork por cozinha por linhagem

O sistema SHALL manter no máximo um fork ativo por cozinha para cada linhagem de ativo global. Edições subsequentes da mesma cozinha SHALL versionar o fork existente, não criar um segundo fork.

#### Scenario: Segunda edição versiona o fork

- **WHEN** uma cozinha que já possui fork de um ativo global edita esse ativo novamente
- **THEN** uma nova versão do fork local é criada
- **AND** nenhum segundo fork da mesma linhagem é criado para aquela cozinha

#### Scenario: Cozinhas diferentes forkam independentemente

- **WHEN** duas cozinhas distintas editam o mesmo ativo global
- **THEN** cada uma recebe o próprio fork, isolado do da outra

#### Scenario: Fork removido libera nova bifurcação

- **WHEN** uma cozinha remove o próprio fork e edita o ativo global novamente
- **THEN** um novo fork é criado

### Requirement: Fork local prevalece sobre o global na visão da cozinha

O sistema SHALL exibir, na listagem de uma cozinha, o fork local em lugar do ativo global de origem, independentemente dos números de versão das duas linhas. O fork sombreia o upstream apenas na visão daquela cozinha.

#### Scenario: Cozinha com fork vê o fork

- **WHEN** a listagem de receitas de uma cozinha que possui fork de uma receita global é consultada
- **THEN** o fork local aparece e a receita global de origem não aparece duplicada

#### Scenario: Nova versão global não sobrepõe o fork

- **WHEN** a SDAB publica uma nova versão do ativo global após uma cozinha ter criado seu fork
- **THEN** a cozinha com fork continua vendo o próprio fork
- **AND** a precedência não depende de comparação de número de versão entre fork e global

#### Scenario: Cozinha sem fork vê o global

- **WHEN** a listagem de uma cozinha que não possui fork daquela linhagem é consultada
- **THEN** o ativo global aparece

#### Scenario: Visão global ignora forks

- **WHEN** a listagem da administração global é consultada
- **THEN** apenas ativos globais aparecem, nenhum fork local

### Requirement: Fork é sinalizado na interface

O sistema SHALL indicar na interface quando um ativo exibido é fork local de um ativo global, e SHALL informar ao usuário, antes de salvar, que a edição de um ativo global no contexto local criará uma cópia local.

#### Scenario: Aviso antes de forkar

- **WHEN** um usuário abre para edição um ativo global no contexto de uma cozinha
- **THEN** a interface informa que salvar criará uma cópia local e que o ativo global não será alterado

#### Scenario: Fork identificado na listagem

- **WHEN** um fork local é exibido em uma listagem
- **THEN** ele é identificado como cópia local, com referência ao ativo global de origem

#### Scenario: Divergência do upstream é visível

- **WHEN** o ativo global de origem recebeu nova versão depois da criação do fork
- **THEN** a interface sinaliza que existe versão mais nova no ativo global de origem
