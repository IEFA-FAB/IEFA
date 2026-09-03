## ADDED Requirements

### Requirement: Partir de um documento existente

A ferramenta SHALL aceitar um ofício ou minuta existente como ponto de partida, nas formas: texto colado, arquivo PDF e foto ou digitalização. O conteúdo importado SHALL virar uma proposta de documento, aplicada pelo mesmo caminho de revisão das demais propostas da IA.

#### Scenario: Texto colado

- **WHEN** o usuário cola o corpo de um ofício antigo e pede para partir dele
- **THEN** assunto, destinatários, referências, anexos e parágrafos são extraídos para os campos correspondentes

#### Scenario: Digitalização

- **WHEN** o usuário envia a foto de um ofício
- **THEN** o conteúdo é extraído da imagem e proposto da mesma forma que o texto colado

#### Scenario: Arquivo não suportado

- **WHEN** o usuário envia um formato que a ferramenta não sabe processar
- **THEN** a ferramenta recusa explicitamente, informando os formatos aceitos, e nada é enviado ao provider

### Requirement: A identidade do documento antigo não é herdada

Ao importar, numeração, NUP e data SHALL ficar em branco, e o documento resultante SHALL registrar que veio de uma minuta.

#### Scenario: Minuta com número no cabeçalho

- **WHEN** a minuta importada contém "Ofício nº 34/GAB/255" e um NUP
- **THEN** o documento resultante sai sem numeração e sem NUP, com aviso de que é derivado de minuta

### Requirement: O conteúdo importado é dado, não instrução

O conteúdo do documento importado SHALL ser tratado como dado. Instruções embutidas no arquivo NÃO SHALL alterar o comportamento da IA, e o nome do arquivo NÃO SHALL ser repassado ao modelo sem normalização.

#### Scenario: Instrução embutida na minuta

- **WHEN** a minuta contém um trecho pedindo para desconsiderar as instruções anteriores
- **THEN** a IA segue as regras da norma e trata o trecho como conteúdo do documento

### Requirement: Anexo de documento classificado é recusado

A ferramenta SHALL recusar o envio de qualquer arquivo quando o grau de sigilo do documento for diferente de `ostensivo`, e SHALL registrar a recusa.

#### Scenario: Upload em documento reservado

- **WHEN** o usuário tenta anexar uma minuta a um documento com grau de sigilo reservado
- **THEN** o envio é recusado antes de qualquer chamada a provider, com o motivo explicado, e a recusa fica registrada
