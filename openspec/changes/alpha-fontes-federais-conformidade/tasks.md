# Tasks

Agrupadas por PR. Cada grupo é um Pull Request próprio contra `main` (nunca merge direto, revisão do Greptile + humana).

## PR A — Schema `alpha` em `packages/database` + consolidação do projeto Supabase

- [x] A.1 [database] Migration: `create schema alpha`, extensões `vector` e `ltree` em `extensions`, grants e RLS
- [x] A.2 [database] Migration: corpus com versionamento desde a origem — `alpha.document` (com `source_id`, `external_id`, `version_label`, `effective_from`, `superseded_at`, `content_hash` e CHECK estendido de `document_type`), `alpha.document_chunk` (`vector(1024)`, HNSW, FTS `portuguese`), `alpha.query_log`
- [x] A.3 [database] Migration: `alpha.normative_source` + seed das fontes (AGU modelos 14.133, Lei 14.133, decretos, INs SEGES) com `enabled = false`
- [x] A.4 [database] Migration: `alpha.structure_node` (`extensions.ltree`, `title_embedding vector(1024)`), `alpha.explanatory_note`, `alpha.placeholder`
- [x] A.5 [database] Migration: `alpha.checklist_rule`, `alpha.submission`, `alpha.extraction`, `alpha.compliance_run`, `alpha.compliance_finding`
- [x] A.6 [database] Migration: RPCs `alpha.match_chunks_cosine` e `alpha.match_chunks_fts` com filtro de versão vigente
- [x] A.7 [database] Migration: expor `alpha` no PostgREST (`pgrst.db_schemas` + `notify pgrst`) e atualizar `db:types` / `db:pull` / `db:diff` com o schema novo
- [ ] A.8 [database] Rodar `bun run db:types` e conferir os tipos gerados do schema `alpha`
- [x] A.9 [alpha] Cliente Supabase com `db: { schema: "alpha" }` e checkpointer com `PostgresSaver.fromConnString(url, { schema: "alpha" })`
- [x] A.10 [alpha] Renomear referências de tabela no código (`documents` → `document`, `document_chunks` → `document_chunk`, `query_logs` → `query_log`) em `api/routes.ts`, `tools/rada-retriever.ts` e `ingest/markdown-ingest.ts`
- [x] A.11 [alpha] `rada-retriever.ts`: filtrar `superseded_at IS NULL` e manter o comportamento do ChatRADA
- [x] A.12 [database] Script de cópia do corpus do projeto antigo (`fjnysdiusivrffprcdus`) para o schema `alpha`, com conferência de contagem de documentos e chunks antes/depois
- [ ] A.13 [alpha] Executar a cópia, conferir contagens e só então trocar `SUPABASE_URL` / `DATABASE_URL` do deploy; projeto antigo fica somente leitura
- [x] A.14 [alpha] Corrigir `plans/alpha/spec.md` §2 (schema `alpha`, dimensão 1024, tabelas novas) para parar de divergir do código

## PR B — Camada de fontes + adapter AGU (sem LLM)

- [x] B.1 [alpha] `src/sources/types.ts`: contratos `NormativeSourceAdapter`, `SourceItem`, `StructuredDoc`, `StructureNodeDraft`
- [x] B.2 [alpha] `src/sources/pipeline.ts`: `hash → dedup → supersede → chunk → embed → upsert`, por item, com supersede só ao fim
- [x] B.3 [alpha] `src/sources/registry.ts`: lê fontes de `alpha.normative_source` e resolve o adapter (fonte sem adapter é erro explícito)
- [x] B.4 [alpha] Dependência `fflate` (OOXML). `mammoth`/`jszip` descartados — ver D9 no design: achatam estilo de parágrafo e não expõem comentários
- [x] B.5 [alpha] `sources/agu/discover.ts`: crawl do índice + categorias, hrefs `.docx`, `version_label` do sufixo mês/ano, identidade sem versão
- [x] B.6 [alpha] `sources/agu/discover.ts`: piso de sanidade (`MIN_EXPECTED_MODELS`) e exclusão da categoria de modelos revogados, ambos reportados
- [x] B.7 [alpha] `sources/docx.ts` + `agu/adapter.ts`: scanner OOXML → árvore de `structure_node` (path, ordinal, level, `title_norm`, `is_required`)
- [x] B.8 [alpha] `agu/adapter.ts` + `lib/legal-ref.ts`: notas explicativas dos comentários do Word → referências legais estruturadas
- [x] B.9 [alpha] `agu/adapter.ts`: tokens de preenchimento por seção, deduplicados
- [x] B.10 [alpha] Semeadura de `checklist_rule` (`origin = 'agu_note'`, `status = 'draft'`) a partir de notas com citação, sem duplicar em reingestão
- [x] B.11 [alpha] Fixtures reais (2 `.docx` + HTML de categoria); 78 testes de `discover`, `docx`, `adapter`, `chunking`, `legal-ref` e `text`, todos sem rede
- [x] B.12 [alpha] CLI `bun run ingest:agu` (dry-run por padrão, `--apply` para gravar, `--limit` para calibrar)
- [x] B.13 [alpha] Rotas `GET /api/v1/sources`, `GET /api/v1/sources/:id/documents`, `GET /api/v1/documents/:id/structure`
- [ ] B.14 [alpha] Rodar `bun run ingest:agu --apply` contra o banco e conferir o resultado no console (depende de A.8/A.13)

