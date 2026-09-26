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
