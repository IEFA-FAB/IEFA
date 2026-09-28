## 1. Descoberta

- [x] 1.1 [database] Descobrir quem carrega `core.user_military_data` e como (insert/replace, ordem, frequência, se reescreve CPF); a carga está fora do repo
  - Resposta do mantenedor (2026-09-27): a tabela é carregada eventualmente a partir de dados de outro sistema; de tempos em tempos o mantenedor sobe um patch da tabela, manualmente. O desenho mantém o formato do patch: as sete colunas de hoje com os mesmos nomes, tipos e ordem; a coluna nova (`id` identity) é a última e tem default; a unicidade do CPF é a da PK antiga, agora por `UNIQUE` (árbitro do upsert). O `"nrOrdem"` do espelho não é renomeado pelo lote 6 da linguagem ubíqua (D2): o SARAM é exposto como `saram` só pela view `core.military_identity`, e o patch continua entrando com o nome antigo. Como subir o patch: `LGPD.md`, seção "Espelho do cadastro de pessoal", e o comentário da tabela no banco
- [x] 1.2 [database] Inventariar os leitores do espelho (não só `nrCpf`): `git grep` por `user_military_data`, `userMilitaryData`, `nmPessoa`; `pg_views`/`pg_proc`/`pg_depend` no banco
  - Banco (2026-09-27, catálogo pelo MCP, só leitura): 68.317 linhas (`pg_stat`: 68.780 inserts, 463 deletes, 0 updates); PK `user_military_data_pkey ("nrCpf")`, índices em `"nrOrdem"` e `"dataAtualizacao"`; RLS ligada sem policy; grants só `postgres` e `service_role`; nenhuma FK de fora, nenhuma função, policy ou job do pg_cron cita a tabela; três views dependentes, todas pelo `"nrOrdem"` (nenhuma pelo CPF, que só a PK usava): `core.person_identity`, `core.v_user_identity` e `analytics.v_user_identity` (esta sem `security_invoker`, lida pelo `analytics_reader`). Nenhum SARAM repetido no espelho; 87 contas com SARAM ausente dele
  - Código: `sisub-domain` (`user.ts` lia CPF e nome completo para o perfil; `dashboard.ts` lia o nome completo; `snack-requests.ts`; SQL cru em `designations.ts` e `price-research-report.ts`, que a proposta não listava); `sisub` (`user.fn.ts` mascarava o CPF; `profile.tsx` mostrava o nome completo; `lib/dashboard.ts` e `qr-code.tsx` caíam no nome completo sem nome de guerra; fixture de teste); `sucont` (`military.server.ts`, `people.fn.ts`); `rumaer` (`military.fn.ts`, lia o nome completo sem usá-lo); `api` (`/api/user-military-data`, restrita, projeta o nome completo, não o CPF)

## 2. Migration (espera o mantenedor)

- [x] 2.1 [database] PK física `id` identity; `UNIQUE` no CPF; views dependentes recriadas (`20260927170000_military_roster_key.sql`). `core.person_identity` e `core.v_user_identity` passam a ler `core.military_identity`, com as mesmas colunas de saída; `analytics.v_user_identity` fica sobre a tabela, de propósito: ela não é `security_invoker` (o `analytics_reader` a lê sem grant em `core`), e a view invoker aninhada checaria o privilégio do `analytics_reader` (permission denied, aviso de 20260921160000). Ela lê só SARAM, posto e nome de guerra e publica `id` + `display_name`; a migration confere que ela não passou para a view
- [x] 2.2 [database] View `core.military_identity` (`saram`, `posto`, `nome_guerra`, `sg_org`, `data_atualizacao`), só servidor (`security_invoker`, SELECT só do `service_role`); `core.military_masked_cpf(p_saram)` para o perfil do titular (executável só pelo `service_role`)
- [ ] 2.3 [database] No mesmo PR, depois de aplicar: `db:types` e `db:drizzle:pull` (o pull deixa de declarar `nrCpf` como PK); apagar as pontes `src/pending-military-roster-key.ts` e `drizzle/pending-military-roster-key.ts` (o tripwire delas quebra o typecheck depois do pull) e voltar `index.ts`/`core.ts`/`sisub.ts`/`drizzle/sisub.ts` a `generated.ts`

## 3. Apps e gate

- [x] 3.1 [sisub] [sisub-domain] [sucont] [rumaer] Leituras pela view; perfil do titular com o CPF mascarado por função do servidor (a máscara é montada no banco, `fetchMaskedCpf`; `cpf-mask.ts` saiu). O nome completo saiu do perfil, do painel de presença e do QR code (o rótulo cai no nome de guerra e depois no e-mail) e do perfil do rumaer, que não o usava
- [x] 3.2 [root] Regra `.opengrep/rules/` contra leitura de `nrCpf`/`nmPessoa` fora da allowlist com motivo (`military-roster.yaml`: `military-roster-personal-data` e `military-roster-raw-table`, casos em `__fixtures__/military-roster.ts`)

## 4. Fechamento

- [ ] 4.1 [root] `bun run check`, `bun run lint --concurrency=2`, `bun run test --concurrency=2`
