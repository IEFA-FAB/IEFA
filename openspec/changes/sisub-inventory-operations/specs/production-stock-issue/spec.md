# production-stock-issue (delta)

## ADDED Requirements

### Requirement: Requisição de saída do dia
O sistema SHALL manter, por cozinha e data de retirada, uma requisição de saída com origem `production` e status `open`, `closed` ou `closed_unexplained`. Cada item SHALL ter ingrediente, refeição opcional, sugestão, total emitido e total devolvido derivados dos movimentos, e motivo de variância. A sugestão SHALL ser a soma, sobre as tarefas de produção cuja data de retirada é o dia (default: data de produção), da quantidade **bruta** (com fator de correção) calculada via `scaleIngredientQuantity` sobre o snapshot congelado da receita × porções planejadas, arredondada para cima à embalagem de saída do item quando definida. A sugestão SHALL ser recalculada enquanto a requisição estiver aberta e congelada no fechamento. Sem tarefas no dia, a requisição SHALL existir sem sugestão.

#### Scenario: Requisição do almoço
- **WHEN** o almoxarife abre a requisição de amanhã, com 3 preparações para 400 porções
- **THEN** a lista mostra cada ingrediente com a quantidade bruta somada e os lotes que seriam alocados

#### Scenario: Descongelamento no dia anterior
- **WHEN** a carne do almoço de quarta tem data de retirada na terça
- **THEN** ela aparece na requisição de terça

#### Scenario: Cozinha sem planejamento
- **WHEN** a cozinha não tem tarefas de produção no dia
- **THEN** a requisição aceita saídas sem sugestão, sem variância e sem motivo

### Requirement: Emissões livres e motivo no fechamento
Emissões SHALL ser livres ao longo do dia (a menor, a maior, fora da sugestão). No fechamento, o sistema MUST exigir motivo ∈ `headcount_change | production_loss | yield_difference | recipe_substitution | portion_adjustment | other` (texto obrigatório para `other`) apenas para linhas com sugestão maior que zero cujo desvio entre sugerido e emitido líquido exceda a tolerância percentual **e** o piso absoluto da cozinha (default 10 % e R$ 20 ou uma embalagem). Requisição não fechada até 23:59 no fuso de Brasília SHALL ser fechada automaticamente: como `closed_unexplained`, listada em pendências, quando alguma linha exigiria motivo e não o tem; como `closed` quando nenhuma exigiria — inclusive a requisição sem sugestão da cozinha que não planeja no sisub, que de outro modo geraria uma pendência falsa todo dia.

#### Scenario: Saída a maior por aumento de efetivo
- **WHEN** a sugestão de arroz é 40 KG, o almoxarife emite 48 KG e fecha o dia
- **THEN** o fechamento pede motivo para o arroz e o operador escolhe "efetivo mudou"

#### Scenario: Desvio abaixo do piso
- **WHEN** a sugestão de sal é 0,8 KG e são emitidos 1 KG, com custo total de R$ 1
- **THEN** o fechamento não pede motivo para o sal

#### Scenario: Dia não fechado
- **WHEN** a requisição com linha fora da tolerância não é fechada até 23:59
- **THEN** ela fica `closed_unexplained` e aparece em pendências da cozinha

#### Scenario: Dia sem planejamento não vira pendência
- **WHEN** a requisição de uma cozinha sem tarefas no dia, só com saídas avulsas, não é fechada até 23:59
- **THEN** ela fica `closed` e não aparece em pendências

### Requirement: Três modos de lançar a saída
Na mesma requisição, o operador SHALL poder lançar quantidades editando a lista sugerida, lendo códigos (GTIN resolve o ingrediente e soma o conteúdo da embalagem com alocação automática; GS1 com lote ou etiqueta interna usa aquele lote) e buscando ingrediente, com saldo e lotes visíveis. Os lotes alocados SHALL ser exibidos antes da confirmação. Cada emissão SHALL carregar identificador gerado no cliente, único, de modo que reenvio não gere segunda saída.

#### Scenario: Baixa lendo a embalagem
- **WHEN** o almoxarife lê duas vezes o GTIN do pacote de feijão de 1 KG
- **THEN** a linha de feijão recebe 2 KG, alocados pela regra de alocação

#### Scenario: Leitura de etiqueta de lote
- **WHEN** o almoxarife lê a etiqueta interna do lote L77 de um item com três lotes
- **THEN** a quantidade sai do lote L77 sem justificativa de troca de lote

#### Scenario: Duplo clique
- **WHEN** o botão de emitir é acionado duas vezes com o mesmo identificador
- **THEN** só uma saída é registrada

### Requirement: Devolução ao lote de origem
A requisição SHALL aceitar devolução gerando movimento `issue_return` ao lote de origem, valorado pelo custo médio ponderado das saídas daquele lote pela requisição, limitado ao emitido líquido do lote, sob a mesma trava da emissão. Saída registrada sem lote MUST NOT ser devolvida a lote.

#### Scenario: Devolução de insumo cru
- **WHEN** sobram 2 pacotes fechados de macarrão ao fim do serviço
- **THEN** o almoxarife devolve 2 KG ao lote de origem, ao custo da saída

#### Scenario: Devolução maior que o emitido
- **WHEN** alguém tenta devolver 10 KG de um lote do qual a requisição emitiu 6 KG
- **THEN** o sistema recusa

