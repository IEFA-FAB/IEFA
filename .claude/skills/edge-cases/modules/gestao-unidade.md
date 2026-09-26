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

