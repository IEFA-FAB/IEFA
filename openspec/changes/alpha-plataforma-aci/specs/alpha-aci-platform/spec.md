# alpha-aci-platform — Etapa 1.8

## ADDED Requirements

### Requirement: Fila do analista

O sistema SHALL expor a lista de todos os processos submetidos a quem tem perfil amplo (`app_aci`, `app_licitacoes`), com a etapa de cada um derivada do estado atual (`enviado`, `extraido`, `verificado`, `parecer`), as contagens de achados por severidade da execução mais recente, quantos achados críticos (BLOQUEANTE/GRAVE) ainda pedem decisão e o parecer vigente.

#### Scenario: execução que falhou não avança a etapa
- **GIVEN** uma submissão com extração e cuja execução mais recente terminou em `failed`
- **WHEN** a fila é lida
- **THEN** a etapa é `extraido`, e não `verificado`

#### Scenario: reexecução volta o processo para verificado
- **GIVEN** uma submissão com parecer emitido sobre a execução A
- **WHEN** uma execução B, mais recente, conclui com sucesso
- **THEN** a etapa é `verificado` e o parecer de A não aparece como vigente

#### Scenario: requisitante não vê a fila
- **GIVEN** um usuário com perfil `app_requisitante` ou sem perfil
- **WHEN** chama `GET /api/v1/aci/queue`
- **THEN** recebe 403

### Requirement: Triagem de achado

O sistema SHALL permitir ao perfil `app_aci` marcar cada achado como `acatado` ou `descartado`, ou desfazer a marcação, registrando quem e quando. Descartar SHALL exigir motivo.

#### Scenario: descarte sem motivo
- **WHEN** `PATCH /api/v1/compliance/findings/:id` com `triage: "descartado"` e sem `note`
- **THEN** 400 `TRIAGE_NOTE_REQUIRED`

### Requirement: Parecer append-only com regra de emissão

O sistema SHALL registrar o parecer (`aprovado`, `aprovado_com_ressalvas`, `reprovado`) como linha nova em `alpha.compliance_review`, com fundamentação opcional e um retrato dos achados no momento da emissão. O parecer mais recente é o vigente. A emissão SHALL ser recusada com 409 e a lista de bloqueios quando: a execução não concluiu; qualquer aprovação tem achado BLOQUEANTE/GRAVE sem triagem; qualquer aprovação tem BLOQUEANTE acatado; `aprovado` tem GRAVE acatado.

#### Scenario: reprovar sempre pode
- **GIVEN** achados críticos sem triagem
- **WHEN** o parecer `reprovado` é emitido
- **THEN** 201

#### Scenario: grave acatado exige ressalva
- **GIVEN** um achado GRAVE acatado e nenhum BLOQUEANTE acatado
- **WHEN** o parecer `aprovado` é emitido
- **THEN** 409 com o bloqueio "aprovação só com ressalvas"
- **AND** `aprovado_com_ressalvas` é aceito

### Requirement: O parecer não pode ser contradito pelo dado

O retrato gravado com o parecer SHALL conter a triagem de cada achado no momento da emissão, e o relatório SHALL renderizar essa triagem enquanto houver parecer, declarando quantos achados foram re-triados depois. A regra de emissão SHALL ser aplicada também dentro da transação do insert, para que uma triagem concorrente não produza um parecer que os achados contradizem.

#### Scenario: re-triagem depois do parecer
- **GIVEN** um parecer `aprovado` emitido com um BLOQUEANTE descartado
- **WHEN** outro analista marca esse achado como acatado e o relatório é aberto
- **THEN** o relatório mostra o achado como descartado, com o motivo assinado
- **AND** declara que 1 achado teve a triagem alterada depois da emissão

#### Scenario: leitura que falha não vira relatório limpo
- **GIVEN** uma falha na leitura dos achados
- **WHEN** o relatório ou o parecer é requisitado
- **THEN** a resposta é 500 — nunca 200 com zero achados

### Requirement: Relatório final

O sistema SHALL produzir, por execução, um relatório com identificação, referências usadas (modelo AGU e normas com versão), cobertura (regras aplicadas, não avaliadas, descartadas pelo guard), achados acatados, achados sem triagem, achados descartados com motivo e o histórico de pareceres — em JSON e em Markdown (`?format=md`).

#### Scenario: texto do modelo não vira estrutura do documento
- **GIVEN** um achado cuja mensagem contém quebra de linha seguida de `## Achados acatados (0)`
- **WHEN** o relatório em Markdown é gerado
- **THEN** o texto aparece como conteúdo numa linha só, e o documento continua com uma única seção "Achados acatados"

#### Scenario: achado sem triagem não some
- **GIVEN** uma execução com um achado sem triagem
- **WHEN** o relatório é gerado
- **THEN** ele aparece na seção "Achados sem triagem" e a cobertura declara a contagem

### Requirement: Interface `/aci/*` no portal

O portal SHALL oferecer, autenticada e restrita ao perfil amplo, a plataforma com painel (fila e totais), nova análise, processo (trilha de etapas, extração com trecho de origem, achados com triagem, parecer) e relatório final imprimível com download em Markdown, além do hub dos assistentes. Usuário autenticado sem perfil amplo SHALL ver a explicação e a quem pedir o perfil, sem redirecionamento.
