# identity-assurance-guards (delta)

## ADDED Requirements

### Requirement: Garantia de identidade e origem no UserContext
O `UserContext` de `@iefa/pbac` SHALL carregar `aal: 1 | 2`, `lastFactorAt: number | null` e `origin: "session" | "api-key"`. Os valores SHALL ser derivados das claims do JWT já validado por `getUser()`, e SHALL NOT ser lidos do payload da server function. `lastFactorAt` SHALL ser extraído da entrada de `amr` cujo `method` é `totp`, e SHALL NOT ser lido de `amr[0]`.

#### Scenario: Sessão elevada popula o contexto
- **WHEN** uma server function é chamada por uma sessão que verificou TOTP
- **THEN** o `UserContext` traz `aal: 2`, `origin: "session"` e `lastFactorAt` igual ao timestamp da verificação

#### Scenario: Refresh de token não renova a elevação
- **WHEN** o `amr` contém `token_refresh` como entrada mais recente e `totp` numa entrada anterior
- **THEN** `lastFactorAt` reflete o timestamp do `totp`, e não o do refresh

#### Scenario: Payload não influencia o AAL
- **WHEN** o cliente envia `aal: 2` no corpo da requisição de uma sessão AAL1
- **THEN** o `UserContext` permanece com `aal: 1`

#### Scenario: Ausência da claim é tratada como AAL1
- **WHEN** o JWT não traz a claim `aal`
- **THEN** o `UserContext` assume `aal: 1`

### Requirement: Piso de garantia em todos os pontos de autorização
A avaliação de garantia SHALL ser uma função pura de `@iefa/pbac` e SHALL ser aplicada nos **três** pontos por onde a autorização do ERP passa: `requireLevel`/`requireAnyLevel` de `@iefa/pbac/start`, `requireAuthWithPermission` de `apps/sisub/src/lib/auth.server.ts` (por onde passam `requireUnitScope` e `requireStorageForKitchen`) e os guards de `packages/sisub-domain/src/guards/`. Nenhum caminho de autorização SHALL ficar sem o eixo de garantia disponível. A exigência tem dois graus: `"session"` (exige `aal === 2`) e `"fresh"` (exige `aal === 2` e `lastFactorAt` dentro da janela de elevação de 15 minutos). A exigência SHALL ser avaliada **depois** do gate de módulo e nível, de modo que quem não tem permissão receba negativa de permissão, e não pedido de elevação.

#### Scenario: Grau session satisfeito
- **WHEN** uma sessão AAL2 cuja verificação ocorreu há 3 horas chama uma operação de grau `session`
- **THEN** a operação executa normalmente

#### Scenario: Grau fresh vencido
- **WHEN** uma sessão AAL2 cuja verificação ocorreu há 40 minutos chama uma operação de grau `fresh`
- **THEN** o sistema rejeita com `MFA_REQUIRED` e `nextStep: "step-up"`

#### Scenario: Execução orçamentária é alcançada pelo gate
- **WHEN** uma server function de empenho classificada como `"session"` é chamada por sessão AAL1 através de `requireUnitScope`
- **THEN** o sistema rejeita com `MFA_REQUIRED`, sem executar nenhuma escrita no banco

#### Scenario: Guard de domínio também aplica a exigência
- **WHEN** uma operation do `sisub-domain` classificada é chamada com um `ctx` cuja garantia não satisfaz a exigência
- **THEN** a operation rejeita antes de qualquer escrita

#### Scenario: Sem permissão não vira pedido de elevação
- **WHEN** um usuário sem o módulo e nível exigidos chama uma operação protegida
- **THEN** o sistema rejeita por permissão, sem apresentar desafio de segundo fator

### Requirement: Fonte única de classificação
A classificação de garantia SHALL residir em **um único** registro versionado, por operação, coberto por testes. Qualquer visão derivada — quais módulos e níveis alcançam operação classificada, quais contas são protegidas — SHALL ser computada a partir desse registro, e SHALL NOT ser mantida como segunda lista escrita à mão. O sistema SHALL NOT permitir que configuração em banco reduza a exigência definida em código.

#### Scenario: Visão por conta é derivada
- **WHEN** se determina se uma conta é protegida
- **THEN** o resultado é computado das permissões efetivas cruzadas com o registro, sem consultar nenhuma lista paralela

#### Scenario: Configuração em banco não reduz a exigência
- **WHEN** existe configuração em banco indicando exigência menor que a do registro para a mesma operação
- **THEN** a exigência aplicada é a do registro

#### Scenario: Registro sem exigências preserva o comportamento atual
- **WHEN** todas as operações estão classificadas como `"none"`
- **THEN** nenhuma operação exige AAL2 e o comportamento de autorização é idêntico ao anterior à mudança

