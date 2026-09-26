## Context

O caminho do planejamento da contratação já existe em pedaços, mas sem costura:

- **Gestão Cozinha → "Suprimentos"** (`procurement.kitchen_ata_draft`): a nutricionista escolhe cardápios × repetições e envia (`pending → sent`). O status `reviewed` existe no CHECK e nunca é gravado.
- **Gestão Unidade → "Anexos Quantitativos"** (`procurement.procurement_list`): wizard de 5 passos com retomada (`wizard_step`), cálculo `calculateAtaNeeds` (cardápio → preparação → insumo → item de compra), limites de quantidade (`ata-quantity-limits.ts`), snapshot congelado ao sair do rascunho e CSV no cliente (`lib/ata-annex.ts`).
- **Pesquisa de preços**:
  - modal e pesquisa em lote sobre a API pública do Compras.gov.br;
  - memória de cálculo em `procurement_pesquisa_preco{,_item,_amostra}` e no catálogo `compras_amostra`;
  - o PR #455 converteu as amostras para a unidade do item, colocou o teto na mediana e exigiu pesquisa para gravar preço.
- **Catálogo:** `kitchen.folder` é uma árvore. O nível 2 sob "Gêneros de Alimentação" traz Proteínas, Estocáveis, Bebidas, Hortifruti etc. O insumo pendura numa folha (`kitchen.ingredient.folder_id`).

Quem usa: o **chefe do rancho** (Gestão Unidade, `unit:2`), que decide a segmentação na maioria das unidades, e a **nutricionista** (Gestão Cozinha, `kitchen:2`), que em geral **não** vê a Gestão Unidade.

## Goals / Non-Goals

**Goals**
- O chefe do rancho consegue sair de "preciso contratar carnes" até os três documentos colados no processo sem saber a ordem das telas.
- A nutricionista sabe o que falta para a unidade planejar e vê o retorno do que enviou.
- Toda afirmação dos documentos é conferível na fonte: o auditor refaz as contas.
- O vocabulário da tela bate com o da Lei 14.133/2021 e dos decretos.

**Non-Goals:** ver "Não-objetivos" na proposta.

## Decisions

### D1. Fluxo = roteiro declarativo sobre telas existentes

Um fluxo é uma lista de etapas `{ id, título, objetivo, status, pendências[], ação principal }`.

- **Status derivado dos dados** a cada leitura, nunca de checklist marcado à mão, que fica defasado. Valores: `done | attention | blocked | todo`.
- **Leitura única:** o domínio expõe uma operação de status por fluxo (`fetchProcurementPlanningStatus(unitId)`, `fetchDemandForecastStatus(kitchenId)`), e o app mapeia o resultado em etapas (`src/lib/flows/*.ts`, funções puras testadas).
- **Rotas:**
  - `/unit/$unitId/flows` (índice) e `/unit/$unitId/flows/procurement-planning`;
  - `/kitchen/$kitchenId/flows` e `/kitchen/$kitchenId/flows/demand-forecast`;
  - item "Fluxos" no topo da navegação de cada módulo.
- **Link das etapas:** cada etapa leva à tela que já existe com `?from=flow`. A tela de destino mostra "Voltar ao fluxo" quando recebe o parâmetro.
- Alternativa descartada: um wizard novo que reimplementa as telas. Duplicaria regras (limites, snapshot) e envelheceria separado.

### D2. Pendência: severidade, dono e ação

| Severidade | Efeito | Exemplo |
|---|---|---|
| `blocking` | a etapa não conclui | nenhum cardápio semanal nas cozinhas; item disputado por duas contratações |
| `warning` | segue, mas fica registrada | cozinha sem previsão enviada; item sem contratação; preço sem pesquisa |
| `info` | orienta | "Estocáveis: calendário prevê março; comece em outubro" |

- **Pendência de outro módulo não vira link.** O chefe não abre a Gestão Cozinha.
- **O reflexo do lado da cozinha:** o fluxo da cozinha lê o calendário das contratações da OM dela (só nome e mês previsto) e mostra "a unidade planeja a contratação Carnes para março: envie a previsão até lá".
- Não há notificação ativa; cada lado vê a pendência no próprio fluxo.

