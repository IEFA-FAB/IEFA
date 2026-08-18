## ADDED Requirements

### Requirement: Registry declarativo de fontes normativas
O sistema SHALL manter um registry persistido (`normative_source`) onde cada fonte externa declara autoridade, tipo, URL base, cadência e estado de habilitação, e SHALL executar toda ingestão através de um adapter que implementa o contrato comum `discover` / `fetch` / `parse`.

#### Scenario: Fonte desabilitada é ignorada
- **WHEN** a rotina de atualização executa e uma fonte tem `enabled = false`
- **THEN** nenhuma requisição é feita àquela fonte e seu `last_checked_at` permanece inalterado

#### Scenario: Erro de fonte não contamina as demais
- **WHEN** o `discover()` de uma fonte lança exceção durante a rotina de atualização
- **THEN** a mensagem é gravada em `normative_source.last_error`, a fonte é marcada como verificada e as demais fontes seguem sendo processadas

#### Scenario: Sucesso limpa o erro anterior
- **WHEN** uma fonte que tinha `last_error` preenchido é ingerida com sucesso
- **THEN** `last_error` volta a nulo e `last_checked_at` é atualizado

### Requirement: Ingestão idempotente por hash de conteúdo
O sistema SHALL calcular `content_hash` do conteúdo bruto de cada item descoberto e SHALL tratar como no-op a reingestão de um item cujo hash seja idêntico ao da versão vigente.

#### Scenario: Reingestão sem mudança
- **WHEN** a rotina reingere um item cujo `content_hash` é igual ao do documento vigente para o mesmo `(source_id, external_id)`
- **THEN** nenhum documento, chunk ou embedding novo é criado e nenhuma chamada de embedding é feita

#### Scenario: Reexecução após falha parcial
- **WHEN** uma ingestão falha após criar o documento mas antes de criar todos os chunks, e a rotina roda de novo
- **THEN** a ingestão daquele item é retomada até o estado completo, sem duplicar documento

### Requirement: Versionamento aditivo com vigência
O sistema SHALL registrar cada nova versão de um documento como linha nova em `documents`, marcando a versão anterior com `superseded_at`, e SHALL NEVER sobrescrever ou apagar o conteúdo de uma versão anterior.

#### Scenario: Nova versão publicada pela fonte
- **WHEN** o `content_hash` de um item difere do documento vigente
- **THEN** um documento novo é inserido com o novo `version_label`, o anterior recebe `superseded_at = now()` e seus chunks permanecem legíveis por ID

#### Scenario: Apenas a versão vigente é recuperável por busca
- **WHEN** uma busca semântica ou por palavra-chave é executada sem filtro explícito de versão
- **THEN** somente chunks de documentos com `superseded_at IS NULL` são retornados

#### Scenario: Auditoria de versão antiga
- **WHEN** um parecer de conformidade antigo é reaberto referenciando um `document_id` já superseded
- **THEN** o conteúdo e os chunks daquela versão continuam acessíveis por ID

### Requirement: Tipos de documento estendidos a fontes federais
O sistema SHALL aceitar os tipos `LEI`, `DECRETO`, `IN_SEGES` e `MODELO_AGU` em `documents.document_type`, preservando os tipos preexistentes da FAB.

#### Scenario: Ingestão de modelo AGU
- **WHEN** um modelo da AGU é ingerido com `document_type = 'MODELO_AGU'`
- **THEN** o insert é aceito

#### Scenario: Tipo inválido continua rejeitado
- **WHEN** um documento é inserido com `document_type = 'INVALID'`
- **THEN** a constraint CHECK é violada e o insert falha

#### Scenario: Corpus da FAB intacto
- **WHEN** a migration de extensão de tipos é aplicada
- **THEN** todos os documentos preexistentes com tipo `RADA`, `RBHA`, `ICA`, `MCA` ou `NSCA` permanecem válidos e recuperáveis

### Requirement: Rotina de atualização agendada
O sistema SHALL expor `POST /internal/jobs/sources/refresh`, autenticada por segredo de serviço, que percorre as fontes habilitadas conforme a cadência declarada e retorna um resumo por fonte (verificada, versão nova, erro).

#### Scenario: Chamada sem credencial de serviço
- **WHEN** a rota é chamada sem o segredo de serviço válido
- **THEN** a resposta é 401 e nenhuma fonte é processada

#### Scenario: Resumo da execução
- **WHEN** a rotina termina
- **THEN** a resposta lista, por fonte, quantos itens foram verificados, quantos geraram versão nova e qual erro ocorreu, se houver

### Requirement: Análise de impacto de mudança normativa
Quando uma nova versão de documento de legislação for ingerida, o sistema SHALL comparar o texto dos dispositivos entre as versões e SHALL marcar como `needs_review` toda `checklist_rule` ativa cuja `legal_ref` cite um dispositivo alterado ou removido.

#### Scenario: Dispositivo citado por regra é alterado
- **WHEN** uma nova versão da norma altera o texto de um dispositivo citado por uma regra `active`
- **THEN** a regra passa a `status = 'needs_review'` e deixa de ser aplicada em novas execuções de verificação

#### Scenario: Dispositivo não citado é alterado
- **WHEN** a nova versão altera apenas dispositivos que nenhuma regra cita
- **THEN** nenhuma regra muda de status

#### Scenario: Regra defasada é visível
- **WHEN** existem regras em `needs_review`
- **THEN** a listagem de fontes expõe a contagem e permite navegar até as regras afetadas