## PR C — Console: fontes e inspetor de modelo

- [x] C.1 [portal] Layout autenticado `/alpha` com guard de sessão, fora da navegação pública
- [x] C.2 [portal] `/alpha/fontes`: tabela de fontes com autoridade, versão vigente, última verificação, erro e contagem de regras em `needs_review`
- [x] C.3 [portal] `/alpha/fontes`: ação de coleta sob demanda com estado de andamento e resumo final
- [x] C.4 [portal] `/alpha/modelos/$id`: árvore de seções navegável com obrigatoriedade, notas e dispositivos citados
- [ ] C.5 [portal] `/alpha/modelos/$id`: diff entre duas versões do mesmo modelo — depende de haver duas versões ingeridas (A.13/B.14)
- [x] C.6 [portal] Conferir aderência ao `apps/portal/STYLE_CONTRACT.md` (zero radius, sem faixa lateral colorida de acento)

## PR D — Legislação federal + watcher

- [x] D.1 [alpha] `sources/legislacao/html-text.ts` — decodificação e normalização. **LexML/SRU descartado**: responde verificação anti-bot do Senado, não XML; `fast-xml-parser` deixou de ser necessário
- [x] D.2 [alpha] `sources/legislacao/parse-articulado.ts`: `structure_node` com `ref_label` por dispositivo (artigo, parágrafo, inciso, alínea), com aninhamento correto
- [x] D.3 [alpha] `sources/legislacao/adapter.ts` — Planalto (lei/decreto) e DOU (IN) como origens verificadas; migration corrige as URLs do registry
- [x] D.4 [alpha] `compliance/resolve-legal-ref.ts` + `lib/ref-label.ts` — resolução contra nó existente, com `norma_ausente`/`dispositivo_ausente` explícitos
- [ ] D.5 [alpha] Ingerir corpus mínimo de fato (Lei 14.133, decretos 11.246 e 11.462, IN SEGES 65) — depende do banco (A.13)
- [x] D.6 [alpha] `POST /internal/jobs/sources/refresh` com autenticação por segredo de serviço e resumo por fonte
- [x] D.7 [alpha] Análise de impacto: diff de dispositivo entre versões → `checklist_rule` afetadas para `needs_review`
- [x] D.8 [alpha] Timer semanal in-process (`jobs/scheduler.ts`), desligado por padrão — mesmo padrão dos workers de sync do `api`, sem infra nova
- [x] D.9 [alpha] 14 testes sobre a Lei 14.133 real: encoding, rótulo ordinal/cardinal, aninhamento de inciso em parágrafo, dispositivo inexistente

## PR E — Extrator (Etapa 1.4)

- [x] E.1 [alpha] `extraction/schema.ts` — `ContratacaoSchema` (19 campos), obrigatórios e rótulos
- [x] E.2 [alpha] Dependência `unpdf`; `extraction/to-text.ts` — `.docx` e `.pdf` → texto + árvore de seções do documento submetido
- [x] E.3 [alpha] `extraction/extract.ts` — structured output validado, retry limitado e falha explícita em vez de payload inválido
- [x] E.4 [alpha] `extraction/locate-span.ts` + `apply-spans.ts` — citação literal reencontrada no texto; sem span o campo vira ausente
- [x] E.5 [alpha] Bucket privado `alpha-submissions` (migration) + rotas de submissão, extração, histórico e texto
- [x] E.6 [alpha] 14 testes: span exato, aproximado, inexistente, descarte por evidência não localizada, schema inválido
- [x] E.7 [portal] `/alpha/analise/nova`: upload, extração e conferência lado a lado com o trecho destacado

