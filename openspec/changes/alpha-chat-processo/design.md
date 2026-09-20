## Context

O α tem hoje duas coisas que o chat precisa juntar.

**Documento e achados.** A submissão guarda o arquivo no bucket `alpha-submissions` (PDF/DOCX, até 25 MiB). O texto não é gravado: ele é reconstruído sob demanda por `toSubmissionText(bytes, mime)` (`extraction/to-text.ts`), que devolve `{ text, nodes }`, com `nodes` sendo a árvore de seções com corpo. O resultado passa por um `TextCache` em memória (`api/submissions.ts`, `loadSubmissionText`, hoje privada do módulo). Os achados ficam em `alpha.compliance_finding`, com severidade, `section_path`, `message`, `legal_ref`, `suggestion`, `evidence_span` e triagem. O parecer vigente é a linha mais recente de `alpha.compliance_review`.

**Conversa sobre norma.** O ChatRADA (`graph/*`) é um LangGraph `router → rada_agent → grader → synthesizer` sobre `PostgresSaver`, com `thread_id = session_id`. A sessão não tem tabela: ela só ganha dono quando a primeira linha cai em `query_log` (`canAccessSession`). A resposta chega inteira no fim, pelo evento `complete`, sem streaming de texto. Esse grafo foi desenhado para pergunta sobre regulamento: ele classifica, busca, gradua a evidência e sintetiza. A intenção `PROCUREMENT` nem vai ao corpus da 14.133.

O modelo é chamado por LangChain (`lib/llm.ts`). O primário é Bedrock `ChatBedrockConverse`, e a reserva, `makeChatLLM`. Há `withModelFallback` para falha transitória e o tier `fast`. O retriever (`tools/rada-retriever.ts`) faz busca híbrida (cosseno + FTS + RRF) e exige declarar o corpus (`lib/corpora.ts`: `AERONAUTICAL`, `FEDERAL_LEGISLATION`, `TEMPLATE`). O contrato `corpora.contract.test.ts` cobra isso.

Autorização:

- `authMiddleware` monta `AlphaAccess` (papéis por OM, com a cobertura de apoio).
- `canReadSubmission(submissionId, user, access)` (`api/authorize.ts`) decide quem lê o processo: o autor, ou Requisitante, Licitações ou ACI que cubra a OM.

O contrate fala com o α por `alphaRequest` (`lib/alpha/client.ts`), com o Bearer da sessão Supabase, e não faz streaming em lugar nenhum. O portal tem o cliente SSE do ChatRADA (`lib/alpha/chat.ts`: `parseSseBuffer`, testado) e o painel de citação (`CitationPanel`, com leitura preguiçosa de `/chunks/:id`).

## Goals / Non-Goals

**Goals:**

- Um motor de chat ancorado em fontes, único para as duas superfícies (processo e avulso). O que muda entre elas é só de onde vêm as fontes.
- Resposta em streaming de texto, com citação que o servidor garante existir.
- Conversa com dono desde a criação, e autorização do processo reavaliada a cada turno.
- Teto de consumo antes do SSE.
- Documento e anexos tratados como conteúdo não confiável no prompt.

**Non-Goals:** os da proposta. Em especial: não tocar o grafo do ChatRADA, não editar documento, não compartilhar conversa.

## Decisions

### D1. Motor novo em `src/chat/`, sem reusar o grafo do ChatRADA

É um laço de agente com ferramentas (LangChain `bindTools` sobre o `getLLM` existente), com no máximo 4 rodadas de ferramenta por turno. Na rodada final, o texto é transmitido.

- **Alternativa considerada:** um nó novo no grafo do ChatRADA. Foi descartada:
  - o roteador, o grader e o `no_basis` foram calibrados para "achar o dispositivo no RADA-e", e cada um custa uma chamada de modelo antes da primeira palavra;
  - o estado do grafo atravessa turnos (ver o `buildTurnInput`), e isso já rendeu dois bugs;
  - o grafo não transmite texto.
