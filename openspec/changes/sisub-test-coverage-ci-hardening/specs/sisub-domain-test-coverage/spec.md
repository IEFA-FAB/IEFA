## ADDED Requirements

### Requirement: Schemas do domain layer têm cobertura unitária
Os schemas exportados por `@iefa/sisub-domain` MUST ter testes unitários para payload mínimo válido, payload completo válido e rejeições de campos obrigatórios, UUIDs, datas, inteiros e quantidades.

#### Scenario: Schema aceita payload válido
- **WHEN** um payload válido é passado para um schema do domain layer
- **THEN** `safeParse()` MUST retornar sucesso com os campos normalizados esperados

#### Scenario: Schema rejeita quantidade inválida
- **WHEN** um payload usa quantidade zero, negativa ou não inteira onde a regra exige positivo/inteiro
- **THEN** `safeParse()` MUST retornar falha com path do campo inválido

### Requirement: Guards do domain layer têm testes de permissão
As funções `requirePermission`, `requireKitchen`, `requireUnit` e `requireMessHall` MUST ser testadas com contexto permitido, sem permissão e com escopo divergente.

#### Scenario: Guard permite escopo correto
- **WHEN** `requireKitchen()` recebe contexto com permissão da cozinha exigida
- **THEN** a função MUST NOT lançar erro

#### Scenario: Guard bloqueia escopo errado
- **WHEN** `requireKitchen()` recebe contexto de outra cozinha
- **THEN** a função MUST lançar `PermissionDeniedError`

### Requirement: Operações de receitas têm cobertura de integração
As operações de receitas do domain layer MUST ser testadas com Supabase staging/dev para listagem, criação, versão e filtro de soft delete.

#### Scenario: Receita deletada não é retornada por fetch
- **WHEN** uma receita tem `deleted_at` preenchido
- **THEN** `fetchRecipe()` MUST retornar `NotFoundError`

#### Scenario: Listagem retorna versão mais recente
- **WHEN** uma família de receitas possui versão 1 e versão 2
- **THEN** `listRecipes()` MUST retornar apenas a versão mais recente daquela família

#### Scenario: Criação com ingrediente persiste relações
- **WHEN** `createRecipe()` recebe ingredientes válidos
- **THEN** a receita e suas linhas em `recipe_ingredients` MUST ser persistidas

### Requirement: Operações de planejamento têm cobertura de integração
As operações de planejamento MUST ser testadas para criação de menu diário, adição/remoção/restauração de item, atualização de efetivo e substituições.

#### Scenario: Adicionar item valida cozinha do menu
- **WHEN** `addMenuItem()` é chamado para menu de cozinha A por usuário sem permissão na cozinha A
- **THEN** a operação MUST ser rejeitada

#### Scenario: Remover item usa soft delete
- **WHEN** `removeMenuItem()` é chamado com payload válido
- **THEN** o item MUST ter `deleted_at` preenchido e não aparecer em consultas ativas

#### Scenario: Restaurar item limpa soft delete
- **WHEN** `restoreMenuItem()` é chamado em item deletado
- **THEN** o item MUST voltar a aparecer em consultas ativas

### Requirement: Templates e tipos de refeição têm cobertura
Templates de menu e tipos de refeição MUST ter testes para CRUD, fork, apply, delete/restore e escopo de cozinha.

#### Scenario: Aplicar template cria menus no intervalo
- **WHEN** `applyTemplate()` recebe template válido e intervalo de datas
- **THEN** o sistema MUST criar menus e itens esperados apenas nas datas alvo

#### Scenario: Fork exige leitura na origem e escrita no destino
- **WHEN** usuário tenta copiar template de cozinha sem permissão de leitura
- **THEN** a operação MUST ser rejeitada

#### Scenario: Delete de meal type usa soft delete
- **WHEN** `deleteMealType()` é chamado
- **THEN** a linha MUST receber `deleted_at` e `fetchMealTypes()` MUST NOT retorná-la
