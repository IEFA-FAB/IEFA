# Tasks

## 1. Helper compartilhado

- [x] 1.1 [ai-provider] Criar `src/untrusted.ts` com `createPromptNonce`, `neutralizeDelimiters`, `wrapUntrusted`, `untrustedContentRule` e `dropClientSystemMessages`, com prefixo validado (`^[a-z]+_$`). Exportar no subpath `./untrusted` e cobrir com `untrusted.test.ts`: marcador forjado, nonce no texto, marcador partido `</docu<documento_>mento_x>`, dois prefixos, rótulo com quebra de linha, `system`/`developer` descartados. Verificação: testes do pacote verdes.
- [x] 1.2 [alpha] `compliance/judge-prompt.ts`: manter o `neutralizeDelimiters(text, nonce)` como wrapper do pacote (prefixo `documento_`). `chat/prompt.ts`: importar a neutralização. Verificação: `judge-prompt.test.ts` e `chat/prompt.test.ts` verdes sem editar o esperado.

## 2. sisub: aprovação humana

- [x] 2.1 [sisub] `wrapTool` em `module-chat/tools/shared.ts`: `needsApproval: true` nas tools com `requiredLevel >= 2`; exportar o conjunto de nomes. Verificação: teste em `shared.test.ts`.
- [x] 2.2 [sisub] `sanitizeClientMessages({ approvalTools, resume })` e rota `module-chat/stream.post.ts` repassando `resume`/`parentRunId`/`runId`/`threadId` ao `chat()`. Recusar com 400 o `resume` com `editedArgs` ou payload fora de `{ approved: boolean }`. Verificação: casos em `chat-client-messages.test.ts` com corpo AG-UI real passado por `chatParamsFromRequestBody` (leitura pendente descartada, escrita sem aprovação descartada, escrita aprovada mantida, recusada mantida como recusa, `editedArgs` recusado).
- [x] 2.3 [sisub] Server fn `describeChatActionFn` só de leitura, com PBAC e escopo da rota, que descreve a entidade de cada tool de escrita sem UUID. Verificação: teste por tool, inclusive a falha que devolve "não foi possível descrever o item".
- [x] 2.4 [sisub] Tela: cartão Confirmar/Recusar com rótulo no imperativo e descrição. Input bloqueado com interrupt pendente; `handleSubmit` não grava nesse estado; gravação única depois da decisão; status `denied` no `ToolCallDisplay` ("Recusada pelo usuário"). Seguir o `STYLE_CONTRACT.md` do sisub. Verificação: teste do hook e smoke no app.
- [x] 2.5 [sisub-domain] `SaveModuleChatMessageSchema` aceita `denied` como status terminal. Verificação: teste do schema.

## 3. sisub: escopo e prompt

- [x] 3.1 [sisub] `assertRouteScope` em `shared.ts`, chamado depois de resolver a linha em todas as tools do kitchen e do unit listadas em D3. Recurso global não é recusado. Verificação: teste por tool no padrão de `unit-behavior.test.ts` (outra cozinha ou OM é recusada; global e sem escopo passam).
- [x] 3.2 [sisub-domain] `AGENT_UNTRUSTED_DATA_RULE` em `agent/`; [sisub] incluir a regra no `prompts/answer-style.ts`. Verificação: teste do registry (todo módulo contém a regra).

## 4. sisub-mcp

- [x] 4.1 [sisub-mcp] `apply_template` com `AgentApplyTemplateSchema.strict()` e `agentApplyTemplate`. Atualizar a descrição, os prompts `plan_week`/`apply_template_wizard` e a anotação (`additive`). Verificação: teste que recusa `conflictMode`, `startDate` e mais de 31 datas; `annotations.test.ts` ajustado.
- [x] 4.2 [sisub-mcp] `instructions` no `Server` com `AGENT_UNTRUSTED_DATA_RULE`. Verificação: teste que confere as instruções.

## 5. contrate

- [x] 5.1 [contrate] Override de `img` em `components/chat/MessageBody.tsx` que mostra só o texto alternativo. Verificação: `MessageBody.test.ts` com `renderToStaticMarkup`, sem `<img>` e sem a URL.

## 6. portal

- [x] 6.1 [portal] `lib/comaer/prompt.ts`: documento em `wrapUntrusted` com nonce por requisição e regra no system prompt. `chat.post.ts`: `dropClientSystemMessages`. Verificação: teste da montagem (marcador forjado fica dentro do bloco; regra presente) e teste do descarte de papel.

## 7. sucont

- [x] 7.1 [sucont] `conta-generica.fn.ts`: system fixo; `context` (máx. 60k) delimitado no `user`; `query` máx. 4k. Ajustar `routes/conta-generica.tsx`. Verificação: teste da montagem e do teto.
- [x] 7.2 [sucont] `oracle-prompt.ts`: `contextSummary` em bloco delimitado com regra; `chat/stream.post.ts` com `dropClientSystemMessages`; `model-bench.ts` acompanha. Verificação: teste da montagem.
- [x] 7.3 [sucont] `document-ai.fn.ts`: persona e regras no `system`, rascunho delimitado, `draft` máx. 60k. Verificação: teste da montagem e do teto.
- [x] 7.4 [sucont] Auditor (`report-prompt.ts`) e SAC-DGC (`sacdgc/prompt.ts`): dados de planilha no bloco delimitado com regra. Verificação: testes da montagem.

## 8. alpha

- [x] 8.1 [alpha] `extraction/extract.ts`: `buildExtractionUserMessage` puro, com nonce por chamada, e regra 5 no `SYSTEM_PROMPT`. Verificação: teste da montagem.
- [x] 8.2 [alpha] `sources/docx.ts`: opção `dropHidden`, usada só por `extraction/to-text.ts`. Verificação: testes com run oculto (some), `w:val="false"`/`"0"`/`"off"` (fica), `w:pPr/w:rPr/w:vanish` (parágrafo fica) e `w:webHidden` (fica).

## 9. Edge cases e integração

- [x] 9.1 [sisub] Registrar no catálogo `.claude/skills/edge-cases` (`gestao-cozinha.md`, `gestao-unidade.md`) a aprovação pendente perdida (coberta) e a aprovação depois de o dado mudar (LACUNA).
- [x] 9.2 Rodar `bun run check`, `bun run lint --concurrency=2` e `bun run test --concurrency=2` verdes.
- [ ] 9.3 Smoke no app: no chat do sisub, aprovar, recusar e recarregar com ação pendente; no contrate, imagem vira texto. (Pendente: sem credencial de login nem `.env` acessível ao agente. O fluxo está coberto por `approval-flow.test.ts`, com `ChatClient` e `chat()` reais e só o modelo falso.)
