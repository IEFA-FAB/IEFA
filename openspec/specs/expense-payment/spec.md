# expense-payment Specification

## Purpose
TBD - created by archiving change sisub-budget-execution. Update Purpose after archive.
## Requirements
### Requirement: Pagamento vinculado à liquidação
O sistema SHALL registrar `finance.pagamento` com número da OB, data, valor, liquidação de origem, banco/agência/conta quando disponíveis e origem (`manual` | `siafi`). O total pago de uma liquidação MUST NOT exceder o valor liquidado.

#### Scenario: Registro de pagamento
- **WHEN** o gestor registra OB de R$ 9.000 para uma liquidação de mesmo valor
- **THEN** a liquidação passa a constar como integralmente paga

#### Scenario: Pagamento acima do liquidado é rejeitado
- **WHEN** uma OB faria o total pago exceder o valor da liquidação
- **THEN** o sistema rejeita a operação

#### Scenario: Pagamento parcial
- **WHEN** uma liquidação de R$ 9.000 recebe OB de R$ 4.000
- **THEN** a liquidação mostra R$ 5.000 a pagar e permanece em aberto

### Requirement: Prazo médio de pagamento por fornecedor
O sistema SHALL calcular, por fornecedor, o intervalo entre a liquidação e o pagamento, exibindo o prazo médio e a lista de pagamentos em aberto ordenada por antiguidade.

#### Scenario: Painel de contas a pagar
- **WHEN** o gestor abre a tela de Pagamentos
- **THEN** vê as liquidações não pagas ordenadas da mais antiga para a mais recente, com dias em aberto

#### Scenario: Prazo médio calculado
- **WHEN** um fornecedor teve pagamentos em 10 e 20 dias após a liquidação
- **THEN** o painel exibe prazo médio de 15 dias para esse fornecedor