### D3. Segmentação: contratações montadas pela unidade

**Nome.** "Segmentação" é a tela; cada segmento é uma **contratação**, posicionada no **calendário de contratação** (Decreto 10.947/2022, art. 11, III).

- "Grupo" e "lote" ficam reservados:
  - "grupo de itens" é critério de julgamento (Lei 14.133, art. 82, § 1º; Decreto 11.462, art. 12);
  - "lote" é a divisão do objeto (art. 40, § 2º, I).
- Na lei, "segmento" só aparece no art. 80, § 6º, com sentido compatível: especialidade do fornecedor.

**Modelo:**

- `procurement.procurement_segment`:
  - `id`, `unit_id` (FK `core.units`), `name` (único por unidade entre os não apagados), `description`;
  - `planned_month` (1–12, mês previsto de início do processo);
  - `lead_time_months` (default 5, antecedência do aviso);
  - `validity_months` (default 12, vigência padrão do anexo);
  - `pca_identifier` (texto livre, identificador da futura contratação no PCA);
  - `created_by`, `created_at`, `updated_at`, `deleted_at`.
- `procurement.procurement_segment_rule`:
  - `id`, `segment_id` (cascade), `mode` (`include | exclude`);
  - **exatamente um** de `folder_id` (FK `kitchen.folder`) ou `purchase_item_id` (FK `procurement.purchase_item`);
  - único por `(segment_id, folder_id)` e por `(segment_id, purchase_item_id)`.

**Resolução do item.** Função pura `resolveSegment(item, segments)` em `@iefa/sisub-domain`.

- **Entrada:** o item de compra e a cadeia de pastas do insumo, da folha para a raiz.
- **Especificidade dentro de um segmento:**
  - regra de item de compra vale 1000;
  - regra de pasta vale `100 − distância` (folha = 0, pai = 1…).
- **Casamento:** o segmento casa se sua melhor regra `include` supera a melhor `exclude`. Empate entre as duas: a `exclude` vence (regra mais restritiva).
- **Entre segmentos:** vence a maior especificidade. Empate entre dois segmentos é **conflito**.
- **Resultado:** `{ segmentId } | { unassigned } | { conflict: segmentIds }`.

**Por quê.** A regra mais específica ganha, que é o que o usuário espera ao dizer "Proteínas, exceto Pescados, que vão com Congelados".

- **Conflito bloqueia**, porque o art. 82, VIII, veda participar de duas atas com o mesmo objeto.
- **Item sem contratação** é aviso: pode ser compra fora do rancho.
- Alternativa descartada: uma pasta de nível 2 fixa. A decisão do usuário foi "flexibilidade é a chave".

**Universo avaliado.** Os insumos alcançáveis pelos cardápios (semanais, eventos e apoios, não apagados) das cozinhas da unidade, com o item de compra padrão de cada um. É o universo que o cálculo do anexo percorre.

**Guard de treino.** `procurement_segment` tem `unit_id` e entra em `RESET_STEPS`. As regras caem por cascade. A declaração vai antes da migration, em `RESET_EXCLUSIONS`, e sobe para o reset no PR do recurso.

### D4. Anexo de uma contratação

- `procurement_list.segment_id` (nullable, FK `procurement_segment`, `on delete set null`).
  - O wizard mostra no passo 1 a escolha da contratação, que é opcional: sem ela, o comportamento é o de hoje.
  - A vigência do anexo nasce da vigência do segmento.
- `calculateAtaNeeds` recebe `segmentId` opcional:
  - com ele, devolve só os itens que resolvem para o segmento;
  - devolve também `excluded: { unassigned, otherSegments }` em contagem, para o wizard dizer "37 itens ficaram para outras contratações".
- **Snapshot:** o id do segmento fica na lista. O nome da contratação no documento é o do momento da conclusão, gravado no próprio documento impresso.

### D5. Previsão de demanda com retorno

