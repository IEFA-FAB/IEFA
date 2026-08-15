## ADDED Requirements

### Requirement: Console de acesso organizado por usuários e políticas

O sistema SHALL apresentar a gestão de acesso da SDAB em duas visões: uma orientada a usuários e outra orientada a políticas, ambas na rota de permissões do módulo global.

#### Scenario: Visão de usuário mostra as três camadas

- **WHEN** um administrador seleciona um usuário
- **THEN** são exibidas as políticas anexadas, os grants inline e as permissões efetivas resultantes, em seções distintas

#### Scenario: Visão de políticas lista todas as políticas

- **WHEN** um administrador abre a visão de políticas
- **THEN** todas as políticas não removidas são listadas com nome, descrição, quantidade de statements e quantidade de usuários anexados
- **AND** políticas gerenciadas são identificadas como tal

#### Scenario: Busca de usuário exige gate de escrita global

- **WHEN** um usuário sem `global:2` acessa o console
- **THEN** a busca de usuários e todas as mutações são indisponíveis

### Requirement: Gestão de políticas pelo console

O sistema SHALL permitir criar, renomear, descrever e remover políticas customizadas, e adicionar, editar e remover statements dessas políticas.

#### Scenario: Criação de política customizada

- **WHEN** um administrador cria uma política informando nome e descrição
- **THEN** a política é criada como não gerenciada e sem statements

#### Scenario: Statement é adicionado com escopo condicional

- **WHEN** um administrador adiciona um statement escolhendo o módulo
- **THEN** apenas os tipos de escopo válidos para aquele módulo são oferecidos
- **AND** o seletor de escopo específico aparece somente quando o tipo de escopo o exige

#### Scenario: Política gerenciada é somente leitura na UI

- **WHEN** um administrador abre uma política gerenciada
- **THEN** os controles de edição e remoção estão desabilitados com a razão explicada

#### Scenario: Remoção de política em uso avisa o impacto

- **WHEN** um administrador remove uma política anexada a usuários
- **THEN** a confirmação informa quantos usuários perderão as permissões dela

### Requirement: Anexo de política pelo console

O sistema SHALL permitir anexar e desanexar políticas de um usuário diretamente na visão de usuário.

#### Scenario: Anexo reflete nas permissões efetivas

- **WHEN** um administrador anexa uma política a um usuário
- **THEN** a lista de permissões efetivas do usuário é atualizada na mesma tela

#### Scenario: Desanexo pede confirmação

- **WHEN** um administrador desanexa uma política
- **THEN** uma confirmação é exigida antes da revogação

#### Scenario: Políticas já anexadas não são reofertadas

- **WHEN** o seletor de políticas para anexo é aberto
- **THEN** políticas já anexadas ao usuário não aparecem como opção

### Requirement: Rastreabilidade da origem na UI

O sistema SHALL exibir, para cada permissão efetiva listada, a origem que a concedeu.

#### Scenario: Origem de política é exibida

- **WHEN** uma permissão efetiva vem de uma política anexada
- **THEN** o nome da política é exibido junto à permissão

#### Scenario: Origem inline é exibida

- **WHEN** uma permissão efetiva vem de um grant direto
- **THEN** ela é identificada como inline

#### Scenario: Permissão anulada por deny é sinalizada

- **WHEN** um allow é anulado por um deny de qualquer origem
- **THEN** a UI sinaliza que a permissão está negada e por qual origem

### Requirement: Console segue o design system do sisub

O sistema SHALL renderizar o console usando os primitivos de UI existentes do sisub e as proibições visuais do monorepo.

#### Scenario: Componentes de seleção usam Base UI

- **WHEN** qualquer seletor do console é renderizado
- **THEN** ele usa `@base-ui/react/*` por meio dos primitivos do app, nunca Radix UI nem `<option>` nativo

#### Scenario: Nenhuma faixa de acento lateral

- **WHEN** cards, itens de lista, callouts ou alertas do console são renderizados
- **THEN** nenhum usa `border-l-*`/`border-r-*` acima de 1px como acento colorido
