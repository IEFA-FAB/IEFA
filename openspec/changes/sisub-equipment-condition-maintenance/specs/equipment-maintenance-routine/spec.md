# equipment-maintenance-routine

## ADDED Requirements

### Requirement: Plano de manutenção ancorado no papel XOR no modelo
O sistema SHALL manter `kitchen.equipment_maintenance_plan` com exatamente um de `role_id` ou `model_id` preenchido (CHECK XOR, mesmo padrão de `recipe_equipment_requirement`), `kitchen_id` null para plano global e preenchido para plano da cozinha, `kind` em (`preventive`, `inspection`, `cleaning`, `calibration`, `legal`), `interval_days` inteiro positivo e `tolerance_days` não negativo.

#### Scenario: Rotina de papel
- **WHEN** o Catálogo Global cadastra "Limpeza de coifa" ancorada no papel `hood`, a cada 30 dias
- **THEN** toda unidade cuja lista de papéis efetivos inclui `hood` passa a ter essa rotina aplicável, independentemente do modelo

#### Scenario: Rotina de modelo
- **WHEN** o plano é ancorado em um modelo específico
- **THEN** só as unidades daquele modelo o herdam

#### Scenario: Âncora dupla rejeitada
- **WHEN** uma escrita tenta preencher `role_id` e `model_id` no mesmo plano
- **THEN** o banco rejeita pela constraint XOR

### Requirement: Planos aplicáveis usam o papel efetivo da unidade
A lista de planos aplicáveis a uma unidade SHALL ser calculada sobre os papéis **efetivos** (papéis do modelo ∪ adições de `equipment_unit_role` − remoções), nunca sobre os papéis declarados pelo modelo.

#### Scenario: Papel desabilitado na unidade
- **WHEN** uma unidade tem `equipment_unit_role.available = false` para o papel `deep_fryer`
- **THEN** a rotina de troca de óleo ancorada nesse papel NÃO aparece como aplicável àquela unidade

### Requirement: Registro de execução
O sistema SHALL registrar cada execução em `kitchen.equipment_maintenance_log` com `unit_id`, `performed_on`, `performed_by`, `provider` (`in_house` | `contract` | `manufacturer`), `plan_id` opcional e `issue_id` opcional. `plan_id` nulo MUST ser aceito para manutenção corretiva ou avulsa.

#### Scenario: Manutenção não planejada
- **WHEN** a praça registra um conserto que não corresponde a nenhum plano
- **THEN** o log é criado com `plan_id` nulo e aparece no histórico da unidade

#### Scenario: Conserto ligado à pane
- **WHEN** o registro é feito a partir de uma pane aberta
- **THEN** o log grava `issue_id` e a pane pode ser resolvida no mesmo fluxo

### Requirement: Vencimento é derivado, nunca armazenado
O sistema SHALL calcular `next_due_on` de cada par unidade × plano em função pura, sem coluna persistida, na seguinte ordem: (1) `performed_on` do log mais recente daquele plano naquela unidade `+ interval_days`; (2) na ausência de log, `installed_on ?? acquired_on` da unidade `+ interval_days`; (3) na ausência das duas datas, o par MUST ser reportado como **`sem registro`** e MUST NOT ser reportado como vencido.

#### Scenario: Parque recém-migrado
- **WHEN** o relatório roda logo após a migration, sobre unidades sem log e sem data de instalação ou aquisição
- **THEN** todos os pares aparecem como `sem registro`, e nenhum como vencido

#### Scenario: Ancorado na instalação
- **WHEN** a unidade tem `installed_on` e nenhuma execução registrada, com plano de 30 dias
- **THEN** o vencimento é `installed_on + 30 dias`

#### Scenario: Dentro da tolerância
- **WHEN** o vencimento passou há 3 dias e `tolerance_days = 5`
- **THEN** o par é reportado como `em dia`

#### Scenario: Vencido
- **WHEN** o vencimento passou além da tolerância
- **THEN** o par é reportado como `vencida` com o número de dias de atraso

### Requirement: Autoria da rotina
Criar e editar plano SHALL exigir `global` nível 2 para plano global e `kitchen` nível 2 para plano da própria cozinha. Registrar execução SHALL ser permitido a `kitchen` nível 2 ou `kitchen-production` nível 1 no escopo da cozinha da unidade.

#### Scenario: Produção registra execução
- **WHEN** um usuário com apenas `kitchen-production` nível 1 registra a limpeza da coifa
- **THEN** o log é criado com ele como autor

#### Scenario: Produção tenta editar o plano
- **WHEN** o mesmo usuário tenta alterar o intervalo do plano
- **THEN** a operação é recusada por falta de permissão
