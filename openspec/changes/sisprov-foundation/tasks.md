## PR único (este change)

### 1. Estoque multiclasse (banco; espera o mantenedor)

- [ ] 1.1 [database] Migration `inventory_multiclass`: `inventory.stock_location` com backfill de um local por cozinha e trigger em `kitchen.kitchen`; `kitchen.frozen_preparation` como subtipo de `core.item`; `fardamento` no CHECK de `core.item.catalog_scope`
- [ ] 1.2 [database] Na mesma migration: `kitchen_id` → `location_id` e `ingredient_id`/`frozen_preparation_id` → `item_id` em toda tabela do `inventory`; `kitchen_stock_settings` → `stock_location_settings`; `procurement.supply_order.location_id`; constraints e índices no eixo novo; trava de classe por local
- [ ] 1.3 [database] Na mesma migration: funções e views do `inventory` recriadas sobre (local, item), com `set search_path = ''`
- [ ] 1.4 [sisub] Guard de treino varre `location_id`; reset de treino apaga o estoque pelos locais do escopo de treino; `inventory.stock_location` em `RESET_EXCLUSIONS`
- [ ] 1.5 [database] Depois do apply (mantenedor): `db:types`, `db:drizzle:pull`, `audit:rls`

### 2. Código do estoque

- [ ] 2.1 [sisprov-domain] `requireStockLocation` (o gate do local de estoque, para as duas lentes)
- [ ] 2.2 [sisub-domain] Importa do `sisprov-domain`; `production-issue` e o reset de treino passam a item e local
- [ ] 2.3 [sisub] Server functions de estoque e rotas `/storage/$kitchenId` resolvem cozinha → local e leem/escrevem `location_id`/`item_id`; gate por local
- [ ] 2.4 [sisub] Testes unitários e de integração de estoque no eixo novo

### 3. Acesso

- [x] 3.1 [pbac] `sisprov-planning` e `sisprov-admin` no `AppModule`
- [ ] 3.2 [pbac] Sai `sisprov-supply`; comentário do `storage` como estoque do SISPROV
- [x] 3.3 [sisub] `SisubModule` exclui `sisprov-${string}`
- [ ] 3.4 [sisprov-domain] `storage` nos módulos geridos, níveis e rótulos; `SisprovGrantTargetSchema` com `storage` 1–3; testes
- [ ] 3.5 [docs] `pbac/modulos.mdx`: seção do SISPROV com o `storage`

### 4. App

- [x] 4.1 [sisprov] Esqueleto, tema, auth, legal, health, hub, Planejamento, Administração e tela de acessos
- [ ] 4.2 [sisprov] Módulo Estoque no lugar de Almoxarifado: rota `/stock`, gate `storage`, lista de locais alcançáveis com as classes
- [ ] 4.3 [sisprov] Tela de acessos concede `storage` por OM ou global e mostra grant por cozinha só para leitura
- [ ] 4.4 [sisprov] Só os primitivos de `components/ui` que as telas importam

### 5. Deploy, infra, documentos

- [x] 5.1 [root] Entrada no `apps.manifest.json` com `healthUrlVar` e `buildArgFrom`; artefatos regerados
- [x] 5.2 [infra] `infra/sisprov`
- [ ] 5.3 [root] `knip.json` com `packages/sisprov-domain`
- [ ] 5.4 [root] `AGENTS.md`, `README.md`, `PRODUCT.md`, `LGPD.md`, página do SISPROV no docs e edge cases com o SISPROV dono do estoque
- [x] 5.5 [database] Migration `legal_documents_sisprov` (texto proposto)

### 6. Verificação

- [ ] 6.1 [root] `bun run check`, `bun run lint --concurrency=2`, `bun run test --concurrency=2`, `bun run check:deploy`, `bun run knip:files`
- [ ] 6.2 [sisub] Depois do apply: suíte de integração do estoque contra o banco
- [ ] 6.3 [root] `/code-review` com os achados publicados no PR

## Changes seguintes

`sisprov-inventory-package`: a lógica pura do estoque (`stock-math`, `count-math`, `issue-variance`, `receipt-lots`, `receiving-*`, `nfe-*`, `inventory-vocabulary`, `replenishment`) muda de `@iefa/sisub-domain` para `@iefa/sisprov-domain/inventory`, com os utilitários comuns antes, sem mudança de comportamento (design D15).

`sisprov-catalog` (schema da classe fardamento, perfil, grade, embalagem, primeiros locais `unit_storeroom`/`central_depot`), `sisprov-demand-groups`, `sisprov-size-records`, `sisprov-size-curve`, `core-sigpes-sync`, `sisprov-engine` (necessidade líquida → OF), `sisprov-distribution` (saída ao militar).
