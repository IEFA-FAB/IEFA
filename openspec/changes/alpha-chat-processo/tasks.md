# Tasks

Dois PRs contra `main`, cada um revisado com `/code-review` antes do merge. O **PR 1** leva o banco e o α, e é aditivo. O **PR 2** leva o contrate. O α vai para o ar antes do contrate, e a migration é aplicada antes do merge do PR 1.

## 1. Banco e LGPD

- [x] 1.1 [database] Migration `alpha_document_chat`: `alpha.chat_thread`, `alpha.chat_message`, `alpha.chat_attachment` (FKs com `on delete cascade`, checks de `role`/`status`, coluna `saved_at`, `last_activity_at`, índices `(user_id, last_activity_at desc)`, `(submission_id)`, parcial de expurgo (avulsa não salva), `(thread_id, created_at)`, índice parcial de mensagens `role = 'user'` para o teto), RLS ligada sem policy, bucket privado `alpha-chat-attachments` (25 MiB, MIME de PDF/DOCX)
- [x] 1.2 [database] `bun --filter @iefa/database audit:rls` verde, sem entrada nova nas allowlists
- [x] 1.3 [database] APLICADA em produção em 2026-09-22 por `apply_migration` (carimbo `20260922034921`, arquivo renomeado); `audit:rls` com 0 erro. O `generated.ts` NÃO foi regenerado: a main está atrás do banco (traria `access_control.*`, `inventory.count_scope_item` etc. de outras frentes), e o α usa cliente sem tipo
- [x] 1.4 [legal-kit] (APLICADA em 2026-09-22 — `20260922132000_legal_documents_v2_3.sql`: Termos e Privacidade 2.3.0, Cookies 1.3.0 reinserida sem versão nova) Nova versão da Política de Privacidade (linha NOVA em `iefa.legal_documents`) declarando a guarda de conversas e anexos do contrate (avulsa não salva: 180 dias sem uso; salva: até o usuário apagar; de processo: enquanto o processo existir) e o apagamento pelo usuário. `contact.test.ts` segue verde. Aplicar antes do deploy do contrate

## 2. α — núcleo puro (`src/chat/`)

- [x] 2.1 [alpha] `chat/sources.ts`: tipos de fonte (documento, achado, parecer, anexo) e `buildSourceBundle`, que monta o texto integral ou o sumário por `ALPHA_CHAT_DOC_MAX_CHARS`, com testes para abaixo e acima do teto e para múltiplos anexos
- [x] 2.2 [alpha] `chat/prompt.ts`: prompt de sistema (papel de apoio, rótulos `[N…]`/`[A…]`/`[D:…]`, bloco `redacao`, só citar norma com rótulo), fontes em bloco próprio com delimitadores de nonce (reuso de `judge-prompt.ts`). Testes: instrução embutida no documento continua dentro do delimitador, e o delimitador forjado é neutralizado
- [x] 2.3 [alpha] `chat/citations.ts`: `resolveCitations(text, turnSources)` remove rótulo sem fonte, conta `dropped_citations` e localiza a citação literal de documento com `locateEvidence`. Testes: `[N5]` inexistente, achado fora da lista, caminho inexistente, aspas não localizadas
- [x] 2.4 [alpha] `chat/doc-tools.ts`: `readSection(nodes, path)` e `searchDocument(text, term)` (sem acento e sem caixa, 8 ocorrências, 400 caracteres de contexto), com testes
- [x] 2.5 [alpha] `lib/alpha-access.ts`: `decideThreadAccess(thread, user)` puro, com testes (dono, outro usuário e conversa inexistente dão o mesmo resultado)
- [x] 2.6 [alpha] `chat/retention.ts`: `isPurgeable(thread, now)` e `purgeAt(thread)` puros. Testes: 179 e 180 dias, salva, de processo, recém-desmarcada

## 3. α — agente e rotas

