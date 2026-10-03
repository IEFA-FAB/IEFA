## ADDED Requirements

### Requirement: Vínculo de SARAM só por verificação

O SARAM de uma conta SHALL ser vinculado apenas por uma das verificações: chave do e-mail institucional (`email`), SARAM + CPF conferidos no cadastro (`cpf`) ou decisão de administrador (`admin`). Vínculos anteriores à verificação SHALL ser marcados `legacy`. Gravação de SARAM fora das funções de vínculo MUST ficar sem verificação e MUST NOT dar acesso a dado militar.

#### Scenario: Sugestão pelo e-mail

- **WHEN** a conta `fulanosilvajs@fab.mil.br`, com e-mail confirmado e sem vínculo, consulta o estado, e o cadastro tem um único militar com chave `fulanosilvajs`
- **THEN** o estado é `suggestion` com posto, nome de guerra e OM do candidato, sem SARAM, CPF ou nome completo
- **AND** confirmar vincula o SARAM com `saram_verified_by = 'email'`

#### Scenario: Prefixo `tp.` e dígito de homônimo

- **WHEN** o e-mail é `tp.fulanosilvajs2@fab.mil.br`
- **THEN** a chave é `fulanosilvajs` e a confirmação exige os 4 últimos dígitos do CPF, mesmo com um único candidato

#### Scenario: Homônimos

- **WHEN** a chave do e-mail tem dois militares no cadastro
- **THEN** o estado é `homonyms` com os dois candidatos (posto, nome de guerra, OM)
- **AND** só vincula o candidato cujos 4 últimos dígitos do CPF conferem

#### Scenario: Ninguém além da própria chave

- **WHEN** a conta pede um candidato que não é da chave do próprio e-mail
- **THEN** a confirmação é recusada com `CANDIDATE_NOT_FOUND`

#### Scenario: E-mail de fora ou não confirmado

- **WHEN** o e-mail da sessão não é exatamente `@fab.mil.br` ou não está confirmado
- **THEN** não há sugestão e o estado é `no_match` com o motivo em `emailEligibility`

### Requirement: Conferência por CPF com limite de tentativas

A conta SHALL poder vincular informando SARAM e CPF completo, conferidos no banco sem que o CPF saia dele. Falhas MUST ser registradas no banco por conta e por SARAM; com 5 falhas na última hora, a verificação MUST ficar bloqueada até a 5ª falha mais recente sair da janela. A resposta MUST ser a mesma para SARAM inexistente e CPF errado.

#### Scenario: CPF confere

- **WHEN** SARAM e CPF conferem com uma linha do cadastro
- **THEN** o vínculo é gravado com `saram_verified_by = 'cpf'`

#### Scenario: Erro genérico

- **WHEN** o SARAM não existe no cadastro, ou o CPF não confere
- **THEN** o resultado é `mismatch`, com as tentativas restantes, sem dizer qual dos dois falhou

#### Scenario: Bloqueio

- **WHEN** a conta acumulou 5 falhas na última hora
- **THEN** a próxima tentativa devolve `locked` com o horário de liberação, mesmo com o CPF certo

### Requirement: Pedido, contestação e decisão do administrador

A conta sem verificação possível SHALL abrir um pedido de vínculo (SARAM + justificativa), que fica pendente até um administrador (`admin:2`) aprovar ou recusar. Pedir um SARAM vinculado a outra conta SHALL abrir contestação. Vínculo verificado SHALL prevalecer sobre `legacy` e sobre vínculo sem verificação. Toda mudança de vínculo ou de tipo de conta feita por administrador MUST gravar `access_control.sensitive_operation_log` na mesma transação, com o ator da sessão, e MUST conferir a versão que a tela viu.

#### Scenario: Pedido pendente não mostra dado militar

- **WHEN** a conta abre um pedido para um SARAM
- **THEN** o estado é `pending_request` e nenhuma leitura de dado militar devolve o cadastro desse SARAM

#### Scenario: Verificação contra titular legacy

- **WHEN** a conta verifica por CPF um SARAM vinculado como `legacy` a outra conta
- **THEN** o vínculo passa para quem verificou e a transferência é registrada em `sensitive_operation_log`

#### Scenario: Verificação contra titular verificado

- **WHEN** a conta verifica um SARAM já verificado em outra conta
- **THEN** abre-se contestação para o administrador e nenhum vínculo muda

#### Scenario: Decisão sobre pedido já decidido

- **WHEN** dois administradores decidem o mesmo pedido
- **THEN** o segundo recebe `REQUEST_NOT_PENDING` e nada é gravado

### Requirement: Conta institucional

A conta SHALL ser `pessoal` (padrão) ou `institucional`. Conta institucional MUST NOT ter SARAM e MUST NOT ter arranchamento (`will_eat = true`) nem presença própria; a recusa SHALL valer no domínio e no banco. A própria conta SHALL poder se declarar institucional e voltar a pessoal (e então verificar de novo); o administrador SHALL poder marcar e desmarcar.

#### Scenario: Conta de seção se declara institucional

- **WHEN** a conta da seção se declara institucional
- **THEN** o SARAM é desvinculado, o pedido pendente é encerrado e os arranchamentos de hoje em diante deixam de contar
- **AND** permissões, perfil, senha e MFA continuam

#### Scenario: Arranchar com conta institucional

- **WHEN** alguém grava `will_eat = true` ou presença para uma conta institucional, por qualquer caminho
- **THEN** o banco recusa com `ACCOUNT_INSTITUTIONAL_NO_MEALS`

### Requirement: Dados militares pelo estado do vínculo

Os dados militares da própria conta (sisub, rumaer, sucont) SHALL aparecer apenas para vínculo `email`, `cpf` ou `admin`, ou `legacy` cujo SARAM não esteja verificado em outra conta. Conta pessoal sem vínculo verificado MUST continuar podendo se arranchar.

#### Scenario: Legacy em conflito

- **WHEN** o SARAM legacy de uma conta está verificado em outra
- **THEN** a conta legacy não vê os dados militares e aparece na fila do administrador
