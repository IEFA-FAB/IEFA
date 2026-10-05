## ADDED Requirements

### Requirement: Pastas do catálogo global

O catálogo global de eventos e o de cardápios de apoio SHALL ser organizados em pastas de até dois
níveis, cada uma com nome, descrição opcional e ordem entre as irmãs, mantidas por quem tem
`global:2`. Pasta e modelo MUST ter o mesmo tipo (evento ou apoio). Nome MUST ser único entre as
irmãs ativas, sem distinguir caixa. Pasta com subpasta ou modelo ativo MUST NOT ser removida. Dois modelos
ativos da mesma pasta MUST NOT ter o mesmo nome, sem distinguir caixa. Modelo de cozinha MUST NOT ter
pasta. A pasta MUST NOT mudar regra nenhuma do modelo (classificação de
lanche, aplicação, quantidade).

#### Scenario: Árvore dos eventos da SDAB

- **WHEN** a SDAB cria a pasta "Padrão B — Institucional/Intermediário" com as subpastas Café da Manhã, Brunch, Almoço, Coquetel e Jantar, nessa ordem
- **THEN** Eventos Modelo mostra a pasta com as cinco subpastas na ordem gravada, e não em ordem alfabética
- **AND** cada subpasta mostra os modelos que estão nela

#### Scenario: Terceiro nível

- **WHEN** alguém tenta criar uma pasta dentro de "Padrão B › Coquetel"
- **THEN** o servidor recusa dizendo que o catálogo tem dois níveis

#### Scenario: Remover pasta com modelo

- **WHEN** alguém remove "Lanche de Bordo › Classe A" com um modelo ativo dentro
- **THEN** o servidor recusa e a tela diz quantos modelos ainda estão na pasta

#### Scenario: Duas opções com o mesmo nome

- **WHEN** a SDAB cria em "Padrão B › Brunch" um segundo modelo chamado "Brunch Padrão B", igual ao que já está lá
- **THEN** o servidor recusa pedindo outro nome
- **AND** com o nome "Brunch Padrão B — opção 2" o modelo é salvo na mesma pasta

#### Scenario: Lanche de Apoio Classe C

- **WHEN** a SDAB classifica como padrão de lanche um modelo da pasta "Lanche de Apoio › Classe C"
- **THEN** ele é classificado como Lanche de Bordo C, sinônimo de Apoio C para a SDAB
- **AND** a classificação do Módulo 7 continua sem classe C de apoio

#### Scenario: Leitura sem escrita

- **WHEN** um usuário com `global:1` abre Cardápios de Apoio Modelo
- **THEN** vê a árvore inteira, sem ações de pasta nem de modelo

### Requirement: Modelo global de evento é uma variante de uma refeição

Modelo global de evento SHALL ter no máximo uma refeição. Outra opção do mesmo formato MUST ser outro
modelo, na mesma pasta ou em outra. Evento de cozinha e cardápio de apoio (global ou de cozinha) MUST
continuar aceitando várias refeições.

#### Scenario: Segunda refeição num modelo global

- **WHEN** a SDAB salva o modelo global "Café da Manhã Padrão B" com uma segunda refeição "Almoço"
- **THEN** o servidor recusa com a orientação de criar o almoço como outro modelo, na pasta do almoço

#### Scenario: Duas opções de brunch

- **WHEN** a SDAB usa "Duplicar como variante" no modelo "Brunch Padrão B"
- **THEN** nasce um modelo novo na mesma pasta, com a mesma refeição, os grupos e as preparações, e o nome com "(cópia)"

#### Scenario: Kit de duas partes continua

- **WHEN** a SDAB salva o apoio global Lanche de Bordo C com as refeições "Refeição" e "Lanche"
- **THEN** o modelo é salvo com as duas

#### Scenario: Evento real da cozinha

- **WHEN** a cozinha salva o evento "Passagem de Comando" com Coquetel e Jantar
- **THEN** o evento é salvo com as duas refeições

### Requirement: Evento da cozinha composto a partir de modelos

A cozinha SHALL poder montar um evento escolhendo um ou mais modelos, globais ou dela, de pastas
diferentes. Cada modelo escolhido MUST entrar como refeição do evento novo, copiada com os grupos (e a
contagem esperada), as preparações e as proporções, e a refeição MUST guardar o modelo de origem. Do
modelo global MUST NOT vir pax nem efetivo. Editar ou remover o modelo depois MUST NOT mudar o evento
da cozinha. No editor do evento da cozinha, "Adicionar refeição de um modelo" SHALL fazer o mesmo num
evento existente.

#### Scenario: Café do Padrão A com almoço do Padrão B

