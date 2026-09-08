# contract-sources-ingestion

## ADDED Requirements

### Requirement: Projeção das ATAs e da execução já existentes
O sistema SHALL projetar para o registro de contratações as ATAs de `procurement.procurement_arp` da OM, com origem `procurement_arp` e tópico `generos_alimenticios`, e SHALL derivar seus valores empenhado, liquidado e pago da cadeia `finance.empenho → liquidacao → pagamento`. A projeção MUST ser idempotente e MUST NOT criar linha por empenho.

#### Scenario: ATA de gênero aparece no registro
- **WHEN** a OM tem ATA vigente em `procurement_arp` com empenhos liquidados e pagos
- **THEN** o registro mostra uma contratação com origem no próprio sistema e os valores de execução somados da cadeia do `finance`

#### Scenario: Reprojeção após novo pagamento
- **WHEN** um pagamento novo é registrado e a projeção roda de novo
- **THEN** a mesma linha tem o valor pago atualizado e nenhuma linha nova é criada

#### Scenario: Despesa não-alimentar não é inventada
- **WHEN** a OM não tem nenhuma contratação de climatização no sistema
- **THEN** a projeção não cria nada para aquele tópico — a ausência é exibida como ausência, não como zero apurado

### Requirement: Sincronização do Compras.gov por UASG
O sistema SHALL sincronizar contratações do Compras.gov para a UASG de cada OM, gravando com origem `compras_gov` e identificador externo da API. A execução SHALL registrar progresso, passo e falha em `compras_gov_integration.compras_sync_log`/`compras_sync_step`, honrar pedido de parada e ser idempotente. Falha da sincronização MUST NOT impedir cadastro manual nem preenchimento do levantamento.

#### Scenario: OM sem UASG cadastrada
- **WHEN** a sincronização é disparada e a OM não tem UASG
- **THEN** aquela OM é registrada como passo ignorado com o motivo, e as demais seguem

#### Scenario: API indisponível
- **WHEN** a API de dados abertos falha no meio da sincronização
- **THEN** a falha fica registrada no log com o passo em que ocorreu, e o que já foi gravado permanece consistente

#### Scenario: Pedido de parada
- **WHEN** um operador solicita parada durante a sincronização
- **THEN** a execução encerra no fim do passo corrente e o log reflete o encerramento solicitado

### Requirement: Saneamento das Organizações Militares
O sistema SHALL preencher a UASG das Organizações Militares que participam do levantamento, criar a OM ausente `BABV` e reconciliar a identificação do `CINDACTA 2` com a grafia `CINDACTA II` usada na planilha. O preenchimento MUST vir de lista explícita conferida contra o mapa UG→sigla já existente, e MUST NOT ser inferido por semelhança de nome. UASG não conferida SHALL permanecer nula.

#### Scenario: Backfill conferido
- **WHEN** a migration de saneamento é aplicada
- **THEN** as OMs do levantamento passam a ter UASG, e nenhuma UASG é atribuída a OM que não estava na lista conferida

#### Scenario: OM ausente
- **WHEN** a planilha traz a aba BABV, que não existe em `core.units`
- **THEN** a OM passa a existir com código próprio, e a importação da aba deixa de falhar

#### Scenario: Grafia divergente
- **WHEN** a aba se chama "CINDACTA II" e o cadastro guarda "CINDACTA 2"
- **THEN** as duas grafias resolvem para a mesma OM, sem criar unidade duplicada

### Requirement: Origem sempre rastreável
Toda contratação SHALL indicar sua origem e, quando aplicável, o identificador externo e o instante da última sincronização. Contratação de origem externa MUST ser distinguível na tela da que foi declarada pela OM.

#### Scenario: Leitura da origem
- **WHEN** o operador abre a lista de contratações da OM
- **THEN** distingue as que vieram do próprio sistema, as do Compras.gov e as declaradas manualmente, com a data da última sincronização quando houver
