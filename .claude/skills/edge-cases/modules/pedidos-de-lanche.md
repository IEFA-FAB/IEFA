# Pedidos de Lanche (Módulo 7) — lanche de bordo e de apoio

Menu: **Gestão Cozinha → Pedidos de Lanche** (cozinha) e o pedido no módulo Comensal. A produção do
pedido entra no agendamento sob o tipo de refeição de sistema e segue o PEDIDO — os ajustes do
agendamento (GC-AGD-*) não mexem nela.

### PL-PED-01 — "Missão cancelada depois do aceite"
- **O sistema precisa:** itens saem do quadro; material cautelado volta; comida perecível não é reaproveitada.
- **Cobertura:** `snack-requests.operations.test.ts › cancelar depois do aceite tira os itens do quadro`

### PL-PED-02 — "Missão adiada depois do aceite"
- **Hoje:** não há reagendamento: o solicitante cancela e pede de novo (refaz o formulário, perde o aceite).
- **Caminho proposto:** "Reagendar" no pedido (nova partida/retirada) movendo a produção, com as mesmas
  recusas de produção iniciada do GC-AGD-04.
- **Cobertura:** **LACUNA**

### PL-PED-03 — "Pedido em cima da hora"
- **O sistema precisa:** aceitar marcando atraso (`is_late`) em vez de recusar.
- **Cobertura:** regra `isLateRequest` — verificar teste dedicado.

### PL-PED-04 — "Mudou o número de tripulantes/passageiros"
- **Hoje:** hipótese — verificar se o pedido aceito admite ajuste de quantidade sem novo pedido.
- **Cobertura:** hipótese.

### PL-PED-05 — "Retirada parcial ou material não devolvido"
- **Cobertura:** `registerSnackPickup` / `registerSnackMaterialReturn` — verificar teste de devolução parcial.

### PL-PED-06 — "Chegou pedido de lanche e a nutricionista não está: o chão aceita provisório"
- **Realidade:** o aceite é da Gestão Cozinha; o pedido que chega de madrugada espera o expediente.
- **Caminho proposto:** aceite provisório pelo turno (`kitchen-production:1`), com a produção entrando
  no quadro e o aceite pendente de confirmação da nutricionista — o mesmo desenho de PC-TRN-06.
- **Cobertura:** **LACUNA** (fora do escopo do "execução nunca trava", 2026-09-26; o reagendamento,
  PL-PED-02, também ficou de fora).

## Padrões de lanche

### PL-PAD-01 — "Bordo C com refeição e lanche no mesmo kit"
- **Realidade:** voo longo: o kit leva uma refeição (carboidrato, proteína, legume, sobremesa) e um lanche (sanduíche, bebida).
- **O sistema precisa:** o padrão tem duas refeições próprias no mesmo kit; o pedido é uma linha só; a
  produção soma as preparações das duas pelas porções por kit (proporção ÷ 100, meia porção arredonda
  para cima no total).
- **UX:** editor do padrão → "Refeição" e "Lanche" com grupos sugeridos; "Porções por kit" em cada preparação.
- **Cobertura:** `snack-kit.test.ts › meia porção por kit soma exata e arredonda para cima no total` ·
  `snack-requests.operations.test.ts` (porções por kit pela proporção). E2E: **LACUNA**.

