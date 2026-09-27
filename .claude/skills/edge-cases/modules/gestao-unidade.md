# Gestão Unidade — anexo quantitativo do TR, ARP, empenho, contratação de origem

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

## Pesquisa de preços (IN SEGES/ME 65/2021)

Irregularidade na pesquisa não trava o preço: vira não conformidade gravada no item pesquisado
(`non_compliance_reasons`), com a base e o que fazer, e a justificativa correspondente a resolve
(colunas `justification_*`, migration `20260926211000`). A regra é uma só
(`sisub-domain/operations/price-research-compliance.ts`), usada pelo modal, pela gravação, pelo
lote e pelo worker da API. Texto conferido na IN consolidada em gov.br/compras.

### GU-PRC-01 — "A pesquisa só achou 2 preços"
- **Realidade:** item regional ou pouco comprado; o Compras.gov.br devolve 2 contratações no ano.
- **O sistema precisa:** o preço pode ser usado; a pesquisa fica não conforme ("Menos de 3 preços
  válidos", art. 6º, caput e § 5º) até a justificativa, que vai à aprovação da autoridade.
- **UX:** no modal da pesquisa, o quadro de não conformidades aparece sob as estatísticas com a
  caixa "Justificativa da amostra reduzida"; preenchida (10+ caracteres), a pendência passa a
  "justificada" e o "Usar" grava a justificativa junto.
  No relatório de pesquisa de preços, a justificativa tira o aviso do checklist e sai nas
  excepcionalidades (seção 7), com o texto; sem ela, o espaço fica em branco para preencher.
- **Cobertura:** `price-research-compliance.test.ts › menos de 3 preços…`, `› a justificativa da
  amostra reduzida resolve…`; `price-research-report.test.ts › justificativa da amostra reduzida
  tira o aviso…`. **LACUNA:** o modal não tem teste de componente nem e2e.

### GU-PRC-02 — "Os preços vêm todos do mesmo órgão"
- **Realidade:** 5 preços, 2 UASGs.
- **O sistema precisa:** não conformidade "Menos de 3 UASGs distintas", atribuída ao critério da
  unidade (a IN não fixa número de órgãos), resolvida pela mesma justificativa da amostra reduzida.
- **Cobertura:** `price-research-compliance.test.ts › 3 UASGs é critério da unidade, não da IN`.

### GU-PRC-03 — "A amostra não tem data"
- **Realidade:** a API devolve contratação sem `dataResultado` nem `dataCompra`.
- **O sistema precisa:** a amostra aparece na tabela (selo "sem data") e fica fora do cálculo:
  sem data não há como mostrar que o preço é de até 1 ano (art. 5º, II). Quem a inclui (botão
  "N sem data: fora do cálculo") registra a não conformidade "amostra sem data de referência",
  resolvida pela justificativa do período (art. 5º, § 3º). Antes de incluídas, as linhas sem data
  não se selecionam, e "Selecionar todos" não as pega. O lote e o worker da API sempre as deixam
  fora.
- **Cobertura:** `price-research-utils.test.ts › janela de recência` (filtro, partição, funil do
  `autoSelectPrice`, `› sem data só é selecionável depois de incluída…`);
  `price-research-compliance.test.ts › amostra sem data no cálculo…`,
  `› complianceFactsOf…`; `apps/api/.../analyzer.test.ts › amostra sem data fica fora…`.

### GU-PRC-04 — "Quero ver o histórico todo do item"
- **Realidade:** consulta exploratória, ou item sem compra no último ano.
- **O sistema precisa:** "Todo o histórico" continua disponível; a pesquisa gravada com ele (ou com
  janela > 12 meses) fica não conforme citando o art. 5º, I e II, e § 3º, até a justificativa do
  preço fora do prazo (que pede o índice de atualização, não aplicado pelo sistema).
- **Cobertura:** `price-research-compliance.test.ts › todo o histórico e janela maior que 12 meses…`.
- **Decisão:** a janela conta da data da pesquisa, não do edital: é o marco do art. 5º, II (e a
  fonte daqui é o inciso I, Painel de Preços). A divulgação do edital só é marco dos incisos III,
  IV e V. **LACUNA:** quando o sistema tiver essas fontes, a janela delas precisa da data prevista
  de divulgação, que não existe com confiança (`procurement_segment.planned_month` é o mês de
  início do processo, não do edital).

### GU-PRC-05 — "Tirei amostras à mão"
- **Realidade:** o pregoeiro desmarca preços de outro estado ou de embalagem atípica, por
  seleção de linhas ou filtro de coluna, em vez do IQR automático.
- **O sistema precisa:** não conformidade "amostras escolhidas à mão" (art. 6º, § 3º, e art. 3º,
  VI) até o critério ser descrito. O servidor não confia no flag do cliente: deriva a seleção
  manual quando somem amostras entre a janela e a classificação, ou quando a classificação não é a
  do IQR automático, e grava o fato em `manual_selection`, que o relatório lê.
- **Cobertura:** `price-research-compliance.test.ts › seleção manual pede o critério…`,
  `› deriveManualSelection`; `price-research-report.test.ts › seleção manual sai do fato gravado…`.

### GU-PRC-06 — "Quero usar o menor preço"
- **O sistema precisa:** o menor valor é método do art. 6º, caput: "Usar" no Mínimo grava
  `lowest`, sem pendência. Método fora de média/mediana/menor pede justificativa (art. 6º, § 1º);
  hoje nenhuma tela o oferece.
- **Cobertura:** `price-research-utils.test.ts › menor valor é método do art. 6º, caput…`;
  `price-research-compliance.test.ts › menor preço é método do caput…`.

### GU-PRC-08 — "Reabri o relatório do mês passado"
- **O sistema precisa:** a emissão mostra o que foi emitido. O checklist e as excepcionalidades
  ficam congelados na emissão; emissão anterior a esta regra se lê pela regra da época, com o
  texto da época.
- **Cobertura:** `price-research-report.test.ts › emissão registrada`.

### GU-PRC-07 — "O lote pesquisou 200 itens e 12 ficaram com poucos preços"
- **O sistema precisa:** o preço é aplicado; o toast do lote usa as não conformidades que o
  servidor gravou e separa as que se resolvem por justificativa (abrir a pesquisa do item e
  justificar) das que só refazendo resolvem (unidade herdada). A nova pesquisa com justificativa é
  outra memória de cálculo (chave de idempotência v3 inclui janela, seleção e justificativas).
- **Cobertura:** **LACUNA:** o toast não tem teste, e a tabela do anexo não marca quais itens
  estão não conformes (o usuário só descobre reabrindo a pesquisa de cada um). Menor caminho:
  selo "não conforme" por item na `AtaItemsTable`, lido do último `procurement_pesquisa_preco_item`.


## Execução da despesa (contratação de origem, NE, SIAFI)

Change `sisub-flexible-expense-execution`. A regra: quem esqueceu um documento não trava quem está
trabalhando; o sistema registra o fato e mostra a pendência. Os testes de integração abaixo estão
escritos e só rodam depois de aplicada a migration `20260926214000`.

### GU-ORG-01 — "Comprei por dispensa; não tenho ata nem anexo"
- **Realidade:** carne para a formatura por dispensa do art. 75, II. Ninguém fez anexo quantitativo;
  a NE já saiu no SIAFI.
- **O sistema precisa:** a contratação `dispensa` nasce só com o tipo; o que falta (fundamento,
  fornecedor, vigência, objeto, ramo, valor) vira pendência "Dispensa sem …", nunca recusa. A NE
  aponta para ela.
- **UX:** Gestão Unidade → Contratações de origem → Nova contratação (só o tipo é obrigatório);
  completa no card, que grava sozinho.
- **Cobertura:** `acquisition-origin.operations.test.ts › dispensa só com o tipo…`;
  `acquisition.test.ts › completude da contratação`.

### GU-ORG-02 — "Terceira dispensa de carnes no ano"
- **Realidade:** duas dispensas de carnes (classe 8905) já somam R$ 48 mil; a nova, de R$ 20 mil,
  passa do limite de 2026 (R$ 65.492,11, Decreto 12.807/2025).
- **O sistema precisa:** somatório por unidade gestora, exercício, inciso e ramo de atividade (art.
  75, § 1º; IN SEGES/ME 67/2021, art. 4º), com o limite da tabela `direct_contract_limit`. Acima do
  limite: aviso com o total e a composição; a contratação só fica completa com a justificativa.
  Dispensa sem valor não conta como zero — o total vira piso e o aviso diz isso. Ano sem limite
  cadastrado usa o último e pede o cadastro.
- **UX:** a prévia do somatório aparece no diálogo de criação, antes de gravar, e no card.
- **Cobertura:** `acquisition.test.ts › somatório da dispensa (art. 75, § 1º)`;
  `acquisition-origin.operations.test.ts` (limites semeados). **LACUNA:** tela para cadastrar o
  limite de um ano novo (hoje é linha nova na tabela, por migration).

### GU-ORG-03 — "Aderi à ata de outro órgão (carona)"
- **Realidade:** a unidade não participou do registro de preços da UASG 120001 e quer aderir.
- **O sistema precisa:** contratação `registro_precos` com papel `nao_participante`; a ARP entra sem
  anexo quantitativo, ligada à contratação, e os empenhos apontam para os itens dela.
- **UX:** no card da contratação, "Buscar no Compras.gov.br" (importa sem anexo) ou "Cadastrar à mão".
- **Cobertura:** `acquisition-origin.operations.test.ts › carona sem anexo → uma NE com três itens…`.

### GU-ORG-04 — "O Compras.gov.br está fora do ar e preciso empenhar hoje"
- **O sistema precisa:** ARP e itens cadastrados à mão, marcados "não sincronizada"
  (`source = 'manual'`, `last_synced_at` nulo); a primeira importação bem-sucedida atualiza os itens
  pelo número (índice único por ARP + número), sem duplicar. A NE sobre ARP não sincronizada avisa
  que o saldo oficial não foi conferido.
- **UX:** "Cadastrar à mão" no card da contratação; badge "não sincronizada" até importar.
- **Cobertura:** `empenho-conformity.test.ts › ARP à mão não sincronizada…`; a atualização pelo
  número está em `importArpItemsFn` (sem teste de integração: depende da API externa — **LACUNA**).

### GU-ORG-05 — "Apagaram o anexo quantitativo que tinha ARP e empenhos"
- **O sistema precisa:** a ARP fica sem anexo (`SET NULL`), os empenhos ficam intactos; apagar item
  de ARP ou ARP com empenho é recusado (`RESTRICT`). Reimportar a ARP de outro anexo mantém o
  vínculo existente e avisa, em vez de trocar em silêncio.
- **Cobertura:** `acquisition-origin.operations.test.ts › anexo apagado não leva ARP nem empenho…`.

### GU-NE-01 — "Uma NE para arroz, feijão e óleo da mesma ata"
- **O sistema precisa:** um empenho com três itens (`finance.empenho_item`); o comprometimento local
  de cada item da ARP soma só o seu item; o retrato oficial do Compras.gov.br não é tocado. A OF de
  qualquer dos três é conferida pelo valor vigente da NE. Preço diferente do registrado, quantidade
  acima do saldo e data fora da vigência da ata são avisos.
- **UX:** "Empenhar itens" na ARP ou "Registrar NE" na contratação: quantidade por item da ata,
  itens livres, ou só o valor (estimativa/global).
- **Cobertura:** `acquisition-origin.operations.test.ts › carona sem anexo → uma NE com três itens…`;
  `empenho-conformity.test.ts`; `supply-order-gate.test.ts › NE com três itens…`.

### GU-NE-02 — "A NE saiu no SIAFI e ninguém importou; a carne chega amanhã"
- **O sistema precisa:** registro rápido (número, data, valor, favorecido) no próprio lugar — Gestão
  Unidade ou, pelo almoxarife com `storage:2`, na cozinha —, idempotente pelo número. A OF pode sair
  aguardando empenho e a NE se vincula depois, com o teto conferido no vínculo. O import do SIAFI
  completa a NE pelo número (classificação e favorecido), sem trocar o valor; diferença de valor fica
  na conciliação.
- **UX:** `QuickEmpenhoForm`/`QuickEmpenhoDialog` (`components/features/unit/finance/QuickEmpenhoForm.tsx`);
  "Registro rápido de NE" na tela de contratações; a NE aparece em "NE sem contratação de origem"
  com o vínculo ao lado.
- **Cobertura:** `acquisition-origin.operations.test.ts` (OF aguardando empenho e vínculo depois;
  NE registrada à mão completada pelo número). **LACUNA:** o botão na tela da OF e do recebimento é do
  PR de Estoque (tarefas 3.x), que usa o componente.

### GU-SIAFI-01 — "A NS foi importada antes da NE"
- **O sistema precisa:** a NS fica estacionada (`import_row.parse_status = 'waiting_parent'`) com
  "Aguardando a NE …"; quando a NE chega (lote do SIAFI ou registro rápido), a NS vira liquidação
  sem nova ação. OB à espera da NS, idem. A religação é uma função só
  (`siafi_integration.relink_waiting_rows`), chamada pelo import e pelo registro da NE.
- **UX:** a tela do SIAFI lista os documentos à espera e o que cada um espera.
- **Cobertura:** `acquisition-origin.operations.test.ts › NS antes da NE fica estacionada…`.

### GU-SIAFI-02 — "Uma linha do lote não gravou"
- **Realidade:** antes, a NE sem item de ARP morria na constraint, o erro era ignorado e o lote
  ficava "aplicado" sem o documento.
- **O sistema precisa:** o lote aplica numa transação só; erro em qualquer linha não grava nada, o
  lote fica `failed` com a mensagem e pode ser aplicado de novo.
- **UX:** badge "falhou" com a mensagem e o botão "Aplicar de novo".
- **Cobertura:** `acquisition-origin.operations.test.ts › NE registrada à mão… erro de gravação não
  grava nada e o lote se reaplica`.

### GU-SIAFI-03 — "Anular a NE que já tem liquidação ou OF enviada"
- **O sistema precisa:** a anulação passa pelo evento e pelo piso, que é o MAIOR entre o liquidado
  (o que foi liquidado não se desfaz por anulação) e o já pedido em Ordens de Fornecimento não
  canceladas (o fornecedor recebeu a ordem e vai entregar). A NE liquidada não se anula inteira: a
  recusa diz para anular só o saldo a liquidar; abaixo do pedido, diz para cancelar ou reduzir a OF
  antes. O valor da anulação total é lido dentro da transação, sob o lock do evento: um reforço
  concorrente não sobra numa NE "anulada".
- **Cobertura:** `budget-execution.operations.test.ts` (piso do liquidado);
  `acquisition-origin.operations.test.ts › anulação não desce abaixo do que as OFs já pediram…`;
  `expense-execution.test.ts › planEmpenhoCancellation`.

### GU-REP-01 — "Estoque baixo: o sistema sugeriu supermercado virtual"
- **O sistema precisa:** Supermercado Virtual e Contrata+Brasil só quando o valor cabe no que resta do
  limite da dispensa no ramo (classe do CATMAT) da unidade compradora; urgência sozinha não autoriza
  dispensa (a de emergência, art. 75, VIII, tem processo próprio).
- **Cobertura:** `replenishment.test.ts › decideChannel`; `acquisition.test.ts`.
## Execução da despesa (fluxo "Executar despesa", designação)

### GU-DES-01 — "Ninguém sabe quem é o fiscal do contrato"
- **Realidade:** a designação saiu em boletim, mas não havia onde registrá-la: todo
  recebimento parava no provisório.
- **O sistema precisa:** tela de designações (`unit:2`) de fiscal, gestor e comissão, com o ato
  (número do boletim ou da portaria, obrigatório no `ato`), a vigência e o escopo (OM toda,
  contratação, ARP ou empenho). A nota de empenho não designa ninguém (Lei 4.320, art. 58).
  Registro auditado.
- **UX:** Gestão Unidade → Designações → "Nova designação"; o fluxo "Executar despesa" mostra
  "Nenhum fiscal designado" e "Nenhum gestor ou comissão designada", com o atalho.
- **Cobertura:** `lib/flows/expense-execution.test.ts › sem fiscal nem gestor designado…`;
  `receiving-links.operations.test.ts › designar agora…` (CHECK do ato e fonte `empenho`
  recusada). **LACUNA:** `createDesignation` pelo domínio no banco real (a pessoa precisa de
  permissão na OM, e o seed de permissão passa pela função auditada).

### GU-DES-04 — "O chefe do rancho quer se designar gestor e efetivar ele mesmo"
- **O sistema precisa:** quem pode efetivar o definitivo não se designa gestor nem comissão do
  definitivo (segregação de funções, Lei 14.133/2021, art. 7º, § 1º; art. 140, II, b). A recusa
  lista quem mais tem Gestão Unidade nível 2 na OM; sem ninguém, diz para pedir a concessão.
  Designar-se fiscal passa. O formulário não pré-escolhe a própria pessoa.
- **Cobertura:** `designations.test.ts › selfDesignationProblem`. **LACUNA:** caso no banco real.

### GU-DES-05 — "Destituíram o fiscal às 9h"
- **O sistema precisa:** encerrar vale a partir de hoje (`valid_to` = ontem); a que começou hoje
  e já sustenta termo não se apaga.
- **Cobertura:** `designations.test.ts › planEndDesignation`;
  `receiving-links.operations.test.ts › designação encerrada hoje deixa de valer hoje`.

### GU-DES-02 — "O fiscal saiu de férias; o substituto recebe"
- **O sistema precisa:** designação marcada como substituto; a busca prefere a do titular e a
  mais específica (empenho, ARP, contratação, OM).
- **Cobertura:** hipótese (a ordem está em `inventory.find_designation`; sem teste).

### GU-DES-03 — "Apagaram a ARP (ou o empenho) de uma designação"
- **O sistema precisa:** a designação é a prova do ato que sustenta o termo: empenho, ARP e
  contratação passam a `ON DELETE RESTRICT`; o reset de treino apaga a designação antes do
  empenho.
- **Cobertura:** **LACUNA** no banco real (validado no smoke local da migration 20260926215000).

### GU-EXE-01 — "A NE foi importada do SIAFI e ninguém sabe de que contratação ela é"
- **O sistema precisa:** a NE entra e é usável; "sem contratação de origem" (sem
  `acquisition_id` e sem item de ARP) é pendência no fluxo, e some quando a NE é vinculada.
- **UX:** o atalho leva a Gestão Unidade → Contratações de origem, que lista as NEs sem origem.
- **Cobertura:** `lib/flows/expense-execution.test.ts › NE sem contratação de origem…` e
  `› pendência some quando o dado aparece`. A leitura (`fetchExpenseExecutionStatus`) não tem
  caso no banco real: **LACUNA**.

### GU-EXE-02 — "A OF saiu em emergência, sem empenho"
- **O sistema precisa:** a etapa "Ordens de fornecimento" bloqueia (a OF não), citando a Lei
  4.320, art. 60, e leva a registrar a NE.
- **Cobertura:** `lib/flows/expense-execution.test.ts › OF enviada sem empenho bloqueia a
  etapa`. A OF sem empenho é do PR da contratação de origem (tarefa 2.6).

### GU-EXE-03 — "A NS chegou do SIAFI antes da NE"
- **O sistema precisa:** a NS estacionada aparece no fluxo com o número da NE que falta, e o
  atalho para o SIAFI.
- **Cobertura:** `lib/flows/expense-execution.test.ts › NS estacionada…`;
  `expense-execution.test.ts (domínio) › groupSiafiWaiting`. O estacionamento é do PR do SIAFI.

### GU-EXE-04 — "A conciliação dizia 'sem liquidação' para todo recebimento"
- **Realidade:** a view físico × contábil ligava por `goods_receipt.liquidacao_id`, que deixou
  de ser gravado; e uma entrega liquidada em duas NS não somava.
- **O sistema precisa:** ligar pela liquidação que aponta o recebimento, somando as parcelas;
  recusado fora (não tem `definitive_at`).
- **Cobertura:** `receiving-links.operations.test.ts › físico × contábil liga pela liquidação…`.

### GU-EXE-05 — "Dispensa sem valor, ou acima do limite sem justificativa"
- **O sistema precisa:** o fluxo usa as regras da tela de contratações (`acquisitionGaps`,
  `computeDispensaSum`): dispensa sem valor avisa que o somatório do art. 75, § 1º, é um piso;
  acima do limite sem justificativa pede a justificativa, com o atalho para a contratação.
- **Cobertura:** `expense-execution.test.ts (domínio) › summarizeAcquisitions`;
  `lib/flows/expense-execution.test.ts › dispensa acima do limite sem justificativa…` e
  `› contratação incompleta… dispensa sem valor…`.


## Execução financeira (crédito, NC, NS, OB, restos a pagar)

### GU-FIN-01 — "A NE saiu em 339030 e o crédito dessa ND já tinha acabado"
- **Realidade:** o SIAFI emitiu a NE (ou ela foi emitida antes da NC chegar), e o crédito de
  material de consumo da UG estava zerado; o de serviços (339039) tinha sobra.
- **O sistema precisa:** conferir a NE contra a linha de crédito DA classificação dela (UG, ND,
  PTRES, fonte, exercício), somando só os empenhos daquela classificação, pelo valor vigente.
  Crédito de outra ND não "cobre" a NE. Insuficiente vira AVISO com a norma (Lei 4.320, art. 59),
  nunca recusa: o ato já foi praticado no SIAFI.
- **UX:** na tela de NE, ao digitar valor e ND, o aviso aparece ao lado ("Crédito insuficiente em
  ND 339030…"), e o registro segue.
- **Cobertura:** `packages/sisub-domain/src/operations/budget-math.test.ts ›
  checkCreditForClassifiedEmpenho` (o empenho de outra ND não derruba o crédito desta).
  Ligado no registro de empenho do painel da ARP (`EmpenhoBalancePanel`). NE do mesmo dia do
  snapshot entra (dia civil de Brasília): `budget-math.test.ts › NE com data do mesmo dia…`.
  **LACUNA:** a tela de NE com itens (tarefa 2.4) ainda não chama o hook.

### GU-FIN-02 — "Chegou uma NC nova, e depois devolveram parte do crédito"
- **O sistema precisa:** registrar a NC (número, UG emitente e favorecida, esfera, PTRES, fonte,
  ND, PI, UGR, valor) e a anulação dela como outra NC, sem editar a primeira; a soma das NC da
  classificação aparece ao lado do crédito recebido do snapshot e avisa quando não fecha.
- **UX:** Crédito Disponível → "Notas de crédito" → Registrar NC. Coluna "NC registradas" com
  "não fecha" quando falta NC.
- **Cobertura:** `budget-math.test.ts › sumCreditNotesForLine`; integração
  `budget-execution.operations.test.ts › NC, RP em duas parcelas…` (escrita, não rodada no PR).
  **LACUNA:** import de NC pelo SIAFI (`import_batch.report_type` não aceita `nc`).

### GU-FIN-03 — "Em 31/12 parte do empenho foi liquidada e não paga, parte nem liquidada"
- **Realidade:** NE de R$ 10.000; entregas de R$ 6.000 liquidadas, R$ 4.000 pagos; o resto da
  entrega fica para janeiro.
- **O sistema precisa:** inscrever as DUAS parcelas pelo saldo de 31/12: R$ 2.000 em RP
  processado e R$ 4.000 em RP não processado (Lei 4.320, art. 36). A OB de janeiro não muda o
  inscrito. Rodar de novo não soma: se o saldo de 31/12 mudou (NS retroativa), o conjunto é
  substituído e as parcelas antigas ficam como histórico. Empenho inscrito pelo caminho antigo
  (um tipo só) vira parcelas, sem inscrever de novo.
- **UX:** Pagamentos → "Restos a pagar": prévia por empenho com as duas colunas, e um botão.
- **Cobertura:** `finance-compliance-math.test.ts › restos a pagar em duas parcelas` (saldo de
  31/12 com OB em janeiro, recálculo sem soma, migração do legado); integração
  `budget-execution.operations.test.ts` (unicidade da parcela vigente e trilha). **LACUNA:** a conversão do RP não
  processado em processado quando a entrega de janeiro é liquidada não é modelada.

### GU-FIN-04 — "A OB saiu pelo líquido, com DARF de IR e CSLL retidos"
- **Realidade:** NS de R$ 10.000; retenção de 5,85% (IN RFB 1.234/2012) — o fornecedor recebe
  R$ 9.415 e o DARF paga R$ 585.
- **O sistema precisa:** a retenção fica na NS; o teto da OB é o líquido; a retenção é "a
  recolher" até o DARF/DAR/GPS ser registrado. Sem retenção, nada muda.
- **UX:** Liquidações → abrir a NS → Registrar retenção (alíquota calcula o valor); Pagamentos →
  "Retenções a recolher" → Registrar recolhimento.
- **Cobertura:** `finance-compliance-math.test.ts › OB pelo líquido`; integração
  `budget-execution.operations.test.ts` (trigger do pagamento e da dedução).

### GU-FIN-05 — "A NS veio maior do que o que chegou"
- **O sistema precisa:** com recebimento vinculado, Σ NS do recebimento ≤ valor recebido
  (Σ quantidade × custo; com item sem custo, o total da NF-e). Recusa com o quanto ainda cabe
  (Lei 4.320, art. 63, § 2º, III). Recebimento com item sem custo e sem NF-e: aceita, com a
  pendência de precificar.
- **Cobertura:** `finance-compliance-math.test.ts › teto da liquidação pelo recebido`; integração
  `budget-execution.operations.test.ts` (trigger `liquidacao_within_receipt`).

### GU-FIN-06 — "Liquidaram sem recebimento (serviço, ou o recebimento ainda vai ser vinculado)"
- **O sistema precisa:** aceitar a NS e deixar a pendência "liquidação sem recebimento vinculado".
- **UX:** badge "pendente: sem recebimento" na lista de liquidações.
- **Cobertura:** `finance-compliance-math.test.ts › liquidação sem recebimento é pendência`.
  **LACUNA:** a pendência ainda não entra no fluxo "Executar despesa" (tarefa 4.1, que deve usar
  `isLiquidacaoWithoutReceipt`), e não há ação de vincular o recebimento depois da NS.

### GU-FIN-07 — "Anularam a NE inteira"
- **O sistema precisa:** anulação total é `anulacao_total`; "cancelamento" é termo de RP. O banco
  aceita os dois e os lê igual (expand).
- **Cobertura:** `finance-compliance-math.test.ts › anulação total`; integração
  `budget-execution.operations.test.ts`. `registerEmpenhoEventFn` grava `anulacao_total` (o valor
  legado na entrada é convertido).
