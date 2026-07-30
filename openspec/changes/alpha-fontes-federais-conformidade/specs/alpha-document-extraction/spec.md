## ADDED Requirements

### Requirement: Submissão de ETP/TR em DOCX e PDF
O sistema SHALL aceitar upload autenticado de documento `.docx` ou `.pdf` classificado por tipo (`ETP`, `TR`, `EDITAL`), modalidade e objeto, persistindo o arquivo e registrando a submissão.

#### Scenario: Upload aceito
- **WHEN** um usuário autenticado envia um `.docx` com tipo `TR` e objeto `COMPRAS`
- **THEN** a submissão é persistida com o arquivo armazenado e retorna o identificador da submissão

#### Scenario: Formato não suportado
- **WHEN** o arquivo enviado não é `.docx` nem `.pdf`
- **THEN** a requisição é rejeitada com erro de validação e nada é persistido

#### Scenario: Upload sem autenticação
- **WHEN** a rota de submissão é chamada sem token válido
- **THEN** a resposta é 401

### Requirement: Extração para JSON canônico da contratação
O sistema SHALL extrair do documento submetido um JSON aderente ao schema canônico da contratação, validado antes de persistir, e SHALL registrar o modelo de linguagem usado na extração.

#### Scenario: Extração válida
- **WHEN** um TR completo é submetido
- **THEN** a extração é persistida com `payload` aprovado pela validação do schema e o identificador do modelo usado

#### Scenario: Saída do modelo fora do schema
- **WHEN** o modelo devolve estrutura que não valida contra o schema
- **THEN** a extração é reexecutada até o limite configurado e, persistindo a falha, a submissão fica com status de erro sem gravar payload inválido

#### Scenario: Campo obrigatório ausente no documento
- **WHEN** o documento não contém informação para um campo obrigatório do schema
- **THEN** o campo é gravado como ausente de forma explícita, e não inferido ou inventado pelo modelo

### Requirement: Rastreabilidade de origem por campo
O sistema SHALL gravar, para cada campo extraído, o trecho de origem no documento (`source_span`) com posição, e SHALL NEVER persistir campo preenchido sem span correspondente.

#### Scenario: Campo com origem
- **WHEN** o campo `objeto` é extraído
- **THEN** `spans.objeto` contém a posição inicial, final e a página ou seção de onde o texto veio

#### Scenario: Campo sem origem rastreável
- **WHEN** o modelo produz valor para um campo mas não é possível localizar o trecho de origem
- **THEN** o campo é tratado como ausente

#### Scenario: Navegação a partir do span
- **WHEN** um span é aberto na interface
- **THEN** o trecho correspondente do documento original é exibido destacado

### Requirement: Reextração versionada
O sistema SHALL permitir reextrair uma submissão, criando um novo registro de extração sem apagar o anterior.

#### Scenario: Segunda extração
- **WHEN** a mesma submissão é reextraída após ajuste de prompt ou troca de modelo
- **THEN** uma nova linha de extração é criada e a anterior permanece consultável

#### Scenario: Execução de conformidade aponta para extração específica
- **WHEN** uma execução de conformidade é criada
- **THEN** ela referencia o identificador exato da extração usada, não a mais recente
