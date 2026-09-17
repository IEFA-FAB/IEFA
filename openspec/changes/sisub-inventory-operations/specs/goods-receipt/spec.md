# goods-receipt (delta)

## ADDED Requirements

### Requirement: Recebimento com ou sem NF-e
O recebimento SHALL ter origem `nfe`, `delivery_note` ou `ad_hoc`. Sem NF-e, as linhas SHALL ser adicionadas por leitura ou busca no catálogo, com custo sugerido do empenho ou da ATA. NF-e SHALL poder ser vinculada depois, inclusive a vários recebimentos. Recebimento sem NF-e vinculada MUST NOT ser liquidável.

#### Scenario: Remessa do depósito de subsistência
- **WHEN** chegam gêneros com guia de remessa e sem NF-e
- **THEN** o operador cria recebimento `delivery_note`, lê ou busca os itens e segue o mesmo fluxo de conferência

### Requirement: Sessão de conferência registrada como eventos
Cada leitura, confirmação ou sobrescrita SHALL gravar evento append-only com identificador gerado no cliente (único), sequência, código bruto, interpretação, linha casada ou nenhuma, método (`scanner | camera | manual_confirm | typed | bulk_confirm`), fator, quantidade na unidade base, autor e instante. A quantidade conferida da linha SHALL ser derivada dos eventos. Evento reenviado com o mesmo identificador MUST NOT contar duas vezes. Desfazer SHALL ser evento de estorno referenciando um único evento. Sobrescrita SHALL indicar a última sequência vista e MUST ser recusada se houver evento posterior na linha.

#### Scenario: Retry de rede
- **WHEN** a mesma leitura chega duas vezes com o mesmo identificador
- **THEN** a linha conta a caixa uma vez

#### Scenario: Leitura desfeita
- **WHEN** o operador lê três caixas de 12 KG e desfaz a última
- **THEN** a linha mostra 24 KG e os quatro eventos continuam no histórico

#### Scenario: Sobrescrita com tela desatualizada
- **WHEN** A digita 36 KG enquanto B acabou de ler mais uma caixa na mesma linha
- **THEN** a sobrescrita de A é recusada e a tela recarrega a linha

### Requirement: Conferência rápida
A conferência SHALL oferecer: leitura de uma embalagem seguida de multiplicador, com o restante faturado sugerido; "aceitar conforme faturado" para as linhas ainda não conferidas, gerando um evento `bulk_confirm` por linha; validade padrão calculada pelo prazo do ingrediente quando a nota não traz validade; e registro de temperatura medida em linha perecível. O recebimento provisório SHALL poder ser completado (lote, validade, local, etiqueta) até o definitivo.

#### Scenario: Trinta caixas iguais
- **WHEN** o operador lê uma caixa de óleo de uma linha faturada com 30 caixas e confirma ×30
- **THEN** a linha registra 30 caixas com um evento

#### Scenario: Só as exceções
- **WHEN** numa nota de 40 linhas o operador conferiu 3 com divergência e aciona "aceitar conforme faturado"
- **THEN** as 37 restantes recebem a quantidade faturada com evento `bulk_confirm` e as 3 mantêm o conferido

### Requirement: Item sem GTIN na conferência
Linha sem GTIN utilizável SHALL oferecer "Confirmar à mão" com quantidade, gravando evento `manual_confirm`. A efetivação MUST NOT exigir leitura de código para nenhuma linha.

#### Scenario: Hortifrúti a granel
- **WHEN** a nota traz "Tomate — 40 KG — SEM GTIN" e o operador pesa 39,5 KG
- **THEN** o operador confirma à mão 39,5 KG e o termo registra a confirmação manual com seu nome

### Requirement: Tolerância e pendência fiscal
Item de compra SHALL poder definir tolerância percentual de quantidade (default 2 %); dentro dela, a diferença MUST NOT exigir motivo nem marcar o recebimento como divergente. Qualquer quantidade efetivada abaixo da faturada — dentro ou fora da tolerância — SHALL gerar pendência fiscal no recebimento, resolvida por vínculo com NF-e de devolução do fornecedor (chave com `finNFe = 4`), nota substituta ou glosa registrada.

#### Scenario: Carne dentro da tolerância
- **WHEN** a nota fatura 20,000 KG com tolerância de 2 % e a pesagem dá 19,700 KG
- **THEN** entram 19,700 KG sem motivo, e o recebimento fica com pendência fiscal de 0,300 KG

#### Scenario: Pendência resolvida por glosa
- **WHEN** o gestor registra glosa de 0,300 KG no valor correspondente
- **THEN** a pendência fiscal é encerrada

### Requirement: Produto lido que não consta na nota
Leitura que não casa com nenhuma linha MUST NOT adicionar linha ao recebimento de NF-e. O sistema SHALL oferecer: associar a uma linha (gravando alias de GTIN pendente de revisão, conforme `gtin-gs1-catalog`); registrar como item trocado na linha, com motivo; ou ignorar. A escolha SHALL ficar no evento.

#### Scenario: Embalagem nova do mesmo produto
- **WHEN** o GTIN lido é desconhecido e o operador associa à linha "Arroz 5 KG"
- **THEN** a leitura conta para a linha e a próxima nota do mesmo fornecedor com esse GTIN casa sozinha

### Requirement: Linha sem insumo resolvido permanece visível
Linha da nota sem insumo resolvido SHALL aparecer na conferência como "não casada", com atalho para o casamento; o recebimento MUST NOT ser efetivado enquanto houver linha não casada que não tenha sido recusada.

#### Scenario: Item da nota sem casamento
- **WHEN** a nota tem 6 linhas e uma não tem insumo resolvido
- **THEN** a conferência lista 6 linhas, a sexta com aviso, e o botão de efetivar explica o bloqueio

