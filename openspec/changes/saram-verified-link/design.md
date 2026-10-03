## Context

- `core.user_data` (`id`, `email`, `saram`, …) liga a conta ao espelho do cadastro de pessoal `core.user_military_data` (`"nrOrdem"` = SARAM, `"nmGuerra"`, `"nmPessoa"`, `"sgPosto"`, `"sgOrg"`, `"nrCpf"`; ~68 mil linhas, carga manual do mantenedor, sem FK de propósito). Os apps leem a view `core.military_identity` (sem CPF nem nome completo); a regra `military-roster-*` do opengrep barra o resto (`lgpd-military-roster-key`).
- Hoje: `syncUserSaram` (`packages/sisub-domain/src/operations/user.ts`) e `core.link_own_saram` (20261001100200, sucont) aplicam a mesma regra write-once/exclusiva sob `pg_advisory_xact_lock(hashtext('saram:<n>'))`, mas aceitam qualquer SARAM digitado.
- Medido em 2026-10-02/03 (só agregados): 1.432 contas; 1.360 com SARAM; 3 SARAM repetidos em duas contas (em cada par, exatamente uma bate com a chave do e-mail); 87 SARAM ausentes do espelho; 1.660 chaves do espelho com homônimos; 51 unidades, 17 com `code` igual a algum `sgOrg`, nenhum GAP.

## Goals / Non-Goals

**Goals:** só vínculo conferido dá acesso a dado militar; o dono verdadeiro sempre tem um caminho (e-mail, CPF, pedido, contestação); a regra é uma só para sisub e sucont; ninguém perde acesso no deploy; conta de seção deixa de ser pessoa.

**Non-Goals:** ver `proposal.md`.

## Decisions

### D1. A regra mora em SQL

Funções `core.*` (`security invoker`, `set search_path = ''`, executáveis só pelo `service_role`), chamadas pelo domínio do sisub via Drizzle (`db.execute(sql\`select core.f(...)\`)`) e pelo sucont/rumaer via RPC. Motivos:

- **LGPD:** a chave usa o nome completo e a conferência usa o CPF. Em SQL, nenhum dos dois sai do banco — a regra `military-roster-personal-data` continua sem exceção nova;
- **uma regra, dois clientes:** o sucont não tem conexão Postgres; duplicar em TS divergiria (o caso de `link_own_saram`);
- **uma chamada = uma transação:** checar tentativas, travar o SARAM e gravar ficam juntos.

O domínio TS só traduz erros, aplica o PBAC e tipa o retorno.

### D2. Chave do e-mail

- Militar: `regexp_replace(lower(unaccent("nmGuerra")), '[^a-z]', '', 'g')` || iniciais das palavras de `"nmPessoa"` (sem acento, minúsculo, só letras), sem `de/da/do/das/dos/e` — `core.military_name_key`.
- E-mail: só `@fab.mil.br` exato; parte local minúscula, sem o prefixo `tp.` e sem os dígitos finais; só letras, senão não há chave — `core.email_name_key`.
- Índice de expressão `core.user_military_data (core.military_name_key("nmGuerra", "nmPessoa"))`. O acento sai por `translate` (imutável, sem extensão), não por `unaccent`: este é `stable` e mora em `public` no banco compartilhado mas em `extensions` num banco recriado das migrations (20260414120000). Conferido: as 68.317 chaves saem iguais às do `unaccent`. Índice não muda as colunas: o patch de carga segue no formato de 20260927170000.

### D3. Homônimos

Candidatos = linhas do espelho com a chave do e-mail (um por SARAM, a carga mais recente). Mostra-se só posto, nome de guerra e OM; nunca SARAM, CPF ou nome completo. Desempate pelos 4 últimos dígitos do CPF quando:
- há mais de um candidato; **ou**
- o e-mail tem dígito final: o Zimbra só acrescenta número quando já existe a mesma chave, e o outro titular pode não estar no espelho (sem isso, o segundo "joaosilvajs2" confirmaria o primeiro).

A referência do candidato é o `id` físico do espelho (opaco). Se a carga trocou a linha entre a leitura e a confirmação, `CANDIDATE_NOT_FOUND` e a tela relê o estado.

### D4. Tentativas (CPF e sufixo do CPF)

