## PR único (este change)

### 1. Estoque multiclasse (banco; espera o mantenedor)

- [x] 1.1 [database] Migration `inventory_multiclass`: `inventory.stock_location` com backfill de um local por cozinha e trigger em `kitchen.kitchen`; `kitchen.frozen_preparation` como subtipo de `core.item`; `fardamento` no CHECK de `core.item.catalog_scope`
- [x] 1.2 [database] Na mesma migration: `kitchen_id` → `location_id` e `ingredient_id`/`frozen_preparation_id` → `item_id` em toda tabela do `inventory`; `kitchen_stock_settings` → `stock_location_settings`; `procurement.supply_order.location_id`; constraints e índices no eixo novo; trava de classe por local
- [x] 1.3 [database] Na mesma migration: funções e views do `inventory` recriadas sobre (local, item), com `set search_path = ''`
- [x] 1.4 [sisub] Guard de treino varre `location_id`; reset de treino apaga o estoque pelos locais do escopo de treino; `inventory.stock_location` em `RESET_EXCLUSIONS`
- [ ] 1.5 [database] Depois do apply (mantenedor): `db:types`, `db:drizzle:pull`, `audit:rls`

### 1b. Níveis e endereçamento (mesma migration)

- [x] 1b.1 [database] `stock_location`: `level` 1/2/3, `supplied_by_location_id` com guarda de nível, `receives_direct`, `gln` (GS1), `uses_positions`
- [x] 1b.2 [database] `storage_position` em árvore com endereço derivado, `stock_lot.position_id`, `handling_unit` (pallet GIAI, caixa SSCC), `position_move` append-only, `picking_list` (+ linhas), `move_to_position`, `create_picking_list`, `close_picking_list`, posição do lote pelas caixas e `last_counted_at` dos lotes contados
- [x] 1b.3 [sisub-domain] Reset de treino: `position_move`, `picking_list`, `handling_unit`; `storage_position` em `RESET_EXCLUSIONS`
- [x] 1b.4 [sisprov-domain] `inventory/addressing`: níveis, tipos de posição, endereço, chaves GS1, árvore e schemas, com testes
- [x] 1b.5 [sisprov] Locais (criar, configurar com conferência de versão), endereços, lotes (guardar, mover, pendentes), pallets e caixas, separação

### 2. Código do estoque

- [x] 2.1 [sisprov-domain] `requireStockLocation` (o gate do local de estoque, para as duas lentes)
- [x] 2.2 [sisub-domain] Importa do `sisprov-domain`; `production-issue` e o reset de treino passam a item e local
- [x] 2.3 [sisub] Server functions de estoque e rotas `/storage/$kitchenId` resolvem cozinha → local e leem/escrevem `location_id`/`item_id`; gate por local
- [x] 2.4 [sisub] Testes unitários e de integração de estoque no eixo novo (a integração só roda depois do apply, item 6.2)

### 3. Acesso

- [x] 3.1 [pbac] `sisprov-planning` e `sisprov-admin` no `AppModule`
- [x] 3.2 [pbac] Sai `sisprov-supply`; comentário do `storage` como estoque do SISPROV
- [x] 3.3 [sisub] `SisubModule` exclui `sisprov-${string}`
- [x] 3.4 [sisprov-domain] `storage` nos módulos geridos, níveis e rótulos; `SisprovGrantTargetSchema` com `storage` 1–3; testes
- [x] 3.5 [docs] `pbac/modulos.mdx`: seção do SISPROV com o `storage`

### 4. App

- [x] 4.1 [sisprov] Esqueleto, tema, auth, legal, health, hub, Planejamento, Administração e tela de acessos
- [x] 4.2 [sisprov] Módulo Estoque no lugar de Almoxarifado: rota `/stock`, gate `storage`, lista de locais alcançáveis com as classes
- [x] 4.3 [sisprov] Tela de acessos concede `storage` por OM ou global e mostra grant por cozinha só para leitura
- [x] 4.4 [sisprov] Só os primitivos de `components/ui` que as telas importam

### 5. Deploy, infra, documentos

- [x] 5.1 [root] Entrada no `apps.manifest.json` com `healthUrlVar` e `buildArgFrom`; artefatos regerados
- [x] 5.2 [infra] `infra/sisprov`
- [x] 5.3 [root] `knip.json` com `packages/sisprov-domain`
- [x] 5.4 [root] `AGENTS.md`, `README.md`, `PRODUCT.md`, `LGPD.md`, página do SISPROV no docs e edge cases com o SISPROV dono do estoque
- [x] 5.5 [database] Migration `legal_documents_sisprov` (texto proposto)

### 6. Verificação

- [ ] 6.1 [root] `bun run check`, `bun run lint --concurrency=2`, `bun run test --concurrency=2`, `bun run check:deploy`, `bun run knip:files`
- [ ] 6.2 [sisub] Depois do apply: suíte de integração do estoque contra o banco
- [ ] 6.3 [root] `/code-review` com os achados publicados no PR

## Changes seguintes

`sisprov-depot-operations`: telas de recebimento, contagem (por lote, com escopo por posição) e saída do depósito endereçado, etiqueta impressa.

`sisprov-inventory-package`: a lógica pura do estoque (`stock-math`, `count-math`, `issue-variance`, `receipt-lots`, `receiving-*`, `nfe-*`, `inventory-vocabulary`, `replenishment`) muda de `@iefa/sisub-domain` para `@iefa/sisprov-domain/inventory`, com os utilitários comuns antes, sem mudança de comportamento (design D15).

`sisprov-catalog` (schema da classe fardamento, perfil, grade, embalagem, primeiros locais `unit_storeroom`/`central_depot`), `sisprov-demand-groups`, `sisprov-size-records`, `sisprov-size-curve`, `core-sigpes-sync`, `sisprov-engine` (necessidade líquida → OF), `sisprov-distribution` (saída ao militar).
