## ADDED Requirements

### Requirement: Auto-save de respostas em draft
O sistema SHALL salvar cada resposta individualmente no banco com `status='draft'` imediatamente após o usuário interagir com o campo correspondente.

#### Scenario: Resposta de campo de texto (onBlur)
- **WHEN** o usuário preenche um campo de texto e move o foco para fora dele
- **THEN** o sistema faz upsert em `forms.answers` com `status='draft'` para aquela pergunta

#### Scenario: Resposta de escolha única (onChange)
- **WHEN** o usuário seleciona uma opção em uma pergunta `single_choice`
- **THEN** o sistema faz upsert imediato em `forms.answers` com `status='draft'`

#### Scenario: Resposta de múltipla escolha (onChange)
- **WHEN** o usuário marca ou desmarca uma opção em uma pergunta `multiple_choice`
- **THEN** o sistema faz upsert imediato em `forms.answers` com o array atualizado de opções selecionadas e `status='draft'`

#### Scenario: Resposta de avaliação/rating (onChange)
- **WHEN** o usuário seleciona um valor em uma pergunta `rating`
- **THEN** o sistema faz upsert imediato em `forms.answers` com `status='draft'`

#### Scenario: Falha no auto-save
- **WHEN** o upsert falha (erro de rede ou Supabase)
- **THEN** o sistema exibe um indicador visual discreto de erro e mantém o valor no estado local para nova tentativa

### Requirement: Recuperação de estado ao retornar
O sistema SHALL recuperar todas as respostas `draft` do usuário para um questionário ao acessar a tela de resposta, reconstituindo o estado de preenchimento.

#### Scenario: Usuário retorna a questionário com rascunho
- **WHEN** o usuário acessa `/questionnaires/:id` e possui respostas `draft` salvas
- **THEN** o sistema carrega as respostas `draft` e pré-preenche todos os campos com os valores salvos

#### Scenario: Usuário acessa questionário pela primeira vez
- **WHEN** o usuário acessa `/questionnaires/:id` sem nenhuma resposta salva
- **THEN** o sistema exibe todos os campos em branco

#### Scenario: Indicador de respostas salvas automaticamente
- **WHEN** respostas `draft` foram carregadas ou recém salvas
- **THEN** o sistema exibe indicador "Respostas salvas automaticamente" na interface

### Requirement: Envio oficial do questionário
O sistema SHALL permitir que o usuário envie o questionário, alterando todas as suas respostas para `status='sent'`.

#### Scenario: Envio com todas as perguntas obrigatórias respondidas
- **WHEN** o usuário clica em "Enviar questionário" com todas as perguntas `required=true` preenchidas
- **THEN** o sistema atualiza `status='sent'` para todas as respostas do usuário naquele questionário e redireciona para `/questionnaires/:id/success`

#### Scenario: Envio com pergunta obrigatória em branco
- **WHEN** o usuário clica em "Enviar questionário" mas há pergunta com `required=true` sem resposta
- **THEN** o sistema NÃO envia, realça visualmente as perguntas obrigatórias não respondidas e exibe mensagem "Responda todas as perguntas obrigatórias antes de enviar"

#### Scenario: Confirmação de envio
- **WHEN** o envio é bem-sucedido
- **THEN** o sistema exibe tela de confirmação com mensagem "Questionário enviado com sucesso" e link para voltar à lista

### Requirement: Bloqueio de reenvio
O sistema SHALL impedir que um usuário envie respostas para um questionário que já submeteu.

#### Scenario: Usuário tenta acessar questionário já respondido
- **WHEN** o usuário acessa `/questionnaires/:id` e já possui respostas `status='sent'`
- **THEN** o sistema exibe tela informando "Você já respondeu este questionário" sem mostrar os campos de resposta

#### Scenario: Usuário tenta submeter com respostas já sent
- **WHEN** o sistema detecta no momento do submit que já existem respostas `sent` para o par `(questionnaire_id, user_id)`
- **THEN** o sistema aborta o envio e exibe mensagem de aviso, sem alterar as respostas existentes
