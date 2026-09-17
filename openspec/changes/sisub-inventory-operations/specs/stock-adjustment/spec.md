# stock-adjustment (delta)

## ADDED Requirements

### Requirement: Ajuste é documento com motivo tipado
Ajuste de estoque SHALL ser registrado em documento com itens (lote ou item, quantidade, `reason_code`, observação, movimento corrigido quando houver, temperatura medida quando houver) e status `draft → pending_approval → posted | rejected`. `reason_code` SHALL pertencer ao vocabulário do domínio, cada motivo com uma única direção: saída — `expired`, `spoiled`, `damaged`, `cold_chain_failure`, `sanitary_recall`, `lost`, `theft`, `quality_sample`, `supplier_return`, `donation`, `entry_error_out`, `count_loss`; entrada — `entry_error_in`, `count_gain`, `found_stock`, `opening_balance`. O vocabulário SQL MUST ter teste de contrato contra o domínio. Movimentos MUST ser criados só em `posted`, atomicamente, com alocação de lote sob trava.

#### Scenario: Produto estragado
- **WHEN** o operador registra 4 KG de carne moída do lote L9 como `spoiled`
- **THEN** só no lançamento o saldo do lote cai 4 KG

#### Scenario: Direção incompatível
- **WHEN** alguém tenta registrar entrada com motivo `theft`
- **THEN** o sistema recusa

### Requirement: Evidência por motivo
`spoiled` e `damaged` SHALL exigir foto ou termo; `cold_chain_failure` SHALL exigir temperatura medida; `sanitary_recall` SHALL exigir referência ao ato ou aviso; `lost` e `theft` SHALL exigir comunicação (parte) e, depois, número do processo de apuração; `supplier_return` SHALL exigir a chave da NF-e de devolução; `entry_error_*` SHALL exigir o movimento corrigido; descarte (`expired`, `spoiled`, `damaged`) acima da alçada SHALL exigir termo de inutilização assinado por comissão. Ajuste abaixo da alçada SHALL poder ser lançado com evidência pendente, listado em pendências até completar. Anexos SHALL ficar em armazenamento privado, autorizados pelo registro do ajuste no banco, com leitura por URL temporária de até 300 s, metadados de localização removidos na recepção, tipo validado pelo conteúdo e tratamento declarado na política de privacidade antes do uso.

#### Scenario: Avaria sem foto abaixo da alçada
- **WHEN** um nível 2 lança R$ 40 de avaria sem foto
- **THEN** o ajuste é lançado com evidência pendente e aparece em pendências

#### Scenario: Devolução sem nota
- **WHEN** alguém tenta enviar ajuste `supplier_return` sem chave de NF-e de devolução
- **THEN** o envio é recusado

### Requirement: Alçada e segregação
Ajuste cujo valor (quantidade × custo médio, calculado no banco no lançamento, somando ajustes do mesmo item e autor nas últimas 24 horas) exceder a alçada da cozinha (default R$ 500), ou que contenha `cold_chain_failure`, `sanitary_recall`, `lost`, `theft`, `supplier_return`, `donation`, `entry_error_*` ou `found_stock`, MUST exigir aprovação por nível 3 conforme a segregação da cozinha (`strict`: diferente do autor; `dual`: outra pessoa). Sem pessoa elegível, a aprovação SHALL prosseguir com justificativa e entrar no relatório de exceções. Os demais SHALL ser lançados pelo autor nível 2.

#### Scenario: Pequena perda
- **WHEN** um nível 2 registra R$ 35 de pão vencido como `expired`
- **THEN** o ajuste é lançado imediatamente

#### Scenario: Ajuste fatiado
- **WHEN** o mesmo autor registra 5 ajustes de R$ 180 do mesmo item em 2 horas
- **THEN** a partir do terceiro o ajuste exige aprovação

### Requirement: Quarentena imediata
Nível 2 SHALL poder colocar lote em quarentena imediatamente, com motivo, independente de aprovação; o ajuste que encerra a quarentena SHALL seguir a alçada normal. Liberar a quarentena sem ajuste SHALL exigir nível 3.

#### Scenario: Falha de refrigeração no sábado
- **WHEN** a câmara falha e o nível 2 põe em quarentena 20 KG de carne (R$ 700) e registra `cold_chain_failure`
- **THEN** o lote sai da alocação na hora e o ajuste aguarda aprovação sem que o lote seja sugerido

### Requirement: Valor em apuração
Ajustes `lost` e `theft` SHALL reduzir o saldo físico no lançamento e manter o valor com natureza "em apuração" até o registro do número do processo e do resultado, sem que o sisub conduza o processo.

#### Scenario: Extravio
- **WHEN** um ajuste `lost` de R$ 1.200 é aprovado
- **THEN** o saldo cai, o valor aparece "em apuração" e a pendência de número de processo fica listada

### Requirement: Doação de gêneros
O motivo `donation` SHALL estar disponível, exigindo termo de doação e autorização do ordenador anexados, e SHALL aparecer com natureza própria no relatório de perdas e na exportação, separado de perda e de consumo.

#### Scenario: Doação antes do vencimento
- **WHEN** o gestor registra doação de 30 KG de arroz próximo do vencimento com termo e autorização anexados
- **THEN** o ajuste é aprovado, o saldo cai e o valor aparece como doação, não como perda

#### Scenario: Doação sem autorização
- **WHEN** alguém tenta enviar ajuste `donation` sem a autorização do ordenador
- **THEN** o envio é recusado

### Requirement: Relatório de perdas
O sistema SHALL reportar, por período e cozinha, as saídas por ajuste agrupadas por motivo e natureza, com quantidade e valor, destacando os valores em apuração e as exceções de segregação, e excluindo `opening_balance`.

#### Scenario: Fechamento do mês
- **WHEN** o gestor consulta perdas de agosto
- **THEN** vê valor por motivo, a lista de ocorrências em apuração e as exceções de segregação

### Requirement: Tela de ajuste
O módulo SHALL ter tela de ajuste que aceita leitura (GTIN, GS1, etiqueta interna) ou busca para escolher item e lote, mostra saldo e custo médio, e lista para o nível 3 os documentos pendentes de aprovação e de evidência.

#### Scenario: Baixa de vencido pela etiqueta
- **WHEN** o operador lê a etiqueta interna de um lote vencido na tela de ajuste
- **THEN** o lote é pré-selecionado com o motivo `expired` sugerido
