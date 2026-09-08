# Revisão adversarial — o que a medição derrubou

Quatro revisões independentes (performance, corretude/auditoria, aderência ao repo, escopo/valor)
sobre a versão de 2026-09-02 do plano, mais medição própria contra a API e o banco de produção.
Este documento registra o que **mudou de conclusão** e por quê. Achado marcado **[verificado]**
foi conferido diretamente, não aceito do parecer.

## 1. O que matou a capability central

**A `descricao` do item no PNCP é o nome da CLASSE CATMAT, não o produto.** [verificado]

Compra `00394429000100-1-000347/2025`, 10 primeiros itens → **3 descrições distintas**:

```
item  1  R$ 15,8767  Carne de ave in natura
item  2  R$ 15,8767  Carne de ave in natura
item  3  R$ 22,5133  Carne de ave in natura
item  5  R$ 38,6333  Carne de ave in natura
item  8  R$ 16,5833  Carne salgada
item 10  R$ 28,4500  Carne bovina in natura
```

Sete itens chamados "Carne de ave in natura" a quatro preços diferentes. São frango inteiro, coxa,
peito, filé — e **nenhum campo do payload diz qual**: `catalogoCodigoItem`, `informacaoComplementar`
e `ncmNbsDescricao` vêm todos `null`.

