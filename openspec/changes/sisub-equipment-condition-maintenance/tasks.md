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

- [ ] 2.1 [packages/sisub-domain] `utils/equipment-condition.ts`: condição derivada com a precedência de R2. Sem I/O.
- [ ] 2.2 [packages/sisub-domain] `utils/equipment-condition.test.ts`: quatro condições, precedência `retired` > `down` > `degraded` > `operational`, unidade sem pane.
- [ ] 2.3 [packages/sisub-domain] `utils/maintenance-due.ts`: as três âncoras de R4 (`log` → `installed_on ?? acquired_on` → `sem registro`) e a tolerância.
- [ ] 2.4 [packages/sisub-domain] `utils/maintenance-due.test.ts`: inclui explicitamente o caso "parque recém-migrado não nasce vencido".

## Fase 3 — Operations

- [ ] 3.1 [packages/sisub-domain] Schemas Zod de pane e manutenção em `schemas/equipment.ts` (enums exportados como `const` + `z.enum`, no padrão do arquivo).
- [ ] 3.2 [packages/sisub-domain] Operations de pane: `listEquipmentIssues`, `reportEquipmentIssue`, `updateEquipmentIssue` (resolver/descartar/`in_repair`). Guards de R5, dono lido da linha e nunca do input.
- [ ] 3.3 [packages/sisub-domain] Operations de manutenção: `listMaintenancePlans`, `createMaintenancePlan`, `updateMaintenancePlan`, `deleteMaintenancePlan`, `logMaintenance`, `listMaintenanceLogs`.
- [ ] 3.4 [packages/sisub-domain] `listApplicablePlans(unitId)` usando o papel **efetivo** da unidade, não o do catálogo.
- [ ] 3.5 [packages/sisub-domain] `loadKitchenUnits`: filtrar unidade com pane inoperante aberta (R3), incluindo o caminho sem guard usado pelo cálculo de atendimento; expor a condição derivada no `EquipmentUnitWire`.
- [ ] 3.6 [packages/sisub-domain] Afrouxar `createEquipmentUnit` para `kitchen` 2 **ou** `kitchen-production` 1; deixar `update`/`delete` intactos.
- [ ] 3.7 [packages/sisub-domain] `equipment.authz.test.ts`: metade positiva e **negativa** de R5, tool a tool.
- [ ] 3.8 [packages/sisub-domain] `operations/training.ts`: `equipment_issue` e `equipment_maintenance_log` em `RESET_STEPS` **antes** de `kitchen.equipment_unit`; atualizar `training.operations.test.ts`.

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
