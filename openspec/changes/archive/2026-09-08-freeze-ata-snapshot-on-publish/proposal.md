## Why

Hoje a ATA de compra (`procurement_list`) é um híbrido com o pior dos dois mundos: os **quantitativos** são congelados como snapshot em `procurement_list_item`, mas a **proveniência** continua viva apontando (`procurement_list_selection.template_id`) para um `menu_template` mutável e soft-deletável. Ao editar/apagar um cardápio semanal ou evento depois da ATA criada, os quantitativos e a pesquisa de preço da ATA ficam **stale sem nenhum sinal**, e uma ATA já publicada pode ter itens e preços alterados livremente — o que quebra a integridade de um ato de aquisição regido pela Lei 14.133/2021 e pela IN SEGES 65/2021, cuja memória de cálculo precisa ser imutável e reproduzível depois de publicada.

## What Changes

- **Snapshot profundo ao sair do rascunho**: ao finalizar/publicar a ATA, copiar a composição resolvida (seleções + `menu_template_items` resolvidos + breakdown de ingrediente/receita) para tabelas próprias da ATA, tornando-a 100% autocontida e reproduzível mesmo que o cardápio/receita mude depois.
- **Rebaixar o vínculo com o cardápio**: `procurement_list_selection.template_id` passa a ser `origin_template_id` **informativo** (`ON DELETE SET NULL`), sem dependência de integridade. Editar/apagar `menu_template` deixa de afetar ATAs publicadas.
- **Trava de imutabilidade pós-rascunho** (**BREAKING** para chamadas de escrita): com `status != 'draft'` / `wizard_step == null`, `saveAtaDraftItems` e mutações de item/quantitativo são rejeitadas. Preço unitário permanece editável (nova pesquisa dentro da janela legal); composição e quantidade ficam congeladas.
- **Reconciliação de pesquisa de preço por chave de negócio** (CATMAT/ingredient_id) em vez da sobrevivência do `ata_item_id`: recomputar quantidade no rascunho deixa de orfanar pesquisas; só entrada/saída real de item mexe no vínculo. Inclui limpeza dos registros órfãos (`ata_item_id IS NULL`) e aviso ao usuário no replace-all.
- **Detecção de stale no rascunho**: gravar `computed_at` no item e comparar com `updated_at` das seleções; UI exibe badge "quantitativos desatualizados — recalcular" (recompute manual, consistente com o padrão do `applyTemplate`).
- Registrar a data da pesquisa no snapshot e sinalizar expiração da janela legal (~180d) na ATA.

## Capabilities

### New Capabilities
- `procurement-ata-snapshot`: congelamento profundo da composição da ATA no momento em que sai do rascunho, com as tabelas de snapshot próprias e o rebaixamento de `template_id` a origem informativa.
- `procurement-ata-immutability`: regras de trava por estágio do ciclo de vida (rascunho vs. publicada/arquivada) — o que pode e o que não pode ser editado em cada status.
- `procurement-price-research-linkage`: vínculo entre pesquisa de preço e item da ATA por chave de negócio (CATMAT/ingrediente), reconciliação no replace-all, limpeza de órfãos e sinalização de validade temporal da pesquisa.
- `procurement-draft-stale-detection`: rastreio de `computed_at` no rascunho e detecção de quantitativo desatualizado após edição de cardápio/evento, com recompute manual.

### Modified Capabilities
<!-- Nenhuma capability pré-existente em openspec/specs/; todas as regras afetadas são introduzidas aqui como capabilities novas. -->

## Impact

- **App**: `sisub` (exclusivamente). Nenhum efeito em portal, api, alpha ou docs.
- **Schema `procurement`** (`packages/database`): novas tabelas de snapshot da ATA; `procurement_list_selection.template_id` → `origin_template_id` (nullable, `ON DELETE SET NULL`); nova coluna `computed_at` em `procurement_list_item` (ou header); migration + `bun run db:types`.
- **Domain** (`packages/sisub-domain/src/operations/`): `ata.ts` (`createAta`, `finalizeAtaDraft`, `persistDraftItems`, `saveAtaDraftItems`, `updateAtaItemPrices`, `updateAtaStatus`, `fetchAtaDetails`), `procurement.ts`, schemas em `schemas/procurement.ts`.
- **Server fns**: `apps/sisub/src/server/ata.fn.ts`, `price-research.fn.ts`.
- **UI**: `AtaItemsTable.tsx`, `AtaStepIndicator.tsx`, rota `procurement/$ataId.tsx` e `procurement/new.tsx` (badge de stale, estados de leitura pós-publicação).
- **Testes**: `apps/sisub/src/test/operations/` (regressão das domain ops de procurement).

## Não-objetivos

- **Versionar `menu_template` / eventos**: descartado por volume de dados e complexidade de UX; a reprodutibilidade é resolvida pelo snapshot no instante da ATA, não por histórico de cada edição de cardápio.
- **Fork de ATA publicada** (`base_list_id` self-FK git-like para clonar uma ATA e alterá-la): fica como proposta **follow-up**. Esta mudança apenas trava a edição pós-publicação.
- **Recompute automático ao abrir o rascunho**: descartado em favor do badge manual, para não sobrescrever ajustes manuais nem custar query a cada abertura.
- Alterações no fluxo de ARP/empenho (`procurement_arp`, `finance.empenho`) e na integração Compras.gov de busca de preços em si.