### Requirement: Erro tipado com próximo passo
A negativa por garantia de identidade SHALL ser um erro tipado com `code: "MFA_REQUIRED"`, um `nextStep` em `"enroll" | "challenge" | "step-up"` e um `reason` legível descrevendo a operação. O status HTTP SHALL ser sinalizado antes do lançamento, seguindo o padrão de `unauthorized()`/`forbidden()` em `@iefa/pbac/start`.

#### Scenario: Conta sem fator recebe nextStep enroll
- **WHEN** um usuário sem nenhum fator verificado chama uma operação protegida
- **THEN** o erro traz `nextStep: "enroll"`

#### Scenario: Sessão AAL1 com fator recebe nextStep challenge
- **WHEN** um usuário com fator verificado, em sessão AAL1, chama uma operação protegida
- **THEN** o erro traz `nextStep: "challenge"`

#### Scenario: Motivo legível acompanha a negativa
- **WHEN** a concessão de permissão é recusada por elevação vencida
- **THEN** o erro traz um `reason` que descreve a operação, apto a ser exibido no modal

### Requirement: Elevação nunca é exigida em leitura ou guard de rota
Os guards de rota (`beforeLoad`) e as server functions de leitura SHALL NOT exigir garantia de identidade. A exigência SHALL ser aplicada apenas em server functions de mutação e em ações explícitas de exportação de dados.

#### Scenario: Navegação para tela administrativa não pede código
- **WHEN** um administrador abre a tela de gestão de permissões
- **THEN** a tela carrega sem qualquer desafio de segundo fator

#### Scenario: Exportação pede elevação, a tela não
- **WHEN** o usuário abre uma tela que lista dados nominais e em seguida aciona a exportação
- **THEN** a tela abre livremente e apenas a ação de exportar exige elevação

### Requirement: Credencial de API nunca satisfaz exigência de garantia
O `UserContext` resolvido a partir de chave de API SHALL ter `origin: "api-key"` e `aal: 1`, e SHALL NOT satisfazer nenhum grau de exigência de garantia. A negativa SHALL informar que a operação não é acessível por chave de API.

#### Scenario: Chave de API barrada em operação protegida
- **WHEN** uma requisição autenticada por chave de API alcança uma operação com exigência de garantia
- **THEN** o sistema rejeita com mensagem indicando que chaves de API não executam essa operação

#### Scenario: Chave de API segue operando o que não é protegido
- **WHEN** uma requisição autenticada por chave de API chama uma listagem permitida pelas permissões do dono
- **THEN** a operação executa normalmente

### Requirement: Elevação preserva o trabalho em andamento
A camada de cliente SHALL tratar `MFA_REQUIRED` apresentando um modal sobre a tela atual, preservando o formulário preenchido, e SHALL reexecutar a mesma mutação com o mesmo payload após a verificação. O sistema SHALL NOT redirecionar para a tela de login, e o cancelamento SHALL NOT encerrar a sessão.

#### Scenario: Reenvio após elevação
- **WHEN** uma mutação falha com `MFA_REQUIRED` e o usuário conclui a verificação no modal
- **THEN** a mesma mutação é reexecutada com o payload original e conclui com sucesso

#### Scenario: Cancelamento preserva o formulário
- **WHEN** o usuário cancela o modal de elevação
- **THEN** o formulário permanece preenchido, a sessão permanece ativa e nenhuma alteração é gravada

#### Scenario: Cadastro no meio da operação preserva a aba atual
- **WHEN** um usuário sem fator conclui o cadastro a partir do modal aberto sobre um formulário preenchido
- **THEN** a sessão atual é promovida a AAL2, o formulário continua preenchido e a mutação é reexecutada

### Requirement: Classificação exaustiva das server functions de mutação
Toda server function de mutação do sisub SHALL estar classificada num registro declarativo como `"none"`, `"session"` ou `"fresh"`. Um teste de contrato SHALL varrer o diretório de server functions e falhar quando existir função de mutação não classificada.

#### Scenario: Função nova sem classificação reprova a suíte
- **WHEN** uma nova server function de mutação é adicionada sem entrada no registro
- **THEN** o teste de contrato falha apontando o nome da função

#### Scenario: Operações críticas exigem grau fresh
- **WHEN** o registro é verificado para concessão de permissão, criação de chave MCP, concessão a parceiro externo, reset de ambiente de treino, exportação de dados nominais e remoção de MFA de terceiro
- **THEN** todas estão classificadas como `"fresh"`

#### Scenario: Operações financeiras exigem grau session
- **WHEN** o registro é verificado para empenho, liquidação, pagamento e conciliação
- **THEN** todas estão classificadas como `"session"`
