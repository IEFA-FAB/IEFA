# mfa-enrollment (delta)

## ADDED Requirements

### Requirement: Tela de segurança da conta
O sisub SHALL oferecer a rota `/_protected/_modules/diner/security`, acessível a qualquer usuário com `diner` nível 1, exibindo: os fatores cadastrados (nome amigável, tipo e data de cadastro), a quantidade de códigos de recuperação não usados, as sessões ativas e o atalho para `/diner/mcp-keys`. A rota SHALL NOT exigir AAL2 para ser aberta.

#### Scenario: Usuário sem fator abre a tela
- **WHEN** um usuário sem nenhum fator cadastrado abre `/diner/security`
- **THEN** a tela exibe o estado vazio com a ação "Configurar verificação em duas etapas" e nenhum modal de elevação é apresentado

#### Scenario: Usuário com fator abre a tela
- **WHEN** um usuário com um fator TOTP verificado abre `/diner/security`
- **THEN** a tela lista o fator com nome amigável e data, e oferece "Cadastrar segundo dispositivo", "Substituir" e "Remover"

#### Scenario: Cartão de convite no perfil
- **WHEN** um usuário sem fator abre `/diner/profile`
- **THEN** um cartão informa que a conta usa apenas senha e oferece o atalho para a tela de segurança, sem bloquear nada

### Requirement: Cadastro de fator TOTP
O sistema SHALL cadastrar fatores por `supabase.auth.mfa.enroll({ factorType: "totp" })`, apresentando QR code **e** a chave em texto (para máquina sem câmera), e concluindo por `challenge` + `verify`. O sistema SHALL NOT oferecer `factorType: "phone"`.

#### Scenario: Cadastro concluído com sucesso
- **WHEN** o usuário escaneia o QR e digita o código de 6 dígitos correto
- **THEN** o fator fica `verified`, a sessão atual é promovida a AAL2 e o usuário é levado à tela de códigos de recuperação

#### Scenario: Chave em texto para máquina sem câmera
- **WHEN** a tela de cadastro é exibida
- **THEN** a chave secreta é apresentada em texto legível, além do QR code

#### Scenario: Aviso de desconexão antes de concluir
- **WHEN** a tela de verificação do primeiro fator é exibida
- **THEN** ela informa, antes do botão de confirmação, que o usuário será desconectado dos demais dispositivos ao concluir

#### Scenario: Código incorreto duas vezes orienta sobre o relógio
- **WHEN** o usuário erra o código de verificação duas vezes seguidas
- **THEN** a mensagem passa a orientar a conferir se data e hora do aparelho estão em ajuste automático

### Requirement: Reautenticação por senha antes de cadastrar o primeiro fator
O cadastro do **primeiro** fator de uma conta SHALL exigir reautenticação por senha (`auth.reauthenticate()`) imediatamente antes de `mfa.enroll`. Do segundo fator em diante a exigência SHALL NOT ser repetida, porque o GoTrue já responde `403 insufficient_aal` a `enroll` fora de AAL2. Todo cadastro concluído SHALL ser registrado em `access_control.sensitive_operation_log`.

#### Scenario: Primeiro cadastro pede a senha novamente
- **WHEN** um usuário sem nenhum fator inicia o cadastro
- **THEN** o sistema exige a senha da conta antes de gerar o QR code

#### Scenario: Sessão roubada não cadastra o primeiro fator
- **WHEN** uma sessão válida sem conhecimento da senha tenta cadastrar o primeiro fator
- **THEN** o sistema rejeita na etapa de reautenticação, e nenhuma sessão do titular é encerrada

#### Scenario: Segundo fator não repete a senha
- **WHEN** um usuário em AAL2 cadastra o fator reserva
- **THEN** o sistema não pede a senha novamente

#### Scenario: Cadastro fica registrado
- **WHEN** um fator é verificado com sucesso
- **THEN** o evento é gravado em `access_control.sensitive_operation_log` com ator e operação

### Requirement: Fator reserva
O sistema SHALL permitir mais de um fator TOTP por usuário e SHALL oferecer o cadastro de um segundo fator logo após o primeiro. Para **conta protegida** — assim definida a conta cujas permissões efetivas alcançam qualquer operação classificada como `"session"` ou `"fresh"` no registro de classificação — o segundo fator SHALL ser obrigatório: enquanto houver apenas um fator verificado, a conta SHALL NOT satisfazer exigências de garantia de identidade. A condição de conta protegida SHALL ser derivada do registro de classificação, e SHALL NOT ser expressa como um número de nível PBAC.