- [x] 3.1 [alpha] `chat/load-sources.ts` (com cache PRÓPRIO de texto + árvore de seções, em vez de exportar `loadSubmissionText`, que só guarda o texto; o `TextCache` virou genérico para isso) para carregar as fontes do processo (texto, achados da execução `succeeded` mais recente com triagem, parecer vigente, metadados) e do avulso (texto dos anexos pelo `TextCache`). Checar `error` de cada leitura: falha de leitura NUNCA vira "sem achados"
- [x] 3.2 [alpha] `lib/llm.ts`: tier `chat` (`ALPHA_CHAT_AI_MODEL`, vazio = primário) e `env.ts` com as quatro variáveis opcionais do chat e seus defaults. Verificado: o `@langchain/aws` 1.4.5 repassa o `cachePoint` na mensagem de sistema; registrado no `AI-PROVIDERS.md`
- [x] 3.3 [alpha] `chat/agent.ts`: laço `bindTools` com até 4 rodadas, ferramentas `buscar_norma` (corpus declarado, compatível com `corpora.contract.test.ts`), `ler_secao` e `buscar_no_documento` (só quando a fonte vai em sumário), `withModelFallback` antes do primeiro conteúdo, `signal` repassado, texto transmitido na rodada final. Testes com modelo falso: rodada de ferramenta seguida de texto, e teto de rodadas
- [x] 3.4 [alpha] `api/chats.ts`: `POST/GET /chats`, `GET/DELETE /chats/:id`, anexos (`POST`/`DELETE`, validados com `inspectSubmissionDocument`, limite de 5, recusa em conversa de processo), com Storage apagado antes das linhas no `DELETE`
- [x] 3.5 [alpha] `POST /chats/:id/messages/stream`: dono, `canReadSubmission` a cada turno (403 `SUBMISSION_ACCESS_REVOKED`), teto diário antes do SSE (429 `CHAT_DAILY_LIMIT` + `retry_after`), mensagem do usuário gravada antes do modelo, eventos `status`/`delta`/`complete`/`error`, keep-alive de 15 s, teto de 180 s, mensagem do assistente com `status`, tokens e latência
- [x] 3.5a [alpha] `PATCH /chats/:id` (salvar/deixar de salvar, título). Deixar de salvar toca `last_activity_at`. Lista e leitura devolvem `saved_at` e `purge_at`
- [x] 3.5b [alpha] `jobs/purge-chats.ts`: rotina diária no modelo do `scheduler.ts`, lotes de 100, mesmo caminho de remoção do `DELETE` (Storage antes da linha), idempotente com várias tasks, `ALPHA_CHAT_PURGE_ENABLED` (default `true`). Teste com Storage falhando: a conversa fica
- [x] 3.6 [alpha] `body-limits.ts`: teto de 26 MB para `POST /api/v1/chats/:id/attachments`, com teste em `body-limits.test.ts`
- [x] 3.7 [alpha] `authz.routes.test.ts`: cobrir os cenários da spec `alpha-document-chat` (outro usuário → 404; outra OM → 403; revogado → 403 sem chamar o modelo; teto → 429 sem gravar; anexo em conversa de processo → 409)
- [x] 3.8 [alpha] `llms.txt`/`agent-discovery.ts` e a seção do α no `AI-PROVIDERS.md` (tier `chat`, teto diário)
- [x] 3.9 [alpha] (2026-09-22, com `gpt-oss-120b` e com `claude-opus-4-6`; pegou dois bugs — `cachePoint` em modelo sem prompt caching dá 403, e rodada final sem `toolConfig` dá 400 —, ambos corrigidos) Testar ponta a ponta local contra o banco: conversa de processo com a massa de teste (ETP+TR do forno AMR/IAE) e conversa avulsa com um DOCX. Conferir as citações resolvidas e um bloco `redacao`

## 4. contrate — cliente e componentes

- [x] 4.1 [contrate] `lib/alpha/sse.ts`: `parseSseBuffer` portado do portal, com o teste
- [x] 4.2 [contrate] `lib/alpha/chat.ts`: query options de lista e conversa, `createChat`, `deleteChat`, `uploadAttachment`, `streamTurn` (fetch + `ReadableStream`, `AbortController`, tradução de 403/404/429) e `splitRedaction` (separa o bloco `redacao` e a linha de seção). Testes das funções puras
- [x] 4.3 [contrate] `components/chat/`: `ChatThread`, `MessageBubble` (ReactMarkdown, texto trocado pelo do `complete`), `RedactionBlock` (copiar só o texto proposto, com aviso), `CitationChip` + `CitationPanel` (norma por `/chunks/:id`, achado e documento com `located: false` → "trecho não localizado"), `AttachmentDropzone`, `ChatComposer` e o aviso permanente de apoio. Pale Brutalism: zero radius, sem faixa lateral
- [x] 4.3a [contrate] Salvar/deixar de salvar na lista e na conversa. Aviso "será apagada em DD/MM" (Brasília) nas avulsas não salvas, com destaque e botão Salvar a 30 dias ou menos
- [x] 4.4 [contrate] Estados de falha: limite diário com horário, modelo indisponível, timeout, resposta interrompida com reenvio e acesso revogado com envio desabilitado

## 5. contrate — superfícies

- [x] 5.1 [contrate] `ProcessView`: botão "Conversar" no cabeçalho e painel lateral com as conversas do usuário sobre o processo (abre a mais recente, "Nova conversa"). Tela cheia em viewport estreito
- [x] 5.2 [contrate] `FindingCard`: ação "Perguntar sobre este achado", que abre o painel com a pergunta preenchida, sem enviar
- [x] 5.3 [contrate] Rotas `/conversar` (lista + nova conversa) e `/conversar/$threadId`, com entrada na navegação em `lib/modules.ts` gated por `canSubmit`; regenerar o `routeTree.gen.ts`
- [ ] 5.4 [contrate] Validar no navegador: processo como requisitante e como ACI da OM, avulso com PDF e DOCX, citação de norma aberta, redação copiada, limite diário simulado. `react-doctor` sem regressão

## 6. Fechamento

- [ ] 6.1 [root] `bun run check` e `bun run test` (turbo `--concurrency=2`) verdes, e `bun run lint` sem `--write`
- [ ] 6.2 [root] `/code-review` de cada PR, com os achados relatados no PR antes de pedir merge
- [ ] 6.3 [alpha] Depois do deploy: conferir custo e latência por turno (`chat_message.input_tokens`/`latency_ms`) na primeira semana e calibrar `ALPHA_CHAT_MAX_TURNS_PER_DAY`/`ALPHA_CHAT_DOC_MAX_CHARS`