- UI: "Suprimentos" vira **"Previsão de demanda"**; "Rascunho" vira "Previsão"; "Enviar para Gestão" vira "Enviar à unidade". A URL `/kitchen/$kitchenId/suprimentos` fica, como dívida registrada.
- `kitchen_ata_draft` ganha `reviewed_at`, `reviewed_by` e `included_list_id` (FK `procurement_list`, `on delete set null`).
- **Importar a previsão no wizard** chama `markKitchenDraftReviewed(draftId, listId)`, com `unit:2` na OM dona da cozinha: status `reviewed`, carimbo, anexo.
- **Na cozinha:** "Recebida pela unidade em dd/mm, no anexo X". Com o anexo apagado, fica "Recebida pela unidade".

### D6. Documentos

Os três saem do mesmo dado: o anexo (rascunho calculado ou snapshot) e as pesquisas ligadas aos itens.

1. **Tabela do anexo para o TR.**
   - Um botão "Copiar tabela" grava `text/html` (uma `<table>` simples, sem células mescladas e com bordas por atributo) e `text/plain` (TSV) via `ClipboardItem`. Colar CSV num editor de documento não vira tabela.
   - Colunas:
     - Item, CATMAT, Descrição, Unidade;
     - Quantidade estimada, Quantidade máxima, Quantidade mínima a ser cotada;
     - Quantidade mínima por ordem de fornecimento, Ciclo de entrega;
     - Preço estimado e Valor estimado, só sem sigilo.
   - Com `is_budget_confidential`, as colunas de preço saem (IN 65/2021, art. 10; Lei 14.133, art. 24).
2. **CSV** com as mesmas colunas e a justificativa da quantidade máxima ao final.
3. **Memória de cálculo das quantidades** (`/unit/$unitId/procurement/$ataId/print/quantities`). Por item:
   - as contribuições `cozinha × cardápio (tipo) × preparação × comensais × per capita líquido ÷ rendimento × repetições`, depois o total no insumo, o fator de conversão e a quantidade de compra;
   - o acréscimo e a máxima, o ciclo e o mínimo por ordem de fornecimento.

   Vem de `explainAtaNeeds`, a mesma travessia de `calculateAtaNeeds` guardando as parcelas. Em anexo concluído, a memória declara no cabeçalho se os cardápios mudaram desde a conclusão (reusa `is_stale`).
4. **Relatório de pesquisa de preços** (`.../print/price-research`) e o **CSV da série**. Ver D7.

Impressão pela mesma técnica da Ficha Técnica: portal no `<body>` e `window.print()`, A4, "Salvar como PDF" do navegador. Não há dependência nova.

### D7. Pesquisa de preços auditável

**Gravação nova:**
- `procurement_pesquisa_preco.created_by`: o agente responsável (art. 3º, II), da sessão.
- Em `procurement_pesquisa_preco_amostra`: `converted_price numeric(14,6)`, `content_in_unit numeric(14,6)` e `conversion text` (ex.: "FR 750 ML = 0,75 LT"), gravados na hora da pesquisa. A ponte é por item pesquisado, então a conversão não colide entre itens de unidades diferentes.
- `compras_amostra.ni_fornecedor` e `nome_fornecedor`, que a API devolve e hoje se perdem. Entram no fingerprint só para linhas novas; as antigas ficam nulas.

**Relatório.** Estrutura do art. 3º da IN 65/2021:

- **I, II e III:** objeto, responsáveis e fontes. A fonte é caracterizada como sistema oficial (inciso I do art. 5º), com o endpoint, a data da consulta e a janela.
- **IV:** a série vai no CSV anexo, com o SHA-256 impresso.
- **V e VI:** método, com a regra, o teto da mediana, o descarte por IQR 1,5× e os inconsistentes por unidade.
- **VII:** a memória por item:
  - n bruto, após a janela, comparáveis e válidas;
  - mínimo, máximo, média, mediana, desvio-padrão e CV;
  - método, preço estimado e valor sobre a quantidade máxima.
- **VIII:** "não se aplica", porque não há pesquisa direta nesta versão.
- **Excepcionalidades para aprovação:** item com menos de 3 preços (§ 5º) e outro método (§ 1º), com campo de assinatura.

**Checklist de conformidade.** Função pura `auditPriceResearch(items)`, com severidade e base legal:

