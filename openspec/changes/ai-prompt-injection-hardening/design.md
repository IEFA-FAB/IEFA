# Design

## Context

A motivação está em `proposal.md`, e o levantamento completo dela é de 2026-10-01. O que pesa no
desenho:

- **O padrão bom já existe no repo e está testado.**
  - O α tem `apps/alpha/src/compliance/judge-prompt.ts`: nonce de 128 bits, neutralização de marcador
    forjado com substituto não vazio e regra de sistema.
  - O chat do contrate usa um nonce HMAC estável por conversa, para não quebrar o cache de prompt
    (`apps/alpha/src/chat/prompt.ts`).
  - O portal neutraliza imagem em `apps/portal/src/components/ui/markdown.tsx`, e o sisub em
    `apps/sisub/src/components/ui/chat-markdown.tsx`.
- **Aprovação humana:** o `@tanstack/ai` 0.63 traz aprovação de tool (`needsApproval`). O servidor
  emite um interrupt de aprovação, e o cliente responde no `resume` do turno seguinte (detalhe em D2).
- **Histórico do sisub:** o `sanitizeClientMessages` já previu esse fluxo (`allowPendingToolCalls`), mas
  hoje as duas rotas passam `false`.
- **Contrato de agente:** o `packages/sisub-domain/src/agent/templates.ts` já tem o
  `agentApplyTemplate` (só `skip`, no máximo 31 datas). O chat usa, o MCP não.
- **Sem banco nem infra:** nenhuma migration, nenhum segredo, nada em `infra/**`.

## Goals / Non-Goals

**Goals:**
- Um único helper de delimitação, usado por todas as superfícies que colam conteúdo de terceiro no
  prompt.
- Fechar os quatro caminhos de maior dano: escrita sem confirmação no sisub, `replace` em massa no MCP,
  imagem no contrate e system prompt do cliente no sucont.

**Non-Goals:**
- Medir quanto o modelo obedece à injeção, porque isso pede eval com o modelo real. Os testes aqui
  provam a montagem do prompt e o comportamento do servidor, como os do α.
- Delimitar resultado de tool com nonce. O resultado vai na mensagem `tool`, que já é um papel separado
  da fala do usuário. Envolver o JSON mudaria o formato que as tools e os testes de contrato esperam. A
  defesa ali é a regra no prompt mais a aprovação humana da escrita.

## Decisions

### D1. Helper em `@iefa/ai-provider/untrusted`

- **Subpath novo, puro e sem dependência:**
  - `createPromptNonce()`
  - `neutralizeDelimiters(text, nonce, tagPrefix)`
  - `wrapUntrusted({ tagPrefix, nonce, label, text })`
  - `untrustedContentRule(tagPrefix)`, o texto da regra de sistema.
  - `dropClientSystemMessages(messages)`, que descarta papel `system`/`developer` vindo do navegador.
    Hoje o sisub tem isso em `chat-client-messages.ts`, e o portal e o oráculo do sucont não.
- **Base:** a lógica do `judge-prompt.ts`, inclusive o substituto `[marcador-removido]` e a rede de
  segurança que troca `<` por `‹`.
- **Prefixo:**
  - Validado contra `^[a-z]+_$` e escapado no regex.
  - A prova de que o substituto não remonta marcador vale para qualquer prefixo nesse formato.
  - Teste com dois prefixos.
- **α:**
  - O `judge-prompt.ts` mantém o `neutralizeDelimiters(text, nonce)` de dois argumentos como wrapper
    do pacote com o prefixo `documento_`. A saída fica idêntica byte a byte.
  - O `chat/prompt.ts` continua com o `wrap` próprio (usa atributos e nonce HMAC por conversa) e só
    importa a neutralização.
  - Os testes do α seguem verdes sem mudar o esperado.
- **Por que `ai-provider`:** α, sisub, portal e sucont já dependem dele.
  - O `sisub-mcp` não depende, e adicionar a dependência levaria o AWS SDK à imagem e mudaria o
    `Dockerfile` gerado.
  - Por isso o texto da regra para resultado de tool fica em `@iefa/sisub-domain/agent`, que o chat e o
    MCP já compartilham (D4).

### D2. Aprovação humana das tools de escrita do sisub

**Como a lib transporta a aprovação (0.63):**
- O servidor emite um interrupt `approval_<toolCallId>` e encerra o run.
- O cliente responde em `resume: [{ interruptId, status: "resolved", payload: { approved } }]`, junto
  com `parentRunId`.
- O `chatParamsFromRequestBody` apaga as `parts` das mensagens, então a aprovação **não** viaja no
  histórico.

**Servidor:**
- `wrapTool` marca `needsApproval: true` em toda tool com `requiredLevel >= 2`. São exatamente as 8
  escritas do registro.
