# Design — Fontes federais e verificação de conformidade (Projeto α, Etapas 1.4–1.7)

## Contexto

O alpha hoje é um RAG de documento único: `documents` + `document_chunks` + busca híbrida (`apps/alpha/src/tools/rada-retriever.ts`) + grafo LangGraph com `router → rada_agent → grader → synthesizer`. Funciona bem para "o que o RADA diz sobre X".

Conformidade é outro problema. Não é "buscar e responder", é "comparar um documento do usuário contra dois artefatos externos versionados (o modelo AGU e a norma vigente) e produzir um parecer auditável". Três diferenças estruturais:

| RAG de consulta | Verificação de conformidade |
|---|---|
| resposta efêmera | parecer persistido e auditável |
| versão do documento é irrelevante | versão é **parte do resultado** |
| usuário avalia a resposta | ACI assina o parecer |

Por isso o desenho gira em torno de **versionamento** e **rastreabilidade**, não em torno do LLM.

## Decisões

### D1 — Registry de fontes com adapter, não script por fonte

Cada fonte externa vira um objeto que implementa um contrato comum. O pipeline (`hash → dedup → chunk → embed → upsert`) é escrito uma vez.

```ts
// apps/alpha/src/sources/types.ts
export interface SourceItem {
  external_id: string        // URL canônica ou URN LexML
  title: string
  version_label: string      // "mai-26", "2021-04-01", "compilado-2026-05-12"
  effective_from?: string
  fetch_url: string
}

export interface StructuredDoc {
  document_type: DocumentType
  title: string
  version_label: string
  content_hash: string
  nodes: StructureNode[]     // árvore (ltree path) — seções, artigos, capítulos
  notes: ExplanatoryNote[]    // só modelos AGU
  placeholders: Placeholder[] // só modelos AGU
}

export interface NormativeSource {
  id: string
  authority: "AGU" | "PLANALTO" | "SEGES" | "SENADO"
  kind: "MODELO" | "LEI" | "REGULAMENTO"
  cadence: "daily" | "weekly" | "monthly"
  discover(): Promise<SourceItem[]>
  fetch(item: SourceItem): Promise<Uint8Array | string>
  parse(raw: Uint8Array | string, item: SourceItem): Promise<StructuredDoc>
}
```

**Por quê**: as fontes têm ciclos e formatos radicalmente diferentes (`.docx` mensal da AGU vs. XML de norma compilada), mas o que acontece *depois* do parse é idêntico. Separar `discover/fetch/parse` também torna cada etapa testável com fixture, sem rede.

### D2 — Versionamento aditivo, nunca UPDATE destrutivo

`document` ganha `content_hash`, `version_label`, `effective_from`, `superseded_at`. Reingestão:

1. `discover()` retorna item com `version_label`
2. se existe `document` ativo com mesmo `(source_id, external_id)` e **mesmo** `content_hash` → no-op
3. hash diferente → insere documento novo, `UPDATE` o anterior com `superseded_at = now()`, mantém chunks antigos

**Por quê**: um `compliance_run` de março precisa continuar reproduzível em julho, mesmo que o modelo AGU tenha mudado em maio. `compliance_run` grava os `document_id` exatos usados — não os IDs "vigentes hoje".

**Custo aceito**: chunks e embeddings acumulam. Mitigação: `document_chunks` de versão com `superseded_at` mais antiga que N meses saem do índice HNSW via índice parcial (`WHERE superseded_at IS NULL`), mas continuam legíveis por ID para auditoria.

### D3 — Notas explicativas da AGU como semente de regra

Os modelos da AGU embutem *notas explicativas* que citam o dispositivo que fundamenta cada seção ("conforme art. 6º, XXIII, 'a', da Lei nº 14.133/21"). É a própria AGU declarando o mapa seção → dispositivo.

