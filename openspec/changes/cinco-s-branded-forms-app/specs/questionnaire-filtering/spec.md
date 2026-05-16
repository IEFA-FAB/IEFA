## ADDED Requirements

### Requirement: Coluna tags na tabela questionnaire
A tabela `forms.questionnaire` DEVE ter uma coluna `tags text[] NOT NULL DEFAULT '{}'` com índice GIN para filtragem eficiente.

#### Scenario: Migration aditiva
- **WHEN** a migration é executada
- **THEN** a coluna `tags` é adicionada à tabela `forms.questionnaire` sem afetar registros existentes (default `'{}'`)

#### Scenario: Índice GIN criado
- **WHEN** a migration é executada
- **THEN** um índice GIN é criado em `forms.questionnaire(tags)` para suportar queries com operador `@>`

### Requirement: Server function aceita filtro por tags
A server function `getQuestionnairesFn` DEVE aceitar um parâmetro opcional `tags` (array de strings). Quando presente, retorna apenas questionários cuja coluna `tags` contenha todos os valores especificados.

#### Scenario: Sem filtro (comportamento padrão)
- **WHEN** `getQuestionnairesFn` é chamada sem parâmetro `tags`
- **THEN** retorna todos os questionários (comportamento inalterado)

#### Scenario: Filtro por tag "5s"
- **WHEN** `getQuestionnairesFn` é chamada com `tags: ["5s"]`
- **THEN** retorna apenas questionários cujo campo `tags` contém `"5s"`

#### Scenario: Validação de tags
- **WHEN** `getQuestionnairesFn` recebe `tags` com valores inválidos
- **THEN** a validação Zod rejeita a request

### Requirement: Dashboard filtra automaticamente por tenant
O dashboard (`/_authenticated/dashboard`) DEVE aplicar o filtro de tags do tenant ativo automaticamente ao buscar questionários. No tenant `"forms"`, nenhum filtro é aplicado. No tenant `"cinco-s"`, apenas questionários com tag `"5s"` são exibidos.

#### Scenario: Dashboard no tenant forms
- **WHEN** o dashboard é acessado com tenant `"forms"`
- **THEN** todos os questionários são exibidos (incluindo os com tag `"5s"`)

#### Scenario: Dashboard no tenant cinco-s
- **WHEN** o dashboard é acessado com tenant `"cinco-s"`
- **THEN** apenas questionários com tag `"5s"` são exibidos

### Requirement: Criação de questionário herda tags do tenant
Ao criar um questionário no tenant `"cinco-s"`, o sistema DEVE automaticamente incluir a tag `"5s"` no array `tags` do novo questionário.

#### Scenario: Criar questionário no tenant cinco-s
- **WHEN** um questionário é criado via `createQuestionnaireFn` no tenant `"cinco-s"`
- **THEN** o questionário é salvo com `tags: ["5s"]`

#### Scenario: Criar questionário no tenant forms
- **WHEN** um questionário é criado via `createQuestionnaireFn` no tenant `"forms"`
- **THEN** o questionário é salvo com `tags: []` (default, sem tag)

### Requirement: Tag visível no forms genérico
No tenant `"forms"`, questionários com tag `"5s"` DEVEM exibir um badge indicando que pertencem ao programa 5S.

#### Scenario: Badge 5S no dashboard forms
- **WHEN** o dashboard do tenant `"forms"` lista um questionário com tag `"5s"`
- **THEN** um badge "5S" é exibido ao lado do título do questionário
