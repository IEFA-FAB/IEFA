## ADDED Requirements

### Requirement: Corpus mínimo de legislação de contratações
O sistema SHALL ingerir e manter atualizados a Lei nº 14.133/2021, seus decretos federais regulamentadores declarados no registry e as Instruções Normativas SEGES aplicáveis a ETP e Termo de Referência.

#### Scenario: Corpus completo após ingestão inicial
- **WHEN** a ingestão inicial das fontes de legislação conclui
- **THEN** existe ao menos um documento vigente por norma declarada no registry, com `document_type` correspondente (`LEI`, `DECRETO` ou `IN_SEGES`)

#### Scenario: Norma declarada e não ingerida é visível
- **WHEN** uma norma declarada no registry não pôde ser ingerida
- **THEN** a listagem de fontes mostra a norma como ausente, com o erro registrado

### Requirement: Texto articulado com dispositivos endereçáveis
O sistema SHALL estruturar cada norma em `structure_node` com `ref_label` do dispositivo (artigo, parágrafo, inciso, alínea), de modo que uma referência legal textual possa ser resolvida contra um nó existente.

#### Scenario: Resolução de dispositivo citado
- **WHEN** a referência `Art. 6º, XXIII, 'a'` da Lei nº 14.133/2021 é resolvida
- **THEN** o sistema retorna o `structure_node` correspondente da versão vigente da norma

#### Scenario: Dispositivo inexistente
- **WHEN** a referência `Art. 999` da Lei nº 14.133/2021 é resolvida
- **THEN** o sistema retorna "não resolvido", sem erro de execução

#### Scenario: Dispositivo revogado
- **WHEN** um dispositivo existe na versão anterior mas não na vigente
- **THEN** a resolução contra a versão vigente retorna "não resolvido" e a resolução contra a versão antiga, por `document_id`, retorna o nó

### Requirement: Fonte primária estruturada com fallback
O sistema SHALL usar a fonte de texto articulado estruturado declarada no registry como primária e SHALL recorrer à fonte de fallback apenas quando a primária falhar ou não cobrir a norma.

#### Scenario: Primária disponível
- **WHEN** a fonte primária responde com o texto articulado da norma
- **THEN** o fallback não é acionado

#### Scenario: Primária indisponível
- **WHEN** a fonte primária falha ou não cobre a norma solicitada
- **THEN** o adapter tenta o fallback, registra qual fonte foi efetivamente usada no documento e conclui a ingestão

#### Scenario: Ambas indisponíveis
- **WHEN** primária e fallback falham
- **THEN** nenhuma versão vigente é substituída e o erro é registrado na fonte

### Requirement: Recuperação filtrável por norma e vigência
O sistema SHALL permitir que a busca no corpus seja filtrada por norma, tipo de documento e versão vigente, mantendo compatível o comportamento atual de busca sobre o corpus da FAB.

#### Scenario: Busca restrita à legislação federal
- **WHEN** uma busca é executada com filtro de tipo `LEI`, `DECRETO` e `IN_SEGES`
- **THEN** nenhum chunk de documento da FAB é retornado

#### Scenario: Busca do ChatRADA inalterada
- **WHEN** o fluxo existente de consulta ao RADA executa uma busca
- **THEN** o resultado permanece equivalente ao anterior a esta mudança, restrito ao corpus da FAB vigente