**Onde elas ficam, de fato**: são **comentários do Word** (`word/comments.xml`), ancorados ao parágrafo por `w:commentRangeStart`, com o prefixo "Nota Explicativa". Só o Termo de Referência de serviços e obras (mai-26) tem 168 comentários, dos quais 162 são notas — 62 delas citando dispositivo, num total de 114 referências a 26 normas distintas (82 à própria Lei 14.133). Comentário sem o prefixo é orientação de uso do modelo, não nota, e é descartado.

Extrair essas notas e transformá-las em `checklist_rule` semeadas (com `origin = 'agu_note'` e `status = 'draft'`) economiza a maior parte do trabalho manual de escrever regra, e ancora cada regra numa fonte oficial em vez de num prompt inventado.

**Regra semeada não entra em produção automaticamente** — nasce `draft` e precisa de revisão humana na bancada (`/alpha/bancada`) para virar `active`.

### D4 — Comparação estrutural determinística; LLM só para justificar

Pipeline de casamento entre a árvore do documento submetido e a do modelo:

1. **Normalização**: minúsculas, sem acento, sem numeração de seção, sem pontuação final
2. **Exato** sobre o título normalizado
3. **Fuzzy**: token-set ratio ≥ 0.85 (implementação própria, sem dependência nova)
4. **Semântico**: cosseno entre embeddings dos títulos ≥ 0.80 — o embedder já está no projeto
5. **Ordem**: LCS sobre a sequência de nós casados; nó fora da subsequência = `out_of_order`

Saída por nó: `matched | missing | extra | out_of_order | renamed`.

**Por quê não LLM**: é comparação de conjunto ordenado, resolvida por algoritmo em milissegundos, com resultado idêntico a cada execução e testável com fixture. Usar LLM aqui compra não-determinismo e latência sem ganho. O LLM entra depois, só para escrever o texto da recomendação sobre um diff já calculado.

### D5 — Guard de citação no verificador

Todo `compliance_finding` carrega `legal_ref` (norma + dispositivo). Antes de persistir:

1. resolver `legal_ref` contra `structure_node` do documento de legislação vigente
2. não resolveu → **descarta o finding** e registra em `compliance_run.discarded_findings`

**Por quê**: o modo de falha mais destrutivo aqui não é deixar passar uma inconformidade — é apontar uma inconformidade citando artigo que não existe. Isso queima a confiança do ACI de forma irrecuperável. O contador de descartes vira métrica de qualidade do prompt.

Complementa o `graderNode` de grounding que já existe no grafo, que continua checando se o texto do finding se apoia nos chunks recuperados.

### D6 — Cache de verificação por `(hash_bloco, rule_id, document_id_da_norma)`

Reexecutar a análise de um ETP após corrigir uma seção só reprocessa os blocos alterados. Invalidação natural: se a norma muda, muda o `document_id`, a chave muda, recalcula.

### D7 — Console no portal, não app novo

O portal já tem auth Supabase, `getAlphaClient()` tipado (`apps/portal/src/lib/hono.ts`) e uma tela consumindo o alpha (`chatRada.tsx`). Um app novo custaria terraform, ALB, CI e domínio antes da primeira tela útil.

Rotas ficam sob guard autenticado e **não entram no menu público**. Design segue o Pale Brutalism do portal (`apps/portal/STYLE_CONTRACT.md`): zero radius, sem faixa lateral colorida de acento — severidade de finding distinguida por badge + tint de fundo.

### D8 — Consolidação no projeto Supabase do sisub, schema `alpha`

O alpha roda hoje contra um projeto Supabase próprio (`fjnysdiusivrffprcdus`), separado do projeto do sisub (`jgigqdpdjgnnuwajtayh`) usado por `packages/database`, portal, rumaer e sucont. As migrations do alpha passam a viver em `packages/database/supabase/migrations/`, sob o schema `alpha`, no mesmo histórico dos demais schemas.

Consequências, todas tratadas como tarefa explícita:

