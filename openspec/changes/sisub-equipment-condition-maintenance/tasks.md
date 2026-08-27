# Tasks: sisub-equipment-condition-maintenance

## Fase 1 — Schema

- [x] 1.1 [packages/database] Migration `kitchen`: colunas de ficha em `equipment_model` (R1) e `installed_on` / `warranty_until` / `supplier` em `equipment_unit`; todas nulas, com `comment on column` explicando por que a ficha é do modelo.
- [x] 1.2 [packages/database] Migration `kitchen`: tabela `equipment_maintenance_plan` (XOR papel/modelo, `kitchen_id` null = global, `interval_days`, `tolerance_days`, `kind`), com índices parciais em `deleted_at is null` e RLS ligada sem policy.
- [x] 1.3 [packages/database] Migration `kitchen`: tabelas `equipment_maintenance_log` e `equipment_issue`, FKs, CHECKs de enum, índice parcial `(unit_id, status)` para panes abertas, RLS ligada sem policy.
- [x] 1.4 [packages/database] Seed de planos globais mínimos por papel. **Nenhuma rotina `legal` foi semeada**: a periodicidade de obrigação regulada varia por norma e por capacidade, e um número errado ali vira "em dia" falso num relatório de conformidade. Quem cadastra a legal é a OM. Também criado o papel `exhaust_hood`, que faltava na taxonomia de 20260825120100.
- [x] 1.5 [packages/database] `db:types` + pull do Drizzle; versões `20260827120000` e `20260827120100` registradas em `supabase_migrations.schema_migrations` com o mesmo nome dos arquivos.

> **Achado fora do escopo (não corrigido aqui):** `db:drizzle:pull` regride o repo. O
> `schemaFilter` de `drizzle.config.ts` não inclui `nutrition_reference`, então o pull
> APAGA as 10 tabelas que `operations/ingredient-versions.ts` importa — e ao mesmo tempo
> acrescenta ~12 tabelas de `finance`/`procurement`/`core` que o arquivo commitado não
> tinha. Por isso as tabelas novas foram inseridas à mão em `schema.ts`/`relations.ts`,
> a partir da saída do pull, mantendo o diff aditivo. Corrigir o `schemaFilter` é um
> change próprio: o pull completo mexe em ~2.900 linhas.

## Fase 2 — Domínio puro

- [x] 2.1 [packages/sisub-domain] `utils/equipment-condition.ts`: condição derivada com a precedência de R2. Sem I/O. Expõe também `unitCountsForFitness`/`isUnitUnavailable` — o filtro de R3 é DERIVADO da condição, não um segundo predicado sobre `status` + panes, senão a tela e o planejamento divergem na próxima severidade que alguém acrescentar.
- [x] 2.2 [packages/sisub-domain] `utils/equipment-condition.test.ts`: quatro condições, precedência, histórico misto, e a prova de que toda condição declarada é alcançável.
- [x] 2.3 [packages/sisub-domain] `utils/maintenance-due.ts`: as três âncoras de R4 e a tolerância. `today` é PARÂMETRO — cálculo de vencimento que lê o relógio do processo não é testável e erra na virada do fuso. Aritmética em UTC sobre ISO `YYYY-MM-DD`; data malformada lança em vez de virar `NaN`.
- [x] 2.4 [packages/sisub-domain] `utils/maintenance-due.test.ts`: inclui "parque recém-migrado não nasce vencido", os limites da tolerância (igual = em dia, +1 = vencida) e virada de ano/bissexto/horário de verão.
- [x] 2.5 [packages/sisub-domain] Enums de pane e manutenção movidos para `schemas/equipment.ts` (fonte única) — o util importa os TIPOS de lá. Duas listas de severidade em arquivos diferentes divergiriam na primeira severidade nova. Antecipa parte da tarefa 3.1.
- [x] 2.6 [packages/sisub-domain] Não-vacuidade das duas suítes provada por mutação: 7 mutações (remover o early-return de baixa, alargar a severidade que derruba, fazer `dismissed` voltar a pesar, devolver a unidade parada ao cálculo, trocar `>` por `>=` na tolerância, ignorar a execução registrada, remover o estado `unknown`) — todas as 7 mortas.

## Fase 3 — Operations

