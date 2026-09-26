# Gestão Unidade — anexo quantitativo do TR, ARP, empenho

Hipóteses a verificar.

### GU-ANX-01 — "O cardápio semanal mudou depois de montado o anexo quantitativo"
- **O sistema precisa:** o anexo mostra a divergência (ou é recalculável) em vez de ficar com números velhos.
- **Cobertura:** hipótese.

### GU-ANX-02 — "Um evento grande entrou no ano (formatura)"
- **O sistema precisa:** o evento, com efetivo e %, entra no custeio (`calculateAtaNeeds` usa a demanda do evento).
- **Cobertura:** `templates.operations.test.ts` (demanda do evento) — verificar no anexo.

### GU-ARP-01 — "A ARP venceu / o item ficou deserto"
- **O sistema precisa:** o item sem cobertura aparece como pendente, não some.
- **Cobertura:** hipótese.

### GU-EMP-01 — "Saldo do empenho acabou antes do mês"
- **Cobertura:** `EmpenhoBalancePanel` — verificar alerta de saldo baixo.

### GU-ARP-02 — "Preciso comprar resfriado, mas a ATA só tem a carne congelada"
- **Realidade:** com o freezer em manutenção (EST-REC-04), a unidade quer a carne
  resfriada a vácuo. A ATA vigente tem só o item congelado.
- **O sistema precisa:** o pedido continua saindo do item da ATA, que é o que o contrato
  cobre. A diferença de conservação é combinada com o fornecedor e registrada **no
  recebimento**, onde vira divergência do lote, e não em um cadastro paralelo. A
  especificação de compra do insumo é sugestão: comprar diferente dela não exige editar
  o catálogo global.
- **UX:** nenhum passo novo na compra. O registro acontece na conferência (EST-REC-04).
- **Cobertura:** hipótese. Cobre o lado do recebimento. **LACUNA:** o pedido de
  fornecimento não tem como avisar o fornecedor. A coluna `procurement.supply_order.notes`
  existe, mas nenhuma tela a grava nem a imprime.


## Planejamento da contratação (fluxo "Planejar contratação", segmentação)

### GU-SEG-01 — "Este mês a OM só compra carnes; bebidas vão em outro pregão"
- **Realidade:** a unidade planeja todas as produções do ano, mas compra por segmento, um por
  mês, para as atas não vencerem juntas.
- **O sistema precisa:** o anexo quantitativo de uma contratação leva só os itens dela, e diz
  quantos ficaram de fora e por quê.
- **UX:** a contratação se escolhe no passo 1 do wizard; o aviso "N itens ficaram fora de Carnes"
  aparece no passo 5, com link para a segmentação.
- **Cobertura:** `procurement-segments.operations.test.ts › regra mais específica vence…`;
  e2e `procurement-segmentation.spec.ts`.

### GU-SEG-02 — "O mesmo item caiu em duas contratações"
- **Realidade:** duas pastas incluídas em contratações diferentes cobrem o mesmo item de compra
  (ou dois insumos do mesmo item estão em pastas de contratações diferentes).
- **O sistema precisa:** conflito visível na hora, e conclusão do anexo recusada enquanto ele
  existir: o órgão não pode participar de duas atas com o mesmo objeto (Lei 14.133/2021,
  art. 82, VIII).
- **Cobertura:** `procurement-segments.operations.test.ts › mesma pasta em duas contratações…`
  (inclui `SEGMENT_CONFLICT` na conclusão); `segment-resolution.test.ts`.

### GU-SEG-03 — "Apagaram a contratação com anexo em andamento"
- **O sistema precisa:** o anexo antigo guarda a referência; o rascunho pede outra contratação
  (ou todos os itens) antes de calcular.
- **Cobertura:** `procurement-segments.operations.test.ts` (`SEGMENT_NOT_FOUND` no rascunho).

### GU-FLX-01 — "A cozinha não mandou a previsão"
- **O sistema precisa:** o fluxo da unidade mostra a pendência dizendo quem resolve, sem link
  para a Gestão Cozinha (o chefe do rancho em geral não tem esse módulo).
- **Cobertura:** `lib/flows/flows.test.ts`; e2e `procurement-flows.spec.ts`.

### GU-FLX-02 — "A mesma previsão serve a duas contratações"
- **O sistema precisa:** importar a previsão no anexo de Carnes não a esconde do anexo de
  Estocáveis; cada importação fica registrada, e a cozinha vê em quais anexos ela entrou.
- **Cobertura:** `procurement-flows.operations.test.ts`; e2e `procurement-flows.spec.ts`.

### GU-FLX-03 — "A contratação de março chegou e ninguém começou"
- **O sistema precisa:** a janela do calendário (mês previsto − antecedência) abre a pendência
  nos dois fluxos; o anexo concluído dentro da janela a fecha.
- **Cobertura:** `procurement-calendar.test.ts`; `procurement-flows.operations.test.ts`.

## Pesquisa de preços (IN SEGES/ME 65/2021)

Irregularidade na pesquisa não trava o preço: vira não conformidade gravada no item pesquisado
(`non_compliance_reasons`), com a base e o que fazer, e a justificativa correspondente a resolve
(colunas `justification_*`, migration `20260926211000`). A regra é uma só
(`sisub-domain/operations/price-research-compliance.ts`), usada pelo modal, pela gravação, pelo
lote e pelo worker da API. Texto conferido na IN consolidada em gov.br/compras.

