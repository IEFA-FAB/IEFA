# stock-count (delta)

## ADDED Requirements

### Requirement: Tipo e escopo da contagem
Uma contagem SHALL ter tipo `annual`, `responsibility_transfer`, `eventual` ou `rotating`, e escopo `full` (itens da cozinha com saldo ou já movimentados), `conservation_class`, `location`, `item_list` ou `menu_cycle` (ingredientes dos cardápios dos próximos N dias). Na abertura, os itens do escopo SHALL ser materializados, e duas contagens abertas da mesma cozinha MUST NOT conter o mesmo item (garantido por índice único no banco). Contagem aberta há mais de 7 dias SHALL expirar.

#### Scenario: Contagem rotativa do cardápio
- **WHEN** o gestor abre contagem `rotating` com escopo `menu_cycle` de 7 dias
- **THEN** a folha contém apenas os ingredientes desses cardápios

#### Scenario: Sobreposição
- **WHEN** existe contagem aberta da classe resfriado e alguém abre contagem `full`
- **THEN** o sistema recusa indicando a contagem que conflita

### Requirement: Contagem cega
Por padrão, enquanto a contagem estiver em `counting`, quem tem nível 2 MUST NOT obter saldo, diferença ou valor dos itens do escopo na folha, nas leituras da contagem, no painel e nos relatórios de estoque. As telas de **operação** (saída e ajuste) continuam mostrando saldo e lotes: a cozinha não para durante a contagem, e sem o saldo o operador não escolhe lote. A cegueira protege contra o viés de confirmação — quem conta copiar o número do sistema —, não contra quem decide procurar o saldo numa tela de operação; a defesa contra isso é a recontagem por outra pessoa acima da tolerância e a segregação (D7). Nível 3 SHALL poder abrir contagem não cega, registrando a escolha.

#### Scenario: Operador contando
- **WHEN** um operador nível 2 abre a folha de uma contagem cega
- **THEN** vê item, lote, validade e local e o campo "contado", sem saldo

#### Scenario: Consulta de saldo durante a contagem
- **WHEN** esse operador abre o painel de estoque durante a contagem
- **THEN** os itens do escopo aparecem sem saldo

#### Scenario: Saída durante a contagem
- **WHEN** esse operador lança a saída do dia de um item do escopo durante a contagem
- **THEN** a tela de saída mostra os lotes e saldos necessários para alocar, e o movimento entra no fechamento da contagem pela regra de movimentos durante a contagem

### Requirement: Lançamentos por lote e por item, com leitura
Cada lançamento SHALL identificar item e, quando possível, lote; SHALL aceitar lote novo encontrado (com validade) e item fora da folha ("achado", que entra no escopo). A folha SHALL aceitar leitura de GTIN (soma o conteúdo da embalagem ao item), GS1 com lote e etiqueta interna (somam ao lote). Várias pessoas SHALL poder contar ao mesmo tempo; lançamentos da mesma linha SHALL ser somados, com sobrescrita explícita disponível. Cada lançamento SHALL ter identificador gerado no cliente, único. Linha "sem lote" de um item SHALL ser comparada com o saldo sem lote somado ao dos lotes do item não contados individualmente.

#### Scenario: Duas pessoas na câmara
- **WHEN** um operador conta 12 KG de um lote na prateleira A e outro conta 8 KG do mesmo lote na prateleira B
- **THEN** a linha totaliza 20 KG com os dois lançamentos e autores

#### Scenario: Contagem por item e por lote do mesmo item
- **WHEN** o item arroz tem lotes L1 (10 KG) e L2 (5 KG), L1 é contado com 10 KG e é lançado "arroz sem lote 5 KG"
- **THEN** a linha sem lote é comparada com os 5 KG de L2 e não gera sobra

### Requirement: Saldo de referência no instante da contagem
A diferença de cada linha SHALL ser `contado − saldo do ledger com occurred_at até o instante da contagem`. Online, o instante SHALL ser o do servidor. Offline, SHALL ser o horário do dispositivo corrigido pelo desvio medido na abertura da sessão e limitado ao intervalo entre a última sincronização e o recebimento pelo servidor; havendo movimento do item nesse intervalo, a linha MUST ir para recontagem. A cozinha MUST NOT ser impedida de movimentar estoque durante a contagem.

#### Scenario: Saída durante a contagem
- **WHEN** um lote tinha 50 KG, foi contado às 09:00 com 50 KG e às 10:00 saíram 10 KG
- **THEN** a revisão às 11:00 mostra diferença zero e o saldo final do lote é 40 KG

#### Scenario: Contagem offline na câmara
- **WHEN** o operador conta 50 KG às 09:00 sem conexão, saem 10 KG às 10:00 e a folha sincroniza às 10:30
- **THEN** a referência é 09:00 corrigido, e como houve movimento no intervalo a linha vai para recontagem

### Requirement: Pré-condições da aprovação
A aprovação MUST ser recusada enquanto existir, para item do escopo, tarefa de produção concluída sem requisição fechada no período da contagem ou recebimento `provisional`.

#### Scenario: Baixa ainda não lançada
- **WHEN** a carne do almoço foi retirada, a tarefa está `DONE` e a requisição do dia não foi fechada
- **THEN** a aprovação é recusada indicando a requisição pendente

### Requirement: Revisão, recontagem e aprovação
No encerramento, linhas com diferença acima da tolerância percentual **e** de valor da cozinha SHALL ir para nova rodada cega, feita por outra pessoa quando a segregação da cozinha for `strict` e opcional quando `dual`; a rodada mais recente vale. A aprovação SHALL ser feita por nível 3 que não é o criador nem autor de lançamento quando `strict`, ou por qualquer outra pessoa quando `dual`; sem pessoa elegível, SHALL prosseguir com justificativa registrada e entrar no relatório de exceções. Contagem `annual` ou `responsibility_transfer` MUST seguir a comissão (capability `receipt-designation`) sem exceção. Itens do escopo não contados SHALL ser listados e só serão zerados com marcação explícita.

#### Scenario: Divergência grande
- **WHEN** a contagem de óleo dá 30 L contra 60 L esperados, acima das duas tolerâncias
- **THEN** a linha vai para recontagem e só a nova rodada entra na aprovação

#### Scenario: Cozinha com um único nível 3
- **WHEN** a segregação é `strict` e o único nível 3 contou e vai aprovar
- **THEN** a aprovação exige justificativa e a contagem aparece no relatório de exceções

### Requirement: Aprovação gera ajuste
A aprovação SHALL lançar ajuste já aprovado (capability `stock-adjustment`) com uma linha por diferença, motivo `count_gain` ou `count_loss`, valorado conforme `stock-ledger`, regularizando as saídas sem lote do item. A competência do inventário SHALL ser a data da contagem no fuso de Brasília.

#### Scenario: Aprovação com perdas
- **WHEN** a contagem aprovada tem 3 linhas com falta e 1 com sobra
- **THEN** é lançado um ajuste com 4 linhas vinculado à contagem e os saldos passam a refletir o contado

### Requirement: Leitura sem conexão
A folha de contagem SHALL guardar lançamentos localmente quando sem conexão e reenviá-los em ordem ao reconectar; lançamento reenviado MUST NOT ser contado duas vezes. O armazenamento local SHALL estar declarado na Política de Cookies antes do uso.

#### Scenario: Câmara fria sem sinal
- **WHEN** o operador lança 15 leituras sem conexão e sai da câmara
- **THEN** as 15 leituras são enviadas uma vez cada e aparecem na folha
