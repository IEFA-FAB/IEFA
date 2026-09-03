# Design: sisub-pncp-integration

> **Versão 2 (2026-09-03).** O que a revisão adversarial e a medição derrubaram da v1 está em
> `review.md`; os números por escopo, em `scopes.md`. Este documento é só o desenho do que
> permanece.

## Context

O PNCP expõe três superfícies públicas sem chave. Duas delas são de consulta paginada
(`/api/consulta/v1/*` e `/api/pncp/v1/orgaos/...`), e uma terceira, `/api/search/`, está declarada
mas nunca foi validada — a sondagem tomou RST de conexão, resultado inconclusivo.

Varrendo a especificação inteira, existe **um único endpoint de lote**:
`/v1/orgaos/{cnpj}/pca/{ano}/csv`. É nele que este change se apoia.

Medições relevantes, todas contra produção:

| | |
|---|---|
| PCA da FAB, ano 2026 | 1 requisição, **2 s**, 8 MB, **21.392 itens**, 35 UASGs |
| Anos disponíveis | 2025 (7,5 MB), 2026 (8 MB), **2027 já publicado** (4,8 MB) |
| Funciona para outro ente | prefeitura: 590 KB em 1,0 s |
| `UASG` por linha | 100% |
| Itens alimentares (por classe CATMAT) | **1.300**, **620 CATMATs distintos** |
| CATMAT preenchido nesses itens | **78%** |
| **CATMATs já em `procurement.purchase_item`** | **375 de 620 (60%)** |
| UASGs que planejam gênero | **30** |

O contraste com o caminho de atas é o ponto inteiro do desenho: **o PCA tem código de catálogo, as
atas não.** Onde o caminho de atas exigia casamento textual sobre descrições que são nomes de
classe, o PCA casa por igualdade de código.

## Goals / Non-Goals

**Goals:**

- Trazer o Plano de Contratações Anual de gênero da FAB para dentro do sisub, ligado ao catálogo
  por CATMAT.
- Expor a lista das 30 UASGs que planejam gênero, para alimentar a curadoria manual de
  `core.units.uasg`.
- Deixar registrado, em `pncp-compra-reference`, o contrato do caminho de preço homologado — para
  que a próxima tentativa não repita os erros já pagos.

**Non-Goals:**

- Escrever qualquer coisa em `procurement.compras_amostra`, em `procurement_pesquisa_preco*` ou na
  RPC `upsert_compras_amostras`.
- Implementar o caminho de atas/itens/resultados.
- Worker com fila, token bucket, disjuntor, single-flight ou cache negativo.

## Decisions

### 1. O lote é a arquitetura, não uma otimização

A ingestão é: baixar 1 CSV por órgão e ano, parsear e **reconciliar o snapshot**. Para cobrir
2025–2027 da FAB inteira são **3 requisições**. Não há fan-out, portanto não há nada a coalescer,
limitar ou priorizar.

**A tabela é o cache.** A UI lê só dela, nenhuma requisição de usuário toca a origem, e queda do
PNCP não afeta a tela — propriedade que a medição justifica: o mesmo arquivo levou **2 s numa
coleta e 35,2 s na outra**, byte a byte idêntico.

**Reconciliação, não upsert-merge.** O CSV é o plano completo do par órgão/ano. Upsert puro nunca
remove nada, então item retirado do plano ficaria no acervo para sempre, inflando a demanda
planejada em silêncio. Remoção é lógica (`removed_at`): item planejado e depois retirado é sinal.

**Duas guardas para dois custos.** O hash do arquivo evita as 21 mil escritas quando nada mudou
(medido byte-idêntico entre coletas); a sonda `/consulta/v1/pca/atualizacao` (7,5 KB contra 8 MB)
evitaria a banda, mas depende de validar a semântica de `totalRegistros`. Cache HTTP condicional
está descartado por medição no próprio endpoint do CSV: `no-store`, **sem `ETag` e sem
`Last-Modified`**, e `Content-Length: None` — o que também torna arquivo truncado indistinguível de
arquivo curto, e por isso a reconciliação exige guarda de completude.

**Alternativa descartada:** reaproveitar o desenho de duas fases da v1. Ele existia para tornar
tratável um backfill de 200 unidades por item; aqui não há por-unidade nem por-item na rede.

### 2. Mapear o CSV por nome de cabeçalho, e falhar alto

O arquivo tem 20 colunas separadas por `;`, com BOM, decimal em vírgula e cabeçalho em português
(`Unidade Responsável;UASG;Id do item no PCA;…`). O parser resolve cada campo pelo nome; coluna
esperada ausente aborta a ingestão inteira daquele arquivo.

**Por quê.** Mapeamento posicional em CSV governamental quebra em silêncio quando a origem insere
uma coluna: as linhas continuam entrando, com os valores deslocados. O modo de falha caro é o
silencioso, não o ruidoso.

### 3. Join por CATMAT, e o buraco fica visível

O vínculo com `purchase_item` é igualdade de código. Os 22% de itens sem CATMAT e os 30% sem
quantidade **não são escondidos**: a tela conta e mostra os dois grupos.

