# ATLAS — Spec de Implementação (Spec-Driven Development)

> **Referência:** `planning.md` · **Fase:** 1 — Módulo ACI · **Etapa ativa:** 1 (ChatRADA)
> **Stack:** Bun · Hono · LangGraph.js · Supabase (self-hosted) · LangSmith

---

## Como usar este documento

Cada seção é um **contrato verificável**. Para cada componente você encontrará:

- **Interface TypeScript** — o contrato de entrada/saída
- **Invariantes** — regras que NUNCA podem ser violadas
- **Cenários (Given/When/Then)** — critérios de aceite executáveis
- **Critério de done** — o que define "implementado corretamente"

Implemente na ordem das seções. Os testes de uma seção são pré-requisito para a próxima.

---

## Índice

1. [Estado Global — `AgentState`](#1-estado-global--agentstate)
2. [Banco de Dados — Schema Supabase](#2-banco-de-dados--schema-supabase)
3. [Tool — `RADA_Retriever`](#3-tool--rada_retriever)
4. [Nó — `Router`](#4-nó--router)
5. [Nó — `RADA_Agent` (ReAct + Self-Correction)](#5-nó--rada_agent-react--self-correction)
6. [Nó — `Grader` (Hallucination Check)](#6-nó--grader-hallucination-check)
7. [Nó — `Synthesizer`](#7-nó--synthesizer)
8. [Nó — `NoBasis`](#8-nó--nobasis)
9. [Nó — `GeneralChat`](#9-nó--generalchat)
10. [Grafo — Composição e Arestas](#10-grafo--composição-e-arestas)
11. [Auth — Supabase Auth + RBAC](#11-auth--supabase-auth--rbac)
12. [API HTTP — Endpoints Hono (Richardson L3)](#12-api-http--endpoints-hono-richardson-l3)
13. [Serviço de Ingestão — `markdown-ingest`](#13-serviço-de-ingestão--markdown-ingest)
14. [Observabilidade — LangSmith + `query_logs`](#14-observabilidade--langsmith--query_logs)
15. [Feature — Visualizador de Documentação](#15-feature--visualizador-de-documentação)

---

## 1. Estado Global — `AgentState`

### 1.1 Contrato de Tipos

```typescript
// src/graph/state.ts

type Intent =
  | "LEGISLATION"    // Etapa 1: ChatRADA
  | "SEFA_SYSTEMS"   // Etapa 2 (slot reservado)
  | "PROCUREMENT"    // Etapa 3 (slot reservado)
  | "GENERAL"
  | "GREETING"
  | "UNKNOWN";

type DocumentType = "RADA" | "RBHA" | "ICA" | "MCA" | "NSCA";

type TerminationReason =
  | "success"
  | "no_documents_found"
  | "low_relevance_score"
  | "hallucination_detected"
  | "max_iterations_reached"
  | "max_retries_reached";

interface DocumentMetadata {
  source: string;          // ex: "RADA-2023.md"
  document_type: DocumentType;
  chapter: string;
  article: string;
  section?: string;
  year: number;
  page: number;
}

interface RelevanceScores {
  semantic_score: number;  // 0–1: cosine similarity
  keyword_score: number;   // 0–1: BM25/FTS
  rerank_score: number;    // 0–1: score final RRF
}

interface RetrievedDocument {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  scores: RelevanceScores;
}

interface GroundingCheck {
  is_grounded: boolean;
  ungrounded_claims: string[];
  confidence: number;      // 0–1
}

interface AgentState {
  messages: BaseMessage[];
  session_id: string;
  user_id?: string;

  intent: Intent;
  original_query: string;
  reformulated_query?: string;

  retrieved_documents: RetrievedDocument[];
  has_sufficient_context: boolean;
  min_rerank_threshold: number;     // default: 0.45

  grounding_check?: GroundingCheck;
  generated_response_draft?: string;

  retrieval_iterations: number;     // máx: 3
  grading_retries: number;          // máx: 2

  termination_reason?: TerminationReason;
  final_response?: string;
  cited_documents: string[];        // IDs dos chunks — obrigatório

  // Extensão futura — não usar no MVP
  graph_context?: KnowledgeGraphContext;
  document_processing?: DocumentProcessingState;
}
```

### 1.2 Invariantes

| # | Invariante | Violação esperada |
|---|---|---|
| I1 | `min_rerank_threshold` sempre `0.45` no início da sessão | Erro de runtime |
| I2 | `retrieval_iterations` começa em `0`, máx `3` | Resposta incorreta |
| I3 | `grading_retries` começa em `0`, máx `2` | Loop infinito |
| I4 | `cited_documents` nunca vazio quando `termination_reason = "success"` | Resposta sem embasamento |
| I5 | `has_sufficient_context = true` somente se ≥1 doc com `rerank_score >= 0.45` | Falso positivo jurídico |
| I6 | `termination_reason` sempre definido ao fim do grafo | Falha de auditoria |

### 1.3 Cenários

```gherkin
# SPEC-STATE-01
Given: novo estado criado
When: estado inicializado
Then: min_rerank_threshold = 0.45
And: retrieval_iterations = 0
And: grading_retries = 0
And: cited_documents = []
And: has_sufficient_context = false

# SPEC-STATE-02
Given: estado com retrieved_documents todos com rerank_score < 0.45
When: has_sufficient_context é avaliado
Then: has_sufficient_context = false

# SPEC-STATE-03
Given: estado com ≥1 retrieved_document com rerank_score >= 0.45
When: has_sufficient_context é avaliado
Then: has_sufficient_context = true
```

---

## 2. Banco de Dados — Schema Supabase

### 2.1 Tabelas a criar (em ordem)

```sql
-- Ordem obrigatória (dependências de FK)
-- 1. documents
-- 2. document_chunks
-- 3. knowledge_graph_nodes   (Etapa 2 — criar, não usar no MVP)
-- 4. knowledge_graph_edges   (Etapa 2 — criar, não usar no MVP)
-- 5. langgraph_checkpoints
-- 6. query_logs
```

### 2.2 Invariantes de Schema

| # | Invariante |
|---|---|
| I1 | `document_chunks.embedding` dimensão = 3072 (text-embedding-3-large) |
| I2 | FTS gerado com `to_tsvector('portuguese', content)` |
| I3 | HNSW index com `m=16, ef_construction=64` |
| I4 | `document_type` restrito a `('RADA','RBHA','ICA','MCA','NSCA')` via CHECK |
| I5 | `query_logs.termination_reason` nunca nulo |

### 2.3 Cenários

```gherkin
# SPEC-DB-01
Given: schema aplicado
When: INSERT em document_chunks com embedding de tamanho 3071
Then: erro de schema (violação de dimensão de vetor)

# SPEC-DB-02
Given: documento inserido com document_type = 'INVALID'
When: INSERT executado
Then: violação de CHECK constraint

# SPEC-DB-03
Given: document_chunks com chunk para document_id inexistente
When: INSERT executado
Then: violação de FK constraint

# SPEC-DB-04
Given: schema aplicado
When: busca vetorial com `vector_cosine_ops` executada
Then: índice HNSW é usado (verificar via EXPLAIN ANALYZE)
```

### 2.4 Migrations a implementar

| Arquivo | Conteúdo |
|---|---|
| `001_extensions.sql` | `CREATE EXTENSION vector`, `CREATE EXTENSION ltree` |
| `002_documents.sql` | Tabela `documents` + índices |
| `003_chunks.sql` | Tabela `document_chunks` + HNSW + FTS |
| `004_knowledge_graph.sql` | Tabelas KG (Etapa 2 — stub) |
| `005_checkpoints.sql` | Tabela `langgraph_checkpoints` |
| `006_query_logs.sql` | Tabela `query_logs` |

---

## 3. Tool — `RADA_Retriever`

### 3.1 Contrato

```typescript
// src/tools/rada-retriever.ts

interface RADARetrieverInput {
  query: string;
  filters?: {
    document_type?: DocumentType;
    year_from?: number;
    year_to?: number;
    chapter?: string;
    article?: string;
  };
  top_k?: number; // default: 10
}

interface RADARetrieverOutput {
  documents: RetrievedDocument[];    // ordenados por rerank_score DESC
  total_found: number;               // antes do threshold
  after_threshold: number;           // após filtro 0.45
  search_metadata: {
    semantic_count: number;
    keyword_count: number;
    fusion_method: "RRF";
    threshold_applied: number;
    query_used: string;
  };
}
```

### 3.2 Pipeline de busca (ordem obrigatória)

```
1. Semântica   → pgvector cosine similarity → top 10
2. Keyword     → Postgres FTS (portuguese)  → top 10
3. RRF Fusion  → score = Σ 1/(60 + rank_i)  → lista unificada
4. Reranker    → LLM cross-encoder prompt   → top 5
5. Threshold   → descarta docs com rerank_score < 0.45
```

### 3.3 Fórmula RRF

```
rrf_score(doc) = Σ 1 / (60 + rank_i)
onde rank_i é a posição na lista semântica e na lista keyword
```

### 3.4 Invariantes

| # | Invariante |
|---|---|
| I1 | `fusion_method` sempre `"RRF"` |
| I2 | `after_threshold` = quantidade de docs com `rerank_score >= 0.45` |
| I3 | `documents` sempre ordenados por `rerank_score DESC` |
| I4 | `total_found` >= `after_threshold` (sempre) |
| I5 | Se `after_threshold = 0`, lista `documents` = `[]` |

### 3.5 Cenários

```gherkin
# SPEC-RETRIEVER-01
Given: banco com documentos RADA indexados
When: query = "requisitos para certificado de piloto"
Then: retorna ≥1 documento com rerank_score >= 0.45
And: documentos ordenados por rerank_score DESC
And: fusion_method = "RRF"

# SPEC-RETRIEVER-02
Given: banco vazio (sem documentos)
When: qualquer query executada
Then: after_threshold = 0
And: documents = []
And: total_found = 0

# SPEC-RETRIEVER-03
Given: documentos com rerank_score abaixo de 0.45
When: query executada
Then: after_threshold = 0
And: documents = []
And: total_found > 0  # encontrou mas não passou no threshold

# SPEC-RETRIEVER-04
Given: filtro { article: "Art. 42" }
When: query executada com filtro
Then: todos os documentos retornados têm metadata.article = "Art. 42"

# SPEC-RETRIEVER-05
Given: query executada
When: reranker chamado
Then: prompt enviado ao LLM contém query + conteúdo dos documentos
And: resultado é lista ordenada por relevância
```

---

## 4. Nó — `Router`

### 4.1 Contrato

```typescript
// src/graph/nodes/router.ts

type RouterInput = Pick<AgentState, "messages" | "original_query">;
type RouterOutput = Pick<AgentState, "intent">;
```

### 4.2 Mapeamento de intenções

| Intenção | Trigger semântico | Ação |
|---|---|---|
| `LEGISLATION` | Questões sobre RADA, RBHA, ICA, MCA, NSCA, legislação aeronáutica | → `RADA_AGENT` |
| `SEFA_SYSTEMS` | Sistemas internos SEFA, módulos, processos de gestão | → `SEFA_AGENT` (Etapa 2) |
| `PROCUREMENT` | Licitações, contratos, pregões | → `PROC_AGENT` (Etapa 3) |
| `GENERAL` | Perguntas genéricas, não classificadas | → `GENERAL_CHAT` |
| `GREETING` | Saudações | → `GENERAL_CHAT` |
| `UNKNOWN` | Não classificável | → `GENERAL_CHAT` |

### 4.3 Cenários

```gherkin
# SPEC-ROUTER-01
Given: mensagem "Qual o art. 42 do RADA?"
When: Router processa
Then: intent = "LEGISLATION"

# SPEC-ROUTER-02
Given: mensagem "Olá, bom dia!"
When: Router processa
Then: intent = "GREETING"

# SPEC-ROUTER-03
Given: mensagem "Qual a capital do Brasil?"
When: Router processa
Then: intent = "GENERAL"

# SPEC-ROUTER-04
Given: mensagem ambígua
When: Router processa
Then: intent nunca é undefined
And: intent está no enum Intent
```

---

## 5. Nó — `RADA_Agent` (ReAct + Self-Correction)

### 5.1 Contrato

```typescript
// src/graph/nodes/rada-agent.ts

type RADAAgentInput = Pick<AgentState,
  | "messages"
  | "original_query"
  | "reformulated_query"
  | "retrieval_iterations"
  | "min_rerank_threshold"
>;

type RADAAgentOutput = Pick<AgentState,
  | "retrieved_documents"
  | "has_sufficient_context"
  | "retrieval_iterations"
  | "reformulated_query"
>;
```

### 5.2 Lógica do loop ReAct

```
Iteração 1: usa original_query
  → chama RADA_Retriever
  → se after_threshold >= 1: has_sufficient_context = true → sai
  → se after_threshold = 0: reformula query → continua

Iteração 2: usa reformulated_query (mais específica)
  → mesma lógica

Iteração 3: segunda reformulação (sinônimos regulatórios)
  → se ainda 0: termination_reason = "max_iterations_reached"
  → has_sufficient_context = false → sai
```

### 5.3 Prompt de reformulação

```
Você é especialista em legislação aeronáutica brasileira (RADA, RBHA, ICA).
A query "{original_query}" não retornou documentos relevantes.

Reformule para melhorar o recall:
- Use terminologia técnica aeronáutica (ex: "piloto" → "comandante")
- Considere artigos ou capítulos relacionados
- Não invente termos que não existem na legislação

Retorne APENAS a query reformulada.
```

### 5.4 Invariantes

| # | Invariante |
|---|---|
| I1 | `retrieval_iterations` incrementa +1 a cada chamada do retriever |
| I2 | Máximo de 3 iterações — nunca > 3 |
| I3 | Reformulação usa apenas terminologia aeronáutica real |
| I4 | Se `retrieval_iterations >= 3` e sem contexto: `has_sufficient_context = false` |

### 5.5 Cenários

```gherkin
# SPEC-RADA-01
Given: query "certificado de piloto" retorna docs na iteração 1
When: RADA_Agent executa
Then: retrieval_iterations = 1
And: has_sufficient_context = true
And: reformulated_query não definido

# SPEC-RADA-02
Given: query retorna 0 docs em 3 iterações
When: RADA_Agent executa
Then: retrieval_iterations = 3
And: has_sufficient_context = false
And: reformulated_query definido (última reformulação)

# SPEC-RADA-03
Given: query retorna docs somente na iteração 2
When: RADA_Agent executa
Then: retrieval_iterations = 2
And: has_sufficient_context = true
And: reformulated_query != original_query
```

---

## 6. Nó — `Grader` (Hallucination Check)

### 6.1 Contrato

```typescript
// src/graph/nodes/grader.ts

type GraderInput = Pick<AgentState,
  | "generated_response_draft"
  | "retrieved_documents"
  | "grading_retries"
>;

type GraderOutput = Pick<AgentState,
  | "grounding_check"
  | "grading_retries"
>;
```

### 6.2 Prompt de verificação

O grader recebe o rascunho da resposta e os documentos recuperados e deve verificar:
- Cada afirmação do rascunho está ancorada em pelo menos um documento?
- Lista afirmações sem suporte em `ungrounded_claims`

### 6.3 Invariantes

| # | Invariante |
|---|---|
| I1 | `grading_retries` máximo = 2 |
| I2 | Se `grounding_check.is_grounded = false` e `grading_retries >= 2`: `termination_reason = "max_retries_reached"` |
| I3 | `grounding_check.confidence` sempre entre 0 e 1 |
| I4 | `ungrounded_claims` = `[]` quando `is_grounded = true` |

### 6.4 Cenários

```gherkin
# SPEC-GRADER-01
Given: draft com afirmações todas suportadas pelos documentos
When: Grader executa
Then: grounding_check.is_grounded = true
And: ungrounded_claims = []

# SPEC-GRADER-02
Given: draft com afirmação inventada não presente nos documentos
When: Grader executa
Then: grounding_check.is_grounded = false
And: ungrounded_claims contém a afirmação inventada

# SPEC-GRADER-03
Given: grounding_check.is_grounded = false e grading_retries = 2
When: Grader avalia resultado
Then: aresta condicional vai para NO_BASIS
And: termination_reason = "max_retries_reached"
```

---

## 7. Nó — `Synthesizer`

### 7.1 Contrato

```typescript
// src/graph/nodes/synthesizer.ts

type SynthesizerInput = Pick<AgentState,
  | "messages"
  | "retrieved_documents"
  | "grounding_check"
>;

type SynthesizerOutput = Pick<AgentState,
  | "generated_response_draft"
  | "cited_documents"
  | "final_response"
  | "termination_reason"
>;
```

### 7.2 Regras de síntese

1. A resposta deve citar explicitamente os artigos/capítulos de origem (formato: `[¹]`, `[²]`)
2. `cited_documents` deve conter os IDs dos chunks utilizados
3. Ao final, inclui lista de fontes: `¹ RADA-2023 — Cap. IV, Art. 42`
4. Nunca afirma algo além do que está nos documentos recuperados

### 7.3 Invariantes

| # | Invariante |
|---|---|
| I1 | `cited_documents` nunca vazio quando Synthesizer conclui com sucesso |
| I2 | Cada ID em `cited_documents` corresponde a um doc em `retrieved_documents` |
| I3 | `termination_reason = "success"` ao finalizar |
| I4 | Formato de citação: texto inline `[N]` + lista de fontes ao final |

### 7.4 Cenários

```gherkin
# SPEC-SYNTH-01
Given: retrieved_documents com 2 docs relevantes (rerank_score >= 0.45)
When: Synthesizer executa
Then: final_response contém citações [¹] e [²]
And: cited_documents tem 2 IDs
And: termination_reason = "success"

# SPEC-SYNTH-02
Given: Synthesizer é chamado com grounding_check.is_grounded = true
When: Synthesizer executa
Then: resposta não contém afirmações além dos documentos recuperados
```

---

## 8. Nó — `NoBasis`

### 8.1 Contrato

```typescript
// src/graph/nodes/no-basis.ts

type NoBasisInput = Pick<AgentState, "termination_reason">;
type NoBasisOutput = Pick<AgentState, "final_response">;
```

### 8.2 Mensagens por TerminationReason

| `termination_reason` | Mensagem |
|---|---|
| `no_documents_found` | "Não foi encontrada base normativa na legislação disponível." |
| `low_relevance_score` | "Os documentos encontrados não possuem relevância suficiente..." |
| `hallucination_detected` | "Não foi possível gerar uma resposta verificável..." |
| `max_iterations_reached` | "Após múltiplas tentativas de busca, não foi encontrado embasamento..." |
| `max_retries_reached` | "A resposta gerada não pôde ser verificada contra a legislação..." |

### 8.3 Invariantes

| # | Invariante |
|---|---|
| I1 | `final_response` nunca vazio — sempre retorna mensagem de fallback |
| I2 | `cited_documents` permanece `[]` |
| I3 | Mensagem nunca inventa embasamento |

### 8.4 Cenários

```gherkin
# SPEC-NOBASIS-01
Given: termination_reason = "max_iterations_reached"
When: NoBasis executa
Then: final_response = mensagem correspondente
And: cited_documents = []

# SPEC-NOBASIS-02
Given: qualquer termination_reason válido
When: NoBasis executa
Then: final_response não é string vazia
```

---

## 9. Nó — `GeneralChat`

### 9.1 Contrato

```typescript
// src/graph/nodes/general-chat.ts

type GeneralChatInput = Pick<AgentState, "messages" | "intent">;
type GeneralChatOutput = Pick<AgentState,
  | "final_response"
  | "termination_reason"
  | "cited_documents"
>;
```

### 9.2 Invariantes

| # | Invariante |
|---|---|
| I1 | `cited_documents = []` (chat geral não cita documentos) |
| I2 | `termination_reason = "success"` |
| I3 | Não redireciona para retriever |

### 9.3 Cenários

```gherkin
# SPEC-GENERAL-01
Given: intent = "GREETING"
When: GeneralChat executa
Then: final_response é uma saudação
And: cited_documents = []
And: termination_reason = "success"
```

---

## 10. Grafo — Composição e Arestas

### 10.1 Definição das arestas condicionais

```typescript
// src/graph/edges/conditions.ts

function routerCondition(state: AgentState): string {
  switch (state.intent) {
    case "LEGISLATION": return "rada_agent";
    case "SEFA_SYSTEMS": return "sefa_agent";  // Etapa 2
    case "PROCUREMENT":  return "proc_agent";  // Etapa 3
    default:             return "general_chat";
  }
}

function radaAgentCondition(state: AgentState): string {
  if (state.has_sufficient_context) return "grader";
  if (state.retrieval_iterations >= 3) return "no_basis";
  return "rada_agent"; // loop
}

function graderCondition(state: AgentState): string {
  const { grounding_check, grading_retries } = state;
  if (grounding_check?.is_grounded) return "synthesizer";
  if (grading_retries >= 2) return "no_basis";
  return "rada_agent"; // re-gera draft
}
```

### 10.2 Estrutura do grafo (MVP)

```
START → ROUTER
ROUTER → [RADA_AGENT | GENERAL_CHAT]
RADA_AGENT → [RADA_AGENT (loop) | GRADER | NO_BASIS]
GRADER → [SYNTHESIZER | RADA_AGENT (retry) | NO_BASIS]
SYNTHESIZER → END
NO_BASIS → END
GENERAL_CHAT → END
```

### 10.3 Invariantes

| # | Invariante |
|---|---|
| I1 | `recursionLimit: 10` configurado no grafo |
| I2 | Toda aresta condicional tem fallback — nunca `undefined` |
| I3 | `SYNTHESIZER` e `NO_BASIS` nunca se chamam mutuamente |
| I4 | Extensão de nó nunca altera `grader.ts`, `synthesizer.ts` ou `no-basis.ts` |

### 10.4 Cenários

```gherkin
# SPEC-GRAPH-01
Given: query de legislação com docs disponíveis
When: grafo executa do START ao END
Then: caminho percorrido = START → ROUTER → RADA_AGENT → GRADER → SYNTHESIZER → END
And: termination_reason = "success"

# SPEC-GRAPH-02
Given: query de legislação sem docs disponíveis
When: grafo executa 3 iterações
Then: caminho = ... → NO_BASIS → END
And: termination_reason = "max_iterations_reached"

# SPEC-GRAPH-03
Given: query de saudação
When: grafo executa
Then: RADA_AGENT não é chamado
And: caminho = ROUTER → GENERAL_CHAT → END
```

---

## 11. Auth — Supabase Auth + RBAC

> O Supabase Auth é o sistema central de autenticação. Roda no **mesmo projeto Supabase** que contém as tabelas do chat (`documents`, `document_chunks`, `query_logs`, etc.) — sem banco separado.

### 11.1 Perfis (roles) — mapeamento do `business_explanation`

| Perfil | Role Supabase | Acesso |
|---|---|---|
| `REQUISITANTE` | `app_requisitante` | Apenas seus próprios processos |
| `LICITACOES` | `app_licitacoes` | Todo o fluxo, pode modificar |
| `ACI` | `app_aci` | Todo o fluxo, aprovação final |

As roles são armazenadas em `auth.users.raw_app_meta_data -> 'role'` e propagadas via JWT claim.

### 11.2 Contrato de Auth

```typescript
// JWT claim esperado (Supabase emite automaticamente após login)
interface AlphaJWTPayload {
  sub: string;           // user_id (UUID — auth.users.id)
  role: AppRole;         // claim custom: "app_requisitante" | "app_licitacoes" | "app_aci"
  email: string;
  exp: number;
}

type AppRole = "app_requisitante" | "app_licitacoes" | "app_aci";

// Header obrigatório em todos os endpoints protegidos
// Authorization: Bearer <supabase_access_token>
```

### 11.3 Middleware Hono de Auth

```typescript
// src/middleware/auth.ts

async function authMiddleware(c: Context, next: Next) {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized", code: "MISSING_TOKEN" }, 401);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return c.json({ error: "Unauthorized", code: "INVALID_TOKEN" }, 401);

  c.set("user", user);
  c.set("role", user.app_metadata.role as AppRole);
  await next();
}
```

### 11.4 Invariantes de Auth

| # | Invariante |
|---|---|
| I1 | Todo endpoint `/api/v1/*` exige `Authorization: Bearer <token>` válido emitido pelo Supabase Auth |
| I2 | `user_id` no `AgentState` é sempre `auth.users.id` extraído do JWT — nunca aceito via body |
| I3 | Token inválido ou expirado → HTTP 401 antes de tocar o grafo |
| I4 | Perfil `REQUISITANTE` só acessa sessões onde `query_logs.user_id = auth.uid()` |
| I5 | Perfis `LICITACOES` e `ACI` acessam qualquer sessão |

### 11.5 Cenários de Auth

```gherkin
# SPEC-AUTH-01
Given: request sem header Authorization
When: qualquer endpoint /api/v1/* é chamado
Then: HTTP 401 com code = "MISSING_TOKEN"

# SPEC-AUTH-02
Given: token JWT expirado
When: endpoint é chamado
Then: HTTP 401 com code = "INVALID_TOKEN"

# SPEC-AUTH-03
Given: usuário com role = "app_requisitante"
When: GET /api/v1/sessions/:id/messages para sessão de outro usuário
Then: HTTP 403 com code = "FORBIDDEN"

# SPEC-AUTH-04
Given: usuário com role = "app_aci"
When: GET /api/v1/sessions/:id/messages para sessão de outro usuário
Then: HTTP 200 (ACI tem acesso total)
```

---

## 12. API HTTP — Endpoints Hono (Richardson L3)

> **Modelo de Maturidade Richardson aplicado:**
> - **L1 — Resources:** URLs identificam recursos (`/sessions`, `/chunks`)
> - **L2 — HTTP Verbs:** verbos semânticos por operação
> - **L3 — HATEOAS:** toda response inclui `_links` com as ações disponíveis a partir daquele estado
>
> **Versionamento:** rota `/api/v1/` — permite evolução para `/api/v2/` sem quebrar clientes.
> Todo endpoint exige o middleware de Auth da Seção 11.

### 12.1 Estrutura de rotas

```
POST   /api/v1/sessions                         → cria sessão
POST   /api/v1/sessions/:session_id/messages    → envia mensagem (com streaming SSE)
GET    /api/v1/sessions/:session_id/messages    → histórico da sessão
GET    /api/v1/chunks/:id                       → conteúdo completo do chunk
```

### 12.2 `POST /api/v1/sessions` — criação de sessão

```typescript
// Request: sem body (user_id vem do JWT)

// Response — HTTP 201
interface CreateSessionResponse {
  session_id: string;
  created_at: string;
  _links: {
    self:     { href: string; method: "GET" };   // /api/v1/sessions/:id/messages
    messages: { href: string; method: "POST" };  // /api/v1/sessions/:id/messages
  };
}
```

### 12.3 `POST /api/v1/sessions/:session_id/messages` — enviar mensagem

Este endpoint suporta **dois modos** via header `Accept`:

#### Modo JSON (resposta completa)

```typescript
// Request
interface SendMessageRequest {
  message: string;
}

// Response — HTTP 200
interface SendMessageResponse {
  session_id: string;
  intent: Intent;
  final_response: string;
  termination_reason: TerminationReason;
  cited_documents: CitedChunk[];
  retrieval_iterations: number;
  grading_retries: number;
  _links: {
    self:    { href: string; method: "POST" };   // /api/v1/sessions/:id/messages
    history: { href: string; method: "GET" };    // /api/v1/sessions/:id/messages
    chunks:  Array<{ href: string; method: "GET"; chunk_id: string }>;
  };
}
```

#### Modo SSE — streaming parcial (Accept: text/event-stream)

O cliente envia `Accept: text/event-stream`. O servidor abre um stream SSE e emite eventos na medida em que o grafo progride.

> **Timeout de conexão:** se o servidor **não emitir nenhum byte** por mais de `CONNECTION_IDLE_TIMEOUT_MS = 60_000` (60s), a conexão é encerrada com `event: error`. Isso **não ocorre** em condições normais de execução — o grafo emite pelo menos um `event: status` a cada transição de nó.

```typescript
// Schema dos eventos SSE

// Progresso do grafo (emitido a cada transição de nó)
interface SSEStatusEvent {
  event: "status";
  data: {
    node: "router" | "rada_agent" | "grader" | "synthesizer" | "no_basis" | "general_chat";
    message: string;   // mensagem legível para o usuário
    iteration?: number; // retrieval_iterations atual (só nos nós de busca)
  };
}

// Resposta final completa (substitui o polling — emitido ao final do grafo)
interface SSECompleteEvent {
  event: "complete";
  data: SendMessageResponse;  // mesmo schema do modo JSON
}

// Erro irrecuperável (timeout de conexão ou crash interno)
interface SSEErrorEvent {
  event: "error";
  data: {
    code: "CONNECTION_TIMEOUT" | "GRAPH_ERROR";
    message: string;
  };
}
```

**Sequência de eventos SSE para query de legislação:**
```
event: status
data: {"node":"router","message":"Classificando sua pergunta..."}

event: status
data: {"node":"rada_agent","message":"Consultando o RADA...","iteration":1}

event: status
data: {"node":"grader","message":"Verificando embasamento legal..."}

event: status
data: {"node":"synthesizer","message":"Elaborando resposta com citações..."}

event: complete
data: {"session_id":"...","intent":"LEGISLATION","final_response":"...", ...}
```

**Sequência para query sem embasamento (3 iterações):**
```
event: status
data: {"node":"rada_agent","message":"Consultando o RADA...","iteration":1}

event: status
data: {"node":"rada_agent","message":"Reformulando busca...","iteration":2}

event: status
data: {"node":"rada_agent","message":"Tentativa final de busca...","iteration":3}

event: status
data: {"node":"no_basis","message":"Não foi encontrado embasamento suficiente."}

event: complete
data: {"session_id":"...","termination_reason":"max_iterations_reached", ...}
```

### 12.4 `GET /api/v1/sessions/:session_id/messages` — histórico

```typescript
// Response — HTTP 200
interface HistoryResponse {
  session_id: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    intent?: Intent;
    cited_documents?: CitedChunk[];
    _links?: {
      chunks: Array<{ href: string; method: "GET" }>;
    };
  }>;
  _links: {
    self: { href: string; method: "GET" };
    send: { href: string; method: "POST" };
  };
}
```

### 12.5 `GET /api/v1/chunks/:id` — conteúdo do chunk

```typescript
// Response — HTTP 200
interface ChunkResponse {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  scores: RelevanceScores;
  _links: {
    self: { href: string; method: "GET" };
  };
}
```

### 12.6 `CitedChunk` — payload de citação

```typescript
interface CitedChunk {
  chunk_id: string;
  source: string;         // "RADA-2023.md"
  document_type: DocumentType;
  chapter: string;
  article: string;
  page: number;
  snippet: string;        // primeiros 200 chars do chunk
}
```

### 12.7 `ErrorResponse` — erros da API

```typescript
interface ErrorResponse {
  error: string;
  code:
    | "MISSING_TOKEN"      // 401: sem Authorization header
    | "INVALID_TOKEN"      // 401: token inválido ou expirado
    | "FORBIDDEN"          // 403: role sem permissão
    | "INVALID_INPUT"      // 422: body inválido
    | "GRAPH_ERROR"        // 500: erro interno do grafo
    | "CONNECTION_TIMEOUT"; // 504: idle timeout do SSE
}
```

### 12.8 Invariantes da API

| # | Invariante |
|---|---|
| I1 | Todo endpoint `/api/v1/*` valida JWT Supabase antes de executar qualquer lógica |
| I2 | `user_id` no `AgentState` é sempre extraído do JWT — nunca do body |
| I3 | HTTP 200 mesmo em `termination_reason != "success"` — é uma resposta de negócio válida |
| I4 | HTTP 4xx apenas para input inválido ou auth; HTTP 5xx apenas para erro interno |
| I5 | No modo SSE, pelo menos 1 `event: status` é emitido antes de qualquer resposta do LLM |
| I6 | `CONNECTION_IDLE_TIMEOUT_MS = 60_000` — encerra stream apenas se **nenhum byte** for enviado por 60s |
| I7 | `event: complete` é **sempre** o último evento emitido no stream SSE |
| I8 | `_links` presentes em todas as responses de sucesso (HATEOAS) |

### 12.9 Cenários

```gherkin
# SPEC-API-01
Given: POST /api/v1/sessions sem Authorization header
When: request enviada
Then: HTTP 401 com code = "MISSING_TOKEN"

# SPEC-API-02
Given: POST /api/v1/sessions com JWT válido
When: sessão criada
Then: HTTP 201
And: response._links.messages.href = "/api/v1/sessions/{id}/messages"

# SPEC-API-03
Given: POST /api/v1/sessions/:id/messages com query de legislação
When: grafo conclui com success (Accept: application/json)
Then: HTTP 200
And: cited_documents não vazio
And: termination_reason = "success"
And: response._links.chunks[] tem um href por cited_document

# SPEC-API-04
Given: POST /api/v1/sessions/:id/messages com query sem embasamento
When: grafo conclui (Accept: application/json)
Then: HTTP 200
And: termination_reason != "success"
And: final_response = mensagem de fallback correspondente

# SPEC-API-05 (Streaming SSE — sucesso)
Given: POST /api/v1/sessions/:id/messages com Accept: text/event-stream
When: grafo executa query de legislação
Then: servidor emite em ordem:
  1. event: status (node = "router")
  2. event: status (node = "rada_agent", iteration = 1)
  3. event: status (node = "grader")
  4. event: status (node = "synthesizer")
  5. event: complete com SendMessageResponse completo
And: cited_documents não vazio no evento complete

# SPEC-API-06 (Streaming SSE — sem embasamento)
Given: POST /api/v1/sessions/:id/messages com Accept: text/event-stream
When: grafo executa 3 iterações sem docs
Then: servidor emite events: status com iteration = 1, 2, 3
And: emite event: status com node = "no_basis"
And: emite event: complete com termination_reason = "max_iterations_reached"

# SPEC-API-07 (Timeout de conexão)
Given: servidor trava e não emite nenhum byte por 60s
When: cliente aguarda
Then: servidor encerra stream com event: error e code = "CONNECTION_TIMEOUT"
And: HTTP 504 se modo JSON

# SPEC-API-08 (RBAC)
Given: usuário role = "app_requisitante" tenta acessar sessão de outro usuário
When: GET /api/v1/sessions/:id/messages
Then: HTTP 403 com code = "FORBIDDEN"
```

---

## 13. Serviço de Ingestão — `markdown-ingest`

### 13.1 Contrato

```typescript
// src/ingest/markdown-ingest.ts

interface IngestInput {
  filePath: string;       // path para o .md
  document_type: DocumentType;
  year: number;
  title: string;
}

interface ChunkResult {
  chunk_index: number;
  content: string;
  chapter?: string;
  article?: string;
  section?: string;
  page?: number;
  embedding: number[];    // vetor 3072 dimensões
}

interface IngestResult {
  document_id: string;
  chunks_created: number;
  failed_chunks: number;
}
```

### 13.2 Pipeline de ingestão

```
1. Parse Markdown → identifica frontmatter + headings (Cap./Art./Seção)
2. Chunking       → divide por artigo/seção (chunk máx: 512 tokens)
3. Embedding      → text-embedding-3-large → vetor 3072d
4. Upsert         → INSERT em documents + document_chunks (Supabase)
```

### 13.3 Invariantes

| # | Invariante |
|---|---|
| I1 | Cada chunk tem no máximo 512 tokens |
| I2 | Overlap entre chunks de mesmo artigo: 50 tokens |
| I3 | `chapter`, `article`, `section` extraídos do heading Markdown |
| I4 | Embedding sempre dimensão 3072 |
| I5 | Ingestão é **idempotente** — re-executar não duplica documentos |

### 13.4 Cenários

```gherkin
# SPEC-INGEST-01
Given: arquivo RADA-2023.md com 500 artigos
When: markdown-ingest executa
Then: document_id criado na tabela documents
And: chunks >= 500 criados em document_chunks
And: cada chunk tem embedding de 3072 dimensões
And: content_tsv gerado (FTS)

# SPEC-INGEST-02
Given: arquivo já ingerido anteriormente
When: markdown-ingest executa novamente
Then: não cria documentos duplicados
And: chunks_created = 0 se conteúdo não mudou

# SPEC-INGEST-03
Given: heading "## Capítulo IV — Art. 42"
When: ingest processa heading
Then: chunk.chapter = "Capítulo IV"
And: chunk.article = "Art. 42"
```

---

## 14. Observabilidade — LangSmith + `query_logs`

### 14.1 O que registrar em `query_logs`

Cada chamada ao grafo gera exatamente 1 registro em `query_logs` ao finalizar.

```typescript
interface QueryLogInsert {
  session_id: string;
  original_query: string;
  reformulated_query?: string;
  intent: string;
  retrieved_doc_ids: string[];
  termination_reason: string;
  final_response: string;
  retrieval_iterations: number;
  grading_retries: number;
  latency_ms: number;
  langsmith_run_id?: string;
}
```

### 14.2 Invariantes

| # | Invariante |
|---|---|
| I1 | Sempre 1 log por execução do grafo |
| I2 | `latency_ms` = tempo total do grafo em milissegundos |
| I3 | `langsmith_run_id` = ID do trace LangSmith (quando configurado) |
| I4 | `termination_reason` nunca nulo |

### 14.3 Cenários

```gherkin
# SPEC-OBS-01
Given: query executada com sucesso
When: grafo finaliza
Then: 1 registro em query_logs com termination_reason = "success"
And: latency_ms > 0

# SPEC-OBS-02
Given: LangSmith configurado via LANGCHAIN_API_KEY
When: grafo executa
Then: langsmith_run_id preenchido no log
And: trace disponível no dashboard LangSmith
```

---

## 15. Feature — Visualizador de Documentação

### 15.1 Comportamento esperado

O `POST /api/v1/sessions/:session_id/messages` já retorna `cited_documents` com `CitedChunk[]`. O frontend usa `GET /api/v1/chunks/:id` para carregar o conteúdo completo quando o usuário clica em uma citação.

### 15.2 Contrato de UI (para referência do frontend)

```
Layout: Split de 2 colunas (chat esquerda | docs direita)
- Coluna esquerda: mensagens + input
- Coluna direita: painel de documentação (persistente na sessão)
- Ao clicar em [¹]: carrega chunk via GET /api/v1/chunks/:id
- Renders: Markdown do chunk com highlight do snippet relevante
- Multi-doc: lista todos os cited_documents com trechos empilhados
```

### 15.3 Invariantes

| # | Invariante |
|---|---|
| I1 | Painel de docs não afeta o estado do grafo |
| I2 | Nenhuma lógica adicional no backend — feature puramente de apresentação |
| I3 | `GET /api/v1/chunks/:id` é o único acesso ao conteúdo completo |

### 15.4 Cenários

```gherkin
# SPEC-VIEWER-01
Given: resposta com cited_documents contendo 2 chunks
When: usuário clica em [¹]
Then: GET /api/v1/chunks/{chunk_id_1} é chamado
And: painel exibe conteúdo do chunk com snippet destacado

# SPEC-VIEWER-02
Given: painel com documento aberto
When: usuário envia nova mensagem no chat
Then: painel atualiza com novos cited_documents da nova resposta
And: histórico do chat não é perdido
```

---

## Critério Global de Done (Definition of Done)

Uma funcionalidade está **done** quando:

- [ ] Contrato TypeScript definido e sem erros de tipo (`tsgo --noEmit`)
- [ ] Todos os cenários `Given/When/Then` desta seção passando
- [ ] Invariantes verificadas por testes unitários
- [ ] `query_logs` registra corretamente o resultado
- [ ] JWT Supabase validado — endpoint não executa sem token válido
- [ ] Sem chamadas LLM desnecessárias além das especificadas
- [ ] Sem dependência de Python, PDF, ou bibliotecas fora da stack definida

---

## Ordem de Implementação Recomendada

```
1.  Migrations SQL (Seção 2)
2.  AgentState + tipos (Seção 1)
3.  Supabase client + checkpointer (src/db/)
4.  Auth: middleware Hono + roles Supabase (Seção 11)
5.  markdown-ingest (Seção 13) → ingerir RADA-2023.md
6.  RADA_Retriever tool (Seção 3)
7.  Nós: Router → GeneralChat → NoBasis (Seções 4, 9, 8)
8.  Nó: RADA_Agent com loop (Seção 5)
9.  Nó: Grader (Seção 6)
10. Nó: Synthesizer (Seção 7)
11. Grafo: composição + arestas (Seção 10)
12. API Hono: endpoints JSON (Seção 12)
13. API Hono: modo SSE streaming (Seção 12.3)
14. Observabilidade: query_logs (Seção 14)
15. Visualizador: endpoint GET /api/v1/chunks/:id (Seção 15)
```