- [x] 3.1 [packages/sisub-domain] Schemas Zod de pane e manutenção em `schemas/equipment.ts`. Os enums já tinham vindo na 2.5; aqui entram os objetos de entrada, com `.nullish()` em todo opcional e os dois `refine` que espelham os CHECK do banco (XOR papel/modelo, `toleranceDays < intervalDays`) — rejeitar no schema dá mensagem, deixar chegar no banco dá `23514`.
- [x] 3.2 [packages/sisub-domain] Operations de pane em `operations/equipment-maintenance.ts`: `listEquipmentIssues`, `reportEquipmentIssue`, `updateEquipmentIssue`. Encerrar grava autor/data e reabrir limpa os dois; descartar exige justificativa. A cozinha dona vem sempre da unidade lida do banco.
- [x] 3.3 [packages/sisub-domain] Operations de manutenção: `listMaintenancePlans`, `createMaintenancePlan`, `updateMaintenancePlan`, `deleteMaintenancePlan`, `logMaintenance`, `listMaintenanceLogs`.
- [x] 3.4 [packages/sisub-domain] `listApplicablePlans(unitId)` pelo papel **efetivo** (`resolveUnitRoleIds`), não pelo do catálogo — unidade com a fritadeira desabilitada não herda a rotina de troca de óleo.
- [x] 3.5 [packages/sisub-domain] `loadKitchenUnits` filtra pela pane inoperante aberta (R3) usando `isUnitUnavailable` — o MESMO predicado da tela — e o `EquipmentUnitWire` passa a expor `condition` e `open_issues`. O filtro vale também no caminho sem guard usado pelo cálculo de atendimento (cozinha produtora ≠ pedida).
- [x] 3.6 [packages/sisub-domain] `createEquipmentUnit` aceita `kitchen:2` OU `kitchen-production:1` (guard novo `requireKitchenFloorWrite`). Cadastrar com `status` diferente de `active` continua exigindo `kitchen:2`: declarar equipamento já em manutenção é decisão administrativa.
- [x] 3.7 [packages/sisub-domain] `equipment.authz.test.ts`: 4 casos positivos e 11 negativos de R5, mais o dono do plano. Não-vacuidade por mutação: 5 mutações, e **uma sobreviveu na primeira rodada** — o stub não dava `kitchenId` à unidade da pane, então os dois testes de "produção não encerra pane" recusavam por escopo e passariam com qualquer guard. Corrigido o stub, o mutante morre.
- [x] 3.8 [packages/sisub-domain] `RESET_STEPS` — **já feito** nos commits `820e49f4` e `11120405`, que também trataram o plano ancorado em modelo local sem `kitchen_id` (violava a FK no delete do modelo e abortava o reset inteiro).

## Fase 4 — Agregações de relatório

- [ ] 4.1 [packages/sisub-domain] `getKitchenEquipmentCondition(kitchenId)`: contagem por condição, panes abertas ordenadas por severidade e tempo, histórico recente.
- [ ] 4.2 [packages/sisub-domain] `getKitchenMaintenanceMatrix(kitchenId)`: unidade × plano aplicável com os três estados de R4.
- [ ] 4.3 [packages/sisub-domain] `getFleetEquipmentReport()`: cobertura por papel, panes inoperantes por tempo, planos mais vencidos, distribuição do parque. Guard `analytics` nível 2. Filtros opcionais de papel/modelo/cozinha, todos `.nullish()`.

## Fase 5 — Server fns e hooks

- [ ] 5.1 [sisub] `server/equipment.fn.ts`: fns de pane e manutenção, `createServerFn(...).validator(z.object(...))`, client Supabase per-request no handler.
- [ ] 5.2 [sisub] `server/equipment.fn.ts`: fns dos três relatórios da Fase 4.
- [ ] 5.3 [sisub] `hooks/data/useEquipment.ts` + `lib/query-keys.ts`: queries e mutations novas, com invalidação da lista de parque ao relatar/resolver pane (a condição muda).

## Fase 6 — Telas

- [ ] 6.1 [sisub] `/global/equipment`: aba **Rotinas** (lista por papel, form com atalhos de intervalo) e campos de ficha no form de modelo.
- [ ] 6.2 [sisub] `/kitchen-production/$kitchenId/equipment`: rota nova, cartão por unidade com badge de condição e de rotina vencida.
- [ ] 6.3 [sisub] Diálogo de relato de pane: severidade em duas opções com texto claro ("dá para usar com limitação" / "não dá para usar"), categoria e descrição. Otimizado para uso de pé, em tela pequena.
- [ ] 6.4 [sisub] Diálogo de registro de manutenção (plano opcional, prestador, data, custo, nota), acessível da produção e da gestão.
- [ ] 6.5 [sisub] `/kitchen/$kitchenId/equipment`: aba **Condição** com resumo, panes abertas e ações de resolver/descartar (nível 2).
- [ ] 6.6 [sisub] `/kitchen/$kitchenId/equipment`: aba **Manutenção** com a matriz unidade × plano e registro direto da célula.
- [ ] 6.7 [sisub] `/analytics/equipment`: rota nova, agregada por papel, somente leitura, com filtros.
- [ ] 6.8 [sisub] `NavItems.tsx`: "Equipamentos" em Produção Cozinha e "Equipamentos" em Análises Globais (`minLevel: 2`); `lib/breadcrumbs.ts`.
- [ ] 6.9 [sisub] Revisar as quatro telas contra o `STYLE_CONTRACT.md` do sisub e a proibição global de faixa de acento lateral.

## Fase 7 — Testes de integração e fechamento

- [ ] 7.1 [sisub] `test/operations/equipment.operations.test.ts`: pane inoperante remove a unidade do atendimento; `dismissed` devolve; `degraded` não remove; cozinha produtora ≠ pedida.
- [ ] 7.2 [sisub] Conferir que `setupIntegration` das tabelas novas **falha** sob `SISUB_INTEGRATION_REQUIRED` em vez de dar early-return silencioso; cleanup de fixture em LIFO com `trackFn` ordenado.
- [ ] 7.3 [sisub] Rodar o gate de integração contra o banco real e conferir a contagem de testes executados (run rápido demais = suíte vazia).
- [ ] 7.4 [root] `bun run check` + `bun run test`.
- [ ] 7.5 Aplicar a migration em produção **antes ou junto** do merge, e conferir o run de CI/CD depois. Nota no PR sobre a mudança de comportamento do alerta do `DayDrawer`.
- [ ] 7.6 `/code-review` antes de pedir merge, com os achados relatados no PR.
