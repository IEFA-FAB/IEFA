## ADDED Requirements

### Requirement: Demanda estruturada pelo Value-Focused Thinking

O requisitante SHALL estruturar a demanda em passos, na ordem: problema, objetivos, alternativas,
solução, itens, preços, riscos e planejamento, antes de gerar qualquer peça.

#### Scenario: objetivo-meio sem fundamental
- **WHEN** um objetivo-meio não aponta nenhum objetivo fundamental
- **THEN** a demanda mostra a pendência "atenção" no passo Objetivos

#### Scenario: menos de duas alternativas
- **WHEN** a demanda tem uma única alternativa
- **THEN** o envio à ACI fica bloqueado até outra alternativa ser registrada

### Requirement: Enquadramento pelo valor e pela exclusividade

A demanda SHALL indicar a via de contratação pela natureza, pela exclusividade e pelo valor
estimado somado ao já gasto no exercício com objeto da mesma natureza.

#### Scenario: soma do exercício acima do limite
- **WHEN** um bem estimado em R$ 50.946,28 soma R$ 20.000,00 já gastos em 2026
- **THEN** o enquadramento indicado é licitação, e não dispensa do art. 75, II

### Requirement: Peças idênticas entre si

DFD, ETP, Mapa de Riscos e TR SHALL sair da mesma demanda, com o mesmo objeto, itens e valores.

#### Scenario: objeto nas peças
- **WHEN** as peças são geradas
- **THEN** a descrição sucinta do DFD, o objeto do Mapa de Riscos e o início das condições gerais do TR são o mesmo texto

### Requirement: Envio à ACI como submissão comum

O envio SHALL gerar o ETP e o TR em `.docx` e gravá-los como submissões com `demand_id`, que seguem
a extração e a verificação existentes.

#### Scenario: pendência que bloqueia
- **WHEN** a demanda tem conferência "bloqueia"
- **THEN** o α responde 422 `DEMAND_BLOCKED` com as pendências e não grava submissão

#### Scenario: edição concorrente
- **WHEN** duas pessoas gravam a mesma demanda a partir da mesma versão
- **THEN** a segunda gravação recebe 409 `DEMAND_CHANGED` e nada é sobrescrito
