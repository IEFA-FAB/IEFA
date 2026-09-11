# mfa-recovery (delta)

## ADDED Requirements

### Requirement: Geração e armazenamento de códigos de recuperação
Ao concluir o cadastro do primeiro fator, o sistema SHALL gerar 10 códigos de recuperação aleatórios de alta entropia, exibi-los **uma única vez** e persistir apenas o hash SHA-256 de cada um em `access_control.mfa_recovery_code`, seguindo o mesmo padrão de `access_control.mcp_api_keys.key_hash`. O texto claro SHALL NOT ser persistido nem registrado em log ou telemetria.

#### Scenario: Códigos exibidos uma única vez
- **WHEN** o usuário conclui a verificação do primeiro fator
- **THEN** o sistema exibe os 10 códigos com as ações copiar, baixar e imprimir, e informa que eles não serão mostrados novamente

#### Scenario: Confirmação explícita antes de sair da tela
- **WHEN** a tela de códigos é exibida
- **THEN** o botão de conclusão permanece desabilitado até o usuário marcar que guardou os códigos

#### Scenario: Somente o hash é persistido
- **WHEN** os códigos são gerados
- **THEN** a tabela `access_control.mfa_recovery_code` contém apenas `code_hash`, e nenhuma coluna guarda o código em texto claro

#### Scenario: Regeração invalida os códigos anteriores
- **WHEN** o usuário gera novos códigos de recuperação
- **THEN** todos os códigos anteriores não usados tornam-se inválidos

### Requirement: Códigos de recuperação indisponíveis para conta protegida
**Conta protegida** é aquela cujas permissões efetivas alcançam qualquer operação classificada como `"session"` ou `"fresh"`. Conta protegida SHALL NOT dispor de códigos de recuperação; seus caminhos de recuperação são o fator reserva e o reset administrativo. A condição SHALL ser derivada do registro de classificação, e SHALL NOT ser expressa como um número de nível PBAC.

#### Scenario: Operador de execução orçamentária não recebe códigos
- **WHEN** um usuário com `unit` nível 2 — que alcança empenho e liquidação — conclui o cadastro do fator
- **THEN** o sistema não gera códigos de recuperação e orienta ao cadastro do fator reserva

#### Scenario: Comensal com fator voluntário recebe códigos
- **WHEN** um usuário apenas com `diner` conclui o cadastro voluntário de um fator
- **THEN** o sistema gera os códigos de recuperação normalmente

#### Scenario: Atalho de código de recuperação ausente no desafio
- **WHEN** um usuário de conta protegida chega à tela de desafio de segundo fator
- **THEN** o atalho "Usar um código de recuperação" não é apresentado

#### Scenario: Conta que vira protegida perde os códigos
- **WHEN** um usuário passa a ter permissão que alcança operação classificada
- **THEN** os códigos de recuperação dele são invalidados e o sistema passa a exigir fator reserva

### Requirement: Uso de código de recuperação remove o fator
O consumo de um código de recuperação SHALL, numa única transação lógica: validar o hash, marcar o código como usado (`used_at`), remover os fatores verificados do usuário via `auth.admin.mfa.deleteFactor`, chamar `refreshSession()` e registrar a ocorrência em `access_control.mfa_reset_log` com `method = 'recovery-code'`. O código de recuperação SHALL NOT produzir sessão AAL2.

#### Scenario: Recuperação bem-sucedida
- **WHEN** um usuário em sessão AAL1 informa um código de recuperação válido e não usado
- **THEN** os fatores são removidos, a sessão permanece AAL1 e o usuário é levado à tela obrigatória de cadastro de novo fator

#### Scenario: Código já usado é rejeitado
- **WHEN** um usuário informa um código de recuperação com `used_at` preenchido
- **THEN** o sistema rejeita sem remover nenhum fator

#### Scenario: Operações protegidas seguem inacessíveis até o recadastro
- **WHEN** um usuário que acabou de usar um código de recuperação chama uma server function que exige garantia de identidade
- **THEN** o sistema rejeita com `MFA_REQUIRED`, porque ele ainda não provou um segundo fator

