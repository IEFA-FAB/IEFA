# ATLAS — Tasks de Implementação (Spec-Driven)

> **Fonte:** `spec.md` · **Fase:** 1 — Módulo ACI · **Etapa ativa:** 1 (ChatRADA)
> Implementar na ordem abaixo. Os testes de uma task são pré-requisito para a próxima.

---

## TASK-00 — Bootstrap do Projeto

**Objetivo:** Ambiente configurado antes de qualquer código.

- [ ] Criar `package.json` com dependências exatas da stack use bun add para fazer isso:
  ```
  @langchain/langgraph @langchain/langgraph-checkpoint-postgres
  @langchain/core @langchain/openai hono
  ```
- [ ] Criar `.env.example` com todas as variáveis obrigatórias:
  ```
  # Supabase
  SUPABASE_URL=
  SUPABASE_SERVICE_ROLE_KEY=
  DATABASE_URL=

  # NVIDIA NIM — LLM + Embeddings + Reranker (via @langchain/openai)
  NVIDIA_API_KEY=
  NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
  LLM_MODEL=openai/gpt-oss-120b
  EMB_MODEL=baai/bge-m3
  EMB_QUERY_PREFIX=Represent this sentence for searching relevant passages: 
  EMB_TRUNCATE=END
  EMB_NORMALIZE=true
  EMB_BATCH_SIZE=128

  # Reranker NVIDIA — multilingual (PT suportado — MIRACL 26 langs)
  NVIDIA_RERANK_MODEL=nvidia/llama-3.2-nv-rerankqa-1b-v2
  RERANK_TOP_N=5
  # Rate limit trial: ~40 req/min (sem limite diário publicado)
  # Self-host posterior: mesmo modelo via NIM container

  # Hiperparâmetros híbrido
  K_SEM=4
  K_KEYWORD=6
  RRF_K=60

  # LangSmith
  LANGCHAIN_API_KEY=
  ```
- [ ] `bun run build` sem erros

---

## TASK-01 — Migrations SQL (Seção 2)

**Spec:** §2 — Banco de Dados — Schema Supabase

- [ ] Criar `migrations/001_extensions.sql` — `CREATE EXTENSION vector`, `CREATE EXTENSION ltree`
- [ ] Criar `migrations/002_documents.sql` — tabela `documents` + índices
- [ ] Criar `migrations/003_chunks.sql` — tabela `document_chunks`, `embedding VECTOR(1024)` (bge-m3), HNSW (`m=16, ef_construction=64`), FTS `to_tsvector('portuguese', content)`
- [ ] Criar `migrations/004_knowledge_graph.sql` — tabelas KG (stub Etapa 2 — criar, não usar)
- [ ] Criar `migrations/005_checkpoints.sql` — usar schema oficial do `@langchain/langgraph-checkpoint-postgres` (tabelas: `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`) — **não usar schema caseiro**
- [ ] Criar `migrations/006_query_logs.sql` — tabela `query_logs` com `termination_reason NOT NULL`

**Critérios de aceite (SPEC-DB-01 a 04):**
- [ ] INSERT com embedding de 3071 dimensões → erro de violação de dimensão
- [ ] INSERT com `document_type = 'INVALID'` → violação de CHECK constraint
- [ ] INSERT em `document_chunks` com `document_id` inexistente → violação de FK
- [ ] `EXPLAIN ANALYZE` de busca vetorial usa índice HNSW

---

## TASK-02 — AgentState + Tipos (Seção 1)

**Spec:** §1 — Estado Global — `AgentState`
**Arquivo:** `src/graph/state.ts`

- [ ] Definir tipos: `Intent`, `DocumentType`, `TerminationReason`
- [ ] Definir interfaces auxiliares: `DocumentMetadata`, `RelevanceScores`, `RetrievedDocument`, `GroundingCheck`
- [ ] Definir `AgentStateAnnotation` usando **`Annotation.Root`** do LangGraph.js (não `interface` plana):
  ```typescript
  import { Annotation, messagesStateReducer } from "@langchain/langgraph";

  const AgentStateAnnotation = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: messagesStateReducer,
      default: () => [],
    }),
    retrieved_documents: Annotation<RetrievedDocument[]>({
      reducer: (_, next) => next,
      default: () => [],
    }),
    cited_documents: Annotation<string[]>({
      reducer: (_, next) => next,
      default: () => [],
    }),
    retrieval_iterations: Annotation<number>({
      reducer: (_, next) => next,
      default: () => 0,
    }),
    grading_retries: Annotation<number>({
      reducer: (_, next) => next,
      default: () => 0,
    }),
    has_sufficient_context: Annotation<boolean>({
      reducer: (_, next) => next,
      default: () => false,
    }),
    min_rerank_threshold: Annotation<number>({
      reducer: (_, next) => next,
      default: () => 0.45,
    }),
    // ... demais campos com reducer (_, next) => next
  });

  type AgentState = typeof AgentStateAnnotation.State;
  ```
