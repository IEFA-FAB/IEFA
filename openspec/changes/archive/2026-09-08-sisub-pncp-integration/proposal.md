# Proposal: sisub-pncp-integration

> **Versão 2 (2026-09-03).** A v1 propunha evidência de preço nacional por casamento textual, uma
> aba de cobertura de atas e um worker dimensionado para 200 unidades. A medição derrubou a
> premissa central e o registro está em `review.md`. Esta versão é o que sobrou de pé, mais o que
> a medição encontrou no lugar.

## Why

Duas descobertas de 2026-09-02/03 contra a API e o banco de produção definem este change.

**A que fecha uma porta.** A `descricao` do item no PNCP é o **nome da classe CATMAT, não o
produto**: numa compra real da FAB, 10 itens têm 3 descrições, com "Carne de ave in natura"
repetida sete vezes a quatro preços diferentes — frango inteiro, coxa, peito e filé, sem nenhum
campo que os distinga (`catalogoCodigoItem`, `informacaoComplementar` e `ncmNbsDescricao` vêm
`null`). Casar item do PNCP com o catálogo do sisub por texto não é caro: é **indecidível**. E a
cesta que ele iria melhorar já tem média de 470 amostras válidas de 167 UASGs distintas, com 96% de
conformidade — ela não é pobre, é ruidosa (169 de 265 pesquisas com CV acima de 40%).

**A que abre outra.** Varrendo a especificação inteira do PNCP, existe **um único endpoint de
lote**: `/v1/orgaos/{cnpj}/pca/{ano}/csv`. Ele devolve, em **uma chamada de 2 segundos**, os
**21.392 itens do Plano de Contratações Anual de toda a FAB** — 35 UASGs — com `UASG` em 100% das
linhas e **código CATMAT em 78%** dos itens alimentares. Dos **620 CATMATs alimentares, 375 (60%)
já existem em `procurement.purchase_item`**. Ou seja: onde as atas exigiam casamento textual e
confirmação humana, o PCA **casa por código, automaticamente**.

O PCA é plano, não execução — é sinal de **demanda e de estimativa**, não preço de mercado. É
exatamente por isso que ele não compete com a pesquisa de preço existente: ele responde perguntas
que hoje ninguém consegue responder — *o que a FAB planejou comprar de gênero este ano, em que
quantidade, por quanto, e em quais OM*.

## What Changes

Afeta **sisub** (1 tela nova), **apps/api** (1 rotina de ingestão) e **packages/database**
(migration em `compras_gov_integration`). Nenhum outro app. **Nenhuma escrita na memória de cálculo
da Lei 14.133.**

- **Ingestão do CSV do PCA** — 1 chamada por órgão e ano, parse do CSV, upsert por
  `(cnpj_orgao, ano_pca, id_item_pca)`. Não precisa de worker com fila, token bucket ou disjuntor:
  são 3 chamadas para cobrir 2025, 2026 e 2027 da FAB inteira.
- **Tabela nova** `compras_gov_integration.pncp_pca_item`, com RLS ligada sem policy.
- **Tela nova, somente leitura**, no módulo de análise: *"Plano de contratações de gênero — FAB"*.
  Mostra, por UASG e por classe CATMAT, os itens planejados com quantidade, unidade de fornecimento
  e valor unitário estimado; e marca quais CATMATs já existem no catálogo do sisub.
- **Insumo de curadoria de UASG** — a listagem expõe as 30 UASGs que planejam gênero, com nome
  oficial, para alimentar o preenchimento manual de `core.units.uasg` pela tela de configurações
  que já existe.
- **Preço homologado como referência de classe (adiado, ver Não-objetivos)** — o caminho de atas
  fica registrado e medido, mas fora desta entrega.

## Capabilities

### New Capabilities

- `pncp-pca-plan`: ingestão em lote do Plano de Contratações Anual por órgão/ano e a leitura
  agregada por UASG e classe, com join por CATMAT ao catálogo do sisub.
- `pncp-compra-reference`: contrato do acervo de compras homologadas do PNCP — **especificado agora,
  implementado depois** — incluindo o que a fonte pode e não pode sustentar.

### Modified Capabilities

