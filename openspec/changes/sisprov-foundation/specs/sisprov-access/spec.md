## ADDED Requirements

### Requirement: Três módulos PBAC por papel
O `AppModule` de `@iefa/pbac` SHALL conter `sisprov-planning`, `sisprov-supply` e `sisprov-admin`, com o comentário de cada um no padrão do arquivo. Os três MUST ser escopados por OM (`unit`), com cobertura pela hierarquia de apoio (`core.units.supporting_unit_id`): grant na apoiadora cobre as apoiadas, transitivamente; o inverso não. Grant sem escopo é global. Nenhum DDL é necessário: `access_control.user_permissions.module` é texto sem CHECK.

| Módulo | Nível 1 | Nível 2 | Nível 3 |
| --- | --- | --- | --- |
| `sisprov-planning` | consultar previsão e adesão da OM | informar e ajustar a previsão da OM | não existe |
| `sisprov-supply` | consultar OF e estoque da OM | receber OF, distribuir, trocar, devolver | não existe |
| `sisprov-admin` | não existe | gestão sistêmica: grupos, enxovais, curvas, períodos, aprovação de OF | gerenciar grants dos três módulos |

#### Scenario: Cobertura pela apoiadora
- **WHEN** um usuário tem `sisprov-planning` nível 2 escopado ao GAP-SJ e abre a previsão do IAE (apoiado pelo GAP-SJ)
- **THEN** o guard aceita; abrir a previsão de uma OM fora da cobertura é recusado

#### Scenario: Papéis independentes na mesma OM
- **WHEN** um usuário tem `sisprov-supply` nível 2 numa OM e nenhum `sisprov-planning`
- **THEN** ele opera o almoxarifado dessa OM e não enxerga nem edita a previsão dela

### Requirement: Militar como sessão autenticada
O militar que preenche a própria ficha de tamanhos ou confirma o recebimento do próprio fardamento SHALL ser identificado pela sessão (SARAM via `core.military_identity` e o vínculo verificado), sem módulo PBAC. Essas rotas MUST exigir autenticação e MUST NOT exigir grant.

#### Scenario: Militar sem grant acessa o próprio
- **WHEN** um usuário autenticado sem módulo `sisprov-*` abre a própria ficha de tamanhos (change posterior)
- **THEN** a rota abre; a ficha de outro SARAM é recusada

### Requirement: Gates de servidor por papel
`apps/sisprov/src/lib/auth.server.ts` SHALL expor, sobre `createRequestAuth` de `@iefa/pbac/start`, os gates `requirePlanning(level, unitId?)`, `requireSupply(level, unitId?)`, `requireSisprovAdmin(level)` e `requireSisprovApp()` (qualquer módulo do app, nível 1). Toda server function MUST chamar um gate ou delegar a uma operation que receba `UserContext` (regra `server-fn-missing-auth-guard`); endpoint público (`/health`, documentos legais, sessão) é marcado com o comentário e o `nosemgrep` do padrão.

#### Scenario: Server function sem gate
- **WHEN** uma server function do sisprov é escrita sem `require*` nem operation com `ctx`
- **THEN** o opengrep reprova no CI com `server-fn-missing-auth-guard`

### Requirement: Autogestão de grants só dos módulos do app, auditada
O SISPROV SHALL gerir apenas grants dos módulos `sisprov-*`, pela tela de permissões (`sisprov-admin` nível 3), com busca por e-mail (`searchUsersByEmail`), concessão e revogação por `changeModulePermission` (grant e linha de `access_control.sensitive_operation_log` na mesma transação, ator da sessão). O par (módulo, nível) MUST ser validado junto, por `discriminatedUnion`: `sisprov-planning` e `sisprov-supply` em 1 ou 2; `sisprov-admin` em 2 ou 3. A revogação MUST partir da linha lida no servidor pelo `permissionId`, filtrada aos módulos do app. Ninguém revoga o próprio `sisprov-admin` nível 3 (`assertGrantable`).

#### Scenario: Tentativa de conceder módulo de outro app
- **WHEN** o cliente envia `module = "global"` para a server function de concessão
- **THEN** o schema recusa antes de qualquer escrita

#### Scenario: Auto-revogação da administração
- **WHEN** o último administrador tenta revogar o próprio `sisprov-admin` nível 3
- **THEN** a operação é recusada com a mensagem de política e nada é gravado

### Requirement: Rótulos dos módulos
Os rótulos de tela SHALL ser "Planejamento" (`sisprov-planning`), "Almoxarifado" (`sisprov-supply`) e "Administração" (`sisprov-admin`), com a legenda de nível 1 "Consulta", 2 "Operação" (planning e supply) ou "Gestão" (admin), 3 "Administrador". `apps/docs/content/docs/pbac/modulos.mdx` MUST documentar os três no padrão das demais seções.

#### Scenario: Seletor da tela de permissões
- **WHEN** o administrador abre o seletor de módulo e nível
- **THEN** só aparecem as combinações válidas da tabela acima, com esses rótulos