| Regra | Severidade |
|---|---|
| Item sem pesquisa, ou com preço diferente do da pesquisa | bloqueia |
| Menos de 3 amostras válidas ou de 3 fontes | aviso, pede justificativa aprovada (art. 6º, § 5º) |
| Preço acima da mediana | bloqueia (art. 6º, § 6º) |
| Unidade inferida | aviso |
| CV > 25% | aviso de análise crítica (art. 6º, § 4º); limiar interno, declarado no documento |
| Pesquisa com mais de 180 dias | aviso (art. 5º, III e IV, contados até o edital) |

**Roteiro de auditoria:**
- curva ABC por valor: os itens que somam 80% são conferidos por inteiro;
- dos demais, amostra reproduzível de 10% (mínimo 5), sorteada com semente derivada do SHA-256 do CSV.

**Integridade:** o CSV é gerado de forma determinística (ordem por item e depois por amostra), o hash é calculado no navegador (`crypto.subtle`), e o botão de download entrega exatamente os bytes hasheados.

### D8. Quantidade mínima a ser cotada

- `procurement_list.min_quote_percent` (0–100, default 100: o licitante cota a máxima inteira).
- Por item: `ceil(máxima × percentual)`, congelado em `procurement_list_snapshot_component.min_quote_quantity` na conclusão.
- Alternativa descartada: um valor por item. É raro que o rancho diferencie, e o percentual cobre o edital típico.

### D9. Terminologia

Só texto de UI e CSV nesta change; identificadores `ata*` do código e do banco são dívida.

| Antes | Depois | Base |
|---|---|---|
| Publicar / Publicado (anexo) | Concluir / Concluído | publicar = divulgar no PNCP (art. 54) |
| Margem (%) / Justificativa da margem | Acréscimo sobre a estimada (%) / Justificativa da quantidade máxima | margem de preferência (art. 26); quantidade máxima (art. 82, I) |
| Qtd Alvo / Previsto | Quantidade estimada | art. 18, IV; art. 40, III |
| Qtd Mínima por Pedido / menor lote | Quantidade mínima por ordem de fornecimento | ordem de fornecimento (art. 6º, X); lote (art. 40, § 2º, I) |
| Preço de Referência (catálogo) | Preço de catálogo | não é pesquisa (IN 65/2021) |
| Lista de Itens da Ata | Itens do anexo quantitativo | ata = art. 6º, XLVI |
| Suprimentos / Rascunho | Previsão de demanda / Previsão | demanda (Decreto 10.947/2022) |

## Risks / Trade-offs

- **Colar tabela no editor do TR é instável.** A skill de contratações registra isso para TRs pequenos.
  - Mitigação: HTML mínimo e botão "Copiar em partes de 100 linhas".
  - O CSV fica como plano B.
  - Conferir colando um anexo real antes de considerar pronto.
- **Resolução de segmento em cada leitura** percorre a árvore de pastas: são algumas centenas de pastas, carregadas uma vez por requisição e mantidas em memória.
- **Preço convertido gravado só em pesquisas novas.** As antigas mostram "conversão recalculada" no relatório, pela regra pura de `price-units.ts`, e o relatório diz qual foi o caso.
- **O fluxo da cozinha lê o calendário da OM:** expõe nome e mês das contratações a quem tem `kitchen:1`. Aceito: não é dado sensível, e é o que torna a pendência visível sem notificação.

## Migration Plan

1. PR de declaração: `procurement.procurement_segment` em `RESET_EXCLUSIONS` (verde nos dois estados) e esta proposta.
2. Aplicar a migration `…_procurement_planning_flows.sql` no banco compartilhado (`db:push --dry-run` antes).
3. PR do recurso, em partes:
   - (a) migration no repo, tipos regerados (`db:types`, `db:drizzle:pull`), segmentação e `procurement_segment` promovida a `RESET_STEPS`;
   - (b) terminologia e previsão de demanda com retorno;
   - (c) fluxos;
   - (d) documentos e dossiê de pesquisa.

   Cada parte tem gates, integração e e2e na sentinela do treino.

Rollback: as colunas são aditivas e nuláveis ou com default; as tabelas novas não são referenciadas por nada antigo. Reverter o app basta, e a migration pode ficar.