- **Alternativa considerada:** `@tanstack/ai` (`chat()` + `createAdapterFromEnv`). Foi descartada por ora. O α inteiro é LangChain: fallback, retry com `$metadata.httpStatusCode` e tracer. Um segundo stack de modelo no mesmo serviço duplicaria a reserva e a telemetria. Migrar o α não é deste change: o item 6.3 do `tanstack-ai-multiprovider-migration` cobria só a parte de LLM do `@iefa/alpha-client`, e foi fechado com o change arquivado em `openspec/changes/archive/2026-09-20-tanstack-ai-multiprovider-migration/`.

Ferramentas do agente, todas somente leitura:

- `buscar_norma({ consulta, corpus: "legislacao" | "modelos_agu" | "aeronautico" })`: o `radaRetriever` com o filtro do corpus declarado, top 6. Devolve os trechos numerados com id.
- `ler_secao({ caminho, fonte })`: devolve o corpo de uma seção de uma fonte do turno (documento do processo ou anexo). Só existe quando alguma fonte não coube inteira (D2).
- `buscar_no_documento({ termo, fonte })`: busca literal (sem acento, sem caixa) nas fontes do turno, com até 8 ocorrências e 400 caracteres de contexto cada. Serve para "onde o TR fala de garantia?" quando o texto não está inteiro no prompt.

### D2. Contexto: documento inteiro quando cabe, sumário + ferramentas quando não

A cada turno, o contexto se monta do zero (`chat/context.ts`). Nada vem do estado do turno anterior além do histórico de mensagens. Isso evita o bug do canal que sobrevive entre turnos.

- **Fontes do processo:**
  - texto do documento (`loadSubmissionText`, que passa a ser exportada);
  - achados da execução `succeeded` mais recente, com triagem e nota, já ordenados por severidade;
  - parecer vigente;
  - metadados (tipo do documento, modalidade, objeto, OM).
- **Fontes do avulso:** o texto de cada anexo (`toSubmissionText` sobre o arquivo do bucket novo), cacheado no mesmo `TextCache`.
- **Orçamento:** `ALPHA_CHAT_DOC_MAX_CHARS`, com default de 150.000 caracteres somando todas as fontes. O preenchimento é guloso, da menor fonte para a maior: com um TR de 40 mil e um edital de 300 mil, o TR vai inteiro e só o edital resume. A fonte que não cabe vai como sumário: a árvore `nodes` com caminho, título e tamanho, mais os primeiros 1.500 caracteres de cada seção de nível 1. `ler_secao` e `buscar_no_documento` passam a existir.
  - **Por que não sempre ferramentas:** cada rodada de ferramenta é uma ida ao modelo. O ETP/TR típico (30 a 80 mil caracteres) cabe, e ter o texto inteiro é o que faz a conversa parecer com o NotebookLM.
  - **Por que não sempre inteiro:** o edital com anexos passa de 300 mil caracteres.
- **Cache de prompt:** o bloco das fontes vai num bloco de sistema próprio, estável entre turnos, marcado com `cachePoint` do Bedrock Converse. Ele muda quando uma execução nova conclui, e aí o cache se refaz. A verificação de que o `ChatBedrockConverse` instalado repassa o `cachePoint` é tarefa. Se ele não repassar, o motor funciona igual, só que mais caro, e isso fica registrado.
- **Conteúdo não confiável:** documento, anexos, `message`/`suggestion` dos achados e a nota do parecer entram entre delimitadores com nonce, e os metadados digitados por quem envia (modalidade, nome do arquivo) também. A neutralização é `neutralizeDelimiters`, de `compliance/judge-prompt.ts`, a mesma do verificador. **O nonce é por conversa, não por turno** como no juiz: um nonce novo a cada turno mudaria o bloco das fontes e anularia o cache de prompt. Ele sai de um HMAC do id da conversa com chave sorteada no boot (`conversationNonce`), então quem escreve o documento continua sem conhecê-lo. Um TR com "ignore as instruções anteriores" é texto a analisar.

### D3. Citações: marcadores com id, validados no servidor

O prompt apresenta cada fonte do turno com um rótulo estável:

