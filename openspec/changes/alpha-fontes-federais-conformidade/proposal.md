## Why

O Projeto α entregou a Etapa 1.1 (ChatRADA) e parou na fronteira do que realmente dá retorno ao ACI: **conferir um ETP/TR contra a norma vigente**. As Etapas 1.4 a 1.7 do roteiro (`AppAnalista`, `ComparadorEstrutural`, `AppVerificadorRestrito`, `VerificadorAmplo`) dependem de duas coisas que o alpha **não tem hoje**:

1. **O modelo oficial da AGU/CJU** — a Etapa 1.5 compara a estrutura do documento contra o modelo oficial, mas nenhum modelo da AGU está ingerido. Os modelos são `.docx` publicados em `gov.br/agu/.../licitacoesecontratos/14133/`, com versão no nome do arquivo (`...-dez-25.docx`, `...-abr-26.docx`) e revisão a cada ~4 meses.
2. **A legislação federal vigente** — o corpus atual só cobre documentos internos da FAB (`document_type` restrito por CHECK a `RADA|RBHA|ICA|MCA|NSCA`). Sem Lei 14.133/21, decretos regulamentadores e INs SEGES indexados, o verificador não tem contra o que verificar.

Além disso, o schema atual é **estruturalmente incompatível com conformidade**: `documents` não tem versão nem vigência. Um parecer de conformidade sem registro de *qual versão da norma e do modelo foi usada* não é auditável — e a Etapa 1.7 gera exatamente um parecer que o ACI assina.

Existem ainda três débitos que bloqueiam qualquer crescimento de schema:

- As migrations do alpha **não estão no repositório** (`plans/alpha/spec.md` lista `001..006` como "a implementar", mas nada existe em `packages/database` nem em `apps/alpha`). O schema em produção foi aplicado à mão.
- O alpha vive num **projeto Supabase separado** (`fjnysdiusivrffprcdus` em `apps/alpha/.env.example`) do projeto principal do IEFA (`jgigqdpdjgnnuwajtayh`, usado por `packages/database`, portal e sisub). Isso duplica administração, deixa a validação de JWT do portal contra o alpha ambígua e impede que as migrations do alpha entrem no mesmo histórico de `@iefa/database`.
- `plans/alpha/spec.md` declara embedding de 3072 dimensões (text-embedding-3-large), mas o código roda `baai/bge-m3` com **1024** (`apps/alpha/src/tools/rada-retriever.ts`). A realidade é 1024.

Esta mudança é **independente de acesso ao RADA**: todas as fontes são federais e públicas.

## What Changes

- **Consolidação do alpha no projeto Supabase principal, sob o schema `alpha`**: as migrations passam a viver em `packages/database/supabase/migrations/`, no mesmo histórico dos demais schemas. O corpus existente (documentos, chunks com embedding, logs) é **copiado** do projeto antigo, não reingerido — o RADA não é reingerível hoje.
- **Camada de fontes normativas** (`apps/alpha/src/sources/`): registry declarativo com um adapter por fonte e um pipeline comum `discover → fetch → hash → parse → chunk → embed → upsert`. Ingestão idempotente por `content_hash`.
- **Versionamento de documento — nunca sobrescreve**: nova versão cria linha nova; a anterior recebe `superseded_at`. `document_type` deixa de ser CHECK fechado em documentos da FAB e passa a aceitar `LEI`, `DECRETO`, `IN_SEGES`, `MODELO_AGU`.
- **Adapter AGU**: crawl das categorias de modelos da Lei 14.133/21, download dos `.docx`, extração de **três** artefatos por modelo — árvore de seções, notas explicativas (que citam o dispositivo legal de cada seção) e placeholders de preenchimento.
- **Adapter de legislação**: Lei 14.133/21, decretos regulamentadores e INs SEGES via LexML/`normas.leg.br`, com Planalto como fallback.
- **Watcher de atualização** + **análise de impacto**: rota interna agendada detecta versão nova, reindexa e marca como `needs_review` toda regra de conformidade que cita dispositivo alterado.
- **Etapa 1.4 — extrator**: ETP/TR (`.docx`/`.pdf`) → JSON canônico da contratação, com `source_span` obrigatório em cada campo.
- **Etapa 1.5 — comparador estrutural**: casamento determinístico (exato → fuzzy → embedding) + LCS para ordem, produzindo `missing | extra | out_of_order | renamed`. LLM só redige justificativa.
- **Etapas 1.6/1.7 — verificação de conformidade**: loop por bloco × regra aplicável com RAG na legislação vigente, **guard de citação** (finding com referência legal que não resolve contra chunk real é descartado) e relatório unificado por severidade.
- **Console de teste no portal** (`/alpha/*`, rotas autenticadas): fontes, inspetor de modelo, upload/extração, relatório de conformidade e bancada de calibração de regra.
- **Golden set** de ETP/TR anotados como fixture, com métricas de precisão/recall por regra.

## Capabilities

### New Capabilities

