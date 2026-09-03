# pncp-pca-plan

## ADDED Requirements

### Requirement: Ingestão em lote do Plano de Contratações Anual
O sistema SHALL ingerir o Plano de Contratações Anual por órgão e ano a partir de
`/api/pncp/v1/orgaos/{cnpj}/pca/{ano}/csv`, que é o único endpoint de lote do PNCP. A ingestão MUST
custar uma requisição por par órgão/ano, e MUST NOT iterar unidades — o CSV do CNPJ raiz já traz
todas as UASGs do órgão.

#### Scenario: Ingestão da FAB
- **WHEN** a ingestão roda para o CNPJ `00394429000100` e o ano corrente
- **THEN** uma única requisição traz o plano de todas as UASGs do órgão e as linhas são gravadas em `pncp_pca_item`

#### Scenario: Ano sem plano publicado
- **WHEN** o órgão não tem plano publicado para o ano
- **THEN** a ingestão registra ausência e NÃO falha

### Requirement: Mapeamento do CSV por nome de cabeçalho
O parser SHALL localizar cada campo pelo **nome da coluna no cabeçalho**, e MUST NOT depender da
ordem posicional. Coluna esperada ausente SHALL abortar a ingestão com erro explícito, em vez de
gravar linha parcial. O arquivo vem com BOM, separador `;` e decimal com vírgula.

#### Scenario: Coluna renomeada na origem
- **WHEN** uma coluna esperada não está no cabeçalho
- **THEN** a ingestão falha com mensagem nomeando a coluna, e nenhuma linha daquele arquivo é gravada

#### Scenario: Decimal e BOM
- **WHEN** o CSV traz `1350,0000` e BOM no início
- **THEN** o valor é convertido para numérico corretamente e a primeira coluna do cabeçalho é reconhecida

### Requirement: Reconciliação de snapshot, não upsert-merge
O CSV é o plano **completo** do par órgão/ano, portanto a ingestão SHALL reconciliar o snapshot
inteiro dentro do escopo `(cnpj_orgao, ano_pca)`: linha presente é inserida ou atualizada por
`(cnpj_orgao, ano_pca, id_item_pca)`, e linha que existia no acervo e **não** está no arquivo novo
SHALL ser marcada como removida. O sistema MUST NOT usar upsert-merge puro — item retirado do plano
permaneceria no acervo para sempre, inflando a demanda planejada em silêncio.

A remoção SHALL ser lógica, nunca física: item que foi planejado e depois retirado é sinal, não
lixo.

#### Scenario: Reprocessamento sem mudança
- **WHEN** o mesmo órgão/ano é ingerido duas vezes com o mesmo conteúdo
- **THEN** nenhuma linha é inserida, nenhuma é marcada como removida, e a contagem de inseridos é zero

#### Scenario: Item retirado do plano
- **WHEN** um item presente na ingestão anterior não está no arquivo novo do mesmo órgão/ano
- **THEN** ele é marcado como removido, com a data, e deixa de contar na demanda planejada

#### Scenario: Escopo da reconciliação
- **WHEN** o órgão A, ano 2026, é reconciliado
- **THEN** nenhuma linha de outro órgão ou de outro ano é afetada

### Requirement: Reconciliação só ocorre sobre download comprovadamente completo
A ingestão SHALL confirmar que o arquivo foi recebido por inteiro antes de marcar qualquer linha
como removida, e MUST reconciliar dentro de uma única transação. A origem responde
`Content-Length: None` (transferência chunked), de modo que um arquivo truncado é indistinguível de
um arquivo curto — sem essa guarda, uma conexão cortada marcaria o plano inteiro como removido.

#### Scenario: Download truncado
- **WHEN** a transferência é interrompida e o arquivo chega parcial
- **THEN** nenhuma linha é marcada como removida e a ingestão falha explicitamente

#### Scenario: Queda anômala de volume
- **WHEN** o arquivo novo tem volume drasticamente menor que o do acervo para o mesmo órgão/ano
- **THEN** a reconciliação é abortada e reportada, em vez de aplicada

### Requirement: Invalidação por conteúdo e sonda de mudança
O acervo SHALL guardar o hash do último arquivo aplicado por par órgão/ano, e MUST pular a
reconciliação inteira quando o arquivo novo for idêntico — foi medido que o CSV volta **byte a byte
igual** entre coletas, e reaplicar custaria 21 mil escritas sem nenhuma mudança de estado.

Revalidação condicional por HTTP MUST NOT ser tentada: o endpoint responde `no-store` e **não envia
`ETag` nem `Last-Modified`**.

#### Scenario: Arquivo inalterado
- **WHEN** o hash do arquivo baixado é igual ao do último aplicado
- **THEN** nenhuma escrita ocorre no acervo e o sync registra "sem mudança"

#### Scenario: Sem validadores HTTP
- **WHEN** o cliente busca o CSV
- **THEN** ele NÃO envia `If-None-Match` nem `If-Modified-Since`

### Requirement: Frescor declarado na leitura
A leitura SHALL expor a data da última ingestão bem-sucedida do par órgão/ano que está sendo
exibido. O sistema MUST NOT apresentar o acervo como se fosse consulta ao vivo — a latência da
origem foi medida entre **2 s e 35 s para o mesmo arquivo**, e nenhuma requisição de usuário toca a
origem.

#### Scenario: Exibição do plano
- **WHEN** a tela mostra itens planejados
- **THEN** ela informa quando aquele plano foi coletado

