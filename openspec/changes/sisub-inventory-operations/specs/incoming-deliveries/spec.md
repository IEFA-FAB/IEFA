# incoming-deliveries (delta)

## ADDED Requirements

### Requirement: Painel "A caminho"
O sistema SHALL exibir, por cozinha, uma lista única do que está para chegar ou pendente de documento: (a) OF `sent` ou `partially_received` com saldo a receber; (b) NF-e `announced` ou `available` sem recebimento efetivado; (c) recebimento sem NF-e vinculada ("entrega sem nota"); (d) linha recusada com reposição prometida. Itens vinculados entre si SHALL aparecer como uma linha. Cada linha SHALL mostrar fornecedor, itens principais, valor, data prevista ou de emissão, dias de atraso e a próxima ação. A lista SHALL ter limite e devolver o total.

#### Scenario: OF atrasada
- **WHEN** a data prevista de uma OF passou há 3 dias sem recebimento
- **THEN** a linha mostra "3 dias de atraso" e é ordenada antes das demais

#### Scenario: Nota com itens não casados
- **WHEN** uma NF-e `available` tem 2 itens em `review`
- **THEN** a próxima ação exibida é "casar 2 itens" com atalho para a nota

#### Scenario: Pão entregue sem nota
- **WHEN** há três recebimentos de pão da semana sem NF-e vinculada
- **THEN** aparecem como "entrega sem nota" com a soma recebida, aguardando a nota semanal

### Requirement: Vínculo sugerido NF-e ↔ empenho ↔ OF ↔ entregas
Para NF-e sem vínculo, o sistema SHALL sugerir empenhos da unidade cujo favorecido tem o CNPJ ou CPF do emitente e saldo a receber, OFs abertas desses empenhos e recebimentos sem nota do mesmo fornecedor, ranqueados por coincidência de itens e datas. O vínculo MUST ser confirmado por nível 2. Vincular recebimentos sem nota SHALL comparar, por linha, a soma recebida com a quantidade da nota e abrir divergência quando exceder a tolerância.

#### Scenario: Um empenho compatível
- **WHEN** a nota do CNPJ X chega e a unidade tem um único empenho vigente para X com saldo
- **THEN** o empenho e sua OF aberta aparecem pré-selecionados para confirmação

#### Scenario: Nota semanal fechando entregas diárias
- **WHEN** a nota semanal de pão fatura 70 UN e as cinco entregas sem nota somam 70 UN
- **THEN** o operador vincula as cinco entregas à nota sem divergência

### Requirement: Quantidade de OF comparável com o recebido
A OF e o painel de empenho SHALL comparar pedido e recebido na unidade base do insumo, convertendo a quantidade da OF pelo conteúdo do item de compra; sem conversão resolvível, a comparação SHALL aparecer como indisponível, nunca como zero. OF criada pela interface MUST gravar o item de compra.

#### Scenario: OF em caixas, recebimento em quilos
- **WHEN** a OF pede 10 caixas de 5 KG e o recebimento efetiva 50 KG
- **THEN** a OF aparece como totalmente recebida
