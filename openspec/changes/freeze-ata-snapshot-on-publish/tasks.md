## 1. Migrations e tipos (schema `procurement`)

- [x] 1.1 [database] Migration: criar `procurement.procurement_list_snapshot_selection` (list_id FK CASCADE, origin_template_id nullable, template_name, template_type, headcount, repetitions, snapshot_source default 'native', created_at)
- [x] 1.2 [database] Migration: criar `procurement.procurement_list_snapshot_component` (list_item_id FK CASCADE, ingredient_id, recipe_id, net_quantity, portion_multiplier, quantity_needed, computed_at)
- [x] 1.3 [database] Migration: adicionar `procurement_list_item.computed_at timestamptz`
- [x] 1.4 [database] Migration: adicionar `procurement_list_selection.origin_template_id` (nullable, `ON DELETE SET NULL`) + backfill de `template_id`; NÃO dropar `template_id` ainda (fase 2)
- [x] 1.5 [database] Rodar `bun run db:types` e conferir os objetos Drizzle novos em `drizzle/schema.ts`

## 2. Domain — snapshot ao publicar (`procurement-ata-snapshot`)

- [x] 2.1 [sisub-domain] Implementar `buildAtaSnapshot(tx, listId)` que resolve seleções + componentes por ingrediente e insere nas tabelas de snapshot numa transação
- [x] 2.2 [sisub-domain] Chamar snapshot em `finalizeAtaDraft` e na transição `updateAtaStatus` → `published`
- [x] 2.3 [sisub-domain] `fetchAtaDetails`: ler do snapshot quando ATA publicada; no rascunho filtrar `deleted_at` do join de `menu_template`
- [x] 2.4 [sisub-domain] Migration/script de backfill de snapshot para ATAs `published`/`archived` existentes (`snapshot_source = 'backfill'`; parcial quando template não resolvível)

## 3. Domain — trava de imutabilidade (`procurement-ata-immutability`)

- [x] 3.1 [sisub-domain] Guard de status em `saveAtaDraftItems`/`finalizeAtaDraft` (item paths): DomainError quando `status != 'draft'` / `wizard_step == null`
- [x] 3.2 [sisub-domain] `updateAtaStatus`: validar transições `draft → published → archived`; proibir `published → draft`
- [x] 3.3 [sisub-domain] Confirmar que `updateAtaItemPrices` permanece permitido em `published` e não toca composição/quantitativo

## 4. Domain — vínculo de pesquisa de preço (`procurement-price-research-linkage`)

- [x] 4.1 [sisub-domain] `persistDraftItems`: reconciliar pesquisas por `catmat_item_codigo` (fallback `ingredient_id`) antes de deletar itens, relinkando ao novo `ata_item_id`
- [x] 4.2 [sisub-domain] Retornar contagem de pesquisas que perderão vínculo no resultado de `saveAtaDraftItems`
- [x] 4.3 [sisub-domain] Após reconciliar, deletar linhas de pesquisa órfãs (`ata_item_id IS NULL`) da ATA na mesma transação
- [x] 4.4 [sisub-domain] Expor `research_date` no snapshot/detalhe e derivar flag de expiração (default 180d)

## 5. Domain — detecção de stale no rascunho (`procurement-draft-stale-detection`)

- [x] 5.1 [sisub-domain] Gravar `computed_at` nos itens em `createAta` e no recompute
- [x] 5.2 [sisub-domain] `fetchAtaDetails` (rascunho): calcular flag `isStale` comparando `max(computed_at)` dos itens com `max(updated_at)` dos templates das seleções

## 6. Server functions

- [x] 6.1 [sisub] Ajustar `server/ata.fn.ts` para propagar contagem de desvínculos, flag `isStale` e flag de expiração da pesquisa
- [x] 6.2 [sisub] Ajustar `server/price-research.fn.ts` se necessário para a reconciliação por CATMAT

## 7. UI (`apps/sisub`)

- [x] 7.1 [sisub] Badge "quantitativos desatualizados — recalcular" no rascunho (`AtaItemsTable`/`procurement/$ataId.tsx`)
- [x] 7.2 [sisub] Modo leitura pós-publicação: desabilitar edição de composição/itens, manter edição de preço
- [x] 7.3 [sisub] Aviso "N pesquisas serão desvinculadas" no replace-all antes de confirmar recompute
- [x] 7.4 [sisub] Sinalização de pesquisa expirada (≥180d) no detalhe da ATA

## 8. Testes e verificação

- [x] 8.1 [sisub] Testes de regressão das domain ops de procurement: snapshot ao publicar, guard de status, reconciliação por CATMAT, limpeza de órfãos, stale flag (`src/test/operations/`)
- [ ] 8.2 [sisub] Rodar `SISUB_RUN_INTEGRATION=true bun run test:integration` + `bunx vitest run` verde
- [x] 8.3 [root] Rodar `bun run check` (Biome + typecheck) verde