- **O corpus do RADA foi perdido.** O projeto Supabase antigo foi apagado em 2026-07-31, com documentos, chunks e embeddings dentro, e não há backup. O schema `alpha` nasce vazio e o ChatRADA responde "sem base" até o corpus ser reconstruído por `bun run ingest:all` a partir dos Markdown do RADA em `apps/alpha/knowledge/` — que hoje está vazio e depende de acesso ao RADA.
- **Extensões.** O projeto principal ainda não tem `vector` nem `ltree` habilitadas — a primeira migration habilita as duas no schema `extensions`.
- **Exposição no PostgREST.** Schema novo exige `alter role authenticator set pgrst.db_schemas` incluindo `alpha` + `notify pgrst, 'reload config'`, senão o client JS devolve `PGRST106`.
- **Cliente e checkpointer.** `createClient(..., { db: { schema: "alpha" } })` e `PostgresSaver.fromConnString(url, { schema: "alpha" })` — a versão 1.0.x do checkpointer aceita a opção `schema` e cria as próprias tabelas nele, em vez de poluir `public`.
- **Autenticação deixa de ser ambígua.** Com um único projeto, o JWT que o portal emite é o mesmo que `supabase.auth.getUser(token)` do alpha valida. Hoje, com projetos distintos, essa validação depende de o segredo de produção sobrescrever o `.env.example` — o que não é verificável a partir do repositório.

O projeto antigo já não existe — foi apagado em 2026-07-31. O α passa a viver inteiramente no projeto do sisub, com o schema `alpha` começando vazio.

**Secrets herdados, com dívida declarada.** Em produção o α consome os secrets do sisub (`VITE_SISUB_SUPABASE_URL`, `SISUB_SUPABASE_SECRET_KEY`, `SISUB_DATABASE_URL`), como rumaer e sucont já fazem. É o caminho mais curto e consistente com o repositório, e acopla os dois serviços: rotacionar a chave do sisub derruba o α, e não há como dar ao α credencial de menor privilégio nem pooler próprio. O TODO de separar (`ALPHA_SUPABASE_*` apontando para o mesmo projeto) está registrado no `sync-secrets.yml` e no `terraform.tfvars.example`.

O `DATABASE_URL` do sisub é do pooler. O `PostgresSaver` do LangGraph usa `pg.Pool` sem prepared statement nomeado, então funciona em modo transação — mas é o ponto a olhar primeiro se o checkpointer falhar depois da troca.

### D9 — Bibliotecas de parse

| Formato | Escolha | Motivo |
|---|---|---|
| `.docx` (modelo AGU e submissão) | `fflate` + scanner OOXML próprio | ver abaixo |
| `.pdf` (submissão) | `unpdf` | roda em Bun sem binário nativo; devolve texto com posição, necessário para `source_span` |
| XML LexML (SRU) | `fast-xml-parser` | leve, sem DOM |

**`mammoth` foi descartado** depois de abrir os modelos reais. Ele converte `.docx` para HTML, e os dois sinais que interessam não sobrevivem à conversão:

- a hierarquia está em **estilos de parágrafo próprios** (`Nivel01`, `Nvel02`, `Nvel2-Opcional`), que o mammoth mapearia para `<p>` genérico — e é de `-Opcional` que sai `is_required`;
- as notas explicativas são **comentários**, que o mammoth simplesmente não emite.

Sobra ler `word/document.xml` e `word/comments.xml` diretamente. `fflate` descompacta (menor e mais rápido que `jszip`) e um scanner de ~120 linhas varre os parágrafos em ordem de documento. `w:p` não aninha em OOXML, o que torna a varredura previsível; a garantia vem dos testes sobre os `.docx` reais em `__fixtures__/`.

## Schema

Schema `alpha` no projeto Supabase principal, migrations em `packages/database/supabase/migrations/` com timestamp de 14 dígitos (convenção do monorepo).