### Requirement: Saída avulsa
O sistema SHALL permitir requisição com origem `ad_hoc`, sem tarefa de produção, com destino e motivo obrigatórios, sujeita às mesmas regras de lote, custo e idempotência. Saída para evento fora da alimentação regular SHALL exigir referência à autorização. Envio de gêneros para outra OM MUST ser registrado como transferência, não como saída avulsa.

#### Scenario: Lanche de instrução noturna
- **WHEN** o almoxarife registra saída avulsa de pão e café para "instrução noturna" com a autorização referenciada
- **THEN** a saída é registrada sem tarefa e aparece separada no relatório de variância

## MODIFIED Requirements

### Requirement: Baixa de estoque vinculada à produção
A saída de estoque para produção SHALL ser registrada pela requisição de saída do dia. Ao concluir uma `production_task` (status `DONE`) cuja data de retirada não tenha requisição, o sistema SHALL oferecer abrir a requisição daquele dia a partir das tarefas concluídas, com a sugestão calculada. O consumo teórico MUST ser calculado a partir do **snapshot congelado** da receita (`menu_items.recipe`), não da receita viva. Cada movimento `production_issue` SHALL referenciar a requisição e ser criado na unidade base por ingrediente e lote.

#### Scenario: Baixa pré-preenchida após produção
- **WHEN** uma tarefa é concluída num dia sem requisição
- **THEN** o sistema oferece abrir a requisição do dia com os ingredientes e quantidades teóricas, editáveis

#### Scenario: Confirmação da saída
- **WHEN** o operador emite as quantidades reais
- **THEN** movimentos `production_issue` são criados na unidade base, vinculados à requisição

### Requirement: Consumo FEFO por lote
A alocação SHALL ocorrer dentro da transação que grava a saída, com os lotes do item travados, na ordem: lotes marcados "usar primeiro"; validade crescente, com o lote sem validade concorrendo pela data de recebimento **no lugar** da validade — e não depois de todos os lotes datados; empate por data de recebimento e, por fim, identificador. Lotes em quarentena e lotes com validade anterior à data da saída (fuso de Brasília) MUST ser ignorados. Saldo insuficiente MUST NOT bloquear a saída: a parte não coberta SHALL ser gravada sem lote e alertada ao nível 3 para regularização em até 7 dias. O operador SHALL poder escolher outro lote com justificativa; escolher lote vencido MUST exigir nível 3 e justificativa.

#### Scenario: Consumo atravessando lotes
- **WHEN** a saída é de 30 KG e o lote válido mais próximo do vencimento tem 20 KG
- **THEN** o sistema consome 20 KG desse lote e 10 KG do lote válido seguinte

#### Scenario: Lote vencido ignorado
- **WHEN** o item tem lote vencido ontem com 5 KG e lote válido com 50 KG, e a saída é de 10 KG
- **THEN** os 10 KG saem do lote válido e o vencido aparece sinalizado para baixa

#### Scenario: Hortifrúti sem validade
- **WHEN** há dois lotes de alface sem validade recebidos segunda e quarta
- **THEN** a saída consome primeiro o lote de segunda

#### Scenario: Saídas simultâneas do mesmo lote
- **WHEN** duas requisições emitem ao mesmo tempo 15 KG de um item cujo único lote tem 20 KG
- **THEN** uma consome 15 KG do lote e a outra consome 5 KG do lote e grava 10 KG sem lote — o lote nunca fica negativo

#### Scenario: Override de lote
- **WHEN** o operador seleciona manualmente um lote diferente do sugerido
- **THEN** o sistema exige justificativa e registra o lote escolhido

### Requirement: Retorno de sobra ao estoque
Sobra reaproveitável registrada em `production_task.leftover_quantity` SHALL poder gerar movimento `leftover_return`, criando lote **da preparação congelada** (`frozen_preparation_id`) com validade derivada de `frozen_preparation.shelf_life_days`, com a quantidade pré-preenchida da tarefa. Sobra descartada SHALL gerar movimento `waste` com motivo `production_leftover_discard` e observação opcional.

#### Scenario: Sobra reaproveitada
- **WHEN** o operador marca 5 KG de sobra como reaproveitável em preparação congelada com shelf life de 30 dias
- **THEN** um `leftover_return` cria lote referenciando a `frozen_preparation` com validade a 30 dias da produção

#### Scenario: Descarte
- **WHEN** o operador marca a sobra como descarte
- **THEN** um movimento `waste` é criado com motivo `production_leftover_discard`

### Requirement: Variância teórico × real
O sistema SHALL reportar, por período, cozinha e ingrediente, a sugestão congelada, o emitido líquido de devoluções, delta absoluto e percentual, e a distribuição dos motivos. Saídas avulsas e requisições `closed_unexplained` SHALL aparecer separadas. O período SHALL ser delimitado no fuso `America/Sao_Paulo`.

#### Scenario: Relatório de variância
- **WHEN** o gestor consulta a variância do mês de uma cozinha
- **THEN** o relatório lista por ingrediente: sugerido, emitido líquido, delta absoluto e percentual, e os motivos mais frequentes

#### Scenario: Movimento no último dia do mês à noite
- **WHEN** uma saída ocorre às 22:30 de 31/08 no horário de Brasília
- **THEN** ela entra no relatório de agosto