#### Scenario: Consumo é registrado de forma garantida
- **WHEN** um código de recuperação é consumido
- **THEN** o evento é gravado em `access_control.mfa_reset_log` e em `access_control.sensitive_operation_log` antes de a resposta ser devolvida

### Requirement: Limite de tentativas que não vira negação de serviço
A verificação de código de recuperação SHALL ser limitada no servidor pelo par (usuário, origem da requisição), com teto global por usuário mais alto que o teto por origem, e SHALL NOT depender do `sessionStorage` usado por `@iefa/auth-kit/rate-limiter`. O bloqueio SHALL NOT alcançar o caminho de reset administrativo.

#### Scenario: Tentativas sucessivas inválidas da mesma origem bloqueiam
- **WHEN** uma mesma origem envia códigos de recuperação inválidos acima do limite para um usuário
- **THEN** o sistema passa a rejeitar novas tentativas daquela origem por um período

#### Scenario: Terceiro não tranca a recuperação da vítima
- **WHEN** um atacante esgota o limite de tentativas contra o e-mail de uma vítima
- **THEN** a vítima, a partir de outra origem, ainda consegue tentar seu código de recuperação dentro do teto global

#### Scenario: Reset administrativo não é bloqueado pelo limite
- **WHEN** o limite de tentativas de um usuário está esgotado
- **THEN** o reset administrativo daquele usuário continua disponível

### Requirement: Reset administrativo de MFA
A remoção do MFA de outro usuário SHALL exigir que o administrador tenha `admin` nível 3 **e** elevação de identidade fresca. A tela SHALL exigir confirmação explícita de que a identidade do titular foi verificada por canal que não seja o e-mail, e uma justificativa textual. A operação SHALL registrar `access_control.mfa_reset_log` com `method = 'admin-reset'`, `target_user_id`, `performed_by` e `reason`. A notificação por e-mail ao titular SHALL ser tentada como entrega adicional best-effort e SHALL NOT ser condição para a operação concluir; a ausência de provider de e-mail configurado SHALL ser reportada pelo endpoint de capacidades do app, e SHALL NOT falhar em silêncio.

#### Scenario: Reset com todas as travas satisfeitas
- **WHEN** um administrador em elevação fresca confirma a verificação por canal alternativo, preenche a justificativa e confirma a operação
- **THEN** os fatores do titular são removidos, o titular é desconectado de todas as sessões e o log é gravado antes da resposta

#### Scenario: Administrador sem elevação fresca é barrado
- **WHEN** um administrador cuja última verificação de fator excede a janela de elevação aciona o reset
- **THEN** o sistema apresenta o desafio de elevação antes de executar, e não remove nada enquanto ele não for concluído

#### Scenario: Falha de e-mail não impede o registro nem a operação
- **WHEN** o provider de e-mail não está configurado e um reset administrativo é executado
- **THEN** a operação conclui, o log é gravado, e o endpoint de capacidades reporta o e-mail como indisponível

#### Scenario: Justificativa vazia é rejeitada
- **WHEN** o administrador confirma o reset sem preencher a justificativa
- **THEN** o sistema rejeita a operação

#### Scenario: Log preservado mesmo com usuário removido
- **WHEN** se tenta excluir um usuário que figura em `mfa_reset_log`
- **THEN** a restrição de chave estrangeira impede a exclusão, preservando a prova de quem removeu o MFA de quem

### Requirement: Recuperação de senha não contorna o segundo fator
Uma sessão originada do fluxo de recuperação de senha SHALL NOT permitir remover fatores, consumir código de recuperação para remoção, nem alcançar operações que exijam garantia de identidade.

#### Scenario: Sessão de recovery não remove fator
- **WHEN** um usuário conclui a redefinição de senha por link de e-mail e tenta remover o fator cadastrado
- **THEN** o sistema rejeita a operação

#### Scenario: Sessão de recovery ainda enfrenta o desafio
- **WHEN** um usuário com fator verificado conclui a redefinição de senha
- **THEN** o acesso às operações protegidas continua exigindo a verificação do segundo fator
