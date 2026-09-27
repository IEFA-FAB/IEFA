# Gestão Cozinha — Planejamento da Produção

Menu: **Planejamento da Produção** → Cardápios Semanais, Eventos, Cardápios de Apoio, **Agendamento da Produção**.
O agendamento é onde o planejado (semanal, evento, apoio) vira o que se produz em cada dia — e é
onde a realidade chega primeiro. Tudo o que um cardápio pôs num dia é identificado pela origem do
item (`menu_items.origin_template_id`); os imprevistos agem sobre essa origem.

Arquivos de teste citados:
- `INT` = `apps/sisub/src/test/operations/planning-adjustments.operations.test.ts`
- `E2E` = `apps/sisub/e2e/tests/production-scheduling.spec.ts`
- `TPL` = `apps/sisub/src/test/operations/templates.operations.test.ts`

## Cardápios de apoio e viagens

### GC-AGD-01 — "A viagem surgiu hoje: 100 kits de apoio"
- **Realidade:** missão marcada no próprio dia; a cozinha já tem a rotina planejada.
- **O sistema precisa:** o apoio entra SOMANDO ao dia, sem apagar a rotina; aplicar duas vezes não duplica.
- **UX:** no dia → "Aplicar evento ou apoio" → escolhe o apoio → aparece em "Neste dia" com a contagem.
- **Cobertura:** `INT › viagem que surgiu hoje…` · `E2E › viagem que surgiu hoje, adiou…`

### GC-AGD-02 — "A viagem da semana que vem foi cancelada"
- **Realidade:** o apoio já estava no calendário, talvez com porções ajustadas.
- **O sistema precisa:** tudo o que aquele apoio pôs no dia sai; o resto do dia fica; dá para restaurar.
- **UX:** "Neste dia" → "Tirar do dia" → confirmação diz quantas preparações e que vão para a lixeira.
- **Cobertura:** `INT › viagem cancelada…` · `E2E › …e foi cancelada`

### GC-AGD-03 — "A viagem adiou (ou antecipou)"
- **Realidade:** a missão mudou de data depois de planejada e ajustada.
- **O sistema precisa:** os itens MUDAM de dia com porções, trocas, substitutos e tarefas pendentes;
  adiar para uma data que já tem o mesmo apoio é recusado (não dobra a produção). Antecipar é o mesmo gesto.
- **UX:** "Neste dia" → "Adiar" → nova data → toast "N preparações foram para dd/mm/aaaa".
- **Cobertura:** `INT › viagem adiada…` (o dia de origem não fica "planejado" e vazio) · `INT › adiar para uma data que já passou é recusado…` · `E2E › …adiou para a semana que vem, adiou de novo…`

### GC-AGD-04 — "Era hoje e adiou"
- **Realidade:** adiamento no dia; o turno pode já ter começado a produzir.
- **O sistema precisa:** se nada começou, adia como GC-AGD-03 (tarefa pendente vai junto). Se a produção
  já começou, RECUSA mover ou tirar e diz para registrar a sobra do que foi produzido.
- **UX:** mesmo "Adiar"; recusa em toast com a instrução.
- **Cobertura:** `INT › viagem de hoje adiada depois que a produção começou…` · `E2E › …adiou para a semana que vem` (sem produção iniciada)

## Cardápio semanal

### GC-AGD-05 — "Faltou um alimento: troca a preparação"
- **Realidade:** o fornecedor não entregou; a preparação do dia muda.
- **O sistema precisa:** o item troca de preparação mantendo porções, porcentagem, grupo, posição e
  origem; o motivo fica no item e chega à Produção Cozinha.
- **UX:** no item → "Trocar preparação" → escolhe a nova → informa o motivo → selo "Trocada (era X)".
- **Cobertura:** `INT › faltou um alimento…` (inclui: reaplicar o mesmo cardápio não traz a original de volta) · `E2E › cardápio semanal: faltou um alimento…`

### GC-AGD-06 — "Faltou um insumo: substituto dentro da preparação"
- **Realidade:** a preparação fica, um ingrediente muda (laranja → acerola).
- **O sistema precisa:** o substituto fica registrado no item do dia (a ficha técnica não muda);
  os substitutos previstos na ficha aparecem primeiro, o resto se digita.
- **UX:** no item → "Substituir insumo" → escolhe o insumo que faltou → substituto → motivo → selo "1 insumo substituído".
- **Cobertura:** `INT › faltou um insumo…` (dois registros seguidos não se apagam: merge atômico) · `E2E › …faltou um insumo…`

### GC-AGD-07 — "Faltou luz (ou água): o dia inteiro muda"
- **Realidade:** sem cocção; entra o cardápio de contingência (refeição fria).
- **O sistema precisa:** o planejado do dia vai para a lixeira e a contingência entra, numa transação
  (nunca um dia vazio no meio); produção de pedido de lanche aceito fica.
- **UX:** no dia → "Trocar o dia" → escolhe o apoio de contingência → alerta do que acontece → confirma.
- **Cobertura:** `INT › faltou luz ou água…` · `E2E › …e depois faltou luz no dia`

## Eventos

### GC-AGD-08 — "Surgiu um evento"
- **Realidade:** solenidade marcada com pouca antecedência.
- **O sistema precisa:** o evento entra no dia somando à rotina, cada refeição do evento no seu horário,
  com o efetivo e a % de cada preparação.
- **UX:** no dia → "Aplicar evento ou apoio" (ou, no editor do evento, "Aplicar ao Calendário").
- **Cobertura:** `E2E › evento que surgiu…` · `TPL › evento: a porcentagem da preparação incide sobre o efetivo…`