Consequência: a capability `pncp-price-evidence` pedia que um humano confirmasse que
"LEGUME IN NATURA @ R$ 18,58" é o preço da batata que ele está cotando. Isso não é atrito alto —
é **indecidível**. O exemplo que motivava a proposta ("Carne de ave in natura, estimado 15,8767 →
homologado 8,90, −44%") é um desvio sobre item não identificável.

**Decisão: `pncp-price-evidence` é REMOVIDA**, com ela a migration em `procurement.compras_amostra`
(`origem`, `pncp_controle`) e a aba no `PriceResearchModal`.

## 2. A premissa de valor também não se sustentava

Produção, [verificado] por SQL:

| Fato | Valor |
|---|---|
| `procurement_arp` — carona já implementado e ligado por CATMAT | **0 linhas** |
| `procurement_list` — atas do wizard | 5 linhas, **1 unidade** (DIRAD) |
| Pesquisas de preço | 265 itens, todos entre 2026-05-23 e 06-08 |
| Cesta atual por item pesquisado | média **470 amostras válidas, 167 UASGs distintas** |
| Conformidade | **254 de 265 (96%)** já conformes |
| Qualidade | **169 de 265 com CV > 40%** |
| `measure_unit` gravado | **0 de 265** |
| DIRAD (única unidade com uso) no PNCP | **HTTP 204**, corpo vazio |

A cesta atual **não é pobre — é ruidosa**. Somar amostras casadas por texto, de fonte sem código de
catálogo, a uma cesta de 470 piora o CV e não muda a defensabilidade. E a única unidade que já usou
o módulo não tem ata no PNCP.

Além disso, `savePrecoAuditFn` grava `total_after_pollution_filter = total_after_date_filter`
("a etapa é registrada como passa-tudo") e a estatística usa `precoUnitario` **cru**, não
`normalized_price` — que é calculado, gravado e nunca usado. [verificado em
`price-research-utils.ts:121` e `price-research.fn.ts:293`]

## 3. Defeitos de corretude no plano anterior

- **O caminho de escrita não aceitava `origem`.** [verificado] `savePrecoAuditFn` não escreve na
  tabela: chama a RPC `procurement.upsert_compras_amostras`, de lista fixa com 16 colunas. A amostra
  PNCP entraria com o `default 'siasg'`, sem erro — exatamente a mentira que o change existia para
  impedir. E o `ON CONFLICT ... DO UPDATE SET id_compra = ...` é no-op, então não haveria correção
  posterior. Moot com a remoção da capability, mas registra a lição: **coluna nova em tabela escrita
  por RPC exige alterar a RPC.**
- **"Homologado é imutável" é FALSO.** [verificado] O payload de `/resultados` carrega
  `dataCancelamento`, `motivoCancelamento` e `situacaoCompraItemResultadoId`; a Lei 14.133 art. 71
  admite revogação e anulação após a homologação. Os 122 itens medidos são um snapshot, que prova
  que estavam homologados naquele instante, não que sejam imutáveis. **A otimização 3 do `scopes.md`
  está errada e foi corrigida.**
- **`/resultados` devolve LISTA.** [verificado] `ordemClassificacaoSrp` no payload confirma cadastro
  de reserva. As specs diziam "o resultado" no singular. Resultado com
  `ordemClassificacaoSrp > 1` não é preço praticado.
- **Unidade de medida ausente do plano inteiro.** O PNCP traz `unidadeMedida` textual e **não** tem
  análogo de `capacidadeUnidadeFornecimento`. Sem fator de conversão, "Quilograma" e "Caixa" não
  podem entrar na mesma estatística.
- **Chave natural inconsistente.** `pncp_ata` chaveada por ata, `pncp_ata_item` por compra — sem
  coluna de junção. Preço vive na compra, vigência vive na ata.
- **Contradição interna:** `design.md` dizia "chamada externa em tempo de request" numa seção e
  "nenhuma requisição de usuário aguarda o PNCP" em outra.

## 4. Erros de medição e de aritmética meus

- **"1 req/6 s" não é medição.** Foi inferido de um episódio de 429 com 6 conexões paralelas. A
  degradação foi reproduzida a **1 req/13 s de IP frio**, com `HTTP 500` cujo corpo é
  `"Erro na comunicação com o banco de dados."` aos 30 s — e a origem respondendo em **0,103 s**
  logo depois. É indistinguível de instabilidade da origem. Não há **nenhum** header de rate limit
  nas respostas (sem `X-RateLimit-*`, sem `Retry-After`): o limite, se existe, só é descobrível por
  comportamento. **Marcado como NÃO MEDIDO.**
- **A banda de E3 (50k–130k atas) é falsa precisão.** Com âncoras {1300, 672, 0}, o IC95 da média
  por unidade é [−958; 2.272] — inclui zero. A banda declarada é ~5× mais estreita que os dados
  permitem. **Removida.** Substituída por uma medição barata: 1 chamada `tamanhoPagina=10` por
  unidade lê `totalRegistros` sem baixar nada — 200 chamadas dão a distribuição exata.
- **A tabela "Efeito combinado" misturava unidades.** O filtro de relevância de 10% é **por termo de
  busca**; foi aplicado numa coluna de "tempo total" comparada com o backfill do corpus. Nas duas
  leituras possíveis ela está errada. **Removida.**
- **`temResultado` 100%: n=3, não n=122.** Itens dentro de uma compra são totalmente correlacionados
  (a compra inteira está homologada ou não). Jeffreys 95% para 3/3 = [0,44; 1,00] — até 56% das
  compras podem não ter resultado. **Marcado como inconclusivo**, não como "não funciona".
- **Janela de 12 meses perde ata vigente.** Há ata da 120623 com vigência de 2 anos
  (`2024-03-05 → 2026-03-04`). Fase 1 precisa de no mínimo 24 meses.
- **Single-flight chaveado na ata desperdiça 9,3×** — `/itens` é endereçado por **compra**, e há 9,3
  atas por compra alimentar.
- **HTTP 204 não estava previsto.** É a resposta da DIRAD, a primeira unidade real que o código
  encontraria. `res.json()` em 204 estoura.

## 5. O que a medição encontrou de valor real

**O CSV do PCA.** [verificado] `/api/pncp/v1/orgaos/{cnpj}/pca/{ano}/csv` é o **único** endpoint de
lote em todo o PNCP (confirmado varrendo a especificação inteira).

| | |
|---|---|
| Custo | **1 chamada, 2 s, 8 MB** para toda a FAB |
| Conteúdo | **21.392 itens**, 35 UASGs, ano 2026 (2025 e 2027 também disponíveis) |
| Tem `UASG` por linha | **100%** |
| Tem `Código do Item` (CATMAT) | **78%** dos itens alimentares |
| Itens alimentares por classe | **1.300**, com **620 CATMATs distintos** |
| **CATMATs que já existem em `purchase_item`** | **375 de 620 (60%)** |
| UASGs que planejam alimento | **30** |

É o inverso exato do caminho das atas: **tem código de catálogo, então o join é automático** — sem
casamento textual e sem confirmação humana. E funciona para qualquer órgão e ano (testado com uma
prefeitura: 590 KB em 1,0 s).

Ressalva: PCA é preço **estimado/planejado**, não homologado. É sinal de demanda e de estimativa,
não de preço de mercado.

**Correção da própria medição (2026-09-03).** A primeira contagem — 1.462 itens e 678 CATMATs —
usava regex no nome da classe e incluía **utensílios de cozinha (7330), equipamentos (7310, 7320,
7360, 3605, 3730), forragem animal (8710) e animais vivos (8820)**, que não são gênero alimentício.
O filtro implementado é estrito, com as 6 classes `89xx`: **1.300 itens, 620 CATMATs, 375 (60%) já
no catálogo**. A cobertura sobe justamente porque os CATMATs de equipamento não estavam lá.

## 6. A ação de maior alavancagem não é código

Curar as 26 UASGs faltantes usa uma tela que **já está em produção**:
`unit/$unitId/settings.tsx` tem campo `uasg` que dispara `fetchUasgInfoFn` aos 6 dígitos e exibe
nome oficial, UF, município e órgão de volta. É autoverificável — o modo de falha da Decisão 7b (um
candidato único e errado, como `DIRAD → 120136`) não sobrevive a um humano lendo
"Diretoria de Administração do Pessoal" quando queria DIRAD.

**Custo: uma tarde. Efeito: de 3 para 28 unidades.** O plano anterior gastava semanas de engenharia
para servir 3 unidades enquanto declarava fora de escopo a tarefa de uma tarde que serviria 28.

## 7. A pergunta que vale mais que este change

`procurement_arp` tem **0 linhas**. O fluxo de carona já existe (`ArpSearchModal`, `searchArpFn`,
`importArpItemsFn`), busca por qualquer UASG gerenciadora, mostra vigência e importa itens
**ligados por CATMAT** — estritamente melhor que o PNCP para isso, porque tem o código de catálogo
que o PNCP não tem. E ninguém usa.

Entender esse zero vale mais do que construir uma versão pior da mesma coisa.
