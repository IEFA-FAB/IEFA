# siafi-file-import

## ADDED Requirements

### Requirement: Importação de relatório do Tesouro Gerencial
O sistema SHALL aceitar upload de relatório exportado do Tesouro Gerencial (CSV ou XLSX) com o tipo declarado (`credito` | `ne` | `ns` | `ob`), persistindo `siafi_integration.import_batch` (nome do arquivo, hash do conteúdo, tipo, competência, autor, contagens) e `siafi_integration.import_row` com **cada linha crua em jsonb** antes de qualquer normalização.

#### Scenario: Importação válida
- **WHEN** o gestor sobe um relatório de NE com 40 linhas reconhecidas
- **THEN** o sistema cria um lote com 40 linhas cruas persistidas e apresenta o resumo antes de aplicar ao domínio

#### Scenario: Arquivo idêntico reimportado
- **WHEN** o gestor sobe um arquivo cujo hash já foi importado
- **THEN** o sistema reconhece a duplicata e não cria lote novo

#### Scenario: Tipo de relatório incompatível
- **WHEN** o gestor declara `ne` mas o arquivo não contém as colunas obrigatórias desse tipo
- **THEN** o sistema rejeita a importação com mensagem indicando as colunas ausentes, sem persistir linhas no domínio

### Requirement: Parser tolerante a variação de layout
O parser SHALL reconhecer colunas por mapa de sinônimos (ex.: "Nota de Empenho", "NE", "Documento" → número do empenho) e normalizar valores monetários no formato pt-BR (`1.234,56`) e datas `DD/MM/AAAA`. Zero linhas reconhecidas MUST ser tratado como erro de layout, não como importação vazia.

#### Scenario: Cabeçalhos alternativos
- **WHEN** o relatório usa "Documento" no lugar de "Nota de Empenho"
- **THEN** o parser reconhece a coluna normalmente

#### Scenario: Valor monetário pt-BR
- **WHEN** o arquivo traz `1.234,56`
- **THEN** o valor persistido é 1234.56

#### Scenario: Layout desconhecido
- **WHEN** nenhuma linha do arquivo é reconhecida
- **THEN** o sistema falha com "layout não reconhecido" e preserva o lote para diagnóstico

### Requirement: Aplicação ao domínio com origem rastreável
Após a revisão do resumo, o sistema SHALL aplicar as linhas ao domínio: crédito substitui o snapshot da competência; NE/NS/OB fazem upsert por número de documento dentro da unidade e exercício. Todo registro criado ou atualizado por importação MUST ser marcado com `origem = siafi` e `siafi_synced_at`, e MUST manter o vínculo com o `import_batch`.

#### Scenario: Empenho novo vindo do SIAFI
- **WHEN** o relatório traz uma NE que não existe no sisub
- **THEN** o empenho é criado com `origem = siafi` e vinculado ao lote

#### Scenario: Empenho existente é enriquecido
- **WHEN** o relatório traz uma NE já registrada manualmente
- **THEN** o sistema preenche os campos ausentes (ND, PTRES, fonte, favorecido) e registra a divergência quando o valor difere, sem sobrescrever silenciosamente

#### Scenario: Reprocessamento sem novo upload
- **WHEN** o parser é corrigido após um lote com linhas não reconhecidas
- **THEN** é possível reprocessar as linhas cruas do lote existente sem pedir novo arquivo ao gestor