- [ ] Todos os campos do `AgentState` da `spec.md §1.1` presentes no `Annotation.Root`
- [ ] `tsgo --noEmit` sem erros

**Critérios de aceite (SPEC-STATE-01 a 03):**
- [ ] Estado novo: `min_rerank_threshold = 0.45`, `retrieval_iterations = 0`, `grading_retries = 0`, `cited_documents = []`, `has_sufficient_context = false`
  > Dimensão do embedding no schema: `VECTOR(1024)` (baai/bge-m3). Verificar que o tipo reflete 1024d, não 3072d.
- [ ] Invariante I5: `has_sufficient_context = true` apenas se ≥1 doc com `rerank_score >= 0.45`
- [ ] Invariante I6: `termination_reason` sempre definido ao fim do grafo

---

## TASK-03 — Supabase Client + Checkpointer

**Spec:** §2 (infraestrutura), §11 (auth)
**Arquivo:** `src/db/supabase.ts`, `src/db/checkpointer.ts`

- [ ] Instanciar `SupabaseClient` com variáveis de ambiente (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Usar **`PostgresSaver`** oficial do `@langchain/langgraph-checkpoint-postgres`:
  ```typescript
  import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

  export const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
  await checkpointer.setup(); // cria tabelas oficiais se não existirem
  ```
- [ ] Exportar `supabase` e `checkpointer` como singletons
- [ ] Confirmar que `005_checkpoints.sql` (TASK-01) usa schema compatível com `PostgresSaver`

---

## TASK-04 — Auth: Middleware Hono + Roles Supabase (Seção 11)

**Spec:** §11 — Auth — Supabase Auth + RBAC
**Arquivo:** `src/middleware/auth.ts`

- [ ] Implementar `authMiddleware` — extrai Bearer token, valida via `supabase.auth.getUser(token)`
- [ ] Popular `c.set("user", user)` e `c.set("role", user.app_metadata.role)`
- [ ] Configurar roles Supabase: `app_requisitante`, `app_licitacoes`, `app_aci`
- [ ] RLS: `REQUISITANTE` acessa apenas sessões onde `query_logs.user_id = auth.uid()`

**Critérios de aceite (SPEC-AUTH-01 a 04):**
- [ ] Request sem `Authorization` header → HTTP 401, `code: "MISSING_TOKEN"`
- [ ] Token JWT expirado → HTTP 401, `code: "INVALID_TOKEN"`
- [ ] `app_requisitante` acessa sessão de outro usuário → HTTP 403, `code: "FORBIDDEN"`
- [ ] `app_aci` acessa sessão de outro usuário → HTTP 200

---

## TASK-05 — Serviço de Ingestão `markdown-ingest` (Seção 13)

**Spec:** §13 — Serviço de Ingestão
**Arquivo:** `src/ingest/markdown-ingest.ts`

- [ ] Parse de Markdown: extrai frontmatter + headings (`Capítulo`, `Art.`, `Seção`)
- [ ] Chunking por artigo/seção — máx 512 tokens, overlap 50 tokens
- [ ] Embeddings: `baai/bge-m3` via NVIDIA API (`NVIDIA_BASE_URL`) usando `@langchain/openai` → vetor **1024 dimensões**
  > Aplicar `EMB_QUERY_PREFIX` apenas em queries (busca), **não** nos documentos da ingestão.
- [ ] Upsert idempotente em `documents` + `document_chunks`
- [ ] Ingerir `RADA-2023.md` após implementação

**Critérios de aceite (SPEC-INGEST-01 a 03):**
- [ ] Arquivo com 500 artigos → ≥500 chunks com embedding **1024d** e `content_tsv` gerado
- [ ] Re-ingestão do mesmo arquivo → sem duplicatas, `chunks_created = 0`
- [ ] Heading `## Capítulo IV — Art. 42` → `chunk.chapter = "Capítulo IV"`, `chunk.article = "Art. 42"`

---

## TASK-06 — Tool `RADA_Retriever` (Seção 3)

**Spec:** §3 — Tool — `RADA_Retriever`
**Arquivo:** `src/tools/rada-retriever.ts`

- [ ] Busca semântica: `pgvector` cosine similarity → top 10
- [ ] Busca keyword: Postgres FTS (`portuguese`) → top 10
- [ ] RRF Fusion: `score = Σ 1/(60 + rank_i)` → lista unificada
- [ ] Reranker: **`nvidia/llama-3.2-nv-rerankqa-1b-v2`** via endpoint NVIDIA NIM
  > **Por que este modelo:**
  > - Multilingual avaliado em **26 idiomas incluindo Português explicitamente** (benchmark MIRACL)
  > - `nv-rerankqa-mistral-4b-v3` foi **depreciado em dez/2025** — não usar
  > - `gpt-oss-120b` como reranker custaria ~$0.45/M output tokens por chamada — caro demais para rerank de 10 docs por query
  > - `llama-3.2-nv-rerankqa-1b-v2` é um **encoder dedicado** (não LLM gerador) — baixo custo, alta velocidade, self-hostável via NIM container
  > - **Rate limit trial build.nvidia.com**: ~40 req/min (sem limite diário publicado). Para 100 chamadas/dia com ~1 rerank por query = margem confortável
  > - Suporta documentos de até **8192 tokens** — acima do chunk de 512 tokens usado na ingestão
- [ ] Threshold: descarta docs com `rerank_score < 0.45`
- [ ] Suportar filtros: `document_type`, `year_from`, `year_to`, `chapter`, `article`

**Critérios de aceite (SPEC-RETRIEVER-01 a 05):**
- [ ] Query com docs indexados → ≥1 doc com `rerank_score >= 0.45`, ordenados DESC
- [ ] Banco vazio → `after_threshold = 0`, `documents = []`, `total_found = 0`
- [ ] Docs abaixo do threshold → `after_threshold = 0`, `total_found > 0`
- [ ] Filtro por `article: "Art. 42"` → todos os docs retornados com `metadata.article = "Art. 42"`
- [ ] Invariante I3: `documents` sempre ordenados por `rerank_score DESC`

---

## TASK-07 — Nós: `Router`, `GeneralChat`, `NoBasis` (Seções 4, 9, 8)

**Spec:** §4, §8, §9
**Arquivos:** `src/graph/nodes/router.ts`, `src/graph/nodes/general-chat.ts`, `src/graph/nodes/no-basis.ts`

### Router
- [ ] Classificar intent via LLM: `LEGISLATION | SEFA_SYSTEMS | PROCUREMENT | GENERAL | GREETING | UNKNOWN`
- [ ] Intent nunca `undefined` — fallback para `"UNKNOWN"`

**Critérios de aceite (SPEC-ROUTER-01 a 04):**
- [ ] "Qual o art. 42 do RADA?" → `intent = "LEGISLATION"`
- [ ] "Olá, bom dia!" → `intent = "GREETING"`
- [ ] "Qual a capital do Brasil?" → `intent = "GENERAL"`
- [ ] Query ambígua → intent sempre no enum `Intent`

### GeneralChat
- [ ] Responder sem chamar retriever
- [ ] Invariantes: `cited_documents = []`, `termination_reason = "success"`

**Critério de aceite (SPEC-GENERAL-01):**
- [ ] `intent = "GREETING"` → `final_response` é saudação, `cited_documents = []`, `termination_reason = "success"`

### NoBasis
- [ ] Mapear cada `termination_reason` para a mensagem de fallback correspondente
- [ ] `final_response` nunca vazio

**Critérios de aceite (SPEC-NOBASIS-01 a 02):**
- [ ] `termination_reason = "max_iterations_reached"` → mensagem correspondente
- [ ] Qualquer `termination_reason` → `final_response` não é string vazia

---

## TASK-08 — Nó `RADA_Agent` com Loop ReAct (Seção 5)

**Spec:** §5 — Nó — `RADA_Agent` (ReAct + Self-Correction)
**Arquivo:** `src/graph/nodes/rada-agent.ts`

- [ ] Iteração 1: usa `original_query` → chama `RADA_Retriever`
- [ ] Se `after_threshold >= 1`: `has_sufficient_context = true`, sai
- [ ] Se `after_threshold = 0`: reformula query com prompt aeronáutico, incrementa `retrieval_iterations`
- [ ] Máximo 3 iterações → `termination_reason = "max_iterations_reached"`
- [ ] Prompt de reformulação usa apenas terminologia aeronáutica real

**Critérios de aceite (SPEC-RADA-01 a 03):**
- [ ] Docs na iteração 1 → `retrieval_iterations = 1`, `has_sufficient_context = true`
- [ ] Zero docs em 3 iterações → `retrieval_iterations = 3`, `has_sufficient_context = false`, `reformulated_query` definido
- [ ] Docs na iteração 2 → `retrieval_iterations = 2`, `reformulated_query != original_query`

---

## TASK-09 — Nó `Grader` (Seção 6)

**Spec:** §6 — Nó — `Grader` (Hallucination Check)
**Arquivo:** `src/graph/nodes/grader.ts`

- [ ] Verificar cada afirmação do draft contra os `retrieved_documents`
- [ ] Preencher `grounding_check.ungrounded_claims` com afirmações sem suporte
- [ ] `grading_retries` máximo 2 → após isso: `termination_reason = "max_retries_reached"`
- [ ] `grounding_check.confidence` sempre entre 0 e 1

**Critérios de aceite (SPEC-GRADER-01 a 03):**
- [ ] Draft com todas afirmações suportadas → `is_grounded = true`, `ungrounded_claims = []`
- [ ] Afirmação inventada → `is_grounded = false`, `ungrounded_claims` contém a afirmação
- [ ] `is_grounded = false` + `grading_retries = 2` → aresta vai para `NO_BASIS`, `termination_reason = "max_retries_reached"`

---

## TASK-10 — Nó `Synthesizer` (Seção 7)

**Spec:** §7 — Nó — `Synthesizer`
**Arquivo:** `src/graph/nodes/synthesizer.ts`

- [ ] Gerar resposta com citações inline `[¹]`, `[²]`
- [ ] Preencher `cited_documents` com IDs dos chunks utilizados
- [ ] Incluir lista de fontes ao final: `¹ RADA-2023 — Cap. IV, Art. 42`
- [ ] `termination_reason = "success"` ao finalizar
- [ ] Nunca afirma além dos documentos recuperados

**Critérios de aceite (SPEC-SYNTH-01 a 02):**
- [ ] 2 docs relevantes → `final_response` com `[¹]` e `[²]`, `cited_documents` com 2 IDs, `termination_reason = "success"`
- [ ] Chamado com `is_grounded = true` → resposta não contém afirmações além dos docs

---

## TASK-11 — Grafo: Composição + Arestas (Seção 10)

**Spec:** §10 — Grafo — Composição e Arestas
**Arquivo:** `src/graph/edges/conditions.ts`, `src/graph/index.ts`

- [ ] Implementar `routerCondition`, `radaAgentCondition`, `graderCondition`
- [ ] Montar `StateGraph(AgentStateAnnotation)` com todos os nós
- [ ] Configurar `recursionLimit: 10`
- [ ] Toda aresta condicional tem fallback — nunca `undefined`
- [ ] Passar `checkpointer` ao compilar: `graph.compile({ checkpointer })`

**Critérios de aceite (SPEC-GRAPH-01 a 03):**
- [ ] Query de legislação com docs → `START → ROUTER → RADA_AGENT → GRADER → SYNTHESIZER → END`, `termination_reason = "success"`
- [ ] Query sem docs (3 iterações) → `... → NO_BASIS → END`, `termination_reason = "max_iterations_reached"`
- [ ] Saudação → `RADA_AGENT` não chamado, `ROUTER → GENERAL_CHAT → END`

---

## TASK-12 — API Hono: Endpoints JSON (Seção 12)

**Spec:** §12 — API HTTP — Endpoints Hono (Richardson L3)

- [ ] `POST /api/v1/sessions` → HTTP 201, `CreateSessionResponse` com `_links`
- [ ] `POST /api/v1/sessions/:session_id/messages` → executa grafo, HTTP 200, `SendMessageResponse` com `_links` e `cited_documents`
- [ ] `GET /api/v1/sessions/:session_id/messages` → histórico, `HistoryResponse` com `_links`
- [ ] `GET /api/v1/chunks/:id` → `ChunkResponse` com `_links`
- [ ] Todos os endpoints com middleware de Auth (TASK-04)
- [ ] `ErrorResponse` padronizado para todos os erros
- [ ] RBAC: `REQUISITANTE` → 403 para sessões de outros usuários

**Critérios de aceite (SPEC-API-01 a 04, SPEC-API-08):**
- [ ] `POST /api/v1/sessions` sem `Authorization` → HTTP 401, `code: "MISSING_TOKEN"`
- [ ] `POST /api/v1/sessions` com JWT válido → HTTP 201, `_links.messages.href` correto
- [ ] Query de legislação com sucesso → HTTP 200, `cited_documents` não vazio, `_links.chunks[]` com um href por documento
- [ ] Query sem embasamento → HTTP 200, `termination_reason != "success"`, mensagem de fallback
- [ ] `app_requisitante` acessa sessão alheia → HTTP 403, `code: "FORBIDDEN"`

---

## TASK-13 — API Hono: Modo SSE Streaming (Seção 12.3)

**Spec:** §12.3 — Modo SSE

- [ ] Detectar `Accept: text/event-stream`
- [ ] Usar `graph.stream(input, { streamMode: "updates", configurable: { thread_id: session_id } })` para capturar transições de nó:
  ```typescript
  for await (const chunk of stream) {
    const node = Object.keys(chunk)[0]; // ex: "router", "rada_agent"
    // emitir SSE event: status com node
  }
  ```
- [ ] Mapear cada `node` do chunk → `SSEStatusEvent.data.node`
- [ ] Emitir `event: status` a cada transição de nó do grafo
- [ ] Emitir `event: complete` (mesmo schema do modo JSON) como último evento
- [ ] `CONNECTION_IDLE_TIMEOUT_MS = 60_000` — encerrar stream com `event: error` e `code: "CONNECTION_TIMEOUT"` após 60s sem bytes
- [ ] Invariante: `event: complete` sempre é o último evento emitido

**Critérios de aceite (SPEC-API-05 a 07):**
- [ ] Query de legislação com SSE → sequência: `status(router)`, `status(rada_agent, iter=1)`, `status(grader)`, `status(synthesizer)`, `complete`
- [ ] 3 iterações sem docs com SSE → `status(iter=1,2,3)`, `status(no_basis)`, `complete(max_iterations_reached)`
- [ ] Servidor trava 60s → `event: error` com `code: "CONNECTION_TIMEOUT"`

---

## TASK-14 — Observabilidade: `query_logs` + LangSmith (Seção 14)

**Spec:** §14 — Observabilidade — LangSmith + `query_logs`

- [ ] Inserir 1 registro em `query_logs` ao final de cada execução do grafo
- [ ] Calcular `latency_ms` = tempo total do grafo
- [ ] Integrar LangSmith via `LANGCHAIN_API_KEY` e preencher `langsmith_run_id`
- [ ] Confirmar que chamadas do reranker (TASK-06) aparecem como spans filhos no trace LangSmith
- [ ] `termination_reason` nunca nulo no log

**Critérios de aceite (SPEC-OBS-01 a 02):**
- [ ] Query com sucesso → 1 registro com `termination_reason = "success"`, `latency_ms > 0`
- [ ] LangSmith configurado → `langsmith_run_id` preenchido, trace disponível no dashboard

---

## TASK-15 — Frontend: Painel de Documentação (Seção 15)

**Spec:** §15 — Feature — Visualizador de Documentação
> O endpoint `GET /api/v1/chunks/:id` está coberto na **TASK-12**. Esta task cobre exclusivamente a integração de UI.

- [ ] Implementar layout split 2 colunas (chat | docs) conforme `spec.md §15.2`
- [ ] Clique em `[¹]` → `GET /api/v1/chunks/:id` → painel exibe conteúdo com snippet destacado
- [ ] Nova mensagem no chat → painel atualiza com novos `cited_documents`, histórico não perdido
- [ ] Histórico do chat preservado ao navegar entre citações

**Critérios de aceite (SPEC-VIEWER-01 a 02):**
- [ ] Resposta com 2 chunks, clique em `[¹]` → `GET /api/v1/chunks/{id_1}` chamado, painel exibe snippet destacado
- [ ] Nova mensagem → painel atualiza, histórico do chat preservado

---

## Definition of Done (Global)

Cada task está **done** quando:

- [ ] Contrato TypeScript sem erros (`tsgo --noEmit`)
- [ ] Todos os cenários `Given/When/Then` da seção passando
- [ ] Invariantes verificadas por testes unitários
- [ ] `query_logs` registra corretamente o resultado
- [ ] JWT Supabase validado — endpoint não executa sem token válido
- [ ] Sem chamadas LLM desnecessárias além das especificadas
- [ ] Sem dependência de Python, PDF ou bibliotecas fora da stack (Bun · Hono · LangGraph.js · Supabase · LangSmith)
