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

### EST-REC-04 — "O freezer quebrou: compramos carne resfriada a vácuo em vez de congelada"
- **Realidade:** a especificação de compra sugere a carne congelada. Com o freezer em
  manutenção e a geladeira funcionando, o rancho compra (ou aceita do fornecedor) a mesma
  carne resfriada a vácuo, para consumir em poucos dias. Vale para qualquer classe:
  congelado que chega resfriado, resfriado que chega seco (UHT no lugar do fresco) e o
  contrário.
- **O sistema precisa:** a conservação da especificação é **sugestão**, não trava.
  - O lote de estoque entra na classe em que **chegou**, e é ela que dirige alerta de
    validade, contagem por classe e FEFO. Resfriado alerta com 3 dias, não com os 15 do
    congelado.
  - A divergência fica registrada no lote ("Recebido resfriado (sugerido pela
    especificação: congelado)"), com nota opcional, quem e quando. O recebimento termina
    como `divergent`, o mesmo destino da temperatura fora da faixa.
  - A faixa de temperatura da especificação deixa de valer para esse lote: era a da outra
    classe.
  - A especificação e o catálogo não mudam. A próxima compra continua sugerindo congelado.
- **UX:** na conferência, cada lote tem o campo "Conservação" já preenchido com a sugerida.
  Trocar a classe mostra, na própria linha, o efeito ("o lote entra como resfriado, e o
  recebimento fica registrado com divergência") e um campo de motivo opcional. Nenhum
  passo extra, nenhuma recusa, nenhum item de compra novo para cadastrar às pressas.
- **Cobertura:** `receiving.operations.test.ts › conservação: o lote entra na classe em que
  CHEGOU…` (banco real). A frase da divergência: `conditioning.test.ts › divergência do que
  chegou em relação ao sugerido`.

### EST-REC-05 — "Chegou com validade menor que a exigida no edital"
- **Realidade:** o edital exige 180 dias de validade na entrega, e o lote chega com 40. A
  cozinha precisa do item e aceita, mas o fato tem de ficar registrado para a fiscalização.
- **O sistema precisa:** a validade mínima da especificação é critério de aceite
  **registrado**, não bloqueio. O lote abaixo do mínimo grava "Validade de 40 dias na
  entrega, abaixo do mínimo de 180 da especificação", e o recebimento fica divergente.
- **UX:** nada a fazer além de informar a validade do lote. O motivo aparece na linha e no
  termo impresso.
- **Cobertura:** `conditioning.test.ts › validade abaixo do mínimo vira frase…` (unitário).
  **LACUNA** de integração pela tela.

### EST-ARM-01 — "O freezer parou: o congelado foi para a geladeira"
- **Realidade:** o freezer para durante a semana. O que estava congelado vai para a
  geladeira e passa a descongelar: a validade encolhe para o prazo pós-descongelamento.
- **O sistema precisa:** descongelar é fracionar o lote como `thawed`. O derivado nasce
  **resfriado**, com a validade pós-descongelamento do insumo e o vínculo com o lote de
  origem. Transferir um lote para outra cozinha leva a classe junto.
- **UX:** no lote, "Fracionar → Descongelado", com a quantidade que foi para a geladeira.
  O alerta de validade passa a tratá-lo como resfriado.
- **Cobertura:** `receiving.operations.test.ts › conservação: …descongelado vira
  resfriado; transferido leva a classe` (banco real). **LACUNA:** "o freezer parou" não
  tem gesto próprio. Fracionar lote a lote, sob pressão, é o controle paralelo que o
  catálogo quer evitar. O caminho proposto é uma ação em lote na tela de estoque:
  "descongelar tudo o que está em <local>".

### EST-CNT-01 — "A contagem física não bate com o sistema"
- **O sistema precisa:** ajuste com motivo e trilha, sem apagar o histórico.
- **Cobertura:** suíte de contagem — verificar.

### EST-SAI-01 — "Saiu insumo para a produção sem requisição (emergência)"
- **O sistema precisa:** registrar a saída depois, ligada ao dia/preparação.
- **Cobertura:** hipótese.