`core.saram_verification_attempt` (conta, SARAM tentado, método, sucesso, hora; nunca o CPF digitado). Bloqueio com 5 falhas na última hora **por conta**, ou 20 falhas de **outras contas** no mesmo SARAM; libera quando a falha que completou o teto sai da janela. Vale com várias instâncias porque está no banco. A falha não levanta exceção (desfaria o registro da tentativa): as funções devolvem `outcome: "mismatch" | "locked"`. Mensagem única ("SARAM e CPF não conferem") para SARAM inexistente e CPF errado. O teto por SARAM é alto de propósito: ele só existe contra força bruta distribuída (o CPF completo não é forçável por uma conta com 5/hora, e o sufixo de 4 dígitos só vale para candidatos da chave do próprio e-mail); um teto baixo deixaria qualquer um trancar a verificação do dono verdadeiro. O estado mostra o bloqueio da conta; o do SARAM aparece no resultado da tentativa (`outcome: "locked"`).

### D5. Disputa

- Verificação (e-mail ou CPF) de um SARAM cujo titular é `legacy` ou não verificado → **transfere na hora** (verificado prevalece), com linha em `sensitive_operation_log` (`claimSaramFromUnverifiedHolder`, ator = quem verificou, alvo = quem perdeu).
- Titular verificado (`email`/`cpf`/`admin`) → contestação automática para o admin (`claim_verified_by` registra a prova).
- Pedido manual de SARAM com titular → contestação (`kind = 'dispute'`). O pedido revela que o SARAM tem conta (como o `SARAM_TAKEN` de antes); por isso há teto de 5 pedidos por conta em 24 h e um pendente por vez.
- Índice único parcial `user_data_saram_verified_uniq (saram) where saram_verified_by in ('email','cpf','admin')`: um SARAM verificado pertence a uma conta só. Os legacy repetidos (3 hoje) ficam para o admin.

### D6. Legacy

Backfill: vínculo que bate pela chave (com ou sem dígito) → `email`; o resto → `legacy` (inclusive SARAM ausente do espelho). Em cada SARAM repetido, só a primeira conta que bate vira `email`. Legacy **continua vendo** os dados militares (ninguém perde acesso no deploy), salvo quando o mesmo SARAM está verificado em outra conta (o caso das 3 duplicatas: ali o legacy é quem tinha digitado o número de outra pessoa). Sai da fila quando o admin confirma (vira `admin`) ou desvincula. Saídas da própria conta: conferir o próprio SARAM por CPF (sobe para `cpf`); **provar outra identidade** (e-mail ou CPF) troca o legacy, porque verificado prevalece; e o legacy que não localiza ninguém no cadastro (número digitado errado, que antes era corrigível) pode também pedir outro número. Legacy que localiza cadastro não troca sem prova. Pedido pendente aparece no estado antes do legacy (`contested`/`pending_request`, com desistência).

### D7. Gravação fora das funções

Trigger `user_data_guard_saram_link` em `core.user_data`:
- SARAM gravado fora das funções (o app em produção até o deploy, fixtures de teste) é aceito, mas **sem verificação** (`saram_verified_by` zerado): não dá acesso a dado militar e não bloqueia quem verificar;
- `saram_verified_by`/`saram_verified_at` e `account_kind` só mudam com o contexto `iefa.saram_link` aberto pela função (local à transação); fora dele, `42501`.

Recusar a gravação em vez de zerar quebraria a suíte da `main` e o sisub em produção entre o apply e o merge (banco compartilhado).

### D8. Tipo de conta

`account_kind` `pessoal`/`institucional` em `core.user_data`, CHECK "institucional sem SARAM". Ao virar institucional (pela própria conta ou pelo admin): o vínculo é limpo, o pedido pendente é encerrado e os arranchamentos de hoje em diante (data civil de Brasília) passam a `will_eat = false`. Triggers recusam (`ACCOUNT_INSTITUTIONAL_NO_MEALS`) arranchar (`will_eat = true`) e registrar presença para conta institucional; o domínio recusa antes, com mensagem. Voltar a pessoal não restaura o vínculo: a conta verifica de novo. Perfil, senha, MFA, permissões recebidas e operação de cozinha não mudam.

Caminhos de escrita conferidos: `upsertArranchamento` (comensal), `insertPresence` (fiscal e self check-in) — os únicos que escrevem nas duas tabelas (o `api` só lê; MCP e treino não escrevem nelas).

### D9. Aprovador

`admin:2`, global. Medido: `sgOrg` casa com `core.units.code` em 17 de 51 unidades, nenhuma delas GAP (quem opera cozinha) — não há mapeamento confiável para `unit:2`.

### D10. Mudanças do admin auditadas

`core.decide_saram_request`, `core.admin_link_saram`, `core.admin_unlink_saram`, `core.admin_set_account_kind` abrem `access_control.audit_context(p_operation)` e gravam `access_control.record_access_change` na mesma transação, com o ator da sessão (padrão de 20260921130000). Server fns `fresh` + `admin:2` no registro de garantia, via `withAtomicAudit`. Cada uma confere a versão que a tela viu (EDIT-SAFETY): pedido ainda `pending`; `expected_saram`; `expected_kind`.

