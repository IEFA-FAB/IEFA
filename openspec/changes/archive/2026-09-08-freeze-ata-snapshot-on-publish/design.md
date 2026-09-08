## Context

A ATA de compra do sisub (`procurement.procurement_list`) nasce em um wizard de 4 passos (`AtaStepIndicator`: Cardápios Semanais → Eventos → Resumo → Itens). Cardápio semanal e evento são a **mesma tabela** `kitchen.menu_template`, discriminada por `template_type`. O cálculo de quantitativos ocorre em `calculateAtaNeeds` (`packages/sisub-domain/src/operations/ata.ts:78`): resolve `menu_template_items.headcount_override`, receita e ingredientes, aplica `net_quantity × (headcount / portionYield) × repetitions` e agrega por ingrediente, traduzindo para `purchase_item` pela junção `is_default`. `createAta` / `finalizeAtaDraft` **congelam** o resultado em `procurement_list_item`.

Estado atual — híbrido inconsistente:
- **Quantidade** é snapshot (`procurement_list_item`), mas **proveniência** é viva: `procurement_list_selection.template_id → menu_template.id` (FK sem `ON DELETE`; `menu_template` só faz soft-delete, então a FK nunca dispara e a seleção fica pendurada num template escondido).
- Editar `menu_template` (`updateTemplate`, `templates.ts:311`, faz delete-all + reinsert dos items) **não recomputa** nada já persistido, sem sinal de stale.
- Pesquisa de preço (`procurement_pesquisa_preco_item.ata_item_id`) liga por `ON DELETE SET NULL`; o replace-all de `persistDraftItems` (`ata.ts:386`) deleta itens removidos e **orfã** a pesquisa (linha sobrevive sem vínculo).
- `saveAtaDraftItems` / `updateAtaItemPrices` / `updateAtaStatus` **não checam status** — ATA `published` é livremente editável.

Constraints: Lei 14.133/2021 + IN SEGES 65/2021 exigem memória de cálculo da pesquisa de preço imutável e reproduzível após publicação; janela de validade da pesquisa ~180 dias. A pesquisa de preço é **preço unitário**, independente de quantidade — os dois têm ciclos de vida distintos.

## Goals / Non-Goals

**Goals:**
- Tornar a ATA autocontida e reproduzível no instante em que sai do rascunho (snapshot profundo da composição resolvida).
- Eliminar a dependência de integridade com `menu_template` mutável/soft-deletável em ATAs publicadas.
- Impedir edição de composição/quantitativo após publicação, mantendo preço unitário editável.
- Desacoplar o vínculo pesquisa↔item da identidade da linha (`ata_item_id`), reconciliando por CATMAT/ingrediente.
- Sinalizar quantitativo desatualizado no rascunho e validade temporal da pesquisa.

**Non-Goals:**
- Versionar `menu_template`/eventos (histórico por edição de cardápio).
- Fork de ATA publicada (`base_list_id` git-like) — follow-up separado.
- Recompute automático ao abrir o rascunho.
- Mexer em ARP/empenho ou na busca de preços Compras.gov em si.

## Decisions

### D1. Snapshot profundo no momento de sair do rascunho (não no rascunho, não ao vivo)
Ao `finalizeAtaDraft`/publicar, materializar a composição resolvida em tabelas próprias da ATA: `procurement_list_snapshot_selection` (seleção resolvida com nome do template, `template_type`, `headcount`, `repetitions` no momento), e `procurement_list_snapshot_component` (o breakdown ingrediente→receita→quantidade que gerou cada `procurement_list_item`, com `computed_at`). O `procurement_list_item` continua sendo a linha de compra agregada; o snapshot é a memória de cálculo que a reproduz.
- **Por que aqui e não no rascunho**: no rascunho o usuário ainda está iterando; congelar cedo gera lixo. No `published` a lei exige congelamento.
- **Alternativa descartada — versionar menu_template**: volume (cada edição de cardápio = cópia completa de items) e UX (fork semantics via `base_template_id` já é atrito) sem ganho fora do instante da ATA.
- **Alternativa descartada — referência viva + recompute sempre**: viola o requisito legal (quantia do ato oscila) e re-orfã pesquisa a cada view.

### D2. Rebaixar `template_id` a `origin_template_id` informativo
Renomear `procurement_list_selection.template_id` → `origin_template_id`, tornar nullable com `ON DELETE SET NULL`. Deixa de ser fonte de verdade (o snapshot é), vira só rastreabilidade "veio deste cardápio". Corrige o join de `fetchAtaDetails` que hoje exibe nome de template soft-deleted.
- **Alternativa descartada — manter FK dura**: força recriar a integridade que o soft-delete já furou; o snapshot torna a FK desnecessária.

### D3. Trava por estágio: itens/quantidade travados, preço editável
Guard em `saveAtaDraftItems`, `finalizeAtaDraft` (item paths) e mutações de composição: rejeitar (DomainError) quando `status != 'draft'` ou `wizard_step == null`. `updateAtaItemPrices` **permanece permitido** em `published` (nova pesquisa dentro da janela). `updateAtaStatus` valida transições (`draft → published → archived`; sem volta a `draft` uma vez publicada nesta mudança).
- **Por que preço editável**: quantitativo é o ato; preço é revisável dentro da validade legal sem reabrir o ato inteiro. Fork completo fica pro follow-up.
- **Alternativa descartada — imutável total**: mais simples de auditar, porém obriga fork (fora de escopo) para qualquer atualização de preço legítima.

