## Contexto

O α já tem submissão → extração → execução de conformidade, com autorização por submissão (`api/authorize.ts`, allow-list de perfil amplo). A plataforma é uma camada de leitura agregada e duas escritas novas (triagem e parecer) sobre esse fluxo. O portal já fala com o α por `alphaRequest` (fetch + Bearer por request) e tem o console em `/alpha/*` como referência de padrão (loader só no cliente, `useQuery` com estado próprio, Pale Brutalism).

## Decisões

### D1 — Etapa derivada, não gravada; agregação no banco

A etapa do processo (`enviado` → `extraido` → `verificado` → `parecer`) é calculada por `deriveStage` em `aci/queue.ts` a partir do que existe: extração mais recente, execução mais recente e parecer sobre ela. Gravar um `status` na submissão criaria um segundo lugar para a mesma verdade e desincronizaria na primeira reexecução. Consequências deliberadas: execução `failed`/`running` não conta como verificado; parecer sobre execução antiga é histórico (reexecutar volta para `verificado`).

**A leitura, porém, é do banco.** A primeira versão fazia cinco `select` com `in (...)` e juntava em memória: transferia todos os achados de todas as execuções e esbarrava no teto de 1000 linhas do PostgREST **sem erro** — a fila mostrava processo com BLOQUEANTE aberto como limpo. A RPC `alpha.aci_queue` devolve uma linha por submissão (`distinct on` para os mais recentes, `count(*) group by` para os achados), e `deriveStage` continua puro, alimentado por uma linha. O portal também não recalcula a etapa: `GET /aci/processes/:id` já devolve `stage`.

### D2 — Triagem no achado, parecer em linha nova, retrato por achado

Triagem é uma decisão por achado e revisável: mora no próprio `compliance_finding`, com quem e quando. Parecer é peça do processo: `compliance_review` é append-only. Mesmo princípio da versão de documento legal no `legal-kit`: nunca `UPDATE` no que já foi assinado.

O `snapshot` guarda **a triagem de cada achado** (`id`, severidade, triagem, motivo), e não só contagens. Só com contagens o parecer não se sustentava: qualquer `app_aci` pode re-triar um achado depois da emissão, e o relatório passaria a mostrar um BLOQUEANTE acatado sob um "Aprovado" — combinação que a própria regra proíbe. `resolveFindings` renderiza a triagem assinada e declara quantos achados mudaram desde então; a triagem atual continua editável, porque o processo segue vivo.

### D3 — Regra de emissão pura e conservadora

`decisionBlockers(findings, decision)` em `aci/review.ts`, sem I/O, testada por caso:

- reprovar é sempre possível;
- qualquer aprovação exige todo achado BLOQUEANTE/GRAVE triado (MEDIA/INFORMATIVA sem triagem não travam — travar por eles obrigaria dezenas de cliques em achado informativo);
- bloqueante acatado só cabe em reprovação;
- grave acatado desce a aprovação para "com ressalvas".

A rota devolve 409 com `message` legível (o portal exibe `message ?? code`) e a lista de bloqueios. A tela **não** recalcula: `GET /compliance/runs/:id/reviews` devolve `current.blockers` por decisão, vindo da mesma função, e o botão de emitir fica desabilitado com o motivo à vista.

Checar antes de gravar é duas requisições, e entre elas cabe uma triagem de outro analista. Por isso a mesma regra vive também no trigger `alpha.compliance_review_guard`, que roda `before insert` com `select ... for update` na execução: as emissões se serializam e o 23514 vira o mesmo 409. A versão em TypeScript existe para a mensagem boa; a do banco, para o invariante.

### D4 — Relatório final renderizado em Markdown no α

`renderReportMarkdown` é puro e testado. O Markdown é o artefato que vai para o processo sem depender da tela; a página `/aci/relatorio/$runId` renderiza a mesma estrutura em HTML com CSS de impressão. Achado sem triagem entra em seção própria e nunca é omitido; cobertura (regras aplicadas, não avaliadas, descartadas pelo guard) e referências usadas (modelo AGU e normas, com versão) vêm sempre.

### D5 — Perfil lido do JWT no portal, decidido no α

`lib/alpha/role.ts` lê `app_metadata.role` do usuário da sessão só para não oferecer botão que devolveria 403 e para o guard de layout (`/aci` mostra a explicação, não redireciona — o perfil é concedido fora do app). Toda autorização real continua nas rotas do α.

### D6 — Reuso com o console, não substituição

`SubmissionIntakeForm` e `ExtractionFieldsView` saem de `/alpha/analise/nova` para `components/alpha/SubmissionIntake.tsx`; o console continua existindo como ferramenta de calibração (link "Console técnico" na navegação da plataforma). O ChatRADA passa a importar os helpers de sessão de `lib/alpha/chat-session.ts` para que a plataforma consiga abrir uma conversa específica.

## Schema (Supabase, schema `alpha`)

Migration `20260911100000_alpha_compliance_review.sql`:

- `alter table alpha.compliance_finding add triage text check in ('acatado','descartado'), triage_note text, triaged_by uuid, triaged_at timestamptz`
- `create table alpha.compliance_review (id, run_id → compliance_run on delete cascade, reviewer_id, decision check in ('aprovado','aprovado_com_ressalvas','reprovado'), notes, snapshot jsonb, created_at)` + índice `(run_id, created_at desc)` + RLS ligada (só `service_role`, pelos default privileges do schema).

## Riscos

- **Deploy do α antes da migration**: `GET /compliance/runs/:id` seleciona as colunas novas. Ordem obrigatória: migration → deploy.
- **Fila sem paginação**: teto de 200 declarado (`QUEUE_LIMIT`). Volume real hoje é de unidades.
