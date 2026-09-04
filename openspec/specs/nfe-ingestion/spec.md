# nfe-ingestion Specification

## Purpose
TBD - created by archiving change sisub-inventory-cycle. Update Purpose after archive.
## Requirements
### Requirement: Importação de XML de NF-e
O sistema SHALL importar XML de NF-e (layout 4.0) via upload proxiado por `apps/api`, persistindo `inventory.nfe_document` (chave de acesso de 44 dígitos UNIQUE, CNPJ/nome do emitente, CNPJ destinatário, `dhEmi`, valor total, XML íntegro) e `inventory.nfe_item` por `det` (`nItem`, `cProd`, `xProd`, `cEAN`, `cEANTrib`, NCM, CEST, CFOP, `uCom`, `qCom`, `vUnCom` e grupo `rastro` quando presente).

#### Scenario: Importação válida
- **WHEN** o operador envia um XML de NF-e autorizada com 5 itens
- **THEN** o sistema cria 1 `nfe_document` e 5 `nfe_item`, guardando o XML original

#### Scenario: Nota duplicada
- **WHEN** o operador envia um XML cuja chave de acesso já foi importada
- **THEN** o sistema rejeita a duplicata apontando o documento existente

#### Scenario: XML inválido
- **WHEN** o arquivo enviado não é um XML de NF-e válido (schema ou chave malformada)
- **THEN** o sistema rejeita com mensagem descritiva e nada é persistido

### Requirement: Tratamento de GTIN da nota
O parser SHALL normalizar `cEAN`/`cEANTrib` a 14 dígitos; o literal `SEM GTIN` MUST ser persistido como nulo. GTINs presentes em NF-e autorizada SHALL poder criar a entidade GTIN automaticamente com `source = 'nfe'`.

#### Scenario: Item com SEM GTIN
- **WHEN** um `det` traz `cEAN = "SEM GTIN"`
- **THEN** o `nfe_item.gtin` fica nulo e o matching segue pelo mapa de fornecedor

#### Scenario: GTIN novo vindo da nota
- **WHEN** um `det` traz `cEAN` válido inexistente no catálogo
- **THEN** o sistema cria a entidade GTIN com `source = 'nfe'`, descrição `xProd` e NCM da nota, **sem conteúdo líquido**, e o item fica `review` (não `matched`) até haver vínculo com um `ingredient_item` que forneça a conversão

### Requirement: Pipeline de correlação item→insumo
Cada `nfe_item` SHALL passar pelo pipeline de matching com `match_status` ∈ `pending | matched | review | no_match`, nesta ordem: (1) GTIN → `ingredient_item`; (2) `(CNPJ emitente, cProd)` → `supplier_product_map`; (3) sugestão por NCM + brick GPC + similaridade trigram na descrição (→ `review`); (4) fila manual. A conversão de quantidade para unidade base MUST usar conteúdo líquido do GTIN ou `unit_content_quantity` do `ingredient_item` — nunca `uCom`. Item sem conversão resolvível (GTIN sem conteúdo líquido e sem `ingredient_item` vinculado) MUST NOT ficar `matched`.

#### Scenario: Match exato por GTIN
- **WHEN** o `cEAN` do item corresponde a um GTIN vinculado a um `ingredient_item`
- **THEN** o item fica `matched` com `ingredient_item`/`purchase_item`/`ingredient` resolvidos e quantidade convertida à unidade base

#### Scenario: Match por mapa de fornecedor
- **WHEN** o item não tem GTIN mas `(CNPJ, cProd)` existe no `supplier_product_map`
- **THEN** o item fica `matched` via mapa

#### Scenario: Sugestão para revisão
- **WHEN** não há match exato mas existem candidatos por NCM/GPC/descrição
- **THEN** o item fica `review` com candidatos ranqueados para escolha do operador

#### Scenario: Sem candidato
- **WHEN** nenhuma estratégia encontra candidato
- **THEN** o item fica `no_match` e aguarda cadastro/resolução manual

### Requirement: Captura do grupo rastro
Quando o `det` contiver o grupo `rastro` (`nLote`, `qLote`, `dFab`, `dVal`), o sistema SHALL persistir lote e datas no `nfe_item` para pré-preenchimento do recebimento; a ausência do grupo MUST NOT impedir a importação.

#### Scenario: Nota com rastro
- **WHEN** um `det` traz `nLote = "L123"` e `dVal = 2026-12-31`
- **THEN** o `nfe_item` guarda lote e validade, que aparecem pré-preenchidos na conferência do recebimento