Nenhuma — `openspec/specs/` está vazio.

### Removed from v1

- `pncp-price-evidence` — removida. Premissa destruída pela medição (`review.md` §1).
- `pncp-ata-coverage` — removida. Listava 108 linhas para 11 fatos (9,3 atas por compra) e ficava
  vazia justamente na única unidade com uso (`review.md` §2).
- `pncp-ata-ingest` — reduzida a `pncp-compra-reference`, sem implementação nesta entrega.

## Impact

- **packages/database**: uma migration em `compras_gov_integration` (1 tabela). **Não** toca em
  `procurement.compras_amostra` nem na RPC `upsert_compras_amostras`.
- **apps/api**: rotina de ingestão do CSV + rota admin, espelhando `compras-admin.ts`. Precisa de
  discriminador de origem no log de sync — ver Riscos.
- **apps/sisub**: 1 rota nova somente leitura, 1 server fn com guard existente. Nenhum módulo PBAC
  novo. `price-research.fn.ts` e `arp.fn.ts` **não mudam**.
- **Riscos**:
  - **(a) `compras_sync_log` não discrimina origem.** `hasLiveSync` filtra só por
    `status='running'`, sem qualquer filtro de origem; `recoverStaleSyncs` marcaria como erro o sync
    alheio; `/sync/latest` é `order by started_at limit 1` sobre a tabela toda e passaria a devolver
    o sync do PNCP na tela de rotinas do Compras.gov. Exige coluna `source` **antes** de qualquer
    ingestão nova.
  - **(b) CSV é formato frágil.** 20 colunas separadas por `;`, com BOM, decimal em vírgula e
    cabeçalho em português. Mudança silenciosa de coluna quebra o parse — o mapeamento precisa ser
    por **nome de cabeçalho**, nunca por posição, e falhar alto quando uma coluna esperada some.
  - **(c) 22% dos itens alimentares não têm CATMAT** e 30% não têm quantidade. A tela precisa
    mostrar a cobertura real, não esconder o buraco.
  - **(d) Instabilidade da origem.** Medimos `HTTP 500` com corpo
    `"Erro na comunicação com o banco de dados."` aos 30 s, `HTTP 204` com corpo vazio e timeouts —
    às vezes intercalados com respostas de 0,1 s. O cliente lê **status antes do corpo** e nunca
    confia no `content-type`.

## Não-objetivos

- **Evidência de preço do PNCP na pesquisa de preços.** Removido, não adiado: a fonte não carrega o
  produto (`review.md` §1). Se o PNCP passar a preencher `catalogoCodigoItem` nos itens, a decisão
  se reabre — e aí o join é por código, não por texto.
- **Qualquer escrita em `procurement.compras_amostra`, `procurement_pesquisa_preco*` ou na RPC.**
  A prova de auditoria da 14.133 não é tocada por este change.
- **Aba de cobertura de atas.**
- **Worker com fila, token bucket, disjuntor, single-flight e cache negativo.** Dimensionados para
  200 unidades; a ingestão desta entrega são 3 chamadas.
- **Preço homologado (atas → itens → resultados).** Especificado em `pncp-compra-reference` e
  medido em `scopes.md`, mas fora da implementação: depende de decidir a base de medida, o
  tratamento de `ordemClassificacaoSrp > 1` e a revalidação de cancelamento.
- **Preencher `core.units.uasg`.** Continua fora do change **porque é trabalho de dado, não de
  código** — mas deixa de ser tratado como bloqueio distante: a tela de configurações já faz a
  consulta autoverificável, e este change entrega a lista das 30 UASGs que planejam gênero. É uma
  tarde de trabalho e destrava de 3 para 28 unidades.
- **Descobrir por que `procurement_arp` tem 0 linhas.** Fora do escopo e provavelmente mais valioso
  que este change (`review.md` §7).
- **PCA como base de preço de referência.** É valor estimado em plano; não é preço praticado e não
  entra em memória de cálculo.
- **Exposição às tools de IA (chat + MCP).** Quando entrar, segue o contrato de
  `@iefa/sisub-domain/agent` — `limit` + `total`, `.nullish()`, teto de 60k.