### GU-PRC-01 — "A pesquisa só achou 2 preços"
- **Realidade:** item regional ou pouco comprado; o Compras.gov.br devolve 2 contratações no ano.
- **O sistema precisa:** o preço pode ser usado; a pesquisa fica não conforme ("Menos de 3 preços
  válidos", art. 6º, caput e § 5º) até a justificativa, que vai à aprovação da autoridade.
- **UX:** no modal da pesquisa, o quadro de não conformidades aparece sob as estatísticas com a
  caixa "Justificativa da amostra reduzida"; preenchida (10+ caracteres), a pendência passa a
  "justificada" e o "Usar" grava a justificativa junto.
  No relatório de pesquisa de preços, a justificativa tira o aviso do checklist e sai nas
  excepcionalidades (seção 7), com o texto; sem ela, o espaço fica em branco para preencher.
- **Cobertura:** `price-research-compliance.test.ts › menos de 3 preços…`, `› a justificativa da
  amostra reduzida resolve…`; `price-research-report.test.ts › justificativa da amostra reduzida
  tira o aviso…`. **LACUNA:** o modal não tem teste de componente nem e2e.

### GU-PRC-02 — "Os preços vêm todos do mesmo órgão"
- **Realidade:** 5 preços, 2 UASGs.
- **O sistema precisa:** não conformidade "Menos de 3 UASGs distintas", atribuída ao critério da
  unidade (a IN não fixa número de órgãos), resolvida pela mesma justificativa da amostra reduzida.
- **Cobertura:** `price-research-compliance.test.ts › 3 UASGs é critério da unidade, não da IN`.

### GU-PRC-03 — "A amostra não tem data"
- **Realidade:** a API devolve contratação sem `dataResultado` nem `dataCompra`.
- **O sistema precisa:** a amostra aparece na tabela (selo "sem data") e fica fora do cálculo:
  sem data não há como mostrar que o preço é de até 1 ano (art. 5º, II). Quem a inclui (botão
  "N sem data: fora do cálculo" ou seleção da linha) registra a não conformidade "amostra sem data
  de referência", resolvida pela justificativa do período (art. 5º, § 3º). O lote e o worker da
  API sempre a deixam fora.
- **Cobertura:** `price-research-utils.test.ts › janela de recência` (filtro, partição, funil do
  `autoSelectPrice`); `price-research-compliance.test.ts › amostra sem data no cálculo…`,
  `› complianceFactsOf…`; `apps/api/.../analyzer.test.ts › amostra sem data fica fora…`.

### GU-PRC-04 — "Quero ver o histórico todo do item"
- **Realidade:** consulta exploratória, ou item sem compra no último ano.
- **O sistema precisa:** "Todo o histórico" continua disponível; a pesquisa gravada com ele (ou com
  janela > 12 meses) fica não conforme citando o art. 5º, I e II, e § 3º, até a justificativa do
  preço fora do prazo (que pede o índice de atualização, não aplicado pelo sistema).
- **Cobertura:** `price-research-compliance.test.ts › todo o histórico e janela maior que 12 meses…`.
- **Decisão:** a janela conta da data da pesquisa, não do edital: é o marco do art. 5º, II (e a
  fonte daqui é o inciso I, Painel de Preços). A divulgação do edital só é marco dos incisos III,
  IV e V. **LACUNA:** quando o sistema tiver essas fontes, a janela delas precisa da data prevista
  de divulgação, que não existe com confiança (`procurement_segment.planned_month` é o mês de
  início do processo, não do edital).

### GU-PRC-05 — "Tirei amostras à mão"
- **Realidade:** o pregoeiro desmarca preços de outro estado ou de embalagem atípica, por
  seleção de linhas ou filtro de coluna, em vez do IQR automático.
- **O sistema precisa:** não conformidade "amostras escolhidas à mão" (art. 6º, § 3º, e art. 3º,
  VI) até o critério ser descrito.
- **Cobertura:** `price-research-compliance.test.ts › seleção manual pede o critério…`.

### GU-PRC-06 — "Quero usar o menor preço"
- **O sistema precisa:** o menor valor é método do art. 6º, caput: "Usar" no Mínimo grava
  `lowest`, sem pendência. Método fora de média/mediana/menor pede justificativa (art. 6º, § 1º);
  hoje nenhuma tela o oferece.
- **Cobertura:** `price-research-utils.test.ts › menor valor é método do art. 6º, caput…`;
  `price-research-compliance.test.ts › menor preço é método do caput…`.

### GU-PRC-07 — "O lote pesquisou 200 itens e 12 ficaram com poucos preços"
- **O sistema precisa:** o preço é aplicado; o toast do lote diz quantas pesquisas ficaram não
  conformes e manda abrir a pesquisa do item para justificar. A nova pesquisa com justificativa é
  outra memória de cálculo (chave de idempotência v3 inclui janela, seleção e justificativas).
- **Cobertura:** **LACUNA:** o toast não tem teste, e a tabela do anexo não marca quais itens
  estão não conformes (o usuário só descobre reabrindo a pesquisa de cada um). Menor caminho:
  selo "não conforme" por item na `AtaItemsTable`, lido do último `procurement_pesquisa_preco_item`.
