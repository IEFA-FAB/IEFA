# survey-spreadsheet-io

## ADDED Requirements

### Requirement: Importação da planilha preenchida
O sistema SHALL importar um caderno XLSX no formato do levantamento — uma aba por OM, uma linha por categoria — criando ou atualizando as respostas da campanha indicada. A importação SHALL exigir `admin` nível 2, SHALL ser idempotente por (campanha, OM, categoria) e MUST ser atômica: nenhuma linha é gravada enquanto houver aba ou categoria não resolvida.

#### Scenario: Importação do caderno completo
- **WHEN** o administrador importa o caderno com as 27 abas preenchidas
- **THEN** cada OM tem sua resposta com os itens das sete categorias, marcados como preenchimento importado

#### Scenario: Reimportação do mesmo arquivo
- **WHEN** o mesmo caderno é importado outra vez
- **THEN** os valores são atualizados no lugar, sem criar resposta nem item duplicado

#### Scenario: Aba desconhecida
- **WHEN** o caderno traz uma aba cuja sigla não corresponde a nenhuma OM
- **THEN** a importação é recusada por inteiro, relatando as abas não reconhecidas — nenhuma OM é criada automaticamente e nada é gravado

#### Scenario: Célula de prazo com texto
- **WHEN** a célula de prazo traz "-" ou uma frase com número de PAG
- **THEN** o conteúdo vai para a nota do prazo e o campo de data fica vazio, sem falhar a importação

#### Scenario: Valor com formatação de moeda
- **WHEN** a célula de valor traz o número formatado como moeda ou como texto com separador de milhar
- **THEN** o valor é normalizado para número; célula vazia permanece como não informado, distinta de zero

### Requirement: Exportação do caderno por OM
O sistema SHALL exportar o caderno XLSX da campanha com uma aba por OM, contendo as categorias na ordem definida e os valores já registrados, mais uma aba de instruções e uma de resumo. A exportação SHALL estar disponível para `admin` nível 2 e, restrita à própria OM, para `unit` nível 1.

#### Scenario: Caderno pré-preenchido
- **WHEN** o administrador exporta a campanha em andamento
- **THEN** cada aba já traz o que aquela OM respondeu e o que o sistema sugere a partir das contratações, em coluna própria e identificada como sugestão

#### Scenario: Exportação pela OM
- **WHEN** um usuário escopado na BASM exporta
- **THEN** recebe apenas a aba da BASM

### Requirement: Resumo exportado é recalculado
A aba de resumo do caderno exportado SHALL conter totais calculados pelo sistema a partir dos itens, por OM e por categoria. Ela MUST NOT reproduzir fórmulas que derivem uma categoria por subtração do total geral.

#### Scenario: Divergência com a planilha de origem
- **WHEN** o total de uma categoria calculado pelo sistema diverge do total da planilha original
- **THEN** o resumo exportado traz o valor recalculado e uma nota explicando que a origem do consolidado passou a ser o sistema
