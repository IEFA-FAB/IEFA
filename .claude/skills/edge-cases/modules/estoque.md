# Estoque

Hipóteses a verificar; a suíte `inventory-cycle.e2e.operations.test.ts` e as de recebimento/contagem são o ponto de partida.

### EST-REC-01 — "Entrega com duas validades"
- **Cobertura:** `inventory-cycle.e2e.operations.test.ts` (dois lotes, FEFO).

### EST-REC-02 — "Entregaram menos do que o empenhado"
- **O sistema precisa:** recebimento parcial com a pendência visível, sem fechar o empenho.
- **Cobertura:** hipótese.

### EST-REC-03 — "Item entregue diferente do pedido (marca/embalagem)"
- **O sistema precisa:** conferência aceita com divergência registrada, não recusa em bloco.
- **Cobertura:** hipótese (ver `receipt-conference`).

### EST-CNT-01 — "A contagem física não bate com o sistema"
- **O sistema precisa:** ajuste com motivo e trilha, sem apagar o histórico.
- **Cobertura:** suíte de contagem — verificar.

### EST-SAI-01 — "Saiu insumo para a produção sem requisição (emergência)"
- **O sistema precisa:** registrar a saída depois, ligada ao dia/preparação.
- **Cobertura:** hipótese.