- A rota `module-chat/stream.post.ts` repassa `resume`, `parentRunId`, `runId` e `threadId` ao `chat()`.
- O `sanitizeClientMessages` ganha `{ approvalTools, resume }`. Uma call pendente só sobrevive se:
  - a tool está em `approvalTools`; e
  - o `resume` traz `approval_<id>` resolvido.
  Qualquer outra call pendente segue descartada.
- O `resume` com `editedArgs`, ou com payload fora de `{ approved: boolean }`, é recusado com 400. A
  call executa com os argumentos do histórico, que são os mostrados no cartão.
- O analytics não muda: segue com `allowPendingToolCalls: false`.

**Descrição da entidade:**
- Uma server fn só de leitura, `describeChatActionFn({ module, toolName, args })`, resolve com PBAC e
  escopo da rota o que o UUID significa: receita, data e refeição, cozinha, estimativa.
- O cartão mostra a ação no imperativo e essa descrição. Os rótulos ficam num mapa novo ao lado do
  `ToolCallDisplay`, que hoje usa gerúndio.
- **Se a descrição falhar:** o cartão mostra a ação e diz "não foi possível descrever o item". Não
  mostra UUID.

**Cliente (`useModuleChatSession`):**
- Enquanto houver interrupt pendente, o input fica desabilitado com o aviso "Confirme ou recuse a ação
  acima". O `handleSubmit` não grava a mensagem do usuário nesse estado.
- A gravação da mensagem do assistente acontece uma vez, depois da decisão, e não na parada do
  interrupt.
- Recusa:
  - É gravada com o status novo `denied` no `tool_calls` (jsonb).
  - O `SaveModuleChatMessageSchema` passa a aceitar `denied` como terminal.
  - O `ToolCallDisplay` mostra "Recusada pelo usuário", não "Erro".
- Ao recarregar, uma call sem resposta não aparece como executada, porque nada foi gravado para ela.

**Usuário forjando a própria aprovação:** só consegue o que já faria pela tela. O PBAC e o escopo são
conferidos na execução, e a aprovação defende contra o modelo manipulado, não contra o usuário.

**Alternativas descartadas:**
- Confirmação só no prompt: é o estado atual, e é justamente o que a injeção contorna.
- Tool que só "propõe", com a tela executando por server fn própria: tira o resultado do laço do modelo
  e exige token de uso único guardado no banco, ou seja, migration.

### D3. Escopo da rota na linha resolvida

- Um helper em `module-chat/tools/shared.ts` compara a cozinha ou unidade **resolvida** com
  `ctx.scopeId`: `assertRouteScope(ctx, kind, resolvedId)`.
- Cada handler chama o helper depois de buscar a linha, no mesmo ponto onde hoje confere o PBAC:
  - kitchen: `kitchenId` direto; `add_menu_item` (via `dailyMenuId`), `remove_menu_item` (via `itemId`),
    `update_menu_headcount` (via `menuId`), `get_day_details`, `get_template_items` (template de cozinha);
  - unit: `get_quantity_estimate`, `list_empenhos` e `update_quantity_estimate_status` (OM dona da
    estimativa).
- **Recurso global** (receita ou template sem cozinha): é catálogo compartilhado, então não é recusado
  pelo escopo. Continua só a leitura, pelo PBAC.
- Sem escopo de rota, o comportamento atual continua. O erro volta ao modelo como mensagem de domínio.

### D4. MCP usa o contrato de agente

- No MCP, o `apply_template` usa `AgentApplyTemplateSchema.strict()` e `agentApplyTemplate`.
  - O `.strict()` fica só no MCP. Sem ele, o zod 4 descarta `conflictMode`/`startDate` calado, e a
    chamada roda diferente do que o cliente pediu.
  - A descrição da tool explica `targetDates` e que substituir é só pela tela.
- Em `annotations.ts`, o `apply_template` passa de `destructive` para `additive`, porque só preenche.
  O `annotations.test.ts` acompanha.
- O texto das `instructions` do `Server` vem de `@iefa/sisub-domain/agent`
  (`AGENT_UNTRUSTED_DATA_RULE`). O `answer-style.ts` do chat usa o mesmo texto.
- **Por que o contrato e não um teto próprio no MCP:** o `.claude/rules/ai-tools.md` já faz do contrato
  a fonte do que agente pode fazer. Um segundo teto divergiria.

### D5. Superfícies que colam conteúdo no prompt

