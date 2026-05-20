## ADDED Requirements

### Requirement: Validação SQL de analytics tem cobertura unitária
`validateSql()` MUST ter testes para aceitar somente SELECT/CTE seguros, bloquear DML/DDL, limitar tamanho, validar whitelist de tabelas e impor limite máximo.

#### Scenario: SELECT em tabela permitida é aceito
- **WHEN** SQL `SELECT ... FROM meal_forecasts LIMIT 100` é validado
- **THEN** `validateSql()` MUST retornar `{ valid: true }`

#### Scenario: DML é bloqueado
- **WHEN** SQL contém `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `COPY`, `EXECUTE` ou `CALL`
- **THEN** `validateSql()` MUST retornar `{ valid: false }` com erro explicativo

#### Scenario: Tabela fora da whitelist é bloqueada
- **WHEN** SQL referencia tabela não listada em `ALLOWED_TABLES`
- **THEN** `validateSql()` MUST retornar erro de tabela não permitida

#### Scenario: Limit acima do máximo é bloqueado
- **WHEN** SQL contém `LIMIT 1000`
- **THEN** `validateSql()` MUST rejeitar a consulta e indicar o limite máximo permitido

### Requirement: Chart spec streaming tem cobertura sem LLM real
Parsing e emissão de `chart_spec` MUST ser testados com fixtures de texto do modelo, incluindo fence normal, fence com variações, JSON com vírgula final e erro de chave inexistente.

#### Scenario: Chart spec válido emite dados normalizados
- **WHEN** o stream contém bloco `chart-spec` com SQL válido e resultado com colunas esperadas
- **THEN** o endpoint MUST emitir evento `chart_spec` com `data`, `xAxisKey`, `series` e `sql` preservados

#### Scenario: Chave de eixo inexistente retorna erro
- **WHEN** o chart spec declara `xAxisKey` ausente no resultado SQL
- **THEN** o stream MUST emitir erro legível em vez de gráfico vazio

### Requirement: Module chat tools têm cobertura de segurança
As tools de module-chat MUST ter testes unitários/de integração para validação de argumentos, sanitização de erros e checagem PBAC por módulo/escopo.

#### Scenario: Tool sem permissão é bloqueada
- **WHEN** usuário sem permissão chama tool de escrita de `global`, `unit` ou `kitchen`
- **THEN** a tool MUST retornar erro de permissão sem executar query

#### Scenario: Tool sanitiza erro de banco
- **WHEN** Supabase retorna erro técnico
- **THEN** a resposta da tool MUST expor mensagem sanitizada adequada ao usuário

#### Scenario: Argumento inválido é rejeitado
- **WHEN** tool recebe UUID inválido, inteiro inválido ou data inválida
- **THEN** a tool MUST retornar erro de validação antes de chamar Supabase

### Requirement: Endpoints de IA exigem autenticação e permissão
Endpoints `/api/analytics/stream` e `/api/module-chat/stream` MUST ter testes provando autenticação obrigatória e permissão mínima por módulo.

#### Scenario: Analytics stream sem sessão retorna 401
- **WHEN** request sem cookie chama `/api/analytics/stream`
- **THEN** o endpoint MUST retornar 401

#### Scenario: Module chat sem permissão retorna 403
- **WHEN** usuário autenticado sem permissão do módulo chama `/api/module-chat/stream`
- **THEN** o endpoint MUST retornar 403

#### Scenario: Module chat escopado respeita scopeId
- **WHEN** usuário de cozinha A chama module chat de cozinha B
- **THEN** o endpoint MUST retornar 403
