# Produção Cozinha — turno

Menu: **Produção Cozinha**. O turno executa o que o agendamento decidiu e registra o que de fato
aconteceu. Casos aqui são **hipóteses a verificar**, salvo onde "Cobertura" aponta teste.

### PC-TRN-01 — "Faltou um insumo no meio da produção"
- **Realidade:** o turno descobre a falta com a panela no fogo.
- **O sistema precisa:** registrar o substituto no item (mesmo contrato do agendamento, tipo `production`).
- **UX:** "Ajustes do turno" → substituição com motivo.
- **Cobertura:** operação `recordProductionSubstitution`; registra só o insumo que faltou, **não o que entrou** — LACUNA (mesmo formato de `substitute_description` do agendamento).

### PC-TRN-02 — "Produziu menos (ou mais) do que o planejado"
- **O sistema precisa:** quantidade produzida e sobra registradas por tarefa; estoque baixado pelo real.
- **Cobertura:** `production.operations.test.ts` (verificar o caso de produção parcial).

### PC-TRN-03 — "O equipamento parou no meio do turno"
- **O sistema precisa:** tarefa reprogramável para outro equipamento ou a troca de preparação (GC-AGD-05) chegando ao turno.
- **Cobertura:** hipótese.

### PC-TRN-04 — "A preparação foi trocada no agendamento com a tarefa pendente"
- **O sistema precisa:** a tarefa passa a mostrar a preparação nova, de qual veio e o motivo; o
  substituto de insumo registrado no agendamento aparece como "insumo → substituto".
- **Cobertura:** a troca mantém o item (mesmo id) e o `TaskDetailSheet` lê `recipe_swap` e
  `substitute_description`; tela do turno sem e2e — hipótese visual.

### PC-TRN-05 — "Cancelaram depois que a produção começou"
- **O sistema precisa:** o agendamento recusa tirar/adiar (GC-AGD-04); o turno registra a sobra.
- **Cobertura:** recusa em `planning-adjustments.operations.test.ts`; registro de sobra — hipótese.
