# nfe-ingestion (delta)

## ADDED Requirements

### Requirement: Autenticidade da NF-e
A importação SHALL aceitar apenas NF-e com `mod = 55`, `tpAmb = 1`, `protNFe/infProt/cStat` ∈ {100, 150}, `infProt/chNFe` igual ao `Id` de `infNFe`, `infProt/digVal` igual ao `DigestValue` da assinatura e assinatura XMLDSig válida com certificado ICP-Brasil. O resultado de cada verificação SHALL ser gravado na nota. `cStat = 150` SHALL ser aceito e sinalizado como autorização fora de prazo.

#### Scenario: XML sem protocolo
- **WHEN** o operador envia o XML de uma NF-e assinada mas sem `protNFe`
- **THEN** o sistema rejeita informando que a nota não tem autorização e nada é persistido

#### Scenario: cStat editado à mão
- **WHEN** o XML traz `cStat = 100` mas o `digVal` do protocolo não corresponde à assinatura
- **THEN** o sistema rejeita informando que o protocolo não pertence a esta nota

#### Scenario: Nota de homologação
- **WHEN** o XML traz `tpAmb = 2`
- **THEN** o sistema rejeita informando que é nota de ambiente de homologação

#### Scenario: Autorização fora de prazo
- **WHEN** o XML traz `cStat = 150`
- **THEN** a nota é importada e exibida com o aviso "autorizada fora de prazo"

### Requirement: CNPJ da unidade e destinatário
`core.units` SHALL ter `cnpj` de 14 caracteres (12 alfanuméricos + 2 dígitos verificadores, validado pela regra da Receita), único quando preenchido. O destinatário da NF-e SHALL ser casado com a unidade; a nota SHALL ficar visível às cozinhas cuja unidade de compra (`purchase_unit_id` ou `unit_id`) é a destinatária, e a escolha da cozinha SHALL ser feita por nível 2 de uma delas. Nota sem unidade casada SHALL ficar em triagem visível apenas a `storage` nível 3 global e MUST NOT ser listada para nenhuma cozinha, nem aceitar recebimento.

#### Scenario: Unidade com duas cozinhas
- **WHEN** chega nota para a unidade U, que compra para as cozinhas A e B
- **THEN** a nota aparece para A e B até um operador de uma delas assumi-la

#### Scenario: Nota de outra unidade
- **WHEN** um operador da cozinha A importa uma nota destinada à unidade de B
- **THEN** a nota é vinculada à unidade de B, sai da lista de A e a tela avisa o operador para onde ela foi

#### Scenario: Destinatário desconhecido
- **WHEN** o destinatário não corresponde a nenhuma unidade
- **THEN** a nota vai para triagem e nenhuma cozinha a enxerga nem cria recebimento a partir dela

### Requirement: Entrada pela chave de acesso do DANFE
O operador SHALL poder ler ou digitar a chave de acesso. O sistema SHALL criar a nota `announced`, sem itens, com emitente (CNPJ ou CPF), modelo, série, número e mês de emissão extraídos da chave, atribuída à unidade de compra da cozinha em que foi lida e marcada "destinatário não confirmado". O XML posterior da mesma chave SHALL completar a nota e confirmar ou corrigir o destinatário.

#### Scenario: Caminhão chega com DANFE e sem XML
- **WHEN** o operador lê a chave do DANFE de uma nota ainda não importada
- **THEN** a nota aparece em "A caminho" da própria cozinha como anunciada, "aguardando XML"

#### Scenario: XML chega depois
- **WHEN** o XML dessa chave é enviado e passa na autenticidade
- **THEN** a mesma nota passa a `available` com itens e o matching roda

### Requirement: Ciclo de vida da NF-e
A NF-e SHALL expor `announced | available | in_receipt | received | liquidated | cancelled | refused`. `announced`, `available`, `cancelled` e `refused` SHALL ser gravados; `in_receipt` (recebimento não efetivado), `received` (recebimento `definitive` ou `divergent`) e `liquidated` (soma das liquidações vinculadas ≥ valor recebido) SHALL ser derivados. Nota `cancelled` MUST NOT iniciar recebimento nem receber liquidação.

#### Scenario: Nota recebida com divergência
- **WHEN** o recebimento vinculado é efetivado como `divergent`
- **THEN** a nota aparece como `received`

#### Scenario: Liquidação parcial
- **WHEN** uma nota recebida em R$ 4.800 tem uma liquidação de R$ 3.000
- **THEN** a nota continua `received` até a soma alcançar R$ 4.800

### Requirement: Situação da nota antes de efetivar e liquidar
Sem coletor DF-e ativo, a efetivação do recebimento definitivo e o registro de liquidação vinculada SHALL exigir o registro de consulta de situação da nota (data, autor, situação encontrada), com atalho para a consulta pública montado a partir da chave; consulta com mais de 3 dias SHALL ser renovada. Situação "cancelada" SHALL levar a nota a `cancelled`.

#### Scenario: Nota cancelada pelo emitente
- **WHEN** a consulta antes do definitivo registra que a nota foi cancelada
- **THEN** a nota passa a `cancelled` e a efetivação é recusada

### Requirement: Custo por item com rateio da nota
O custo unitário de cada item SHALL ser (`vProd − vDesc + vFrete + vSeg + vOutro + vIPI + vST + vFCPST`) do `det` dividido pela quantidade na unidade base, e a soma dos custos totais dos itens MUST ser igual a `vNF`, com diferença de arredondamento lançada no item de maior valor. Nota complementar (`finNFe = 2`) vinculada SHALL ajustar o valor sem alterar quantidade.

#### Scenario: Nota com frete e desconto
- **WHEN** um item tem `vProd` R$ 1.000, `vDesc` R$ 50 e `vFrete` R$ 30 para 100 KG
- **THEN** o custo unitário do item é R$ 9,80/KG

## MODIFIED Requirements

### Requirement: Importação de XML de NF-e
O sistema SHALL importar XML de NF-e (layout 4.0) via upload proxiado por `apps/api`, persistindo `inventory.nfe_document` (chave de acesso de 44 caracteres UNIQUE, CNPJ ou CPF e nome do emitente, destinatário, unidade destinatária resolvida, `dhEmi`, valor total, finalidade `finNFe`, notas referenciadas, protocolo, resultado da verificação de autenticidade, XML íntegro) e `inventory.nfe_item` por `det` (`nItem`, `cProd`, `xProd`, `cEAN`, `cEANTrib`, NCM, CEST, CFOP, `uCom`, `qCom`, `vUnCom`, `uTrib`, `qTrib`, componentes de valor do item e grupo `rastro` quando presente). Chave já existente em `announced` SHALL ser completada; em qualquer outro estado, rejeitada como duplicada.

#### Scenario: Importação válida
- **WHEN** o operador envia um XML de NF-e autorizada com 5 itens
- **THEN** o sistema cria 1 `nfe_document` e 5 `nfe_item`, guardando o XML original e o protocolo

#### Scenario: Nota duplicada
- **WHEN** o operador envia um XML cuja chave de acesso já foi importada com itens
- **THEN** o sistema rejeita a duplicata apontando o documento existente

#### Scenario: XML inválido
- **WHEN** o arquivo enviado não é um XML de NF-e válido (schema ou chave malformada)
- **THEN** o sistema rejeita com mensagem descritiva e nada é persistido