#### Scenario: Convite ao segundo fator para conta não protegida
- **WHEN** um usuário cujas permissões não alcançam nenhuma operação classificada conclui o cadastro do primeiro fator
- **THEN** a tela oferece cadastrar um segundo dispositivo, com a opção de pular

#### Scenario: Conta protegida não pode pular o fator reserva
- **WHEN** um usuário com `unit` nível 2 — que alcança a execução orçamentária — conclui o cadastro do primeiro fator
- **THEN** a tela exige o cadastro do segundo fator e não oferece a opção de pular

#### Scenario: Conta protegida com um único fator não alcança operação classificada
- **WHEN** um usuário de conta protegida com apenas um fator verificado chama uma server function classificada
- **THEN** o sistema rejeita com `MFA_REQUIRED` e `nextStep: "enroll"`, orientando ao cadastro do fator reserva

#### Scenario: Condição derivada do registro, não de nível
- **WHEN** uma operação passa a ser classificada como `"session"` no registro
- **THEN** as contas cujas permissões a alcançam passam a ser contas protegidas, sem qualquer edição adicional de lista

### Requirement: Desafio de segundo fator no login
Quando a conta tiver ao menos um fator verificado, o login SHALL apresentar, após a senha, a tela de desafio com campo de 6 dígitos e o atalho para código de recuperação (quando disponível para a conta).

#### Scenario: Login com fator cadastrado
- **WHEN** um usuário com fator verificado entra com e-mail e senha corretos
- **THEN** o sistema apresenta a tela de desafio e só conclui o login após verificação, resultando em sessão AAL2

#### Scenario: Login de comensal sem fator
- **WHEN** um usuário sem fator cadastrado entra com e-mail e senha corretos
- **THEN** o login conclui direto em AAL1, sem nenhuma tela adicional

### Requirement: Remoção de fator pelo próprio usuário
A remoção de um fator pelo próprio usuário SHALL exigir sessão em AAL2 (exigência do `mfa.unenroll()`), e o sistema SHALL chamar `refreshSession()` imediatamente após a remoção do último fator verificado.

#### Scenario: Remoção com sessão elevada
- **WHEN** um usuário em AAL2 remove um dos seus fatores
- **THEN** o fator é removido e a lista da tela de segurança é atualizada

#### Scenario: Downgrade imediato após remover o último fator
- **WHEN** um usuário remove o seu último fator verificado
- **THEN** o sistema chama `refreshSession()` na sequência, de modo que a sessão deixe de ser AAL2 imediatamente, sem aguardar o intervalo de refresh

#### Scenario: Remoção a partir de sessão de recuperação de senha é rejeitada
- **WHEN** uma sessão originada do fluxo de recuperação de senha tenta remover um fator
- **THEN** o sistema rejeita a operação

### Requirement: Gestão de sessões ativas
A tela de segurança SHALL listar as sessões ativas e oferecer "Encerrar todas as outras sessões".

#### Scenario: Encerrar as demais sessões
- **WHEN** o usuário aciona "Encerrar todas as outras sessões"
- **THEN** as demais sessões são revogadas e a sessão atual permanece ativa

### Requirement: Aviso de obrigatoriedade não bloqueia navegação
Durante o período de transição para obrigatoriedade, o aviso SHALL ser uma faixa dispensável no topo, nunca um modal bloqueante. Após o prazo, a exigência de cadastro SHALL ser apresentada depois do login bem-sucedido e SHALL manter a ação de sair visível.

#### Scenario: Faixa durante a transição
- **WHEN** um usuário sujeito à obrigatoriedade futura entra no sistema antes do prazo
- **THEN** uma faixa informa a data e oferece configurar agora, sem impedir o uso do sistema

#### Scenario: Tela obrigatória após o prazo
- **WHEN** um usuário sujeito à obrigatoriedade entra após o prazo sem fator cadastrado
- **THEN** o sistema apresenta a tela de cadastro obrigatória, com a ação de sair disponível
