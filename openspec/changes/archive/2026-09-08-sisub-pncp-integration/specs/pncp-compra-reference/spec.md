# pncp-compra-reference

> **Contrato especificado, implementação ADIADA.** Esta capability registra o que o acervo de
> compras homologadas do PNCP pode e não pode sustentar. Nada aqui entra na entrega atual; o
> objetivo é impedir que a próxima tentativa refaça os erros que a medição já pagou.

## ADDED Requirements

### Requirement: A unidade de agrupamento é a compra, nunca a ata
Toda listagem, chave de cache, coalescência de coleta e exibição SHALL ser feita por
`numeroControlePNCPCompra`. O sistema MUST NOT listar nem coletar por ata: foram medidas **9,3 atas
por compra alimentar**, de modo que uma listagem por ata mostra 108 linhas para 11 fatos e uma
coleta chaveada por ata dispara até 9,3 requisições idênticas para a mesma compra.

#### Scenario: Compra com múltiplas atas
- **WHEN** uma compra tem 9 atas vigentes
- **THEN** ela aparece como uma linha, e a coleta dos itens ocorre uma única vez

#### Scenario: Cache de coleta
- **WHEN** duas atas da mesma compra são solicitadas
- **THEN** uma única requisição a `/itens` é emitida

### Requirement: A descrição do item é a classe, não o produto
O sistema MUST NOT usar a `descricao` do item do PNCP para identificar um produto específico, nem
oferecê-la como evidência de preço de um gênero. Foi medido que a descrição é o nome da classe
CATMAT: numa compra real, 10 itens têm 3 descrições, com "Carne de ave in natura" repetida sete
vezes a quatro preços distintos, sem nenhum campo que os diferencie. Toda leitura SHALL apresentar
o dado explicitamente como **nível de classe**.

#### Scenario: Vários itens com a mesma descrição
- **WHEN** uma compra tem sete itens descritos como "Carne de ave in natura" a preços diferentes
- **THEN** a tela os apresenta como itens distintos da mesma classe, e NÃO afirma qual produto é cada um

#### Scenario: Tentativa de casar com o catálogo
- **WHEN** um item do PNCP não tem `catalogoCodigoItem`
- **THEN** ele MUST NOT ser vinculado a `purchase_item` por semelhança de descrição

### Requirement: Item agregador vai para quarentena, não para descarte por regex
Item que represente lote ou grupo SHALL ser posto em quarentena, contabilizado e exibido como tal, e
MUST NOT ser oferecido como evidência. A detecção SHALL combinar pelo menos três sinais: termo
(`lote`, `grupo`, `item`, `pacote`) em qualquer posição junto de numeral arábico ou romano; sinal
estrutural do payload (quantidade unitária com unidade genérica, ou critério de julgamento por
grupo); e magnitude fora de uma ordem de grandeza da mediana dos itens de mesma descrição. Descarte
silencioso por expressão regular ancorada MUST NOT ser usado como única defesa — ele deixa passar
`LOTE 01 - CARNES E DERIVADOS`, que casa busca por "carne" e carrega o valor do lote inteiro.

#### Scenario: Lote com nome de produto
- **WHEN** a descrição é `LOTE 01 - CARNES E DERIVADOS`
- **THEN** o item vai para quarentena e NÃO é exibido como preço de carne

#### Scenario: Contagem visível
- **WHEN** itens são quarentenados numa compra
- **THEN** a quantidade quarentenada é exibida junto da compra

### Requirement: Reconciliação obrigatória dos três valores homologados
O acervo SHALL gravar `valorUnitarioHomologado`, `valorTotalHomologado` e `quantidadeHomologada`
crus, e SHALL conferir que o unitário é consistente com o total dividido pela quantidade dentro de
uma tolerância declarada. Item fora da tolerância MUST ir para quarentena com o desvio registrado.

#### Scenario: Homologação parcial
- **WHEN** a quantidade homologada é menor que a quantidade do item
- **THEN** a quantidade homologada é a usada, e a diferença é exibida

#### Scenario: Divergência entre unitário e total
- **WHEN** o unitário diverge de total/quantidade acima da tolerância
- **THEN** o item é quarentenado com o desvio registrado

### Requirement: Resultado não é único e nem todo resultado é preço praticado
O sistema SHALL tratar apenas o resultado de primeira classificação como preço praticado, porque o
endpoint de resultados devolve **lista** — `ordemClassificacaoSrp` no payload confirma cadastro de
reserva. Resultados de classificação posterior MUST
NOT ser agregados na mesma estatística. Item com
`percentualDesconto` preenchido SHALL ser excluído até haver regra própria, porque nesses casos o
valor unitário pode ser o de referência e não o praticado.

#### Scenario: Cadastro de reserva
- **WHEN** um item tem resultados com ordem de classificação 1 e 2
- **THEN** apenas o de ordem 1 é tratado como preço praticado

#### Scenario: Julgamento por desconto
- **WHEN** o resultado traz percentual de desconto preenchido
- **THEN** o item é excluído da referência

