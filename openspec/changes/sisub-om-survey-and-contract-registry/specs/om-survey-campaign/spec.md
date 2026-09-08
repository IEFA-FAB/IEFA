# om-survey-campaign

## ADDED Requirements

### Requirement: Campanha de levantamento
O sistema SHALL representar um levantamento como campanha com código único, título, finalidade, ano-base do realizado, ano-alvo da necessidade, prazo de resposta e status em exatamente um de `draft`, `open` ou `closed`. Criar, abrir, fechar e reabrir campanha SHALL exigir módulo `admin` nível 2. Campanha em `draft` MUST NOT aceitar resposta de OM; campanha em `closed` MUST NOT aceitar edição de resposta.

#### Scenario: Abertura da campanha
- **WHEN** o administrador abre a campanha DIVISA com ano-base 2025 e ano-alvo 2026
- **THEN** todas as OMs com módulo `unit` passam a ver o levantamento pendente na sua unidade

#### Scenario: Escrita em campanha fechada
- **WHEN** uma OM tenta salvar item de uma campanha `closed`
- **THEN** a operação é recusada com erro de domínio e nada é gravado

#### Scenario: Código duplicado
- **WHEN** o administrador cria uma segunda campanha com o mesmo código
- **THEN** a criação é recusada — o código é a identidade estável entre edições

### Requirement: Categorias são dado da campanha
Cada campanha SHALL definir suas próprias categorias, com código, rótulo, ordem de exibição, tópico durável e, opcionalmente, natureza de despesa sugerida e texto de orientação. O conjunto de categorias MUST NOT ser fixado em enum de banco nem em código da aplicação. Categoria com resposta já gravada MUST NOT ser excluída — apenas desativada.

#### Scenario: Nova edição com outras categorias
- **WHEN** o administrador cria a campanha do ano seguinte com nove categorias, duas delas inéditas
- **THEN** a campanha é criada sem migration de banco e as respostas da edição anterior seguem legíveis com as categorias antigas

#### Scenario: Exclusão de categoria respondida
- **WHEN** o administrador tenta excluir uma categoria que já tem item preenchido por alguma OM
- **THEN** a exclusão é recusada e é oferecida a desativação, que a remove do formulário sem apagar o histórico

### Requirement: Resposta por Organização Militar
O sistema SHALL manter no máximo uma resposta por (campanha, OM), com status em `draft`, `submitted` ou `validated`, e com identificação do responsável pelo preenchimento — nome, função/posto e contato. Ver a resposta SHALL exigir `unit` nível 1 no escopo daquela OM; editar e submeter, `unit` nível 2 no mesmo escopo. Submeter SHALL registrar autor e instante da submissão.

#### Scenario: Isolamento entre OMs
- **WHEN** um usuário com `unit` nível 2 escopado na BASM abre o levantamento da BAPV
- **THEN** o acesso é negado — escopo de unidade não vaza entre OMs

#### Scenario: Segunda resposta da mesma OM
- **WHEN** duas sessões da mesma OM criam a resposta da mesma campanha ao mesmo tempo
- **THEN** apenas uma linha existe ao final, e a segunda operação enxerga a resposta já criada em vez de falhar com violação de unicidade

#### Scenario: Submissão registra autor
- **WHEN** o chefe da SSUB submete a resposta
- **THEN** ficam gravados quem submeteu e quando, e o status passa a `submitted`

### Requirement: Grão da resposta é a categoria
O sistema SHALL manter, por (resposta, categoria), exatamente uma linha com valor realizado no ano-base, resumo do realizado, valor necessário no ano-alvo, resumo da necessidade, observação sobre os valores, situação anterior informada, prazo, nota do prazo e observações. Valor não informado MUST ser distinguível de zero informado. Prazo SHALL ser armazenado como data em campo próprio, separado do texto livre sobre o prazo.

#### Scenario: Zero não é ausência
- **WHEN** a OM informa `0,00` em "Aquisição de Ar-Condicionado" e deixa "Treinamento" em branco
- **THEN** a primeira consta como respondida com zero e a segunda como não respondida, e o relatório distingue as duas

#### Scenario: Prazo textual não vira data
- **WHEN** a OM registra "Já existe contrato de manutenção. PAG 67273.003551/2024-71" no prazo
- **THEN** o texto é preservado na nota do prazo e o campo de data permanece vazio, sem tentativa de conversão

#### Scenario: Valor monetário devolvido como texto
- **WHEN** um item com `realized_amount` gravado é lido de volta e reaberto para edição
- **THEN** o formulário aceita o valor sem erro de validação, ainda que o banco devolva `numeric` como string

### Requirement: Total nunca é gravado
O sistema MUST NOT persistir total por OM, por categoria ou geral. Todo total SHALL ser calculado a partir dos itens no momento da leitura.

#### Scenario: Item alterado após consulta do total
- **WHEN** uma OM corrige o valor de uma categoria depois de o consolidado já ter sido exibido
- **THEN** a consulta seguinte reflete a correção sem nenhum passo de recálculo ou reprocessamento