| Superfície | Antes | Depois |
|---|---|---|
| portal `comaer/prompt.ts` + `chat.post.ts` | documento como 2º system prompt em texto livre; aceita `system` do cliente | documento em `wrapUntrusted` com nonce por requisição, no mesmo 2º system prompt; regra no 1º; `dropClientSystemMessages` |
| sucont `conta-generica.fn.ts` | `system: data.systemContext` | system fixo no servidor; `context` (máx. 60k) delimitado no `user`; `query` máx. 4k |
| sucont `oracle-prompt.ts` + `chat/stream.post.ts` | `contextSummary` em texto livre no system | bloco delimitado com nonce por requisição, no system (sem cache); regra; `dropClientSystemMessages`; `model-bench.ts` acompanha |
| sucont `document-ai.fn.ts` | tudo no `user`, rascunho entre aspas | persona e regras no `system`; rascunho delimitado no `user`; `draft` máx. 60k |
| sucont auditor `report-prompt.ts` | JSON da planilha cru no `user` | JSON dentro do bloco delimitado; regra no system |
| sucont `sacdgc/prompt.ts` | consolidado cru no `user` | consolidado dentro do bloco delimitado; regra no system |
| α `extraction/extract.ts` | `DOCUMENTO:\n${text}` | `buildExtractionUserMessage` puro, bloco com nonce por chamada; regra 5 no `SYSTEM_PROMPT` |

- **Tetos:** os maiores usos reais cabem com folga. O `systemContext` da Conta Genérica tem poucos KB, e
  o `contextSummary` do oráculo já é limitado a 60k em `oracle-request.ts`. Acima do teto, o Zod recusa
  antes da chamada.

### D6. Texto oculto no DOCX das submissões

- O `parseDocx` ganha a opção `{ dropHidden: true }`, usada só por `extraction/to-text.ts` (submissões).
  O caminho dos modelos da AGU não muda.
- O laço de `parseParagraphs` passa a acompanhar `w:r` e `w:rPr`:
  - um `w:vanish` dentro do `w:rPr` do run descarta os `w:t` daquele run;
  - `w:val` igual a `false`, `0` ou `off` não oculta;
  - `w:pPr/w:rPr/w:vanish` (marca de parágrafo) é ignorado;
  - `w:webHidden` não oculta.
- **Hash do corpus:** é dos bytes crus, então não muda.
- **Spans antigos:** `extraction.spans` de submissão com texto oculto pode desalinhar na reexecução,
  porque o texto é reparseado. É raro e aceito: a evidência é reconferida contra o texto novo.
- **Fora do escopo:**
  - Ocultação por estilo (`w:rStyle` com vanish em `styles.xml`) e texto invisível em PDF (cor branca,
    fonte zero) ficam como risco registrado.
  - Detectar exige resolver estilos ou renderizar o PDF.

### D7. Imagem no contrate

- No `MessageBody.tsx`, o override de `img` mostra só o texto alternativo, sem URL. É o comportamento
  do `ModelImagePlaceholder` do portal, com teste igual.
- O teste é `.test.ts` com `createElement` e `renderToStaticMarkup`, porque o runner do contrate só acha
  `*.test.ts`.

### D8. Catálogo de edge cases

Entram em `.claude/skills/edge-cases` (`gestao-cozinha.md`, `gestao-unidade.md`):
- **Aprovação pendente perdida ao recarregar:** coberto, nada é gravado.
- **Aprovação dada depois que o dado mudou:** LACUNA. A escrita da tool não confere a versão vista,
  como já acontece nas escritas por PostgREST (`EDIT-SAFETY`).

## Risks / Trade-offs

- **Aprovação aumenta o atrito no chat do sisub:** criar uma receita passa a pedir um clique a mais. É
  aceito, porque é o único controle que não depende do modelo. O cartão mostra a ação inteira para o
  clique ser informado.
- **Fluxo de interrupt novo na lib, com risco de bug na integração com o histórico persistido:**
  - Mitigação: teste do `sanitizeClientMessages` com corpo AG-UI real, passando por
    `chatParamsFromRequestBody`.
  - Teste do hook para gravar uma vez só.
  - Smoke manual no app.
- **BREAKING no MCP:**
  - Todo cliente que usava `startDate`/`endDate`/`dates` passa a receber erro de validação até usar
    `targetDates`.
  - O erro e a descrição da tool explicam a entrada nova.
  - Os prompts `plan_week` e `apply_template_wizard` do `server.ts` passam a pedir `targetDates`.
- **A regra no prompt reduz o risco, mas não elimina:** por isso as defesas estruturais (aprovação,
  escopo, contrato e imagem) vêm junto e não dependem do modelo.
- **Fallback para outro provider:** o helper é texto, então vale em qualquer provider.

## Migration Plan

1. Um PR com todos os apps. Não há migration nem infra, e o deploy de cada app é independente.
2. Os apps sobem pela ordem normal do CI/CD. Não há dependência de ordem entre eles: o pacote
   `ai-provider` é empacotado no build de cada app.
3. **Rollback:** reverter o squash. Nenhum dado muda de formato. A mensagem de chat com aprovação
   gravada continua legível pela versão anterior: é uma mensagem com tool call e resultado.
