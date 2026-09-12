# sensitive-operation-audit (delta)

## ADDED Requirements

### Requirement: Registro das operações sensíveis
Toda operação classificada como `"session"` ou `"fresh"` SHALL gravar uma linha em `access_control.sensitive_operation_log` com o ator (`actor_id`), o nome da operação, o grau de garantia exigido e a identificação do alvo, **antes** de a resposta ser devolvida ao cliente. O registro SHALL ocorrer no mesmo ponto em que a exigência de garantia é avaliada, de modo que nenhum caminho que passe pelo gate escape do log.

#### Scenario: Concessão de permissão é registrada
- **WHEN** um administrador concede uma permissão a outro usuário
- **THEN** o log recebe uma linha com o ator, `createUserPermissionFn`, o grau exigido e a identificação do usuário e do módulo alvo

#### Scenario: Liquidação é registrada
- **WHEN** um operador registra uma liquidação
- **THEN** o log recebe uma linha com o ator, a operação e a identificação do documento

#### Scenario: Falha da operação não gera registro de sucesso
- **WHEN** uma operação classificada é rejeitada pelo gate de permissão ou de garantia
- **THEN** nenhuma linha de execução bem-sucedida é gravada

#### Scenario: Operação de rotina não polui o log
- **WHEN** um comensal registra a previsão de refeição
- **THEN** nenhuma linha é gravada

### Requirement: Integridade do registro
`access_control.sensitive_operation_log` SHALL ser apenas-inserção para a aplicação: não SHALL existir caminho de aplicação que atualize ou remova linhas. As referências a `auth.users` SHALL usar `on delete restrict`, de modo que a remoção de um usuário não apague a prova de suas ações.

#### Scenario: Aplicação não remove linhas
- **WHEN** se inspeciona a superfície de operações do domínio
- **THEN** não existe operação de update ou delete sobre o log

#### Scenario: Usuário com histórico não pode ser apagado
- **WHEN** se tenta excluir um usuário que figura no log
- **THEN** a restrição de chave estrangeira impede a exclusão

### Requirement: Consulta do registro restrita
A leitura do log SHALL exigir `admin` nível 3. O log SHALL NOT ser exposto por PostgREST ao papel anônimo.

#### Scenario: Administrador consulta o histórico de um usuário
- **WHEN** um administrador com `admin` nível 3 consulta as operações sensíveis de um usuário
- **THEN** o sistema devolve as linhas correspondentes, mais recentes primeiro, com limite e total

#### Scenario: Usuário comum não lê o log
- **WHEN** um usuário sem `admin` nível 3 tenta consultar o log
- **THEN** o sistema rejeita com 403

### Requirement: Canal garantido de aviso de segurança
Eventos de segurança — cadastro de fator, remoção de fator, consumo de código de recuperação e reset administrativo — SHALL ser registrados em banco como canal garantido. A notificação por e-mail SHALL ser entrega adicional best-effort, SHALL NOT ser condição para a operação concluir, e a indisponibilidade do provider SHALL ser reportada pelo endpoint de capacidades do app.

#### Scenario: Sem provider de e-mail, o evento continua registrado
- **WHEN** um evento de segurança ocorre sem provider de e-mail configurado
- **THEN** o registro em banco é gravado e a indisponibilidade aparece no endpoint de capacidades

#### Scenario: Especificação não promete e-mail como garantia
- **WHEN** se audita o comportamento de notificação
- **THEN** nenhuma garantia de entrega por e-mail é afirmada; a garantia é o registro em banco