### Requirement: Homologado não é imutável e precisa de revalidação
O sistema MUST NOT tratar resultado homologado como fato permanente. O payload de `/resultados`
carrega `dataCancelamento`, `motivoCancelamento` e `situacaoCompraItemResultadoId`, e a Lei
14.133/2021 admite revogação e anulação após a homologação. Resultado já coletado SHALL ser
reconsultado quando a `dataAtualizacaoGlobal` da ata correspondente avançar, e o acervo SHALL
guardar a situação e a data de coleta.

#### Scenario: Ata atualizada na origem
- **WHEN** a data de atualização global da ata avança
- **THEN** os resultados dos itens daquela compra são reconsultados

#### Scenario: Resultado cancelado depois
- **WHEN** um resultado já exibido passa a cancelado na origem
- **THEN** a exibição sinaliza que a evidência foi anulada na origem

### Requirement: Base de medida explícita e homogênea
Toda exibição de preço SHALL carregar a unidade de medida e a quantidade. O sistema MUST NOT
apresentar numa mesma estatística preços de bases de medida distintas — o PNCP traz unidade textual
e **não** tem análogo de capacidade da unidade de fornecimento, logo não existe fator de conversão
implícito.

#### Scenario: Duas bases na mesma listagem
- **WHEN** itens vêm em "Quilograma" e em "Caixa"
- **THEN** cada base tem seu próprio agregado, rotulado, e nenhum número combina as duas

### Requirement: Janela de coleta cobre a vigência real, não doze meses
A listagem de compras vigentes SHALL usar janela suficiente para alcançar atas ainda vigentes
assinadas há mais de um ano. Foi medida ata da UASG 120623 com vigência de dois anos
(`2024-03-05` a `2026-03-04`); uma janela de 12 meses a omitiria e a tela apresentaria lista
incompleta com aparência de completa.

#### Scenario: Ata longa ainda vigente
- **WHEN** uma ata foi assinada há 18 meses e vige até o ano que vem
- **THEN** ela aparece entre as vigentes

### Requirement: Amostragem com precisão declarada, não censo
Preço de referência SHALL ser estimado por amostra aleatória com incerteza declarada, e o sistema
MUST NOT coletar `/resultados` de todos os itens relevantes quando uma amostra basta. Para
`n = (z·CV/r)²` com z=1,96 e CV 0,30, bastam **n≈35** para ±10% e **n≈139** para ±5% — contra
milhares de chamadas no censo. O quadro amostral SHALL ser montado localmente a partir das
descrições já obtidas em `/itens`, e o sorteio MUST ser aleatório sobre esse quadro: amostrar pela
ordem de paginação produz amostra viciada, porque a listagem vem agrupada por órgão e data.

A tela SHALL exibir `n`, o intervalo de confiança e o critério de parada. Declarar a precisão é
mais defensável numa auditoria do que apresentar um censo parcial como se fosse censo.

#### Scenario: Parada por precisão atingida
- **WHEN** o erro padrão relativo da amostra cai abaixo da margem alvo, com n mínimo respeitado
- **THEN** a coleta para e a estatística é publicada com n e intervalo de confiança

#### Scenario: Ordem de paginação não é sorteio
- **WHEN** a amostra é selecionada
- **THEN** ela é sorteada sobre o quadro local, e NÃO tomada pelas primeiras páginas da listagem

### Requirement: Quadro e valor são camadas de custo distintas
O sistema SHALL separar a construção do **quadro** (as descrições dos itens, via `/itens`, que
traz até 500 por chamada) da coleta de **valor** (via `/resultados`, uma chamada por item). O quadro
é amortizado e reusável por qualquer termo; o valor é ~33× mais caro por unidade de informação e é
o único que precisa ser racionado. O conjunto de termos SHALL ser derivado do catálogo do próprio
sisub, que é enumerável localmente — MUST NOT ser tratado como espaço desconhecido descoberto pelo
uso.

#### Scenario: Termo novo sobre quadro existente
- **WHEN** um termo ainda não consultado é pesquisado e o quadro já foi construído
- **THEN** a seleção dos itens candidatos é consulta local, sem chamada externa

### Requirement: Disciplina de conexão e orçamento por host
O cliente SHALL usar conexão persistente com keep-alive e concorrência 1 **por host**. A origem é
HTTP/1.1 sem multiplexação, e o incidente que originou o receio de limite foi de **conexões**
paralelas, não de taxa. Como `/consulta/v1` e `/api/pncp/v1` têm saúde independente, o orçamento
SHALL ser contabilizado por host, e o tempo total de um trabalho que usa os dois é o **máximo**
entre eles, não a soma.

#### Scenario: Trabalho que usa os dois hosts
- **WHEN** a listagem e a coleta de itens rodam no mesmo trabalho
- **THEN** cada host tem seu próprio orçamento e elas progridem em paralelo, uma requisição por vez em cada

#### Scenario: Reuso de conexão
- **WHEN** várias requisições seguem para o mesmo host
- **THEN** elas reusam a conexão, em vez de abrir uma nova por requisição

### Requirement: Nenhuma escrita na prova de auditoria
Esta capability MUST NOT escrever em `procurement.compras_amostra`, em
`procurement_pesquisa_preco*` nem na RPC `procurement.upsert_compras_amostras`. É tela de
referência, não evidência.

#### Scenario: Consulta da referência
- **WHEN** um usuário consulta a referência de preço homologado
- **THEN** nenhuma linha de amostra ou de memória de cálculo é criada
