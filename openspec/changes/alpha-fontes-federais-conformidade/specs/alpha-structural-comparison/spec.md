## ADDED Requirements

### Requirement: Seleção do modelo AGU aplicável
O sistema SHALL selecionar o modelo AGU vigente correspondente ao tipo de documento, modalidade e objeto da submissão, e SHALL registrar o `document_id` do modelo usado na execução.

#### Scenario: Modelo correspondente existe
- **WHEN** uma submissão de TR com objeto `SERVICOS` é comparada
- **THEN** o modelo de Termo de Referência para serviços vigente é selecionado e seu `document_id` gravado na execução

#### Scenario: Nenhum modelo aplicável
- **WHEN** não existe modelo vigente para a combinação informada
- **THEN** a comparação estrutural não é executada, a execução registra o motivo e a verificação de conteúdo segue normalmente

#### Scenario: Modelo atualizado depois da execução
- **WHEN** o modelo AGU é atualizado após uma execução concluída
- **THEN** o resultado daquela execução permanece inalterado e continua referenciando a versão usada

### Requirement: Casamento determinístico de seções
O sistema SHALL casar as seções do documento submetido com as do modelo por etapas — título exato normalizado, similaridade léxica e similaridade semântica — e SHALL produzir resultado idêntico para a mesma entrada.

#### Scenario: Título idêntico após normalização
- **WHEN** o documento tem `"4 - DA JUSTIFICATIVA"` e o modelo tem `"4. Da Justificativa"`
- **THEN** as seções são casadas na etapa de título exato normalizado

#### Scenario: Título reescrito
- **WHEN** o documento tem `"Justificativa da necessidade da contratação"` e o modelo tem `"Justificativa da contratação"`
- **THEN** as seções são casadas por similaridade e a seção é classificada como `RENAMED`

#### Scenario: Determinismo
- **WHEN** a mesma comparação é executada duas vezes sobre as mesmas entradas
- **THEN** o conjunto de classificações produzido é idêntico

### Requirement: Classificação de divergência estrutural
O sistema SHALL classificar cada seção como `MATCHED`, `MISSING`, `EXTRA`, `OUT_OF_ORDER` ou `RENAMED`, e SHALL derivar a ordem por subsequência comum máxima entre as sequências casadas.

#### Scenario: Seção obrigatória ausente
- **WHEN** uma seção marcada como obrigatória no modelo não tem correspondente no documento
- **THEN** é registrado um achado `MISSING` com severidade proporcional à obrigatoriedade da seção

#### Scenario: Seção adicional
- **WHEN** o documento tem uma seção sem correspondente no modelo
- **THEN** é registrado um achado `EXTRA` com severidade informativa

#### Scenario: Seções fora de ordem
- **WHEN** duas seções casadas aparecem em ordem invertida em relação ao modelo
- **THEN** a seção fora da subsequência comum máxima é classificada como `OUT_OF_ORDER`, e não ambas

#### Scenario: Documento aderente
- **WHEN** todas as seções do modelo estão presentes, na mesma ordem
- **THEN** nenhum achado estrutural é gerado

### Requirement: Redação de recomendação sobre diff já calculado
O sistema SHALL usar modelo de linguagem apenas para redigir o texto de recomendação de um achado estrutural já classificado, e SHALL NEVER deixar a classificação estrutural a cargo do modelo.

#### Scenario: Recomendação textual
- **WHEN** um achado `MISSING` é gerado
- **THEN** a mensagem descreve a seção ausente e sugere onde inseri-la, sem alterar a classificação

#### Scenario: Falha do modelo de linguagem
- **WHEN** a geração de texto falha
- **THEN** o achado é persistido com mensagem padrão derivada da classificação, sem perder o resultado da comparação
