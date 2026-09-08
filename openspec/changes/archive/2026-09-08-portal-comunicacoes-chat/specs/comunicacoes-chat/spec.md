## ADDED Requirements

### Requirement: Conversa e formulário sobre o mesmo documento

A ferramenta SHALL oferecer os modos "formulário" e "conversa" na mesma rota, operando sobre o mesmo `DocumentInput` e o mesmo preview. Trocar de modo NÃO SHALL alterar, salvar ou descartar o documento em edição.

#### Scenario: Alternar de formulário para conversa

- **WHEN** o usuário preenche campos no formulário e alterna para o modo conversa
- **THEN** o documento aberto na conversa é o mesmo, com todos os campos preenchidos, sem exigir salvar antes

#### Scenario: Alternar de conversa para formulário

- **WHEN** a IA altera o documento em uma conversa e o usuário alterna para o formulário
- **THEN** os campos do formulário refletem as alterações da conversa

### Requirement: A IA altera o documento por remendo

A IA SHALL alterar o documento exclusivamente por operações de remendo com recorte definido (forma, partes, ementa, texto, parágrafo, item, anexos). A IA NÃO SHALL substituir o documento inteiro a cada turno.

#### Scenario: Alteração pontual preserva o resto

- **WHEN** o usuário pede para trocar apenas o destinatário
- **THEN** o destinatário muda e os parágrafos, o assunto e as referências permanecem exatamente como estavam

#### Scenario: Edição manual entre turnos sobrevive

- **WHEN** o usuário edita um parágrafo à mão no formulário e depois pede outra alteração pela conversa
- **THEN** o parágrafo editado à mão continua com o texto do usuário

#### Scenario: Remendo inválido não corrompe o documento

- **WHEN** a IA tenta substituir um parágrafo em posição inexistente
- **THEN** o documento permanece inalterado e a IA recebe um erro de tool que ela pode ler e corrigir

### Requirement: A IA pergunta em vez de inventar

Quando faltar dado necessário ao documento, a IA SHALL perguntar ao usuário em vez de preencher por conta própria. A pauta das perguntas SHALL sair da lista de pendências produzida pela montagem do documento.

#### Scenario: Dado de identidade ausente

- **WHEN** o documento está sem NUP e o usuário pede para concluir
- **THEN** a IA pergunta o NUP e não preenche nenhum valor no campo

#### Scenario: Abertura obrigatória da espécie

- **WHEN** a espécie exige abertura obrigatória e o texto não a tem
- **THEN** a IA aponta a exigência citando o artigo e propõe a correção

### Requirement: Preview com destaque de alteração e desfazer

O preview SHALL ficar visível ao lado da conversa, em painel redimensionável, SHALL destacar os blocos alterados no último turno e SHALL permitir desfazer o turno inteiro.

#### Scenario: Ver o que mudou

- **WHEN** a IA conclui um turno que alterou o assunto e dois parágrafos
- **THEN** o preview destaca esses blocos e informa quantas alterações houve

#### Scenario: Desfazer um turno

- **WHEN** o usuário desfaz o último turno
- **THEN** o documento volta exatamente ao estado anterior ao turno, inclusive espécie e âmbito

### Requirement: A conversa respeita as guardas do fluxo de IA

O endpoint da conversa SHALL exigir sessão, SHALL aplicar o teto de consumo ANTES de abrir o stream e SHALL responder 503 quando a IA não estiver configurada no ambiente.

#### Scenario: Sem sessão

- **WHEN** o endpoint da conversa é chamado sem sessão válida
- **THEN** responde 401 e nenhuma chamada a provider de IA é feita

#### Scenario: Teto estourado

- **WHEN** o usuário excede o teto de requisições
- **THEN** responde 429 com `Retry-After` antes de qualquer byte do stream

#### Scenario: IA não configurada

- **WHEN** as variáveis de IA não estão presentes no ambiente
- **THEN** responde 503 e o restante da ferramenta continua funcionando

#### Scenario: Rota registrada

- **WHEN** a suíte verifica os arquivos de rota do app
- **THEN** toda rota presente em `routes/` está declarada nos `handlers` da configuração, sob pena de o pedido virar redirect em vez de stream

### Requirement: Documento classificado não vai a provider

A conversa SHALL recusar qualquer chamada a provider quando o grau de sigilo do documento for diferente de `ostensivo`, e SHALL registrar a recusa.

#### Scenario: Documento reservado

- **WHEN** o usuário tenta conversar sobre um documento com grau de sigilo reservado
- **THEN** a ferramenta recusa antes da chamada, explica o motivo e grava o registro da recusa