#### Scenario: Origem indisponível
- **WHEN** a origem está fora do ar
- **THEN** a tela continua servindo o acervo local, com a data de coleta visível

### Requirement: Cobertura de catálogo exibida, nunca escondida
A leitura SHALL informar quantos itens têm código de catálogo e quantos não têm. O sistema MUST NOT
omitir da contagem os itens sem CATMAT nem apresentá-los como se estivessem cobertos — na medição,
22% dos itens alimentares não têm código e 30% não têm quantidade.

#### Scenario: Classe com itens sem código
- **WHEN** uma classe tem itens com e sem CATMAT
- **THEN** a tela mostra as duas contagens e o total, e o item sem código aparece marcado como tal

#### Scenario: Item sem quantidade
- **WHEN** o item não tem quantidade estimada
- **THEN** ele NÃO entra em nenhuma soma de quantidade, e a soma exibida declara quantos itens ficaram de fora

### Requirement: Join por código de catálogo, nunca por texto
O vínculo entre item do PCA e `procurement.purchase_item` SHALL ser feito por igualdade de código
CATMAT. O sistema MUST NOT inferir vínculo por semelhança de descrição — é a falha que removeu a
capability de evidência de preço da versão anterior deste change.

#### Scenario: CATMAT presente no catálogo
- **WHEN** o CATMAT do item do PCA existe em `purchase_item`
- **THEN** o item é exibido como já coberto pelo catálogo, com o insumo correspondente

#### Scenario: CATMAT ausente do catálogo
- **WHEN** o CATMAT não existe em `purchase_item`
- **THEN** o item é exibido como não coberto, e NENHUM vínculo por descrição é sugerido

#### Scenario: Catálogo curado depois da ingestão
- **WHEN** um insumo novo é cadastrado em `purchase_item` com um CATMAT que já estava no acervo do PCA
- **THEN** o item passa a aparecer como coberto sem nova ingestão, porque a cobertura é derivada na leitura e MUST NOT ser persistida

### Requirement: Plano é estimativa e a tela declara isso
Todo valor exibido SHALL ser rotulado como **estimado em plano**. O sistema MUST NOT apresentar
valor do PCA como preço praticado, e MUST NOT permitir que ele alimente memória de cálculo de
pesquisa de preço.

#### Scenario: Exibição de valor
- **WHEN** um valor unitário do PCA é exibido
- **THEN** ele aparece rotulado como estimado, com o ano do plano

#### Scenario: Tentativa de uso como referência
- **WHEN** a tela de pesquisa de preço é aberta
- **THEN** nenhum dado do PCA é oferecido como amostra

### Requirement: Lista de UASGs que planejam gênero
A leitura SHALL expor as UASGs com itens alimentares planejados, com o nome oficial da unidade
responsável, para servir de insumo à curadoria manual de `core.units.uasg`.

#### Scenario: Listagem de UASGs
- **WHEN** a tela é aberta
- **THEN** as UASGs com item alimentar são listadas com código, nome oficial e contagem de itens

### Requirement: Cliente tolerante à instabilidade da origem
O cliente SHALL avaliar o status HTTP antes de ler o corpo e MUST NOT confiar no `content-type`.
Foram medidos, na mesma origem: `429` com corpo HTML, `500` com `content-type: application/json` e
corpo de texto puro, `204` com corpo vazio, e timeouts acima de 40 s — intercalados com respostas de
0,1 s. Nenhum desses MUST ser tratado como quebra de contrato.

#### Scenario: Resposta 204
- **WHEN** a origem responde 204 com corpo vazio
- **THEN** o resultado é ausência de dado, e NÃO um erro de desserialização

#### Scenario: Resposta 500 com corpo de texto
- **WHEN** a origem responde 500 com corpo `"Erro na comunicação com o banco de dados."`
- **THEN** o erro é classificado como transitório da origem e é retentável

#### Scenario: Requisições seriais numa conexão
- **WHEN** a ingestão emite requisições
- **THEN** elas são seriais, e NÃO concorrentes contra a mesma origem

### Requirement: Sync log discrimina a origem
Antes de qualquer ingestão nova gravar em `compras_sync_log`, a tabela SHALL ter coluna que
discrimine a origem do sync, e as consultas de concorrência, recuperação e "último sync" SHALL
filtrar por ela. Sem isso um sync do PNCP bloquearia o sync do Compras.gov, marcaria o sync alheio
como falho, e apareceria na tela de rotinas do Compras.gov com o rótulo errado.

#### Scenario: Syncs de origens diferentes
- **WHEN** um sync do PNCP está em execução e um sync do Compras.gov é disparado
- **THEN** o segundo NÃO é bloqueado pelo primeiro

#### Scenario: Último sync por origem
- **WHEN** a tela de rotinas do Compras.gov pede o último sync
- **THEN** ela recebe o último sync daquela origem, e não o do PNCP

### Requirement: Acesso pelos guards existentes
A tabela nova SHALL nascer com RLS ligada e sem policy, com acesso somente por server fn com
service role. A leitura SHALL exigir usuário autenticado no guard já usado pelo módulo onde a tela
vive. Nenhum módulo PBAC novo MUST ser criado.

#### Scenario: Leitura autenticada
- **WHEN** um usuário sem sessão chama a fn de leitura
- **THEN** a chamada é rejeitada pelo guard existente