- `[N1]`, `[N2]`… para os trechos do corpus retornados por `buscar_norma`;
- `[A3]` para o achado (índice na lista do turno);
- `[D:<caminho>]` para uma seção do documento.

O modelo cita com esses rótulos. Ao final do turno, `chat/citations.ts` faz três coisas:

1. **Resolve** cada rótulo contra as fontes REALMENTE entregues no turno: ids de chunk que vieram do retriever, achados carregados e caminhos existentes em `nodes`.
2. **Descarta** rótulo que não resolve. Ele some do texto e é contado em `dropped_citations`. Nunca aparece como link quebrado ou como fonte inventada. É a lição do `toReferences` do ChatRADA, que fabricava "Trecho N".
3. **Localiza a citação literal** de trecho do documento (modelo entre aspas seguido de `[D:…]`) com `locateEvidence`. Se não localizar, marca `located: false`, e a interface mostra "trecho não localizado no documento", em vez de apresentar como citação.

A mensagem persistida guarda `citations: [{ label, kind: "norma"|"achado"|"documento", ref, located? }]`. O contrate resolve `norma` por `GET /api/v1/chunks/:id`, o mesmo endpoint do ChatRADA.

Durante o streaming, o texto vai cru, com rótulos. O evento final `complete` traz o texto limpo e a lista de citações, e o cliente troca o texto pelo final. A validação precisa do texto inteiro, e mostrar só no fim tiraria o sentido do streaming.

### D4. Redação sugerida: bloco cercado, sem efeito colateral

