# arp-empenho-visibility (delta)

## MODIFIED Requirements

### Requirement: Registro e anulação de empenho
O sistema SHALL permitir registrar empenho (número, data, quantidade, valor unitário, nota de lançamento) vinculado a um item de ARP, com unicidade por `(unit_id, numero_empenho)`, e anulá-lo (status `anulado`) sem exclusão física. Registro e anulação afetam apenas o **comprometimento local**; o saldo oficial da ARP só muda em nova sincronização.

O painel SHALL, adicionalmente, exibir por empenho os saldos derivados do documento orçamentário — **liquidado**, **pago** e **a liquidar** (capability `empenho-document`) — e oferecer atalho para a tela de Empenhos da unidade, onde o documento completo (tipo, ND, PTRES, fonte, favorecido, reforços e anulações) é gerido. A anulação por aqui MUST continuar disponível como atalho, mas passa a gerar um evento de anulação no histórico do documento em vez de apenas mudar o status.

#### Scenario: Registro de empenho válido
- **WHEN** o gestor registra um empenho com número inédito na unidade e quantidade > 0
- **THEN** o empenho é criado com status `ativo` e o comprometimento local do item aumenta imediatamente

#### Scenario: Número de empenho duplicado
- **WHEN** o gestor registra um empenho com `numero_empenho` já existente na mesma unidade
- **THEN** o sistema rejeita com mensagem clara e nenhum registro é criado

#### Scenario: Anulação
- **WHEN** o gestor anula um empenho ativo
- **THEN** o status muda para `anulado`, um evento de anulação é registrado no histórico do documento, o comprometimento local é recomposto e o saldo oficial permanece o do último snapshot

#### Scenario: Saldos da execução no painel da ATA
- **WHEN** um empenho do item tem R$ 15.000 vigentes, R$ 9.000 liquidados e R$ 4.000 pagos
- **THEN** a linha expandida mostra esses três valores e o saldo a liquidar de R$ 6.000, com link para o documento completo
