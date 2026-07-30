# arp-empenho-visibility — Fase 1

## ADDED Requirements

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
O sistema SHALL permitir registrar empenho (número, data, quantidade, valor unitário, nota de lançamento) vinculado a um item de ARP, com unicidade por `(unit_id, numero_empenho)`, e anulá-lo (status `anulado`) sem exclusão física. Registro e anulação afetam apenas o **comprometimento local**; o saldo oficial só muda em nova sincronização.

#### Scenario: Registro de empenho válido
- **WHEN** o gestor registra um empenho com número inédito na unidade e quantidade > 0
- **THEN** o empenho é criado com status `ativo` e o comprometimento local do item aumenta imediatamente

#### Scenario: Número de empenho duplicado
- **WHEN** o gestor registra um empenho com `numero_empenho` já existente na mesma unidade
- **THEN** o sistema rejeita com mensagem clara e nenhum registro é criado

#### Scenario: Anulação
- **WHEN** o gestor anula um empenho ativo
- **THEN** o status muda para `anulado`, o registro permanece no histórico, o comprometimento local é recomposto e o saldo oficial permanece o do último snapshot