### GC-AGD-09 — "Faltou luz antes do evento: troca só o cardápio do evento"
- **Realidade:** o evento continua, mas sem cocção; a rotina do dia é outro problema.
- **O sistema precisa:** sai só o que o evento pôs; entra o de contingência; a rotina não é tocada.
- **UX:** "Neste dia" → "Tirar do dia" no evento → "Aplicar evento ou apoio" com a contingência.
- **Cobertura:** `INT › evento que surgiu e depois teve o cardápio trocado…` · `E2E › …teve só o seu cardápio trocado`

### GC-EVT-01 — "Duas refeições do evento no mesmo horário"
- **Realidade:** coquetel e jantar, os dois à noite, com a mesma bebida.
- **O sistema precisa:** um cardápio do dia só, com a demanda de cada refeição pelo efetivo de cada uma (300 + 200 = 500).
- **Cobertura:** `TPL › evento: duas refeições no mesmo horário somam a demanda…`

## Lacunas conhecidas (imprevisto sem caminho completo)

### GC-AGD-10 — "Só uma refeição do evento foi cancelada"
- **Hoje:** "Tirar do dia" age sobre o evento INTEIRO; tirar só o coquetel é item a item.
- **Caminho proposto:** agrupar "Neste dia" por refeição do evento (a origem de cada item + a refeição).
- **Cobertura:** **LACUNA**

### GC-AGD-11 — "Troca só o almoço (falta de gás no fogão grande)"
- **Hoje:** "Trocar o dia" troca TODAS as refeições; trocar uma só é remover e aplicar.
- **Caminho proposto:** "Trocar o dia" com escolha das refeições atingidas.
- **Cobertura:** **LACUNA**

### GC-AGD-12 — "O cardápio já publicado para o comensal mudou"
- **Hoje:** o status PUBLICADO é só leitura (nenhuma operação o grava); o comensal vê a mudança sem aviso.
- **Caminho proposto:** publicar/despublicar pelo agendamento e sinalizar ao comensal o que mudou.
- **Cobertura:** **LACUNA**

### GC-AGD-13 — "Menos gente do que o previsto (dispensa, exercício)"
- **Hoje:** "Quantitativo do dia" regrava o efetivo e as porções derivadas; porção digitada à mão fica.
- **Cobertura:** parcial — hipótese, sem teste de ponta a ponta.

### GC-AGD-14 — "Feriado/ponto facultativo: o semanal não vale naquele dia"
- **Hoje:** "Tirar do dia" no cardápio semanal resolve (mesma operação de GC-AGD-02).
- **Cobertura:** hipótese — coberto pela operação, sem teste dedicado.

## Previsão de demanda (fluxo "Prever demanda para compra")

### GC-PRV-01 — "Enviei a previsão e não sei se a unidade usou"
- **O sistema precisa:** a previsão passa a "Recebida pela unidade" com data e o nome dos anexos
  em que entrou.
- **UX:** aparece na lista de previsões e no fluxo da cozinha.
- **Cobertura:** `procurement-flows.operations.test.ts`; e2e `procurement-flows.spec.ts`.

### GC-PRV-02 — "Apoio cadastrado sem ocorrências mensais"
- **O sistema precisa:** avisar antes do envio: a unidade multiplica o apoio pelas ocorrências e
  zero não compra nada.
- **Cobertura:** `lib/flows/flows.test.ts`.

### GC-PRV-03 — "Insumo do cardápio sem item de compra"
- **O sistema precisa:** avisar a nutricionista de que a unidade não consegue comprá-lo, dizendo
  quem vincula (catálogo global), em vez de o item sumir do anexo sem explicação.
- **Cobertura:** `lib/flows/flows.test.ts`. **LACUNA:** não há aviso para o catálogo global; a
  nutricionista precisa comunicar por fora.

## Execução do dia (fluxo "Revisar a execução")

O turno não espera o planejamento (Produção Cozinha, PC-TRN-06 a 09). O que ele resolveu chega à
nutricionista em Fluxos → "Revisar a execução", com quem, quando e por quê. Nada ali é bloqueio.
`ENB` = `apps/sisub/src/test/operations/execution-never-blocks.operations.test.ts`.

### GC-EXE-01 — "O turno incluiu uma preparação no dia sem me avisar"
- **O sistema precisa:** a inclusão fica no item (`added_in_execution_*`, `execution_reason`) e
  aparece como pendência até a nutricionista marcar revisada (`kitchen:2`); o turno não revisa.
- **UX:** Fluxos → "Revisar a execução" → "Inclusões do turno para revisar" → "Marcar revisada".
- **Cobertura:** `ENB › o turno inclui preparação do catálogo HOJE…` (pendência e revisão) · `lib/flows/execution-review.test.ts`.

### GC-EXE-02 — "Tem ficha provisória para completar"
- **O sistema precisa:** listar a provisória sem versão posterior, com quantas vezes já foi usada;
  ela some sozinha quando a ficha é salva (nova versão).
- **Cobertura:** `ENB › preparação que não existe nasce provisória…` · `execution-review.test.ts › ficha provisória leva à tela…`.

### GC-EXE-03 — "Quero pôr no cardápio-modelo a preparação criada no turno"
- **O sistema precisa:** recusar com a instrução ("complete a ficha"): o anexo quantitativo e a
  compra saem do modelo, e sem ficha eles não compram nada. É o bloqueio imprescindível da execução.
- **Cobertura:** `recipes.authz.test.ts › preparação provisória…` · `ENB`.
