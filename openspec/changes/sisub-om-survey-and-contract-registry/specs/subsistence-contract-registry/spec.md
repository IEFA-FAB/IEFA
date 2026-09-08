# subsistence-contract-registry

## ADDED Requirements

### Requirement: Registro de contratação de subsistência
O sistema SHALL manter, por OM, um registro de contratações afetas ao sistema de subsistência, com espécie (`ata`, `contrato`, `dispensa`, `inexigibilidade`, `empenho_direto`, `termo_aditivo`), NUP/PAG, número, ano, UASG, objeto, fornecedor, natureza de despesa, vigência inicial e final, situação e valores total, empenhado, liquidado e pago. O registro MUST ser independente de qualquer campanha de levantamento. Ler SHALL exigir `unit` nível 1 no escopo da OM; escrever, `unit` nível 2 no mesmo escopo.

#### Scenario: Contratação que nenhuma fonte conhece
- **WHEN** a OM cadastra a ATA de material permanente do PAG 67273.004608/2025-31, que não veio de nenhuma sincronização
- **THEN** a contratação é gravada com origem `manual` e passa a estar disponível para vínculo com o levantamento

#### Scenario: Escopo de unidade
- **WHEN** um usuário escopado na BASM tenta editar contratação da BAPV
- **THEN** a operação é negada

### Requirement: Classificação por tópico durável
Toda contratação SHALL ser classificada em exatamente um tópico de vocabulário fechado e estável — `uniformes`, `climatizacao`, `obra_reforma`, `mobiliario`, `utensilios`, `capacitacao`, `equipamento`, `generos_alimenticios` ou `outros`. O tópico MUST NOT referenciar categoria de campanha. Categoria de campanha SHALL apontar para um tópico, e mais de uma categoria PODE apontar para o mesmo tópico.

#### Scenario: Duas categorias, um tópico
- **WHEN** a campanha define "Aquisição de Ar-Condicionado" e "Manutenção de Ar-Condicionado", ambas no tópico `climatizacao`
- **THEN** as contratações de climatização da OM aparecem como candidatas nas duas categorias, e a distinção entre aquisição e manutenção vem da espécie e da natureza de despesa da contratação

#### Scenario: Consumo por outro sistema
- **WHEN** outro app do monorepo lê o registro de contratações de uma OM
- **THEN** consegue interpretar espécie, tópico, vigência e valores sem conhecer nenhuma campanha de levantamento

### Requirement: Identidade e ausência de duplicata
Contratação com origem externa SHALL ser única por (origem, identificador externo); contratação cadastrada manualmente SHALL ser única por (OM, espécie, número, UASG, ano). Reimportar ou ressincronizar a mesma contratação MUST atualizar a linha existente, nunca criar outra.

#### Scenario: Ressincronização
- **WHEN** o mesmo contrato do Compras.gov é sincronizado pela segunda vez com valor pago maior
- **THEN** a linha existente é atualizada e a contagem de contratações da OM não muda

#### Scenario: Colisão entre manual e sincronizado
- **WHEN** a OM já cadastrou à mão um contrato que depois chega pela sincronização
- **THEN** as duas linhas coexistem, a sincronizada é marcada como possível duplicata da manual, e a decisão de fundir é do operador — o sistema MUST NOT apagar o cadastro manual automaticamente

### Requirement: Valores de execução espelhados, não digitados
Quando a contratação tiver origem em fonte do próprio sistema, os valores empenhado, liquidado e pago SHALL ser derivados dessa fonte e recalculáveis, e MUST NOT ser editáveis na tela. Para contratação de origem `manual`, os mesmos campos SHALL ser editáveis.

#### Scenario: Tentativa de editar valor espelhado
- **WHEN** o operador abre uma contratação projetada de ATA do próprio sistema
- **THEN** os campos de execução aparecem em somente leitura, com indicação da fonte

#### Scenario: Registro manual
- **WHEN** o operador cadastra uma dispensa de manutenção de ar-condicionado
- **THEN** informa os valores de execução manualmente, e o registro indica que a origem é declaração da OM
