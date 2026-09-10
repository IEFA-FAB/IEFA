# Tasks

Um PR contra `main`, revisão com `/code-review` antes do merge.

## A — Banco

- [x] A.1 [database] Migration `20260910233313_alpha_compliance_review.sql`: triagem em `compliance_finding`, tabela `compliance_review` com RLS, trigger `compliance_review_guard` e RPC `aci_queue`
- [x] A.2 [database] **APLICADA em produção em 2026-09-10** por MCP, antes do merge. O remoto gravou `20260910233313` e o arquivo local foi renomeado para o mesmo carimbo (senão o próximo `db push` tentaria reaplicar). `bun run db:types` rodado: `compliance_review`, `aci_queue` e as colunas de triagem estão em `generated.ts`

## B — α: módulos puros

- [x] B.1 [alpha] `src/aci/queue.ts`: `deriveStage`, `buildQueue`, `summarizeQueue` — 7 testes
- [x] B.2 [alpha] `src/aci/review.ts`: `decisionBlockers`, `reviewSnapshot` — 8 testes
- [x] B.3 [alpha] `src/aci/report.ts`: `renderReportMarkdown`, `sortFindings` — 9 testes

## C — α: rotas

- [x] C.1 [alpha] `GET /api/v1/aci/queue` (perfil amplo) com totais
- [x] C.2 [alpha] `GET /api/v1/submissions/:id` — processo inteiro (extrações resumidas, execuções, pareceres)
- [x] C.3 [alpha] `PATCH /api/v1/compliance/findings/:id` — triagem (`app_aci`), motivo obrigatório no descarte
- [x] C.4 [alpha] `GET|POST /api/v1/compliance/runs/:id/reviews` — parecer append-only, 409 com bloqueios legíveis
- [x] C.5 [alpha] `GET /api/v1/compliance/runs/:id/report` — JSON e `?format=md` com `Content-Disposition`
- [x] C.6 [alpha] `GET /api/v1/compliance/runs/:id` passa a devolver `triage`, `triage_note`, `triaged_at`

## D — portal: plataforma

- [x] D.1 [portal] `lib/alpha/role.ts` (+ testes), `lib/alpha/aci.ts`, `lib/alpha/chat-session.ts`; `Finding` ganha a triagem; `extractionsQueryOptions`
- [x] D.2 [portal] `components/alpha/SubmissionIntake.tsx` — formulário e visão de campos extraídos de `/alpha/analise/nova`, que passa a usá-los
- [x] D.3 [portal] `/aci` layout com guard de sessão e tela de acesso restrito por perfil; `components/aci/AciNav.tsx`, `StageStepper.tsx`
- [x] D.4 [portal] `/aci` painel: tiles, filtro por etapa, fila ordenada por crítico aberto e atividade
- [x] D.5 [portal] `/aci/nova` — envio e extração levando ao processo
- [x] D.6 [portal] `/aci/processos/$submissionId` — trilha, seletor de execução, abas Achados (triagem), Extração e Parecer
- [x] D.7 [portal] `/aci/relatorio/$runId` — relatório imprimível + download `.md`
- [x] D.8 [portal] `/aci/chats` — hub dos assistentes e conversas recentes abrindo no ChatRADA
- [x] D.9 [portal] Aderência ao `STYLE_CONTRACT.md` do portal: zero radius, sem faixa lateral de acento, etiqueta + fundo por severidade

## E — roadmap e docs

- [x] E.1 [portal] `roadmap.tsx`: 1.8 em `in-progress`
- [x] E.2 [docs] `etapas.mdx` e `fontes-e-conformidade.mdx` com a seção da plataforma

## R — achados do `/code-review` (aplicados no mesmo PR)

- [x] R.1 [alpha] Toda leitura confere `error` — fila, relatório, parecer e o `GET /compliance/runs/:id` do console. "Zero achados" deixou de ser o fallback de "a consulta falhou"
- [x] R.2 [alpha] Gate do parecer também no banco (`compliance_review_guard`, `before insert` + `for update`): fecha a corrida entre checar e gravar
- [x] R.3 [alpha] Fila virou a RPC `alpha.aci_queue` — a versão em app esbarrava no teto de 1000 linhas do PostgREST sem erro
- [x] R.4 [alpha] `renderReportMarkdown` achata mensagem/sugestão/motivo/arquivo e escapa a fundamentação: texto do modelo não forja seção nem parecer
- [x] R.5 [alpha] `snapshot` do parecer passa a guardar a triagem de cada achado; o relatório mostra a assinada e declara re-triagem posterior
- [x] R.6 [alpha] Nomes de campo em inglês (`QueueTotals`, `ReviewSnapshot`), `DECISIONS`/`STAGE_ORDER` como tupla fonte do tipo, `RunStatus` tipado
- [x] R.7 [alpha] `GET /submissions/:id` virou `GET /api/v1/aci/processes/:id` — não colide com o recurso da submissão e devolve `stage`; sumiu a contagem de campos que ninguém lia
- [x] R.8 [alpha] `api/columns.ts`: uma projeção só para `compliance_finding`/`compliance_run`/`compliance_review`
- [x] R.9 [portal] Fim da seleção de execução por efeito: `selectedRunId` é a escolha do analista e `null` significa "a mais recente" — "verificar novamente" deixou de voltar para a execução antiga
- [x] R.10 [portal] Bloqueios e retrato do parecer vêm do α (`current.blockers`), sem regra recalculada na tela
- [x] R.11 [portal] `FindingCard`, `SectionNav`, `StatGrid` e `formatDateTime` compartilhados (fuso `America/Sao_Paulo`, igual ao relatório do α)
- [x] R.12 [portal] Triagem escreve no cache em vez de refazer as três buscas; `staleTime` nas leituras caras
- [x] R.13 [portal] Envio avisa `onSubmitted` antes da extração: extração que falha não deixa mais o processo invisível nem o botão de verificar apontando para o documento anterior

## F — fechamento

- [x] F.1 [root] `bun run check` (Biome + typecheck) verde no α e no portal
- [x] F.2 [root] testes verdes: α 320 (29 novos), portal 226 (8 novos)
- [x] F.3 [database] Trigger e RPC validados contra o banco real (2026-09-10, sem gravar nada — bloco `DO` com exceção final):
  - `aci_queue(5)` devolve o processo com a execução mais recente e `finding_counts` por severidade × triagem (71 GRAVE + 66 INFORMATIVA, sem parecer)
  - `aprovado` com 71 GRAVE sem triagem → `check_violation` com "71 achado(s) BLOQUEANTE/GRAVE ainda sem triagem"
  - `reprovado` → passa
  - parecer sobre execução inexistente → barrado
- [ ] F.4 [alpha] Fluxo pela interface, depois do deploy: triagem → parecer → relatório em `/aci`
