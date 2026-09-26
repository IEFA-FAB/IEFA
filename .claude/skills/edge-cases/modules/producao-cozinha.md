# Produção Cozinha — turno

Menu: **Produção Cozinha**. O turno executa o que o agendamento decidiu e registra o que de fato
aconteceu. Casos aqui são **hipóteses a verificar**, salvo onde "Cobertura" aponta teste.

Arquivos de teste citados:
- `ENB` = `apps/sisub/src/test/operations/execution-never-blocks.operations.test.ts` (banco real)
- `EXU` = `packages/sisub-domain/src/operations/execution.test.ts` (unitário)

Princípio (2026-09-26): na execução, o que falta vira PENDÊNCIA registrada (quem, quando, motivo)
e visível para quem corrige depois; bloqueio só quando imprescindível (segurança alimentar, dupla
baixa, competência fechada). O planejamento — cardápio de outros dias, cardápio-modelo, ficha
técnica — segue exclusivo de `kitchen:2`.

### PC-TRN-01 — "Faltou um insumo no meio da produção"
- **Realidade:** o turno descobre a falta com a panela no fogo.
- **O sistema precisa:** registrar o que faltou E o que entrou no item (mesmo contrato do
  agendamento: `substitute_description` e, quando é insumo do catálogo, `substitute_ingredient_id`;
  tipo `production`), com o turno sozinho (`kitchen-production:1`).
- **UX:** "Ajustes do turno" → insumo que faltou → substitutos previstos na ficha a um clique, ou
  texto livre → motivo → Registrar. O sheet mostra "insumo → substituto".
- **Cobertura:** `ENB › o turno registra o substituto…` · `production-flexibility.operations.test.ts › recordProductionSubstitution concorrente…` (merge atômico e `substitute_description`).

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

### PC-TRN-06 — "Faltou a preparação do cardápio: jogo outra hoje, direto"
- **Realidade:** o feijão não chegou; o turno faz lentilha no almoço, sem a nutricionista na cozinha.
- **O sistema precisa:** o turno inclui a preparação no cardápio de HOJE (Brasília) — cria o cardápio
  da refeição se não existe, grava no item quem incluiu, quando e o motivo, e já gera a tarefa do
  quadro. Outro dia é planejamento e é recusado com a instrução; quem só lê o cardápio
  (`kitchen:1`) não inclui.
- **UX:** quadro do turno (data = hoje) → "Incluir preparação" → refeição, busca da preparação,
  porções (opcional), motivo curto → a tarefa aparece em Pendente com o selo "Incluída no turno".
  O quadro vazio de hoje oferece o mesmo botão (antes mandava ir ao Agendamento).
- **Cobertura:** `ENB › o turno inclui preparação do catálogo HOJE…` · `ENB › outra data é planejamento…` · `EXU › janela de hoje (Brasília)`, `permissão de execução`. Tela sem e2e — hipótese visual.

### PC-TRN-07 — "A preparação que vou fazer não existe no catálogo"
- **Realidade:** "farofa de ovo com a sobra" não tem ficha técnica; o turno faz assim mesmo.
- **O sistema precisa:** no mesmo gesto do PC-TRN-06, criar uma preparação PROVISÓRIA da cozinha
  só com o nome (porções opcionais), marcada como ficha pendente (`recipes.provisional_since`).
  Funciona no dia (quadro, tarefa, saída pela quantidade real); o mesmo nome ainda pendente é
  reaproveitado. NÃO entra em cardápio-modelo — o anexo e a compra dependem da ficha — até a
  nutricionista completar a ficha (salvar a edição cria a versão seguinte sem a marca).
- **UX:** "Incluir preparação" → "Não está na lista — criar provisória" → nome. A tarefa mostra
  "Ficha incompleta — preparação provisória…". A nutricionista vê em Gestão Cozinha → Fluxos →
  "Revisar a execução" → "Completar ficha".
- **Cobertura:** `ENB › preparação que não existe nasce provisória…` (reaproveitamento, recusa no
  modelo, saída da pendência com a nova versão) · `recipes.authz.test.ts › preparação provisória…
  não entra em cardápio-modelo` · gatilho `menu_template_items_no_provisional_recipe` em `ENB › sobra sem congelada…`.

### PC-TRN-08 — "Sobrou e não há preparação congelada cadastrada"
- **Realidade:** sobra de estrogonofe às 14h; o catálogo de congeladas é da SDAB (só `global:2` cria).
- **O sistema precisa:** a sobra entra numa congelada PROVISÓRIA da cozinha
  (`frozen_preparation.provisional_kitchen_id`), criada na mesma transação da sobra, reaproveitada
  pelo nome, visível só para aquela cozinha até a SDAB aceitá-la no catálogo.
- **UX:** Estoque → Baixa por Produção → "Sobra do serviço" → "Não está na lista? Nome da
  congelada" (+ validade em dias, opcional) → Registrar. A SDAB vê "Criadas pelas cozinhas para
  sobra" em Catálogo Global → Preparações Congeladas → "Aceitar no catálogo".
- **Cobertura:** `ENB › sobra sem congelada cadastrada…`. **LACUNA:** o reset do treino não apaga a
  congelada provisória (a tabela é do catálogo, sem `kitchen_id`); fica órfã na cozinha sentinela.

### PC-TRN-09 — "A ficha do item está vazia (sem insumos, sem porções, sem rendimento)"
- **Realidade:** a sugestão de saída vinha vazia (ou calculada como se a receita rendesse 1 porção)
  sem aviso nenhum; o almoxarife achava que o sistema estava quebrado.
- **O sistema precisa:** dizer "ficha incompleta" com o que falta, na tarefa, na sugestão de saída e
  como pendência da nutricionista — sem travar a produção nem a saída.
- **UX:** selo "Ficha incompleta" no card; aviso no sheet da tarefa e no topo da Saída do dia.
- **Cobertura:** `EXU › ficha incompleta` · `execution-review.test.ts › ficha incompleta diz o dia e o que falta` · `ENB` (lacunas da provisória no quadro).