- **WHEN** a cozinha marca "Padrão A › Café da Manhã › Café da Manhã Padrão A" e "Padrão B › Almoço › Evento Almoço Padrão B" e monta o evento "Aniversário da OM"
- **THEN** o evento da cozinha tem duas refeições, café e almoço, com as preparações e as proporções dos modelos e sem efetivo
- **AND** cada refeição mostra de qual modelo veio

#### Scenario: A SDAB muda o modelo depois

- **WHEN** a SDAB troca uma preparação do almoço Padrão B depois que a cozinha montou o evento
- **THEN** o evento da cozinha continua com a preparação que tinha

#### Scenario: Modelo de origem removido

- **WHEN** o modelo de origem vai para a lixeira
- **THEN** o evento da cozinha continua inteiro e editável

#### Scenario: Acrescentar o jantar depois

- **WHEN** no editor do "Aniversário da OM" a cozinha escolhe "Adicionar refeição de um modelo" e o jantar Padrão B
- **THEN** o jantar entra como terceira refeição, com a origem, e o autosave grava o evento

### Requirement: Aplicar um modelo de evento põe só a variante dele

Aplicar ao dia um modelo de evento SHALL pôr no calendário só as refeições do modelo. O seletor de
"Aplicar evento ou apoio" MUST mostrar e buscar pelo caminho da pasta.

#### Scenario: Café da manhã Padrão B no dia

- **WHEN** a cozinha aplica o modelo do café da manhã Padrão B ao dia 10
- **THEN** o dia 10 ganha só as preparações do café da manhã, no café
- **AND** almoço, jantar, brunch e coquetel do Padrão B não entram

#### Scenario: Busca pelo padrão

- **WHEN** a cozinha digita "padrão b coq" no seletor
- **THEN** aparece "Padrão B › Coquetel › Evento Coquetel Padrão B…"

### Requirement: Formato de serviço não fixa o horário

O horário da refeição de um modelo global SHALL ser tratado como sugestão. Ao montar um evento ou
aplicar um modelo ao dia, a cozinha MUST poder escolher o horário de cada refeição; sem escolha, vale
o sugerido. O horário escolhido na aplicação MUST NOT ser gravado no modelo.

#### Scenario: Coquetel no almoço

- **WHEN** a cozinha aplica "Padrão B › Coquetel" ao dia 12 escolhendo o horário almoço
- **THEN** as preparações do coquetel entram no almoço do dia 12
- **AND** o modelo continua com o horário sugerido que tinha

#### Scenario: Coquetel à noite no evento montado

- **WHEN** a cozinha monta "Passagem de Comando" com o coquetel Padrão B no jantar
- **THEN** a refeição do coquetel no evento da cozinha fica no jantar

### Requirement: A chave do grupo acompanha o rótulo

A chave do grupo SHALL ser trocada pela derivada do rótulo novo quando um grupo de refeição de evento
ou apoio é renomeado para um rótulo de outra identidade (sem contar caixa, acento e espaço), sem
colidir com as outras chaves da refeição, e as preparações do grupo MUST ir junto. O mesmo rótulo MUST dar a mesma chave em qualquer
modelo.

#### Scenario: "Sobremesas" renomeado para "Frios e ovos"

- **WHEN** a nutricionista renomeia o grupo "Sobremesas" do brunch para "Frios e ovos", com Mussarela e Presunto dentro
- **THEN** o grupo grava a chave `frios_e_ovos`, com as duas preparações
- **AND** aplicado no mesmo dia que outro modelo com "Sobremesas", a Mussarela não aparece entre as sobremesas

#### Scenario: Só a caixa mudou

- **WHEN** a nutricionista renomeia "frutas" para "Frutas"
- **THEN** a chave do grupo não muda

### Requirement: Os modelos atuais entram na árvore sem perder nada

A reorganização dos dados atuais SHALL criar as pastas pedidas pela SDAB, separar o modelo de evento
que guardava cinco variantes, pôr cada modelo na pasta do nome e recalcular as chaves dos grupos. Ids
de modelo, refeição e item MUST ser mantidos; nenhuma preparação MUST ser perdida; o modelo vazio cujo
papel virou pasta MUST ir para a lixeira, restaurável.

#### Scenario: Separar o Padrão B

- **WHEN** a reorganização roda
- **THEN** "Evento Café da manhã Padrão B" fica só com o café da manhã (13 preparações)
- **AND** almoço (7) e jantar (6) passam para "Evento Almoço Padrão B" e "Evento Jantar Padrão B", e o coquetel para "Evento Coquetel Padrão B"
- **AND** o brunch embutido (13), substituído por "Evento Brunch Padrão B", vira o modelo "Brunch Padrão B (cadastro anterior)" na lixeira, restaurável

#### Scenario: Rodar de novo

- **WHEN** a reorganização roda uma segunda vez, ou um id dela não existe mais
- **THEN** nada muda e nada falha