### Requirement: Recusa de item e de recebimento
Fiscal designado SHALL poder recusar uma linha (quantidade aceita zero, motivo `damaged | short_shelf_life | out_of_spec | temperature | not_ordered | other`, opção "reposição prometida") e o gestor designado SHALL poder recusar o recebimento inteiro, levando o recebimento a `rejected` e a nota a `refused`, sem movimento de estoque.

#### Scenario: Congelado descongelado
- **WHEN** a temperatura medida de uma linha de frango está fora da faixa e o fiscal recusa a linha com reposição prometida
- **THEN** a linha entra com 0, motivo `temperature`, e a reposição aparece em "A caminho"

#### Scenario: Recusa total
- **WHEN** o gestor recusa o recebimento inteiro
- **THEN** o recebimento fica `rejected`, a nota `refused`, nenhum lote é criado e a OF volta a mostrar o saldo integral

### Requirement: Validade mínima na entrega
Quando o item de compra define vida útil mínima na entrega, lote com vida útil restante menor SHALL gerar alerta e exigir motivo para aceite, e o aceite SHALL entrar na lista de revisão do gestor sem bloquear a conferência.

#### Scenario: Iogurte com 3 dias de validade
- **WHEN** o item exige 10 dias na entrega e o lote vence em 3 dias
- **THEN** o fiscal aceita informando o motivo e o aceite aparece para revisão do gestor

### Requirement: Recebimento efetivado é imutável
Recebimento `definitive`, `divergent` ou `rejected` MUST recusar escrita de item, lote ou evento, garantido por trigger no banco que trava o recebimento. A efetivação SHALL recalcular as quantidades a partir dos eventos na mesma transação, e a interface MUST NOT oferecer nova efetivação.

#### Scenario: Escrita após divergência
- **WHEN** uma chamada tenta alterar a quantidade de um item de recebimento `divergent`
- **THEN** o banco recusa a escrita

#### Scenario: Leitura concorrente com a efetivação
- **WHEN** um evento de leitura é gravado enquanto o definitivo é efetivado
- **THEN** ou o evento entra antes e é contado no estoque, ou é recusado — nunca aparece no termo sem ter entrado no estoque

## MODIFIED Requirements

### Requirement: Recebimento em dois estágios (Lei 14.133, art. 140)
O recebimento SHALL seguir `draft → provisional → definitive`, com estados de exceção `divergent` e `rejected`, registrando autor, data e designação usada em cada estágio conforme a capability `receipt-designation`. Somente o recebimento **definitivo** (ou `divergent`) SHALL criar lotes e movimentos de entrada no ledger e abater o saldo físico do empenho. O documento SHALL referenciar OF, NF-e e empenho quando existirem.

#### Scenario: Fluxo completo
- **WHEN** o fiscal designado registra o provisório e depois o gestor designado efetiva o definitivo
- **THEN** somente no definitivo são criados `stock_lot` + `stock_movement('receipt')` e o painel do empenho mostra a quantidade recebida

#### Scenario: Provisório não movimenta estoque
- **WHEN** um recebimento está em `provisional`
- **THEN** o saldo de estoque permanece inalterado

### Requirement: Conferência física por GTIN contra a NF-e
A conferência SHALL partir dos itens da NF-e quando houver (pipeline da capability `nfe-ingestion`). Um código lido SHALL casar com a linha nesta ordem: `cEAN` da linha; `cEANTrib` da linha; alias ou GTIN do `ingredient_item` casado; GTINs da hierarquia de embalagem. Cada caminho SHALL aplicar o fator correspondente e exibir "N embalagens × conteúdo = total na unidade base"; leitura GS1 com peso SHALL somar o peso lido; leitura GS1 com lote e validade SHALL criar ou incrementar esse lote na linha. O operador SHALL registrar a quantidade recebida e lote/validade (pré-preenchidos do grupo `rastro`, da leitura GS1 ou da validade padrão do item).

#### Scenario: Conferência com scanner
- **WHEN** o operador escaneia o GTIN de uma caixa listada na NF-e
- **THEN** o sistema destaca o item, soma a caixa e mostra "N caixas × conteúdo = total na unidade base"

#### Scenario: Leitura da unidade dentro da caixa
- **WHEN** a nota fatura 10 CX (cEAN) = 120 UN (cEANTrib) e o operador lê o código da unidade
- **THEN** a leitura casa com a mesma linha e soma 1/12 de caixa

#### Scenario: Caixa de carne com peso variável
- **WHEN** o operador lê a etiqueta GS1 de uma caixa com peso líquido 12,50 KG
- **THEN** a linha soma 12,50 KG

#### Scenario: Produto escaneado não consta na nota
- **WHEN** o GTIN lido não corresponde a nenhum item da NF-e vinculada
- **THEN** o sistema alerta, não adiciona o item e oferece associar, registrar troca ou ignorar

### Requirement: Tratamento de divergência
Quando a quantidade conferida diferir da faturada (NF-e) ou da autorizada (OF/empenho) além da tolerância do item, o recebimento SHALL ser marcado `divergent` com motivo obrigatório por item, permitindo recebimento a menor com registro do delta. Linha sem quantidade faturada conversível para a unidade base MUST ser tratada como divergente até o operador confirmar a conversão.

#### Scenario: Recebimento a menor
- **WHEN** a NF-e fatura 100 KG mas chegam 90 KG com tolerância de 2 %
- **THEN** o operador registra 90 KG com motivo, o documento fica `divergent`, o definitivo movimenta 90 KG e há pendência fiscal de 10 KG

#### Scenario: Linha sem conversão
- **WHEN** a linha casada não tem conteúdo líquido para converter a quantidade faturada
- **THEN** a linha aparece como divergente até o operador confirmar a conversão
