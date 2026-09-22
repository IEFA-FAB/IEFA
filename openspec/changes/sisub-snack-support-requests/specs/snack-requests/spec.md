## ADDED Requirements

### Requirement: Requisição de lanche pelo comensal

O sistema SHALL permitir a qualquer usuário com `diner:1` criar uma requisição de Lanche de Bordo ou de Apoio em `/diner/snack-requests/new`, com os campos do Anexo E do Módulo 7, a cozinha apoiadora (default: cozinha do refeitório padrão do usuário) e linhas de padrão pedível com quantidade e público (`crew` | `pax`). O requisitante MUST ser o usuário da sessão. O servidor MUST recalcular a calculadora e gravar entrada e saída em `calculator_snapshot`, e gravar um snapshot de cada padrão na linha.

#### Scenario: Enviar requisição de missão aérea

- **WHEN** o usuário preenche a missão aérea com ordem de missão, 6 tripulantes, 2 passageiros, escolhe padrões e envia
- **THEN** a requisição é criada em `submitted` com `requested_by` igual ao usuário da sessão
- **AND** um evento `null → submitted` é gravado

#### Scenario: Ordem de missão obrigatória em missão aérea

- **WHEN** a missão é aérea e `mission_order_number` está vazio
- **THEN** o envio é rejeitado com erro de validação

#### Scenario: Requisitante forjado é ignorado

- **WHEN** o input traz `requestedBy` de outro usuário
- **THEN** a requisição é gravada com o usuário da sessão

#### Scenario: Padrão de outra cozinha

- **WHEN** uma linha aponta para padrão de cozinha diferente da apoiadora, ou não pedível
- **THEN** o servidor rejeita e nada é gravado

### Requirement: Antecedência mínima de 24 horas

O sistema SHALL comparar `pickup_at` (ou `departure_at`, o que for antes) com o momento do envio. Abaixo de 24 h o envio MUST exigir `late_reason` e a requisição MUST ficar marcada como fora do prazo na fila da cozinha.

#### Scenario: Pedido com 10 horas de antecedência

- **WHEN** o usuário envia uma requisição para retirada em 10 h sem justificativa
- **THEN** o envio é rejeitado pedindo a justificativa

#### Scenario: Pedido tardio justificado

- **WHEN** o mesmo pedido traz `late_reason`
- **THEN** é aceito em `submitted` e aparece com a marca "Fora do prazo"

### Requirement: Divergência da sugestão exige justificativa

Quando as classes ou quantidades pedidas diferem da sugestão da calculadora, o envio SHALL exigir `divergence_reason`, e a cozinha MUST ver sugestão e pedido lado a lado.

#### Scenario: Pedir Classe B num voo de 2 horas

- **WHEN** a calculadora sugere só Classe A e o usuário adiciona um padrão de Classe B sem justificativa
- **THEN** o envio é rejeitado pedindo a justificativa

### Requirement: Pessoal não militar só com motivo

Quando `includes_non_military = true`, o sistema SHALL exigir `non_military_reason` (7.5.1).

#### Scenario: Civil sem motivo

- **WHEN** o pedido marca civis envolvidos sem motivo
- **THEN** o envio é rejeitado

### Requirement: Meus pedidos e cancelamento

O usuário SHALL ver somente as próprias requisições em `/diner/snack-requests`, com status e linha do tempo, e SHALL poder cancelar enquanto `submitted` ou `accepted`. Pedido enviado não é editado: mudança é cancelar e pedir de novo. Leitura ou mutação de requisição de outro usuário MUST ser negada.

#### Scenario: Ler pedido alheio

- **WHEN** o usuário A pede o detalhe de uma requisição do usuário B
- **THEN** o servidor responde como não encontrado

#### Scenario: Cancelar pedido em produção

- **WHEN** o requisitante tenta cancelar uma requisição em `in_production`
- **THEN** a operação é negada e a tela orienta a falar com a cozinha

### Requirement: Transições atômicas com histórico

Toda mudança de status SHALL passar por uma única rotina transacional do servidor que trava a linha (`select … for update`), valida a transição da máquina de estados do design e grava o evento em `kitchen.snack_request_event` na mesma transação. `snack_request_event` MUST ser apenas inserção.

#### Scenario: Aceite e recusa simultâneos

- **WHEN** dois usuários da cozinha aceitam e recusam a mesma requisição ao mesmo tempo
- **THEN** exatamente uma transição é aplicada e a outra falha com conflito de estado

#### Scenario: Transição inválida

- **WHEN** alguém tenta levar uma requisição de `submitted` direto para `delivered`
- **THEN** a função rejeita e nenhum evento é gravado

### Requirement: Documento do Anexo E

O detalhe da requisição SHALL oferecer uma versão imprimível no leiaute do Anexo E, com o valor do lanche preenchido pela SSU quando houver. Em missão terrestre o campo 9 (tipo de lanche) MUST sair em branco, com a classe de apoio calculada informada à parte.

#### Scenario: Imprimir requisição terrestre

- **WHEN** o usuário imprime uma requisição terrestre Classe B
- **THEN** o campo 9 está em branco e a classe de apoio aparece em linha própria