Como o schema é **criado do zero** no projeto principal, não há baseline de "reproduzir o que foi aplicado à mão": as tabelas nascem já no formato final, com versionamento desde a origem. `vector(1024)` é a dimensão real do `baai/bge-m3`, não os 3072 de `plans/alpha/spec.md`. Nomes migram para o singular, alinhados ao resto do repositório (`document`, `document_chunk`, `query_log`).

```sql
create schema if not exists alpha;
create extension if not exists vector with schema extensions;
create extension if not exists ltree  with schema extensions;

-- corpus (migrado do projeto antigo, já com versionamento)
create table alpha.document (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  document_type  text not null,
  source         text,
  year           int,
  source_id      text references alpha.normative_source(id),
  external_id    text,
  version_label  text,
  effective_from date,
  superseded_at  timestamptz,
  content_hash   text,
  created_at     timestamptz not null default now(),
  constraint document_type_check check (document_type in (
    'RADA','RBHA','ICA','MCA','NSCA',
    'LEI','DECRETO','IN_SEGES','MODELO_AGU'
  ))
);

create unique index document_source_version_uk
  on alpha.document (source_id, external_id, content_hash)
  where source_id is not null;

create index document_vigente_ix
  on alpha.document (source_id, external_id)
  where superseded_at is null;

create table alpha.document_chunk (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references alpha.document(id) on delete cascade,
  content      text not null,
  chapter      text,
  article      text,
  section      text,
  chunk_index  int not null,
  token_count  int,
  metadata     jsonb not null default '{}',
  embedding    extensions.vector(1024),
  fts          tsvector generated always as (to_tsvector('portuguese', content)) stored
);

-- índice vetorial só sobre a versão vigente
create index document_chunk_embedding_ix on alpha.document_chunk
  using hnsw (embedding extensions.vector_cosine_ops) with (m = 16, ef_construction = 64);
create index document_chunk_fts_ix on alpha.document_chunk using gin (fts);

-- registry de fontes
create table alpha.normative_source (
  id             text primary key,          -- 'agu-modelos-14133', 'lei-14133'
  authority      text not null,             -- AGU | PLANALTO | SEGES | SENADO
  kind           text not null,             -- MODELO | LEI | REGULAMENTO
  base_url       text not null,
  cadence        text not null default 'weekly',
  enabled        boolean not null default true,
  last_checked_at timestamptz,
  last_error     text
);

-- árvore de seções (modelo AGU e norma articulada)
create table alpha.structure_node (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references alpha.document(id) on delete cascade,
  path         extensions.ltree not null,    -- 1.3.2
  ordinal      int not null,
  level        int not null,
  title        text not null,
  title_norm   text not null,                -- normalizado para matching
  title_embedding extensions.vector(1024),
  ref_label    text,                         -- 'Art. 6º, XXIII, a' quando norma
  is_required  boolean not null default true,
  body         text,
  unique (document_id, path)
);

create table alpha.explanatory_note (
  id            uuid primary key default gen_random_uuid(),
  node_id       uuid not null references alpha.structure_node(id) on delete cascade,
  content       text not null,
  cited_refs    jsonb not null default '[]'  -- [{norma, dispositivo}]
);

create table alpha.placeholder (
  id        uuid primary key default gen_random_uuid(),
  node_id   uuid not null references alpha.structure_node(id) on delete cascade,
  token     text not null,                   -- '[INSERIR OBJETO]'
  hint      text
);

-- regras de conformidade
create table alpha.checklist_rule (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  kind           text not null,              -- ESTRUTURAL | CONTEUDO | CRUZADA
  severity       text not null,              -- BLOQUEANTE | GRAVE | MEDIA | INFORMATIVA
  status         text not null default 'draft', -- draft | active | needs_review | retired
  origin         text not null,              -- agu_note | manual | norma
  origin_document_id uuid references alpha.document(id),
  legal_ref      jsonb not null,             -- [{norma, dispositivo}]
  applicability  jsonb not null default '{}',-- {modalidade:[], objeto:[]}
  target_field   text,                       -- caminho no JSON canônico
  prompt         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- submissões e análise
create table alpha.submission (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  filename     text not null,
  mime_type    text not null,
  storage_path text not null,
  doc_kind     text not null,                -- ETP | TR | EDITAL
  modalidade   text,
  objeto       text,                         -- COMPRAS | SERVICOS | OBRAS | TIC
  created_at   timestamptz not null default now()
);

create table alpha.extraction (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references alpha.submission(id) on delete cascade,
  payload       jsonb not null,              -- JSON canônico da contratação
  spans         jsonb not null,              -- {campo: {start,end,page}}
  model         text not null,
  created_at    timestamptz not null default now()
);

create table alpha.compliance_run (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references alpha.submission(id) on delete cascade,
  extraction_id   uuid not null references alpha.extraction(id),
  model_document_id uuid references alpha.document(id),  -- modelo AGU usado
  law_document_ids uuid[] not null default '{}',        -- normas usadas
  status          text not null default 'running',
  discarded_findings int not null default 0,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create table alpha.compliance_finding (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references alpha.compliance_run(id) on delete cascade,
  rule_id       uuid references alpha.checklist_rule(id),
  category      text not null,               -- ESTRUTURAL | CONTEUDO | CRUZADA
  status        text not null,               -- MISSING | EXTRA | OUT_OF_ORDER | RENAMED | INCONFORME
  severity      text not null,
  section_path  text,
  message       text not null,
  legal_ref     jsonb not null default '[]',
  suggestion    text,
  evidence_span jsonb,
  confidence    numeric(4,3)
);
```