### D11. Formulários antigos

`syncUserSaram` (sisub) e `saveMySaramFn` (sucont) passam por `core.claim_saram`: o SARAM digitado vincula por e-mail só se for o candidato único (sem sufixo) da chave do e-mail; senão vira pedido (`link` ou `dispute`). Nenhum caminho grava SARAM sem verificação. O onboarding do sisub só insiste quando há ação possível (`suggestion`, `homonyms`, `no_match`).

### D12. Visibilidade

`core.visible_saram(p_user)`: o SARAM se a conta é pessoal e o vínculo é `email`/`cpf`/`admin`, ou `legacy` sem verificado concorrente. Usada por `fetchMilitaryDataFn` (sisub), `getMyMilitaryProfileFn` (rumaer), `fetchMyIdentityFn` (sucont) e pelos rótulos que terceiros veem no sisub (designações, pesquisa de preços, painel, pedidos de lanche). As views `core.v_user_identity` e `analytics.v_user_identity` aplicam a mesma condição por extenso (a do analytics não é invoker, e uma função ali checaria o EXECUTE de quem consulta): a conta que gravou o SARAM de outra pessoa não aparece com o nome dela. Fica de fora o console de acessos do sucont (`permissions.fn.ts`/`people.fn.ts`), que lê pelo client tipado e muda depois do `db:types` (FASE 2).

## Contrato para a FASE 2

`fetchMySaramStatusFn()` → `SaramStatus`:

| `status` | quando | `actions` |
|---|---|---|
| `institutional` | conta institucional | `set_personal` |
| `verified` | vínculo `email`/`cpf`/`admin` | — |
| `legacy` | vínculo legacy (`visible` diz se mostra dados) | `verify_cpf` |
| `pending_request` | pedido de vínculo pendente | `withdraw_request` |
| `contested` | contestação pendente | `withdraw_request` |
| `suggestion` | um candidato, e-mail sem sufixo | `confirm_candidate`, `verify_cpf`, `request_link`, `set_institutional` |
| `homonyms` | vários candidatos ou e-mail com sufixo | `confirm_candidate` (com `cpfSuffix`), `verify_cpf`, `request_link`, `set_institutional` |
| `locked_out` | bloqueio de tentativas sem sugestão única | `request_link`, `set_institutional` |
| `no_match` | nenhum candidato ou e-mail inelegível | `verify_cpf`, `request_link`, `set_institutional` |

Campos: `accountKind`, `saram`, `verifiedBy`, `verifiedAt`, `visible`, `identity` (`posto`, `nomeGuerra`, `sgOrg`), `request`, `candidates` (`ref`, `posto`, `nomeGuerra`, `sgOrg`, `heldByOther`, `holderVerified`), `requiresCpfSuffix`, `emailEligibility` (`eligible`/`domain`/`unconfirmed`/`no_key`), `lockedUntil`, `attemptsLeft`, `hasUnverifiedSaram`.

Mutações do comensal devolvem `{ outcome, status }` com o estado novo: `confirmSaramCandidateFn`, `verifySaramByCpfFn`, `requestSaramLinkFn`, `withdrawSaramRequestFn`, `setOwnAccountKindFn`. Admin: `fetchSaramReviewQueueFn`, `decideSaramRequestFn`, `unlinkUserSaramFn`, `linkUserSaramFn`, `setUserAccountKindFn`.

## Risks / Trade-offs

- **Chave errada para quem trocou de nome** → caminho CPF ou pedido; o vínculo verificado não muda depois.
- **Bloqueio por SARAM como DoS** → 1 hora, e-mail e pedido continuam abertos.
- **Backfill marca `email` para quem digitou o SARAM de um homônimo de mesma chave** → mesmo risco que a confirmação por e-mail sem sufixo; residual e auditável pela coluna.
- **Janela entre apply e deploy** → o app antigo grava SARAM não verificado (D7); o legacy segue visível; nada quebra.

## Migration Plan

1. PR (este) com a migration; o orquestrador aplica (`db:push --dry-run` primeiro) e regera tipos.
2. Depois do apply: integração (`saram-link.operations.test.ts`) e o resto da suíte de `user`/`arranchamento`/`presence`.
3. Merge; deploy de sisub, sucont, rumaer.
4. PR seguinte: drop de `core.link_own_saram`; FASE 2 (telas).

Rollback: as funções novas não são chamadas por nada antigo; reverter o código basta. Para desligar as recusas, `create or replace` dos triggers com `return new`.

## Open Questions

- A Política de Privacidade precisa citar a tabela de tentativas (registro de segurança)? Decisão do mantenedor.
