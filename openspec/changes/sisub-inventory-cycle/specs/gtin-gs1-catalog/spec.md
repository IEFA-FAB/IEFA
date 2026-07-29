# gtin-gs1-catalog — Fase 2b

## ADDED Requirements

### Requirement: Entidade GTIN validada e normalizada
O sistema SHALL manter `gs1_integration.gtin` com PK no GTIN normalizado a 14 dígitos (GTIN-8/12/13 com pad de zeros à esquerda). Todo GTIN persistido MUST ter check digit válido (algoritmo GS1). A entidade SHALL guardar descrição, marca, conteúdo líquido + unidade canônica, NCM, código de brick GPC, origem (`nfe` | `vbg` | `manual`) e payload bruto.

#### Scenario: GTIN-13 normalizado
- **WHEN** o usuário cadastra o GTIN-13 `7891234567895`
- **THEN** o sistema persiste `07891234567895` (14 dígitos) com check digit validado

#### Scenario: Check digit inválido
- **WHEN** o usuário informa um código cujo dígito verificador não confere
- **THEN** o sistema rejeita o cadastro indicando o erro

### Requirement: Hierarquia de embalagem
A entidade GTIN SHALL suportar hierarquia via `parent_gtin` + `units_per_parent` (ex.: caixa DUN-14 contendo 12 unidades GTIN-13), permitindo resolver a quantidade em unidade base a partir de qualquer nível da hierarquia.

#### Scenario: Resolução via caixa
- **WHEN** uma NF-e informa `cEAN` de uma caixa cadastrada com `units_per_parent = 12` e a unidade filha tem conteúdo líquido 1 KG
- **THEN** o sistema resolve 1 caixa = 12 KG na unidade base

### Requirement: Classificação GPC importada
O sistema SHALL importar a publicação GPC da GS1 (segmento, família, classe, brick) em `gs1_integration.gpc_brick`, de forma idempotente (padrão dos importadores TACO/IBGE/USDA), e usar o brick para sugestão de correspondência e agrupamento analítico.

#### Scenario: Reimportação idempotente
- **WHEN** o importador GPC roda duas vezes sobre a mesma publicação
- **THEN** o resultado final é idêntico, sem duplicatas

### Requirement: Migração de barcode legado
O backfill SHALL normalizar `kitchen.ingredient_item.barcode`: valores com check digit válido viram `gtin` (FK + UNIQUE parcial `WHERE deleted_at IS NULL`); inválidos permanecem em `barcode` e entram em fila de revisão com sugestões por similaridade. A migração MUST ser não-destrutiva.

#### Scenario: Barcode válido migrado
- **WHEN** um `ingredient_item` tem `barcode` com EAN-13 válido
- **THEN** após o backfill o item tem `gtin` preenchido e a entidade GTIN existe

#### Scenario: Barcode inválido preservado
- **WHEN** um `ingredient_item` tem `barcode` que não valida como GTIN
- **THEN** o `barcode` é mantido, `gtin` fica nulo e o item aparece na fila de revisão

### Requirement: Mapa fornecedor→insumo
O sistema SHALL manter `gs1_integration.supplier_product_map` com UNIQUE `(supplier_cnpj, supplier_code)` mapeando o código do produto do fornecedor (`cProd`) para `purchase_item`/`ingredient_item`, alimentado por resoluções manuais do matching de NF-e.

#### Scenario: Aprendizado após resolução manual
- **WHEN** um operador resolve manualmente um item de NF-e "SEM GTIN" para um insumo
- **THEN** o par `(CNPJ, cProd)` é gravado no mapa e a próxima nota do mesmo fornecedor com o mesmo código resolve automaticamente

### Requirement: Enriquecimento via Verified by GS1
O sistema SHALL oferecer lookup de GTIN via API Verified by GS1 (CNP/GS1 Brasil), proxiado por `apps/api`, com resultado cacheado na própria entidade (`source = 'vbg'`, `verified_at`, payload bruto). Falha ou indisponibilidade da API MUST NOT bloquear cadastro manual.

#### Scenario: Lookup com sucesso
- **WHEN** o operador consulta um GTIN desconhecido e a API retorna dados
- **THEN** o sistema exibe descrição/marca/conteúdo e permite criar a entidade GTIN já preenchida

#### Scenario: API indisponível
- **WHEN** a API Verified by GS1 está fora do ar
- **THEN** o operador ainda consegue cadastrar o GTIN manualmente (com check digit validado localmente)