**Por quê.** Foi exatamente a inferência por semelhança de descrição que destruiu a capability de
evidência de preço da v1. Um estado "não coberto" honesto vale mais que um vínculo plausível e
errado — e uma soma de quantidade que omite 30% dos itens sem dizer isso mente sobre o total
planejado.

### 4. `compras_sync_log` precisa de discriminador de origem ANTES de tudo

`hasLiveSync` consulta `status = 'running'` **sem filtro de origem**; `recoverStaleSyncs` marca como
erro qualquer linha `running` sem heartbeat; `/sync/latest` é `order by started_at limit 1` sobre a
tabela toda, e alimenta a tela de rotinas do Compras.gov no sisub.

Sem uma coluna `source`, a ingestão do PCA bloquearia o sync semanal do CATMAT, marcaria o sync
alheio como falho e apareceria na tela errada com o rótulo errado. É pré-requisito, não melhoria.

### 5. Cliente lê status antes do corpo e nunca confia no `content-type`

Foram medidos, na mesma origem: `429` com corpo **HTML**; `500` com `content-type: application/json`
e corpo de texto puro `"Erro na comunicação com o banco de dados."` aos 30 s; **`204` com corpo
vazio** (que é a resposta da DIRAD, a primeira unidade real que o código encontraria); e timeouts
acima de 40 s — intercalados com respostas de 0,1 s. `res.json()` estoura em três desses quatro.

### 6. Não há evidência de rate limit; há evidência de instabilidade

A v1 afirmava um teto de ~1 req/6 s, inferido de um episódio de 429 sob 6 conexões paralelas. A
mesma degradação foi depois reproduzida a **1 req/13 s de IP frio**, e **nenhuma resposta traz
header de limite** (sem `X-RateLimit-*`, sem `Retry-After`, sem assinatura de gateway).

Para esta entrega o ponto é acadêmico — são 3 requisições. Fica registrado para quem for implementar
`pncp-compra-reference`: **medir a taxa antes de dimensionar qualquer coisa**, com escada de taxa a
concorrência 1, e do mesmo IP de saída que a ingestão usará. Um bloqueio por IP atingiria o NAT do
cluster inteiro, não só o worker.

## Risks / Trade-offs

- **Origem instável** → status antes do corpo (Decisão 5); retentativa com backoff; falha da
  ingestão não derruba a tela, que serve do acervo já gravado.
- **CSV muda de forma** → mapeamento por cabeçalho com falha alta (Decisão 2).
- **Colisão com o sync do Compras.gov** → coluna `source` antes da primeira ingestão (Decisão 4).
- **Dado incompleto na origem** → cobertura exibida, nunca inferida (Decisão 3).
- **PCA é plano, não execução** → tudo rotulado como estimado; proibido alimentar memória de
  cálculo. O risco é alguém tratar valor planejado como preço de mercado, e a defesa é rótulo mais
  a proibição na spec.
- **Trade-off aceito:** entregamos demanda planejada e não preço praticado. Preço praticado exige o
  caminho de atas, que está especificado e adiado.

## Migration Plan

1. Migration em `compras_gov_integration`: `pncp_pca_item`, RLS ligada sem policy, índices por
   `(cnpj_orgao, ano_pca)` e por `codigo_item`.
2. Migration em `compras_gov_integration`: coluna `source` em `compras_sync_log`, backfill
   `'compras_gov'`, índice.
3. Ajustar `hasLiveSync`, `recoverStaleSyncs` e as consultas de `compras-admin.ts` para filtrar por
   `source`.
4. Regenerar `generated.ts`.
5. Aplicar as migrations **antes ou junto** do merge.
6. Rodar a ingestão manualmente para a FAB, ano corrente, e conferir contra os números medidos:
   21.392 linhas, 35 UASGs, 1.300 itens alimentares.
7. Só então ligar a tela.

**Rollback:** a tela sai por revert; a tabela pode ficar. A coluna `source` **não** deve ser
removida — sem ela as consultas de sync voltam a ser ambíguas.

## Open Questions

- ~~**Onde a tela mora?**~~ **Decidido: `/analytics`**, guard `analytics` nível 2, no molde de
  `analytics/workforce.tsx`. É leitura agregada da FAB inteira — mesmo formato e mesmo público das
  telas que já vivem ali. O módulo de unidade não serve porque o recorte é de rede, não de OM.
- **Quantos anos manter?** 2025–2027 estão disponíveis. Manter os três permite comparar planejado
  entre exercícios; manter só o corrente é mais barato e mais simples.
- **A varredura por CNPJ raiz funciona sem `codigoUnidadeAdministrativa`?** Se funcionar, `uasg`
  deixa de ser pré-requisito de rede e vira filtro local — dissolveria o bloqueio de escopo. A
  sondagem foi **inconclusiva**: deu timeout de 40 s enquanto a mesma janela com unidade respondeu
  em 0,103 s, mas houve instabilidade concomitante. Precisa de medição dedicada antes de fixar a
  fase 1 por iteração de unidades.
- **`/api/search/` serve para alguma coisa?** Está citada como uma das superfícies do PNCP e nunca
  foi validada (RST na sondagem). Ou alguém mede o que ela indexa, ou a menção sai do documento —
  API listada como disponível e não usada convida a reimplementação futura.