## Fluxos

### Ingestão AGU

```
discover()  crawl do índice + categorias de /licitacoesecontratos/14133/
            → hrefs .docx → version_label do sufixo (mai-26) → SourceItem[]
fetch()     GET do .docx
parse()     fflate → word/document.xml  → árvore por estilo de parágrafo
                   → word/comments.xml  → notas explicativas + refs legais
                   → colchetes no texto → placeholders
upsert      hash igual → no-op | diferente → versão nova + supersede
            notas → explanatory_note → semeia checklist_rule status=draft
```

Três características do site, descobertas ao rodar contra ele, moldam o `discover`:

- **uma categoria lista arquivos de outra** — a categoria vem do caminho da URL, não da página onde o link foi achado;
- **versões antiga e nova convivem na mesma página** (`...-set-25.docx` e `...-abr-26.docx` do mesmo modelo) — a identidade é a URL sem o sufixo de versão, e só a de maior rank é ingerida;
- **a categoria `modelos-antigos` é arquivo histórico** com 47 modelos revogados — excluída, senão a comparação estrutural conferiria documento novo contra modelo revogado.

Na execução real: 90 arquivos encontrados → 43 modelos vigentes, 47 excluídos por categoria, 4 versões preteridas. Nada é descartado em silêncio; tudo aparece no relatório.

Falha de uma categoria não aborta as demais — cada `SourceItem` é transacionado sozinho e o erro vai para `normative_source.last_error`.

### Ingestão de legislação

Fonte primária LexML/`normas.leg.br` por URN (`urn:lex:br:federal:lei:2021-04-01;14133`), texto articulado. Fallback Planalto HTML. `structure_node.ref_label` recebe o rótulo do dispositivo (`Art. 6º`, `§ 1º`, `XXIII`), que é o que o guard de citação resolve depois.

### Atualização e impacto

`POST /internal/jobs/sources/refresh` (autenticado por segredo de serviço, chamado por scheduled task semanal):

1. para cada fonte habilitada, `discover()` + comparação de hash
2. versão nova → ingere e supersede
3. **análise de impacto**: `checklist_rule` cujo `legal_ref` cite dispositivo cujo texto mudou entre as versões → `status = 'needs_review'`
4. resumo no `/alpha/fontes`

