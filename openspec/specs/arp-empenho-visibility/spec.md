# arp-empenho-visibility Specification

## Purpose
TBD - created by archiving change sisub-inventory-cycle. Update Purpose after archive.
## Requirements
### Requirement: Painel de saldo com duas visões — oficial e local
O sistema SHALL exibir, na tela da ATA (`/unit/$unitId/procurement/$ataId`), um painel por item de ARP que distinga explicitamente duas grandezas de origens diferentes:
- **Saldo oficial** (snapshot da API Compras.gov em `procurement_arp_item.quantidade_empenhada`/`saldo_empenho`, com `synced_at`) — inclui consumo de **outras UASGs** (caronas/adesões) e só muda em sincronização;
- **Comprometimento local** (soma dos empenhos com status `ativo` em `finance.empenho` da unidade) — calculado em tempo real.
O painel MUST NOT somar nem confundir as duas grandezas, e SHALL exibir a data do snapshot oficial.

#### Scenario: Visualização das duas visões
- **WHEN** o gestor abre uma ATA vinculada a uma ARP importada
- **THEN** o painel lista, por item: quantidade homologada, empenhado oficial e saldo oficial (com `synced_at`), e empenhado local (calculado de `finance.empenho`)

#### Scenario: Item sem empenho local mas com consumo externo
- **WHEN** um item não possui empenhos locais registrados, mas o snapshot oficial indica saldo menor que a quantidade homologada
- **THEN** o painel mostra comprometimento local 0 e o saldo oficial do snapshot (não a quantidade homologada), evidenciando o consumo por outras UASGs

### Requirement: Sincronização de saldo via API Compras.gov
O sistema SHALL permitir sincronizar o snapshot oficial dos itens de ARP via API do Compras.gov (módulo ARP, proxy em `apps/api`), registrando `synced_at` e exibindo a data da última sincronização.

#### Scenario: Sincronização manual
- **WHEN** o gestor aciona "Sincronizar saldo" no painel
- **THEN** o sistema chama a API via proxy, atualiza os snapshots dos itens e exibe o novo `synced_at`

#### Scenario: Falha da API governamental
- **WHEN** a API do Compras.gov retorna erro ou timeout
- **THEN** o sistema mantém os valores anteriores, informa a falha ao usuário e não sobrescreve `synced_at`

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

