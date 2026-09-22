# contrate-document-chat

## ADDED Requirements

### Requirement: Chat na tela do processo

O contrate SHALL oferecer, na tela do processo de todos os módulos que a exibem (Requisitante e ACI), um botão "Conversar" que abre um painel lateral de chat sobre aquele processo. O painel SHALL listar as conversas do usuário sobre o processo, abrir a mais recente e permitir iniciar outra.

#### Scenario: primeira conversa sobre o processo
- **GIVEN** um usuário que pode ler o processo e ainda não conversou sobre ele
- **WHEN** clica em "Conversar" e envia uma pergunta
- **THEN** a conversa é criada vinculada ao processo e a resposta aparece progressivamente

#### Scenario: acesso revogado
- **WHEN** o α responde 403 `SUBMISSION_ACCESS_REVOKED` a um turno
- **THEN** o painel mantém o histórico e informa que o usuário não tem mais acesso a este processo, desabilitando o envio

### Requirement: Perguntar a partir do achado

Cada achado exibido SHALL oferecer a ação "Perguntar sobre este achado", que abre o painel com uma pergunta preenchida citando severidade, seção e mensagem, SEM enviá-la.

#### Scenario: atalho do achado
- **WHEN** o usuário aciona "Perguntar sobre este achado" num achado GRAVE da seção 5
- **THEN** o painel abre com a pergunta editável no campo de mensagem, e nenhum turno é enviado até o usuário confirmar

### Requirement: Chat avulso com arquivos

O contrate SHALL oferecer a rota `/conversar`, visível na navegação a quem pode enviar documento, com a lista das conversas avulsas do usuário, a criação de conversa, uma área de soltar arquivos (PDF/DOCX, até 5) e o chat. A tela vazia SHALL dizer o que o assistente consulta: os arquivos enviados, a Lei 14.133, decretos, IN SEGES, modelos da AGU e RADA-e.

#### Scenario: arrastar um TR e perguntar
- **WHEN** o usuário solta um DOCX na área e pergunta "o que falta neste TR?"
- **THEN** o anexo aparece listado na conversa e a resposta considera o seu conteúdo

#### Scenario: arquivo recusado
- **WHEN** o α recusa o anexo (formato, tamanho ou limite de 5)
- **THEN** a tela mostra a mensagem do α junto ao arquivo recusado, e os demais anexos continuam

### Requirement: Salvar conversa e aviso de expurgo

A lista de conversas e a conversa aberta SHALL oferecer a ação de salvar e deixar de salvar. A conversa avulsa não salva SHALL exibir a data em que será apagada, em horário de Brasília. Quando faltarem 30 dias ou menos, o aviso SHALL ganhar destaque e vir com a ação de salvar.

#### Scenario: conversa perto do expurgo
- **GIVEN** uma conversa avulsa não salva que será apagada em 12 dias
- **WHEN** o usuário abre `/conversar`
- **THEN** a conversa aparece com o aviso destacado "será apagada em DD/MM" e o botão Salvar

#### Scenario: conversa salva
- **WHEN** o usuário salva a conversa
- **THEN** o aviso de expurgo some e a conversa é marcada como salva na lista

#### Scenario: conversa de processo
- **WHEN** o usuário abre o painel de chat do processo
- **THEN** não há aviso de expurgo, porque a conversa acompanha o processo

### Requirement: Citações abríveis e honestas

Cada citação da resposta SHALL ser exibida como marcador que abre o conteúdo citado: trecho do corpus (carregado de `/api/v1/chunks/:id`, com o documento de origem), achado (severidade e mensagem) ou trecho do documento. Citação de documento com `located: false` SHALL ser exibida como "trecho não localizado no documento".

#### Scenario: abrir citação de norma
- **WHEN** o usuário abre a citação `[N1]` de uma resposta
- **THEN** o painel mostra o texto do trecho e o título do documento de origem, lidos do α

### Requirement: Redação sugerida copiável e sinalizada

O bloco `redacao` de uma resposta SHALL ser exibido como cartão próprio, com botão "Copiar" e o aviso fixo de que é sugestão do assistente a ser conferida com a norma.

#### Scenario: copiar a redação
- **WHEN** o usuário clica em "Copiar" no cartão de redação
- **THEN** apenas o texto proposto (sem o aviso e sem a linha de seção) vai para a área de transferência

### Requirement: Estados de falha legíveis

O painel e a tela avulsa SHALL traduzir `CHAT_DAILY_LIMIT` (com o horário de liberação), `MODEL_UNAVAILABLE`, `TURN_TIMEOUT` e resposta com `status` `aborted`/`error` em mensagens em português. A pergunta SHALL permanecer disponível para reenvio.

#### Scenario: limite diário
- **WHEN** o α responde 429 `CHAT_DAILY_LIMIT`
- **THEN** a tela informa quando o envio volta a ser possível e mantém o texto digitado no campo

### Requirement: Aviso de apoio, não de parecer

O painel e a tela avulsa SHALL exibir, de forma permanente, que as respostas são apoio à redação e não substituem a verificação nem o parecer do ACI.

#### Scenario: qualquer conversa
- **WHEN** o painel de chat está aberto
- **THEN** o aviso está visível sem interação