Sem o passo 3 o verificador envelhece em silêncio, que é o pior modo de falha do sistema inteiro.

### Verificação

```
submission → extraction (1.4)
           → comparação estrutural contra modelo AGU vigente (1.5)
           → verificação por bloco × regra ativa aplicável (1.6)
              cada uma: RAG na norma vigente → juiz LLM (structured output)
                        → guard de citação → grounding grader → persiste ou descarta
           → checagens cruzadas + consolidação por severidade (1.7)
```

Blocos são verificados em paralelo com limite de concorrência. `compliance_run` grava os `document_id` de modelo e normas usados — é o que torna o parecer reproduzível.

## Riscos

| Risco | Mitigação |
|---|---|
| AGU muda a estrutura do site e o crawl quebra | `discover()` isolado e testado com fixture de HTML; falha vira `last_error` visível em `/alpha/fontes`, não silêncio. Contagem mínima esperada de modelos por categoria como sanity check |
| `.docx` da AGU com formatação irregular entre modelos | Fixture por categoria na suíte; parser tolerante (heading ausente não aborta, vira nó de nível herdado) |
| LLM alucina dispositivo legal | Guard de citação (D5) + grounding grader existente + contador de descartes como métrica |
| Falso positivo enterra o ACI em ruído | Regra nasce `draft`; só vira `active` após calibração na bancada contra o golden set. Severidade obriga triagem |
| Corpus de norma incompleto gera "conforme" enganoso | `compliance_run` registra quais normas foram usadas; relatório declara a cobertura em vez de afirmar conformidade absoluta |
| Volume de embeddings cresce com versões | Índice HNSW parcial em `superseded_at is null` |
| ~~Perda do corpus do RADA na consolidação~~ — **o risco se materializou**: o projeto antigo foi apagado antes da migração | Não há mitigação retroativa. O caminho é reingerir de Markdown (`ingest:all`), que depende de acesso ao RADA. A lição aplicada: o corpus reconstruído passa a ter sua fonte versionada em `apps/alpha/knowledge/`, dentro do repositório, em vez de existir só como linha em banco |
| Alpha em produção apontando para o projeto errado durante a troca | Corte por variável de ambiente (`SUPABASE_URL`, `DATABASE_URL`) num único deploy, depois da carga concluída e conferida; rollback = reverter a variável |
| `vector`/`ltree` ausentes no projeto principal | Habilitadas na primeira migration, no schema `extensions`; migration falha alto se não puder habilitar |
| Schema `alpha` não exposto no PostgREST | `alter role authenticator set pgrst.db_schemas` + `notify pgrst` na própria migration, como já feito para `rumaer` e `sucont` |

## Alternativas descartadas

- **Ingerir os modelos AGU como markdown pelo pipeline atual**: perde a árvore, as notas e os placeholders — exatamente os três artefatos que a Etapa 1.5 precisa. O `.docx` é a fonte com mais informação; converter para markdown antes de estruturar joga fora o que interessa.
- **Comparação estrutural por LLM**: não-determinística, mais cara, e impossível de testar por fixture. Ver D4.
- **Uma tabela `document_version` separada de `document`**: duplicaria FK e reescreveria o retriever atual. Versionar dentro de `document` com `superseded_at` mantém o retriever compatível — ele só ganha um filtro.
- **Manter o alpha em projeto Supabase próprio**: duplicava administração, deixava a validação de JWT entre portal e alpha dependente de configuração não verificável pelo repositório e mantinha as migrations do alpha fora do histórico de `@iefa/database`.
- **Criar secrets próprios do α já nesta mudança**: adiaria a consolidação por uma diferença que hoje não muda comportamento — os dois apontariam para o mesmo projeto. Fica como TODO explícito, não como omissão.
- **Guardar o parecer como texto livre do LLM**: impossível auditar por regra, medir precisão ou marcar regra defasada. Finding estruturado é o que permite o golden set.