## PR F — Comparador estrutural (Etapa 1.5)

- [ ] F.1 [alpha] `compliance/normalize-title.ts` + `token-set ratio` próprio (sem dependência nova), com testes de caso limite
- [ ] F.2 [alpha] `compliance/match-sections.ts`: exato → fuzzy ≥ 0.85 → semântico ≥ 0.80, determinístico
- [ ] F.3 [alpha] `compliance/order-lcs.ts`: subsequência comum máxima → só o nó fora da LCS vira `OUT_OF_ORDER`
- [ ] F.4 [alpha] Seleção do modelo AGU aplicável por tipo/modalidade/objeto + caminho de "nenhum modelo aplicável"
- [ ] F.5 [alpha] Persistência dos achados estruturais em `compliance_finding` com severidade por obrigatoriedade
- [ ] F.6 [alpha] Redação da recomendação por LLM sobre diff já classificado, com mensagem padrão em caso de falha
- [ ] F.7 [alpha] Testes de fixture: seção ausente, extra, renomeada, invertida e documento aderente; teste de determinismo em duas execuções

## PR G — Verificador de conformidade (Etapas 1.6 e 1.7)

- [ ] G.1 [alpha] Seleção de regras ativas aplicáveis por bloco (aplicabilidade + `status = 'active'`)
- [ ] G.2 [alpha] Juiz por regra: recuperação na norma vigente → structured output `{status, confiança, evidência, ref_legal, sugestão}`
- [ ] G.3 [alpha] Guard de citação com `resolveLegalRef`; descarte + incremento de `discarded_findings`
- [ ] G.4 [alpha] Reuso do grader de fundamentação existente antes de persistir o achado
- [ ] G.5 [alpha] "Não avaliada" quando nenhum trecho passa do limiar — nunca inferir conformidade por ausência
- [ ] G.6 [alpha] Regras cruzadas entre campos do JSON canônico (valor × modalidade, parcelamento × justificativa, prazo × dispositivo)
- [ ] G.7 [alpha] Cache por `(hash_bloco, rule_id, document_id_da_norma)` e invalidação ao mudar qualquer componente da chave
- [ ] G.8 [alpha] Execução paralela com limite de concorrência; `compliance_run` grava modelo e normas usados
- [ ] G.9 [alpha] Consolidação por severidade + declaração de cobertura (aplicadas, não avaliadas, descartadas)
- [ ] G.10 [alpha] Rotas `POST /api/v1/compliance/runs`, `GET /api/v1/compliance/runs/:id`, `POST /api/v1/rules/:id/evaluate`
- [ ] G.11 [portal] `/alpha/analise/$id`: abas estrutural, conformidade e execução, com filtro por severidade e navegação até o trecho
- [ ] G.12 [portal] `/alpha/bancada`: teste de regra isolada, exibição do que o guard de citação faria, promoção `draft` → `active`

## PR H — Avaliação e fechamento

- [ ] H.1 [alpha] Golden set: 5 a 10 ETP/TR anotados à mão com as inconformidades esperadas
- [ ] H.2 [alpha] Harness de avaliação: precisão e recall por regra e agregados, executável por comando
- [ ] H.3 [alpha] Calibrar limiares (fuzzy, semântico, `RERANK_THRESHOLD`) contra o golden set e registrar os valores escolhidos
- [ ] H.4 [alpha] Revisar e promover o lote inicial de regras semeadas na bancada
- [ ] H.5 [docs] Atualizar `apps/docs/content/docs/alpha/` com o estado real das etapas 1.4–1.7
- [ ] H.6 [portal] Atualizar `roadmap.tsx`: 1.4 a 1.7 para `done` ou `in-progress` conforme o entregue
- [ ] H.7 [alpha] Documentar em `apps/alpha/.env.schema` as variáveis novas (segredo do job, limiares, base URLs de fonte)

## Final

- [ ] Z.1 [root] `bun run check` verde (Biome + typecheck)
- [ ] Z.2 [root] `bun run test` verde na suíte inteira (não typecheck por arquivo)
