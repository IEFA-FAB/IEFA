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
