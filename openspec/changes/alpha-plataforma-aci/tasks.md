# Tasks

Um PR contra `main`, revisão com `/code-review` antes do merge.

## A — Banco

- [x] A.1 [database] Migration `20260911100000_alpha_compliance_review.sql`: triagem em `compliance_finding` + tabela `compliance_review` com RLS
- [ ] A.2 [database] Aplicar a migration em produção ANTES do deploy do α (`bun run db:push` ou MCP) e rodar `bun run db:types`

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

## F — fechamento

- [x] F.1 [root] `bun run check` (Biome + typecheck) verde no α e no portal
- [x] F.2 [root] testes verdes: α 315 (24 novos), portal 226 (8 novos)
- [ ] F.3 [alpha] Validar o fluxo ponta a ponta contra o banco real depois da migration: triagem → parecer → relatório