- `alpha-normative-sources`: registry de fontes, pipeline comum de ingestão, versionamento com vigência, idempotência por hash e rotina de atualização com análise de impacto.
- `alpha-agu-model-ingestion`: descoberta e ingestão dos modelos `.docx` da AGU para a Lei 14.133/21, com extração de estrutura, notas explicativas e placeholders.
- `alpha-legislation-ingestion`: ingestão da legislação federal de contratações (Lei 14.133/21, decretos, INs SEGES) com texto articulado e recuperação filtrável por norma/dispositivo/vigência.
- `alpha-document-extraction`: extração de ETP/TR submetido para JSON canônico da contratação, com rastreabilidade de origem por campo.
- `alpha-structural-comparison`: comparação da árvore de seções do documento submetido contra o modelo AGU vigente aplicável.
- `alpha-compliance-verification`: verificação de conformidade item a item contra a legislação vigente, guard de citação, checagens cruzadas entre seções e relatório unificado auditável.
- `alpha-testing-console`: interface autenticada no portal para operar e calibrar todas as capacidades acima.

### Modified Capabilities

<!-- Nenhuma capability pré-existente em openspec/specs/; o comportamento atual do alpha (ChatRADA) nunca foi especificado em OpenSpec. Todas as capabilities aqui são novas. -->

## Impact

- **Apps**: `alpha` (núcleo) e `portal` (console de teste). Nenhum efeito em sisub, api, docs ou sisub-mcp.
- **Banco (`packages/database`, projeto principal, schema `alpha`)**: extensões `vector` e `ltree`; tabelas migradas do projeto antigo (`document`, `document_chunk`, `query_log`) já com versionamento; tabelas novas `normative_source`, `structure_node`, `explanatory_note`, `placeholder`, `checklist_rule`, `submission`, `extraction`, `compliance_run`, `compliance_finding`; RPCs `alpha.match_chunks_cosine` e `alpha.match_chunks_fts`; schema `alpha` exposto no PostgREST (`pgrst.db_schemas` + reload) e incluído nos scripts `db:types` / `db:pull` / `db:diff`.
- **`apps/alpha/src/`**: cliente Supabase passa a usar `db: { schema: "alpha" }` e o checkpointer LangGraph passa a `PostgresSaver.fromConnString(url, { schema: "alpha" })`; novos diretórios `sources/`, `extraction/`, `compliance/`; `tools/rada-retriever.ts` generalizado para `tools/normative-retriever.ts` (mantendo `radaRetriever` como wrapper para não quebrar o grafo atual); novas rotas `/api/v1/submissions`, `/api/v1/compliance`, `/api/v1/sources`, `/internal/jobs/sources/refresh`.
- **`apps/portal/src/routes/`**: rotas autenticadas `/alpha/fontes`, `/alpha/modelos/$id`, `/alpha/analise/nova`, `/alpha/analise/$id`, `/alpha/bancada`, consumindo `getAlphaClient()`.
- **Dependências novas em `alpha`**: `fflate` (OOXML), `unpdf` (PDF), `fast-xml-parser` (LexML SRU).
- **Infra**: uma scheduled task semanal chamando `/internal/jobs/sources/refresh` (mesmo padrão dos sync workers já usados no `api`).
- **Testes**: fixtures de `.docx` da AGU e de norma; golden set de ETP/TR anotados; suíte de precisão/recall por regra.

## Não-objetivos

- **Etapa 1.2 (ChatSistemasSEFA) e 1.3 (ChatLicitaçõesSEFA)**: acórdãos do TCU e pareceres CJU ficam fora. É a fonte de acesso mais incerto e maior volume — entra depois que o núcleo de conformidade estiver validado contra fonte estável.
- **Etapa 1.8 (Plataforma ACI)**: o console de teste desta mudança é ferramenta interna de calibração, não a plataforma com persona ACI. Sem dashboard de analista, sem fluxo de aprovação.
- **Fase 2 (MontaDoc, ChatAnaliseProblema, Refinador)**: nada de **geração** de documento. Os placeholders extraídos do modelo AGU são persistidos como insumo futuro, mas nenhum documento é montado aqui.
- **Correção automática do documento**: o sistema aponta a inconformidade e sugere; não reescreve o ETP/TR do usuário. A palavra final é do gestor.
- **Camada de customização por OM**: normas locais subordinadas às sistêmicas ficam para depois; esta fase trata só de norma federal.
- **Reingestão do RADA**: o corpus da FAB é **copiado** entre projetos, nunca reingerido. O acesso ao RADA está indisponível e nada aqui depende dele.
- **Desligar o projeto Supabase antigo do alpha**: fica em modo somente leitura como rede de segurança até o corpus consolidado ser conferido em produção. A desativação é follow-up, não faz parte desta mudança.
- **Unificar a base de usuários entre projetos**: a consolidação move dados do alpha, não identidades. Qualquer ajuste de perfil/role de usuário existente fica fora do escopo.
