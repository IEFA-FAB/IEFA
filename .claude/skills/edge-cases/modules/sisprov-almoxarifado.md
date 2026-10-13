# SISPROV — Almoxarifado (OF recebida, estoque da OM, distribuição, troca e devolução)

Hipóteses a verificar. O estoque é um só, de toda classe (`inventory`, dono SISPROV); este arquivo
cobre os locais que não são de cozinha (almoxarifado da OM, depósito). A cozinha continua em
`modules/estoque.md`. As telas do fardamento estão em fundação
(`openspec/changes/sisprov-foundation`). Os casos abaixo vêm do legado (OS 11, 12, 19) e da análise
do projeto, registrados antes das telas.

### ALM-ACE-01 — "Sou almoxarife e também elo da minha OM"
- **Realidade:** OM pequena; a mesma pessoa recebe a OF e informa a previsão.
- **O sistema precisa:** dois grants (`storage` e `sisprov-planning`) na mesma OM; um não implica o outro.
- **Cobertura:** `packages/sisprov-domain/src/guards/require-permission.test.ts › papéis são independentes na mesma OM`.

### ALM-ACE-02 — "Sou da cozinha e não quero ver fardamento"
- **Realidade:** o encarregado da cozinha tem `storage` na cozinha e abre o estoque no sisub.
- **O sistema precisa:** o local da cozinha só guarda alimentação e auxiliar; item de outra classe é recusado pelo banco, e a tela do sisub não oferece nada além do que o local guarda.
- **Cobertura:** trava `inventory.stock_class_guard` (migration `inventory_multiclass`); teste de integração **LACUNA** até o apply.

### ALM-OF-01 — "A OF chegou com menos do que o emitido"
- **Realidade:** o depósito separou 180 das 200 camisas.
- **O sistema precisa:** recebimento parcial com a pendência visível; a OF não fecha sozinha.
- **Cobertura:** **LACUNA** (change `sisprov-engine`, F2.5).

### ALM-OF-02 — "Veio tamanho diferente do pedido"
- **Realidade:** pediu 30 M, veio 30 G.
- **O sistema precisa:** o recebimento registra o item que CHEGOU, com a divergência ligada à OF; o saldo é do que existe.
- **Cobertura:** **LACUNA** (change `sisprov-engine`).

### ALM-DST-01 — "O militar não está no efetivo sincronizado"
- **Realidade:** incorporou depois da última sincronização do SIGPES; vem buscar o enxoval.
- **O sistema precisa:** distribuir mesmo assim, com o SARAM informado e marcado como "ausente do efetivo", e reconciliar na próxima sincronização.
- **Cobertura:** **LACUNA** (change `sisprov-distribution`).

### ALM-DST-02 — "O tamanho da ficha não serviu na hora"
- **Realidade:** ficha dizia M; o militar provou e precisa de G.
- **O sistema precisa:** troca imediata com motivo (devolução + nova saída no ledger), e a ficha de tamanhos é atualizada com a origem "almoxarifado".
- **Cobertura:** **LACUNA** (change `sisprov-distribution`).

### ALM-DST-03 — "Militar pede item fora do planejamento"
- **Realidade:** coturno rasgou em serviço; não há renovação prevista.
- **O sistema precisa:** distribuição avulsa com justificativa, separada nos indicadores de aderência.
- **Cobertura:** **LACUNA** (change `sisprov-distribution`).

### ALM-DST-04 — "Distribuí por engano / para o SARAM errado"
- **Realidade:** confirmação no SARAM do militar ao lado.
- **O sistema precisa:** estorno como movimento reverso com motivo; o original não some (ledger append-only).
- **Cobertura:** **LACUNA** (change `sisprov-distribution`; invariante do ledger já em `stock-ledger`).

### ALM-EST-01 — "O saldo do depósito que o SISPROV mostra está velho"
- **Realidade:** o saldo do N1 chega por carga periódica (Q1); a carga atrasou uma semana.
- **O sistema precisa:** o saldo mostra a data de referência e se marca como desatualizado; a OF emitida registra qual saldo viu.
- **Cobertura:** **LACUNA** (change `sisprov-engine`, F2.6).

### ALM-TRN-01 — "Treinei recebimento e distribuição na OM de treino"
- **Realidade:** capacitação dos almoxarifes antes do piloto (F3.4).
- **O sistema precisa:** tudo cai na OM sentinela; o reset de treino apaga; nada entra em relatório.
- **Cobertura:** **LACUNA** (declarar as tabelas em `RESET_TARGET_TABLES` no change que as criar).
