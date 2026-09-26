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

### EST-REC-06 — "O pão chega todo dia com a guia; a NF-e é semanal"
- **Realidade:** a padaria entrega 7 kg por dia com a guia de remessa e emite uma NF-e na
  sexta com os 35 kg da semana.
- **O sistema precisa:** cada entrega é um recebimento `delivery_note` efetivado no dia (o pão
  é consumido no dia). A NF-e chega e se vincula às cinco entregas: cada linha casa com o
  MESMO item da nota, o custo vem da linha da nota (R$/kg), nunca do valor da semana dividido
  pelo pão de um dia, e nada muda no estoque nem reabre a efetivação. A nota que fecha
  entregas não gera recebimento próprio (o pão seria contado duas vezes), e recusar uma das
  entregas não recusa a nota das outras.
- **UX:** Recebimentos → "Entrega sem NF-e" (guia, quem entregou, itens). Na sexta, em cada
  recebimento, "Documentos → NF-e → Vincular"; a lista sugere a nota do mesmo CNPJ. "A caminho"
  mostra as entregas da semana sem nota até o vínculo. A NE que ainda não está no sistema se
  registra no próprio vínculo ("Registrar NE"), e sai vinculada.
- **Cobertura:** `receiving-links.operations.test.ts › pão: guia de remessa todo dia, NF-e
  semanal vinculada depois…` (banco real; escrito, depende de 20260926214000/215000 aplicadas);
  `receiving-links.test.ts › cinco entregas da semana podem casar com o MESMO item` e
  `› pão da segunda casa… com o custo da LINHA DA NOTA` (unitário). **LACUNA:** e2e pela tela.

### EST-REC-07 — "A carne chegou antes da nota" / "veio remessa do depósito"
- **Realidade:** o fornecedor entrega e a NF-e só chega no dia seguinte; ou o depósito de
  subsistência manda uma remessa que nunca terá NF-e de fornecedor.
- **O sistema precisa:** recebimento `ad_hoc` (ou guia) com os itens informados na
  conferência; a NF-e, a OF e o empenho se vinculam depois. A entrega que "não terá NF-e"
  (remessa, apoio de outra OM) não fica pendente de nota para sempre.
- **UX:** "Entrega sem NF-e", com o interruptor "Esta entrega terá NF-e". As pendências
  aparecem em "A caminho → O que já chegou e ainda falta documento", cada uma com o atalho
  para o recebimento.
- **Cobertura:** `receiving-links.operations.test.ts › entrega sem NF-e: a de compra fica
  pendente de nota; a remessa do depósito, não`; `expense-execution.test.ts (domínio) ›
  remessa de depósito não espera nota nem empenho`.

### EST-REC-08 — "Chegou a entrega e ninguém foi designado fiscal"
- **Realidade:** a carne está na porta e a designação do fiscal ainda não saiu (ou saiu e
  ninguém cadastrou).
- **O sistema precisa:** a conferência física (itens, lotes, temperatura, validade) é
  registrada por quem tem `storage:2`, sem designação. O provisório continua exigindo fiscal
  designado (Lei 14.133/2021, art. 140, II, a) e confirma o que já foi conferido, sem
  redigitar. A pendência "conferência sem fiscal designado" aparece no Estoque e, contada, na
  Gestão Unidade.
- **UX:** no recebimento, o aviso "Sem fiscal designado para esta entrega": quem tem `unit:2`
  vê "Designar agora" (o ato, o número do boletim, a vigência) e confirma em seguida; quem não
  tem lê "Peça a designação ao chefe do rancho (Gestão Unidade → Designações)".
- **Cobertura:** `receiving-links.operations.test.ts › designar agora…`; `designations.test.ts`
  (mensagem). **LACUNA:** e2e do "Designar agora".

### EST-REC-09 — "Vai efetivar o definitivo e não há gestor nem comissão designada"
- **O sistema precisa:** recusa com quem designa e onde (art. 140, II, b); o provisório fica.
- **Cobertura:** `receiving-links.operations.test.ts › definitivo sem gestor ou comissão…`
  (a regra no banco e a frase). **LACUNA:** a recusa pela server fn (`finalizeReceiptFn`) não
  tem teste que rode o handler.

### EST-REC-10 — "A SEFAZ está fora do ar e a carne está na porta"
- **Realidade:** o portal de consulta não responde; sem a consulta registrada a efetivação era
  recusada, e a carne ficava "por fora" até alguém lançar.
- **O sistema precisa:** efetivar com a consulta pendente, com motivo, quem e quando; o
  estoque entra. A liquidação continua exigindo a consulta recente (Lei 4.320, art. 63). Nota
  que a SEFAZ já disse cancelada nunca passa. A pendência some quando a consulta autorizada
  é registrada depois da efetivação.
- **UX:** no recebimento, o aviso "Consulta da NF-e pendente"; "Efetivar definitivo" pede o
  motivo ("Portal da SEFAZ fora do ar desde as 10h") e efetiva com pendência.
- **Cobertura:** `receiving-links.operations.test.ts › SEFAZ fora do ar…`;
  `receipt-invoice-gate.test.ts` (inclui "a liquidação … continua recusada").

### EST-REC-11 — "A entrega inteira veio estragada"
- **O sistema precisa:** recusar o recebimento todo, com motivo; nada entra no estoque e ele
  não sustenta liquidação. A decisão tem colunas próprias (`rejected_at`/`rejected_by`,
  20260926205000), nunca `definitive_at`.
- **UX:** "Recusar entrega" no recebimento aberto (nível 3, com designação de gestor ou
  comissão); o cabeçalho e o termo mostram "Recusado em" e o motivo.
- **Cobertura:** `invoice-gate.test.ts` (recusado não sustenta liquidação). **LACUNA:** teste
  de integração da recusa pela tela.

### EST-REC-12 — "Vinculei a NF-e errada à entrega"
- **O sistema precisa:** trocar a nota enquanto não houver liquidação; depois dela, a NF-e e o
  empenho em que a NS se apoia não mudam (a função recusa dizendo por quê). O recebimento
  criado DA nota não troca de nota.
  Trocar de nota desliga as linhas que não casam com a nova e, aberto o recebimento, tira o
  custo que veio da antiga. Liquidado, o empenho só pode ser a NE que a NS debitou; com OF, o
  empenho é o da OF, e a OF aguardando empenho recebe a NE nela mesma (com o SICAF).
- **Cobertura:** `receiving-links.operations.test.ts › trocar de NF-e…`, `› recebimento
  liquidado…`, `› OF de E1 não convive com o empenho E2…` (escritos, não rodados).

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