O prompt instrui: correção de texto sai num bloco ` ```redacao ` com, opcionalmente, a primeira linha `Seção: <caminho>`. O contrate renderiza esse bloco como cartão com botão "Copiar" e o aviso fixo "Sugestão do assistente — confira com a norma antes de usar". Não há ferramenta de escrita, e o agente não tem como alterar achado, parecer ou documento. A garantia é estrutural (nenhuma ferramenta escreve), não uma instrução de prompt.

### D5. Persistência: tabelas próprias, dono na criação

Migration `alpha_document_chat` no schema `alpha`:

- **`chat_thread`**: `id uuid pk`, `user_id uuid not null`, `submission_id uuid null → alpha.submission on delete cascade`, `title text`, `saved_at timestamptz null`, `created_at`, `last_activity_at`. Índice `(user_id, last_activity_at desc)`, índice por `submission_id` e índice parcial `(last_activity_at) where submission_id is null and saved_at is null` para o expurgo (D10).
- **`chat_message`**: `id`, `thread_id → chat_thread on delete cascade`, `user_id` (denormalizado da conversa, para o teto diário ser uma leitura só), `role (user|assistant)`, `content text`, `citations jsonb`, `status (complete|aborted|error)`, `model`, `input_tokens`, `output_tokens`, `latency_ms`, `created_at`. Índice `(thread_id, created_at)` e índice `(user_id, created_at desc)` parcial por `role = 'user'`, para o teto (D7).
- **`chat_attachment`**: `id`, `thread_id → chat_thread on delete cascade`, `storage_path`, `filename`, `mime_type`, `size_bytes`, `text_chars`, `created_at`. Check: no máximo 5 por conversa, verificado na rota. A linha é só metadado, porque o texto se reconstrói do arquivo.
- **Bucket** `alpha-chat-attachments`: privado, com 25 MiB e a lista de MIME de `alpha-submissions`. Caminho `${userId}/${threadId}/${uuid}.${ext}`.
- **RLS** ligada sem policy e sem grant a `anon`/`authenticated`, como o resto do schema. Só o α (`service_role`) lê e escreve. Nada entra nas allowlists do `audit-rls.ts`.

Alternativas descartadas:

- **`PostgresSaver`:** o checkpoint guarda o estado do grafo, não a conversa, e parear o histórico com as citações "por posição" já é uma fragilidade do ChatRADA.
- **`query_log`:** a tabela não tem dono na criação e mistura telemetria com dado.

`title` é a primeira pergunta, truncada em 120 caracteres. `last_activity_at` é tocado a cada turno, a cada anexo enviado e ao deixar de salvar (D10).

**Turno com falha.** A mensagem do usuário é gravada ANTES da chamada ao modelo. A do assistente é gravada no fim, com `status`: `complete`, `aborted` (o cliente saiu ou houve timeout) ou `error`. Turno sem resposta não some do histórico. Ele aparece como "resposta interrompida", e é isso que conta no teto.

### D6. Rotas e autorização

Todas ficam em `/api/v1/chats`, atrás de `authMiddleware`.

| Rota | Autorização |
|---|---|
| `POST /chats` `{ submission_id? }` | Com `submission_id`: exige `canReadSubmission`. Sem ele: exige `access.canSubmit` (o mesmo portão de enviar documento). |
| `GET /chats?submission_id=` | Só as do usuário. Com o filtro, as dele sobre aquele processo. |
| `GET /chats/:id` | Dono. Devolve mensagens, citações e anexos. |
| `DELETE /chats/:id` | Dono. Apaga os objetos do Storage ANTES da linha. Se o Storage falhar, responde 502 e mantém a linha (nunca deixa arquivo órfão sem registro). |
| `POST /chats/:id/attachments` (multipart) | Dono, só em conversa avulsa. Teto de corpo de 26 MB registrado em `body-limits.ts`, junto do de `/submissions`. Valida com `inspectSubmissionDocument` antes de gravar. |
| `DELETE /chats/:id/attachments/:attId` | Dono. |
| `PATCH /chats/:id` `{ saved?: boolean, title?: string }` | Dono. Salvar grava `saved_at`; deixar de salvar zera `saved_at` e toca `last_activity_at`. |
| `POST /chats/:id/messages/stream` `{ message }` | Dono **e**, se a conversa é de processo, `canReadSubmission` de novo. Teto diário antes do SSE. |

A checagem de dono é uma função pura `decideThreadAccess(thread, user)` em `lib/alpha-access.ts`, na linha do `decideSubmissionRead`, com o teste de rota em `authz.routes.test.ts`. Conversa inexistente e conversa de outro respondem os dois 404, para não revelar que o id existe.

Reavaliar o processo por turno é o que fecha o caso "perdeu o papel na OM e continua conversando sobre o processo": a conversa segue legível para o dono, mas o turno novo responde 403 `SUBMISSION_ACCESS_REVOKED`, e o painel mostra isso.

### D7. Teto de consumo e tempo

- **Teto diário:** `ALPHA_CHAT_MAX_TURNS_PER_DAY` (default 60). Conta os registros de `alpha.chat_turn_usage` do usuário nas últimas 24 h — uma linha por pergunta, SEM FK para a conversa (migration `20260922131037`). Contar em `chat_message` deixava o teto ser zerado apagando a conversa, porque as mensagens caem em cascata (achado do `/code-review`). A rotina diária apaga os registros com mais de 48 h. Estourou: 429 `CHAT_DAILY_LIMIT` com `retry_after`, ANTES de abrir o SSE. Depois que o SSE abre, não há mais status HTTP (regra do `AI-PROVIDERS.md`).
- **Um turno por vez na conversa:** pergunta sem resposta feita há menos de 180 s → 409 `CHAT_TURN_IN_PROGRESS`. A checagem não é atômica, então a resposta grava `reply_to` (a pergunta que ela responde) e o histórico pareia por ele, não pela ordem das linhas — duas abas no mesmo instante não embaralham mais o que o modelo lê.
- **Corrida:** duas abas podem passar da contagem ao mesmo tempo. É aceito: o teto é freio de custo, não de segurança, e o excesso máximo é o número de abas.
- **Tempo por turno:** 180 s de teto. O SSE manda comentário de keep-alive a cada 15 s enquanto o agente está em ferramenta, porque o idle do ALB é de 60 s. `c.req.raw.signal` aborta o laço, a lição do #308: cliente que sai não pode deixar o modelo rodando.
- **Histórico enviado ao modelo:** as últimas 12 mensagens da conversa. As fontes são remontadas a cada turno e não entram no histórico.

### D8. Protocolo SSE

- `event: status`, `data: { phase: "pensando" | "buscando_norma" | "lendo_secao" | "buscando_no_documento" | "escrevendo" }`: alimenta o "buscando na Lei 14.133…".
- `event: delta`, `data: { text }`: pedaços do texto da rodada final.
- `event: complete`, `data: { message_id, content, citations, dropped_citations }`: texto já limpo (D3).
- `event: error`, `data: { code }`, com `code` em `TURN_TIMEOUT | MODEL_UNAVAILABLE | EMPTY_ANSWER | INTERNAL_ERROR`. `MODEL_UNAVAILABLE` sai quando primário e reserva falham por erro transitório.
- Fonte que não pôde ser carregada (Storage ou banco) é recusada ANTES do SSE com 502 `SOURCES_UNAVAILABLE`: falha de leitura nunca vira fonte vazia.

O parser é o `parseSseBuffer` do portal, copiado para `apps/contrate/src/lib/alpha/sse.ts` com o teste. Não vira pacote: são 40 linhas, e o design system de cada app é outro.

### D9. Interface no contrate

- **Processo:** o `ProcessView` ganha um botão "Conversar" no `SectionHeader`, que abre um painel lateral à direita, sobreposto e com altura total. Em tela estreita, o painel ocupa a tela.
  - O painel lista as conversas do usuário sobre o processo e abre a mais recente. "Nova conversa" cria outra.
  - Cada `FindingCard` ganha "Perguntar sobre este achado". O botão abre o painel com a pergunta preenchida, sem enviar: "Explique o achado [severidade] em [seção]: [mensagem]. O que a norma exige e como reescrever o trecho?". O usuário ajusta e envia.
- **Avulso:** rota `/conversar` (lista das conversas) e `/conversar/$threadId`.
  - Zona de soltar arquivo e mensagem de boas-vindas que diz o que o assistente consulta: seus arquivos, a Lei 14.133, os decretos, as IN SEGES, os modelos da AGU e o RADA-e.
  - Entrada nova na navegação em `lib/modules.ts`, visível a quem tem `canSubmit`.
- **Componentes** em `components/chat/`: `ChatThread`, `MessageBubble` (ReactMarkdown), `RedactionBlock` (bloco `redacao` com copiar), `CitationChip` + `CitationPanel` (norma por `/chunks/:id`, achado com severidade e documento com o trecho ou "não localizado") e `AttachmentDropzone`.
- **Estilo:** Pale Brutalism do contrate, com zero radius e sem faixa lateral de acento. O cartão de redação se distingue por tint de fundo e rótulo, não por `border-l`.
- **Cliente:** `lib/alpha/chat.ts` com query options (`["alpha","chats",…]`) para lista e conversa. O stream usa `fetch` com `ReadableStream`, fora do React Query. Ao `complete`, invalida a conversa.

### D10. Guarda: 180 dias sem uso, salvo se o usuário salvar

- **Regra:** conversa avulsa (`submission_id is null`) com `saved_at is null` e `last_activity_at < now() - 180 days` é apagada, com anexos. Conversa salva fica até o dono apagar. Conversa de processo não entra: vive com o processo (`on delete cascade`).
- **Quem apaga:** `jobs/purge-chats.ts`, no mesmo modelo do `scheduler.ts` (timer no processo, com atraso inicial). Roda uma vez por dia em lotes de 100 e usa o MESMO caminho do `DELETE /chats/:id`: Storage primeiro, linha depois. Falha no Storage deixa a conversa para a próxima rodada, nunca a linha apagada com arquivo órfão.
- **Várias tasks do ECS rodando a rotina ao mesmo tempo** é inofensivo: a seleção é por prazo e a remoção é idempotente (remover objeto ou linha já removida não é erro). Não há trava distribuída.
- **Liga por padrão** (`ALPHA_CHAT_PURGE_ENABLED`, default `true`). Diferente do refresh de fontes, este é compromisso declarado na Política de Privacidade. Ligar no deploy não tem risco: nenhuma conversa alcança 180 dias antes de 180 dias após o lançamento.
- **Deixar de salvar reinicia o relógio.** Tocar `last_activity_at` ao remover o `saved_at` impede que desmarcar uma conversa antiga a apague na madrugada seguinte, sem aviso.
- **A interface avisa:** conversa avulsa não salva mostra "apagada em DD/MM se não for usada" (`last_activity_at + 180 dias`, data de Brasília). A partir de 30 dias do prazo, o aviso ganha destaque e vem com o botão Salvar.
- A regra de elegibilidade é função pura (`isPurgeable(thread, now)`), testada nos limites: 179 e 180 dias, salva, de processo e recém-desmarcada.

## Risks / Trade-offs

- **[Custo por turno com documento inteiro]** → Teto diário, cache de prompt no bloco das fontes, orçamento `ALPHA_CHAT_DOC_MAX_CHARS` e `ALPHA_CHAT_AI_MODEL` para apontar o chat a um modelo mais barato que o do verificador, sem mexer nele.
- **[Modelo inventa dispositivo de lei sem chamar `buscar_norma`]** → O prompt exige citar norma só por `[N…]`. Artigo mencionado sem rótulo fica como texto do modelo, sem a aparência de citação. O aviso fixo no rodapé do painel diz que a resposta é apoio e não parecer.
- **[Redação sugerida adotada sem revisão]** → Aviso no próprio bloco. O documento só muda fora, e é reverificado ao reenviar, então o verificador segue sendo o gate.
- **[Prompt injection pelo documento ou anexo]** → Delimitadores com nonce (D2), e nenhuma ferramenta com efeito (D4). O pior caso é uma resposta ruim ao próprio autor do anexo.
- **[Latência do primeiro token com ferramentas]** → O status aparece em até 1 s. Busca de norma só quando a pergunta pede, e o documento inteiro no contexto dispensa ferramenta na maioria dos turnos.
- **[Conversa salva guarda dado pessoal sem prazo]** → Foi escolha explícita do usuário, e ela é revogável: desmarcar ou apagar. A Política de Privacidade declara as duas guardas antes do deploy.
- **[Expurgo apaga o que o usuário queria manter]** → A data de expurgo aparece na lista desde o primeiro dia e ganha destaque 30 dias antes. Salvar é um clique.
- **[Texto reconstruído a cada turno]** → `TextCache` (32 entradas / 8M caracteres). Com a task reciclada, o primeiro turno de cada conversa baixa e reextrai o arquivo, de 1 a 3 s num PDF grande. É aceito.
- **[Conversa de processo mostra achados de execução nova no meio da conversa]** → É o comportamento desejado, porque o contexto reflete o processo agora. O evento `status` `fontes` e a mensagem de sistema no painel ("verificação nova de 20/09 14h — o assistente passou a considerá-la") evitam a surpresa.

## Migration Plan

1. Migration `alpha_document_chat` (tabelas, índices, RLS e bucket) **aplicada antes do merge** por `apply_migration`. O arquivo local é renomeado para o carimbo gravado no remoto (a armadilha registrada na plataforma ACI). `bun --filter @iefa/database audit:rls` verde.
2. Nova versão da Política de Privacidade (linha nova em `iefa.legal_documents`, nunca `UPDATE`) declarando conversas e anexos do contrate, aplicada antes do deploy do contrate.
3. Deploy do α primeiro: as rotas novas são aditivas e o ChatRADA não muda. Depois o contrate.
4. **Rollback:** esconder a entrada `/conversar` e o botão do processo (contrate) basta. As tabelas ficam, sem consumidor, e o α não precisa voltar.

## Open Questions

- **Modelo do chat.** Proposta: `ALPHA_CHAT_AI_MODEL` apontando para um Sonnet habilitado no Bedrock (conferir a habilitação: Opus 4.8/5 e Sonnet 5 NÃO estavam habilitados em 2026-09). O default é o primário do α.
- **O Pregoeiro público ganha chat?** Fora deste change: exige login, e o Pregoeiro é público.
