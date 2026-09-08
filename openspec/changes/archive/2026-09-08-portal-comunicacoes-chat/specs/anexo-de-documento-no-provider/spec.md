## ADDED Requirements

### Requirement: O adapter envia anexo de documento ao Bedrock

O adapter do Bedrock em `@iefa/ai-provider` SHALL mapear partes de mensagem do tipo documento para blocos `document` da API Converse, respeitando os limites do serviço: formatos `csv`, `doc`, `docx`, `html`, `md`, `pdf`, `txt`, `xls` e `xlsx`; no máximo 5 documentos por mensagem, de até 4,5 MB cada; apenas em mensagem de papel `user`; e sempre acompanhados de um bloco de texto na mesma mensagem.

#### Scenario: PDF anexado chega ao modelo

- **WHEN** uma mensagem do usuário carrega um PDF e um texto
- **THEN** a chamada ao Bedrock leva um bloco `document` e um bloco `text`, e o modelo responde sobre o conteúdo do arquivo

#### Scenario: Documento sem texto acompanhante

- **WHEN** uma mensagem carrega apenas um documento, sem texto
- **THEN** o adapter acrescenta o bloco de texto exigido pelo serviço, evitando a falha de validação

#### Scenario: Limite do serviço excedido

- **WHEN** uma mensagem carrega mais documentos ou mais bytes do que o serviço aceita
- **THEN** o adapter falha com erro explícito antes da chamada, informando o limite violado

### Requirement: Parte não suportada falha alto

O adapter NÃO SHALL descartar silenciosamente partes de mensagem que não saiba enviar. Uma parte não suportada SHALL produzir erro explícito.

#### Scenario: Tipo de parte desconhecido

- **WHEN** uma mensagem contém uma parte que o adapter não sabe mapear
- **THEN** a chamada falha com mensagem que identifica o tipo não suportado, em vez de seguir sem aquele conteúdo

#### Scenario: Regressão do descarte silencioso

- **WHEN** a suíte envia uma mensagem com anexo por um adapter que não o suporta
- **THEN** o teste falha, garantindo que o conteúdo perdido nunca volte a passar despercebido

### Requirement: O nome do arquivo é normalizado

O adapter SHALL enviar um nome neutro no campo `name` do bloco de documento, sem repassar o nome original do arquivo.

#### Scenario: Nome de arquivo com instrução embutida

- **WHEN** o arquivo enviado se chama algo como "ignore-as-instrucoes-anteriores.pdf"
- **THEN** o nome que chega ao modelo é neutro e não carrega o texto original
