## ADDED Requirements

### Requirement: Detecção de tenant via variável de ambiente
O sistema DEVE ler a variável `VITE_APP_TENANT` para determinar o tenant ativo. Valores aceitos: `"forms"` e `"cinco-s"`. Se ausente ou inválido, o tenant DEVE ser `"forms"` (default).

#### Scenario: Tenant cinco-s configurado
- **WHEN** `VITE_APP_TENANT=cinco-s` está definido no ambiente
- **THEN** o sistema identifica o tenant como `"cinco-s"` e aplica tema e filtros correspondentes

#### Scenario: Variável ausente
- **WHEN** `VITE_APP_TENANT` não está definido
- **THEN** o sistema usa `"forms"` como tenant padrão, sem alteração no comportamento atual

#### Scenario: Valor inválido
- **WHEN** `VITE_APP_TENANT` contém valor diferente de `"forms"` ou `"cinco-s"`
- **THEN** o sistema usa `"forms"` como fallback

### Requirement: TenantProvider disponibiliza contexto do tenant
O sistema DEVE prover um `TenantProvider` no nível raiz da aplicação que expõe o tenant ativo e suas configurações via React Context. Um hook `useTenant()` DEVE estar disponível para qualquer componente descendente.

#### Scenario: Acesso ao tenant context
- **WHEN** um componente chama `useTenant()`
- **THEN** recebe um objeto com `{ id, name, tagFilter }` onde `tagFilter` é `null` para `"forms"` e `["5s"]` para `"cinco-s"`

#### Scenario: Uso fora do provider
- **WHEN** `useTenant()` é chamado fora do `TenantProvider`
- **THEN** o sistema DEVE lançar um erro descritivo

### Requirement: Tema visual condicional por tenant
O sistema DEVE aplicar um conjunto diferente de CSS custom properties quando o tenant é `"cinco-s"`. O atributo `data-tenant` no elemento `<html>` DEVE refletir o tenant ativo.

#### Scenario: Tenant forms (padrão)
- **WHEN** o tenant é `"forms"`
- **THEN** o `<html>` recebe `data-tenant="forms"` e os tokens de design "Pale Brutalism" são aplicados (radius zero, sombras hard, paleta acromática)

#### Scenario: Tenant cinco-s
- **WHEN** o tenant é `"cinco-s"`
- **THEN** o `<html>` recebe `data-tenant="cinco-s"` e os tokens de design institucional 5S são aplicados (radius `0.5rem`, sombras suaves, paleta azul-verde institucional)

#### Scenario: Componentes UI inalterados
- **WHEN** o tema muda entre tenants
- **THEN** todos os componentes UI existentes (Button, Card, Input, etc.) DEVEM funcionar sem alteração — apenas os valores das CSS vars mudam

### Requirement: Script de desenvolvimento para tenant cinco-s
O monorepo DEVE ter um script `cinco-s:dev` no `package.json` raiz que inicia o app forms com `VITE_APP_TENANT=cinco-s` na porta 3002.

#### Scenario: Executar cinco-s:dev
- **WHEN** o desenvolvedor executa `bun run cinco-s:dev`
- **THEN** o app forms inicia na porta 3002 com o tema 5S e filtros de conteúdo ativados

#### Scenario: Executar forms:dev continua igual
- **WHEN** o desenvolvedor executa `bun run forms:dev`
- **THEN** o app forms inicia na porta 3001 com comportamento inalterado (sem filtro, tema brutalist)
