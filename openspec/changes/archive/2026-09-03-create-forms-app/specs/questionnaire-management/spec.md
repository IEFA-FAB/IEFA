## ADDED Requirements

### Requirement: Listagem de questionários disponíveis
O sistema SHALL exibir na rota `/` todos os questionários cadastrados no schema `forms`, acessíveis a qualquer usuário autenticado.

#### Scenario: Usuário autenticado acessa a home
- **WHEN** um usuário autenticado acessa `/`
- **THEN** o sistema exibe a lista de questionários com título, descrição e um botão para responder cada um

#### Scenario: Nenhum questionário cadastrado
- **WHEN** a tabela `forms.questionnaires` está vazia
- **THEN** o sistema exibe um estado vazio com mensagem "Nenhum questionário disponível no momento"

#### Scenario: Questionário já respondido (status sent)
- **WHEN** o usuário já submeteu respostas (`status='sent'`) para um questionário
- **THEN** o card desse questionário exibe indicador "Respondido" e o botão está desabilitado

#### Scenario: Questionário com rascunho salvo (status draft)
- **WHEN** o usuário tem respostas `draft` salvas para um questionário mas ainda não submeteu
- **THEN** o card exibe indicador "Em andamento" e o botão permite continuar

### Requirement: Visualização de sessões e perguntas
O sistema SHALL organizar as perguntas por sessão na tela de resposta, respeitando a ordem (`order`) definida nas tabelas `sessions` e `questions`.

#### Scenario: Questionário com múltiplas sessões
- **WHEN** o usuário acessa `/questionnaires/:id`
- **THEN** o sistema exibe as sessões em ordem, cada uma com seu título e perguntas correspondentes

#### Scenario: Questionário com sessão única
- **WHEN** o questionário tem apenas uma sessão
- **THEN** o sistema exibe as perguntas sem separação visual de sessão (apenas o título geral do questionário)
