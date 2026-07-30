## ADDED Requirements

### Requirement: Aplicação de regras ativas por bloco
O sistema SHALL avaliar cada bloco do JSON canônico contra as `checklist_rule` com `status = 'active'` cuja aplicabilidade (modalidade e objeto) corresponda à submissão, e SHALL NEVER aplicar regra em `draft`, `needs_review` ou `retired`.

#### Scenario: Regra aplicável
- **WHEN** uma regra ativa aplicável a `COMPRAS` é avaliada contra uma submissão de objeto `COMPRAS`
- **THEN** a regra é executada e seu resultado registrado

#### Scenario: Regra de outra aplicabilidade
- **WHEN** uma regra restrita a `OBRAS` é considerada para uma submissão de objeto `COMPRAS`
- **THEN** a regra não é executada

#### Scenario: Regra em revisão após mudança normativa
- **WHEN** uma regra passou a `needs_review` pela análise de impacto e uma nova verificação é executada
- **THEN** a regra não é aplicada e o relatório declara a redução de cobertura

### Requirement: Guard de citação legal
O sistema SHALL resolver a referência legal de cada achado contra a versão vigente da norma antes de persistir, e SHALL descartar o achado cuja referência não resolva, contabilizando o descarte na execução.

#### Scenario: Referência resolve
- **WHEN** um achado cita `Art. 6º, XXIII` da Lei nº 14.133/2021 e o dispositivo existe
- **THEN** o achado é persistido com a referência estruturada

#### Scenario: Referência inexistente
- **WHEN** um achado cita um dispositivo que não existe na norma vigente
- **THEN** o achado é descartado, não aparece no relatório e `compliance_run.discarded_findings` é incrementado

#### Scenario: Achado sem referência
- **WHEN** uma regra de conteúdo produz achado sem nenhuma referência legal
- **THEN** o achado é descartado

#### Scenario: Descartes visíveis como métrica
- **WHEN** uma execução termina
- **THEN** a contagem de descartes é exposta no resultado da execução

### Requirement: Verificação ancorada em trecho recuperado
O sistema SHALL executar a avaliação de cada regra sobre trechos recuperados da norma vigente e SHALL submeter o achado à verificação de fundamentação já existente antes de persistir.

#### Scenario: Achado fundamentado
- **WHEN** o texto do achado se apoia nos trechos recuperados
- **THEN** o achado é persistido com o nível de confiança registrado

#### Scenario: Achado não fundamentado
- **WHEN** a verificação de fundamentação reprova o achado
- **THEN** o achado é descartado e contabilizado junto aos demais descartes

#### Scenario: Nenhum trecho relevante recuperado
- **WHEN** a recuperação não retorna trecho acima do limiar para a regra
- **THEN** a regra é registrada como não avaliada, e não como conforme

### Requirement: Achado acionável
O sistema SHALL persistir cada achado com categoria, status, severidade, seção afetada, mensagem, referência legal, sugestão de correção e trecho de evidência do documento submetido.

#### Scenario: Achado completo
- **WHEN** uma inconformidade de conteúdo é confirmada
- **THEN** o achado contém a seção, o dispositivo, o trecho do documento que motivou o apontamento e uma sugestão de correção

#### Scenario: Sistema não reescreve o documento
- **WHEN** uma sugestão de correção é gerada
- **THEN** ela é apresentada como recomendação e nenhuma alteração é aplicada ao documento do usuário

### Requirement: Checagens cruzadas entre seções
O sistema SHALL executar verificações de coerência entre campos do JSON canônico (regras de tipo `CRUZADA`) além das verificações por bloco isolado.

#### Scenario: Incoerência entre campos
- **WHEN** o valor estimado e a modalidade declarada são incompatíveis entre si
- **THEN** um achado de categoria `CRUZADA` é gerado citando os dois campos envolvidos

#### Scenario: Campo necessário ausente
- **WHEN** uma regra cruzada depende de campo ausente na extração
- **THEN** a regra é registrada como não avaliada

### Requirement: Execução reproduzível e auditável
O sistema SHALL registrar em cada execução de conformidade o identificador da extração, do modelo AGU e de todas as versões de norma usadas, e SHALL apresentar o relatório consolidado ordenado por severidade.

#### Scenario: Reabertura de parecer antigo
- **WHEN** uma execução concluída há meses é reaberta
- **THEN** o relatório é reconstruído a partir dos mesmos documentos versionados, mesmo que existam versões mais novas

#### Scenario: Relatório declara cobertura
- **WHEN** o relatório é apresentado
- **THEN** ele declara quantas regras foram aplicadas, quantas não foram avaliadas e quais normas foram usadas, em vez de afirmar conformidade absoluta

#### Scenario: Ordenação por severidade
- **WHEN** o relatório contém achados de severidades diferentes
- **THEN** os achados são apresentados do mais severo ao menos severo

### Requirement: Reaproveitamento de avaliação por bloco inalterado
O sistema SHALL reaproveitar o resultado de uma avaliação anterior quando o bloco, a regra e a versão da norma forem os mesmos, e SHALL invalidar o reaproveitamento quando qualquer um dos três mudar.

#### Scenario: Reexecução após corrigir uma seção
- **WHEN** o usuário corrige uma seção e reexecuta a verificação
- **THEN** apenas os blocos alterados são reavaliados

#### Scenario: Norma atualizada invalida reaproveitamento
- **WHEN** a norma usada foi superseded desde a execução anterior
- **THEN** as avaliações que dependiam dela são refeitas