### D4. Vínculo pesquisa↔item por chave de negócio (CATMAT → ingrediente)
Reconciliar por `catmat_item_codigo` (fallback `ingredient_id`) em vez da sobrevivência do `ata_item_id`. No replace-all do rascunho, antes de deletar, casar pesquisas existentes com os itens novos pela chave e relinkar; só desvincula (e limpa) quando o item realmente sai da lista. `persistDraftItems` passa a: (1) contar pesquisas que perderão vínculo e retornar ao cliente para aviso; (2) após reconciliar, `DELETE` das linhas de pesquisa órfãs (`ata_item_id IS NULL`) associadas àquela ATA, evitando peso morto.
- **Por que**: recomputar quantidade não deve invalidar pesquisa (preço é quantidade-independente). Só entrada/saída de item muda o conjunto.
- **Alternativa descartada — manter `SET NULL` silencioso**: acumula órfãos e perde vínculo em recomputes triviais de quantidade.

### D5. `computed_at` + detecção de stale manual no rascunho
Adicionar `computed_at timestamptz` em `procurement_list_item` (gravado por `createAta`/recompute). No rascunho, comparar `max(computed_at)` dos itens com `max(updated_at)` dos `menu_template` das seleções; se template mais novo, UI marca badge "quantitativos desatualizados — recalcular". Recompute continua sendo ação manual (chama `calculateAtaNeeds` + `saveAtaDraftItems`), consistente com `applyTemplate`.
- **Alternativa descartada — recompute ao abrir**: sobrescreve ajustes manuais e custa query por abertura.

### D6. Validade temporal da pesquisa
`procurement_pesquisa_preco` já grava data (idempotency por dia Brasília em `savePrecoAuditFn`). Expor `research_date` no snapshot da ATA e derivar um flag de expiração (default 180 dias, configurável) exibido na ATA. Não bloqueia; sinaliza.

## Risks / Trade-offs

- **[Migration destrutiva no rename `template_id`→`origin_template_id`]** → migration em duas fases: adicionar `origin_template_id` + backfill a partir de `template_id`, trocar leituras, dropar a coluna antiga numa migration posterior. Rodar `bun run db:types` após.
- **[Duplicação de dados no snapshot profundo]** → volume aceitável: snapshot só é escrito ao publicar (evento raro vs. edições de cardápio); componentes agregam por ingrediente, não por linha de menu bruta.
- **[Trava quebra fluxos que hoje editam ATA publicada]** (**BREAKING**) → auditar chamadas de `saveAtaDraftItems`/mutações de item na UI; garantir que telas pós-publicação entrem em modo leitura; preço via caminho dedicado `updateAtaItemPrices`.
- **[Reconciliação por CATMAT falha quando item não tem CATMAT]** → fallback para `ingredient_id`; itens sem nenhuma das duas chaves são tratados como novos (comportamento atual), com aviso.
- **[ATAs legadas já publicadas sem snapshot]** → migration de backfill best-effort a partir dos `procurement_list_item` + selections existentes; marcar `snapshot_source = 'backfill'` para distinguir de snapshots nativos. ATAs sem template resolvível ficam com snapshot parcial (só itens agregados).
- **[Fork ausente força workaround]** → aceito nesta fase: atualização de preço cobre o caso comum; mudança estrutural de ATA publicada aguarda o follow-up de fork.

## Migration Plan

1. Migration `procurement`: criar `procurement_list_snapshot_selection` + `procurement_list_snapshot_component`; adicionar `procurement_list_item.computed_at`; adicionar `procurement_list_selection.origin_template_id` (nullable, `ON DELETE SET NULL`) + backfill de `template_id`.
2. `bun run db:types` (drizzle) — atualizar `packages/database/drizzle/schema.ts`.
3. Domain: implementar snapshot em `finalizeAtaDraft`; guards de status; reconciliação por CATMAT em `persistDraftItems`; leitura de snapshot em `fetchAtaDetails`.
4. UI: badge de stale (rascunho), modo leitura pós-publicação, aviso de desvínculo no replace-all, flag de validade da pesquisa.
5. Migration de backfill de snapshot para ATAs `published`/`archived` existentes (`snapshot_source = 'backfill'`).
6. Migration posterior (fase 2): dropar `procurement_list_selection.template_id` após confirmar leituras migradas.
- **Rollback**: as tabelas de snapshot e `computed_at` são aditivas; guards são código. Reverter = remover guards e ignorar tabelas novas; `origin_template_id` convive com `template_id` até a fase 2, então rollback pré-fase-2 é seguro.

## Open Questions

- Janela de validade da pesquisa (180d) é fixa ou configurável por unidade? (Design assume default 180d, sinalização não-bloqueante.)
- Backfill de snapshot para ATAs legadas: reprocessar via `calculateAtaNeeds` (se o template ainda existir) ou snapshot parcial só dos itens agregados? (Design assume parcial + flag; reprocessar só se template não-deletado.)
- `updateAtaStatus` deve permitir `published → draft` (reabrir)? Design atual proíbe (imutabilidade); confirmar se há caso operacional que exija reabertura antes do fork existir.
