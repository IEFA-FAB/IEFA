## ADDED Requirements

### Requirement: Registro rápido do documento que falta

Onde uma tela precisar de uma nota de empenho que ainda não está no sistema, o usuário SHALL poder registrá-la no próprio lugar com número, data, valor e favorecido. O import posterior do SIAFI MUST completar esse registro pelo número, sem duplicar.

#### Scenario: A NE saiu no SIAFI e ninguém importou

- **WHEN** o almoxarife monta a OF e a NE ainda não está no sistema
- **THEN** ele registra a NE com o mínimo e segue com a OF
- **WHEN** a unidade importa depois o relatório de NE do SIAFI
- **THEN** a mesma NE é completada com classificação e favorecido
- **AND** diferença de valor vira pendência de conciliação

### Requirement: Import do SIAFI sem perda

O import de NE, NS e OB SHALL gravar cada linha reconhecida ou marcar o lote como falho com a mensagem. NE sem contratação conhecida MUST entrar como pendência "sem contratação de origem". NS ou OB cujo documento pai ainda não está no sistema MUST ficar estacionada e ser religada automaticamente quando o pai chegar.

#### Scenario: NS importada antes da NE

- **WHEN** o lote de NS traz uma NS de uma NE que não existe no sistema
- **THEN** a NS fica estacionada e o fluxo mostra "1 NS aguardando a NE 2026NE000123"
- **WHEN** a NE é importada ou registrada
- **THEN** a NS vira liquidação dessa NE sem nova ação

#### Scenario: Erro de gravação

- **WHEN** uma linha do lote falha ao gravar
- **THEN** o lote fica `failed` com a mensagem e pode ser reaplicado

### Requirement: Vincular depois

OF sem empenho, recebimento sem NF-e, sem OF ou sem empenho SHALL ser aceitos e ficar pendentes. O usuário SHALL poder vincular o documento depois, sem reabrir a efetivação nem mexer no estoque.

#### Scenario: Pão com nota semanal

- **WHEN** o pão chega todo dia com guia de remessa
- **THEN** cada entrega é um recebimento `delivery_note` efetivado no dia
- **WHEN** a NF-e semanal chega
- **THEN** ela é vinculada aos recebimentos da semana

### Requirement: Recusas imprescindíveis dizem o que fazer

O sistema SHALL continuar recusando: pagamento acima do liquidado; liquidação acima do vigente do empenho; liquidação de recebimento recusado ou não efetivado; liquidação com NF-e cancelada ou sem consulta de situação recente; anulação abaixo do liquidado; recebimento provisório ou definitivo sem designação vigente (Lei 14.133, art. 140, II); efetivação dupla; movimento em competência fechada. Cada recusa MUST dizer o que fazer em vez disso. A conferência física da entrega MUST NOT depender de designação.

#### Scenario: Entrega chegou e ninguém foi designado fiscal

- **WHEN** a carne chega e não há fiscal designado para a contratação
- **THEN** o almoxarife registra a conferência física (itens, lotes, temperatura, validade)
- **AND** quem tem `unit:2` vê "Designar agora" no próprio recebimento; quem não tem vê "Peça a designação ao chefe do rancho (Gestão Unidade → Designações)"
- **WHEN** a designação é feita
- **THEN** o fiscal confirma o provisório sobre a conferência já registrada, sem redigitar

### Requirement: Pendências da execução

A Gestão Unidade SHALL ter o fluxo "Executar despesa", e o Estoque SHALL mostrar as pendências de recebimento, derivadas dos dados a cada leitura, cada uma com severidade, mensagem e ação.

#### Scenario: Pendência some quando o dado aparece

- **WHEN** a NE sem contratação é vinculada a uma dispensa
- **THEN** na próxima leitura a pendência "NE sem contratação de origem" some
