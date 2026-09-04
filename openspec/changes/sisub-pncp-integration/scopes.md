# Escopos e custo de volume — sisub-pncp-integration

Medições feitas em 2026-09-02 contra a API de produção do PNCP. Números marcados
**[medido]** vieram de chamada real; **[derivado]** saem de constante medida; e
**[banda]** é extrapolação declarada, sem amostra fechada.

## Constantes medidas

| Constante | Valor | Como |
|---|---|---|
| Payload de listagem | **896 B/ata** | 50 atas em 44.781 B |
| Payload de item | **1.072 B/item** | 10 itens em 10.718 B |
| Payload de `/resultados` | **1.249 B** por item | 1 chamada por item, sem lote |
| Itens por compra | **32,7 média / 25 mediana / 3 mín / 92 máx** | 12 das 26 compras alimentares do GAP-AF |
| Atas por compra | **9,3** (alimentares) · **4,5** (geral) | 242 atas → 26 compras |
| Fração alimentar | **36%** (242 de 672) | regex no `objetoContratacao`, GAP-AF |
| Ritmo seguro | **NÃO MEDIDO** — 1 req/6 s é chute conservador | ver "Rate limit" abaixo |
| Disco por linha | **0,2 – 1,0 KB** | baseline real: `compras_material_item` 340.897 linhas / 337 MB; `compras_amostra` 51.166 / 21 MB |

Âncoras de volume por unidade **[medido]**: `AFA 120060` = 1.300 atas/12 m ·
`GAP-AF 120623` = 672 · `DIRAD 120133` = 0. O universo é de **200 unidades** sob o
CNPJ raiz `00394429000100`.

## Rate limit — NÃO comprovado (correção da v1)

A v1 afirmava um teto de ~1 req/6 s. **Isso não se sustenta.** O número foi
inferido de um episódio de 429 sob 6 conexões paralelas; depois, a mesma
degradação foi reproduzida a **1 req/13 s de IP frio, sem tráfego prévio** — com
`HTTP 500` cujo corpo é `"Erro na comunicação com o banco de dados."` aos 30 s — e
a origem voltou a responder em **0,103 s**. Nenhuma resposta traz header de limite
(sem `X-RateLimit-*`, sem `Retry-After`, sem assinatura de gateway). O que foi lido
como punição é indistinguível de **instabilidade da própria origem**.

Todo tempo calculado neste documento é linear em 6 s/req e portanto é **teto
grosseiro**: se a taxa sustentável for 1 req/s, todos caem 6×. Antes de dimensionar
qualquer coisa, medir com escada de taxa a concorrência 1, do mesmo IP de saída da
ingestão. Um bloqueio por IP atinge o NAT do cluster inteiro, não só o worker.

O que segue valendo no código:

1. **O corpo do 429 é HTML, não JSON.** Um cliente que chame `res.json()` estoura
   erro de parse e o 429 — que é retentável — vira falha genérica. O status TEM de
   ser lido antes do corpo.
2. **Concorrência > 1 não compensa.** Todo o dimensionamento abaixo assume serial
   com ~6 s entre chamadas.

## Os escopos

### E0 — Piloto: GAP-AF, só atas alimentares

Uma unidade, a de maior volume conhecido. Valida contrato, parser e telas.

| | |
|---|---|
| Atas listadas | 672 **[medido]** |
| Compras alimentares | 26 **[medido]** |
| Itens | ~851 **[derivado]** |
| Chamadas fase 1 | 13 → **~1 min** |
| Chamadas fase 2 | 877, das quais 851 são `/resultados` → **~1,5 h** |
| Tráfego | **2,6 MB** |
| Disco | ~2.400 linhas, **~1 MB** |

### E1 — As 3 unidades com `uasg` no banco (AFA, DIRAD, GAP-AF)

O que dá para entregar hoje sem depender de trabalho de dado.

| | |
|---|---|
| Atas listadas | 1.972 **[medido]** |
| Compras alimentares | ~76 **[derivado]** |
| Itens | ~2.497 **[derivado]** |
| Chamadas fase 1 | 39 → **~4 min** |
| Chamadas fase 2 | 2.573 → **~4,3 h** |
| Tráfego | **7,6 MB** |
| Disco | ~7.000 linhas, **~4 MB** |

### E2 — As 29 unidades reais do sisub

Bloqueado por dado, não por código: 26 das 29 não têm `uasg`. Custo ≈ E1 × ~10.
**Não é resolvível por automação** — ver "Casamento por nome" abaixo.

### E3 — As 200 unidades FAB — **NÃO ESTIMÁVEL COM 3 ÂNCORAS**

A v1 publicava uma banda de 50.000–130.000 atas. **Retirada.** Com âncoras
{1300, 672, 0}, o IC95 da média por unidade é **[−958; 2.272]** — inclui zero. A
banda declarada era ~5× mais estreita do que os dados permitem, e a amostra é
viciada por construção: as 3 unidades com `uasg` são as grandes e conhecidas, não
sorteadas.

O dado mais informativo estava sendo ignorado: **DIRAD, uma diretoria de
intendência, tem 0 atas em 12 meses.** Isso sugere concentração forte — poucas UASGs
compram. Se for Pareto, E3 real é bem menor que 50.000, e a estimativa de E2 como
"≈ E1 × 10" também não se sustenta.

**Como resolver barato:** 1 chamada com `tamanhoPagina=10, pagina=1` por unidade lê
`totalRegistros` **sem baixar as atas**. 200 chamadas dão a distribuição exata, não
uma banda. Isso precisa vir antes de qualquer decisão de escopo.

### E3b — As 200 unidades, sem filtro de gênero

Ordem de grandeza de centenas de milhares a ~1 milhão de itens, ou seja, semanas de
chamadas. **Descartado**, independentemente da incerteza acima.

## Conclusão: o custo não é volume de dado, é número de chamadas

O dado cabe folgado. Mesmo o pior escopo viável (E3 banda alta) são **269 MB** num
schema que já carrega mais de 620 MB — `compras_material_item` sozinha tem 337 MB.
Tráfego idem: 499 MB é um sync, não um problema.

O que não cabe é o **orçamento de chamadas**. `/resultados` é **uma chamada por
item**, e a 1 req/6 s isso vira 109–283 h em E3 e mais de 26 dias em E3b. É a
diferença entre um sync que roda de madrugada e um que nunca fecha a janela.

Duas correções à v1 nesta conclusão: os tempos são **teto grosseiro** (a taxa nunca
foi medida — ver acima), e a coalescência de coleta tem de ser chaveada na **compra**,
não na ata. `/itens` é endereçado por compra, e há 9,3 atas por compra alimentar:
chavear na ata permite 9,3 requisições idênticas para a mesma compra, com upsert
no-op — invisível no banco, caríssimo no orçamento de chamadas.

Uma janela de 12 meses também é insuficiente: há ata da 120623 vigente por 2 anos
(`2024-03-05` → `2026-03-04`). Fase 1 precisa de no mínimo 24 meses, ou a listagem
fica incompleta com aparência de completa.

Custo incremental depois da carga: `/atas/atualizacao` é 1 chamada por unidade por
dia → **200 chamadas/dia ≈ 20 min**. Irrelevante.

## Otimização — o que funciona e o que não funciona

Testei seis alavancas contra a API real. Três morreram na medição; três valem.

### Não funcionam (medido, resultado negativo)

| Alavanca | Resultado |
|---|---|
| **Compressão** | O servidor **ignora `Accept-Encoding: gzip`** — resposta volta `Content-Encoding: null`, mesmo tamanho. Não há redução de tráfego disponível. |
| **Cache HTTP condicional** | `Cache-Control: no-cache, no-store, max-age=0, must-revalidate`, **sem `ETag` e sem `Last-Modified`**. `If-None-Match`/`If-Modified-Since` são impossíveis; todo cache tem de ser nosso, no banco. |
| **Pular item sem resultado** | **INCONCLUSIVO.** Os 122 itens vieram de **3 compras**, e itens dentro de uma compra são totalmente correlacionados — o n efetivo é 3. Jeffreys 95% para 3/3 = [0,44; 1,00]: até 56% das compras podem não ter resultado. Medir em ≥30 compras sorteadas antes de descartar. |

### Funcionam

**1. `tamanhoPagina=500` é o teto** — 1000 devolve 400. A fase 1 do GAP-AF cai de 14 chamadas para **2**. Ganho de ~7× em listagem, sem custo.

**2. Filtrar item por descrição ANTES de gastar `/resultados`.** A chamada de `/itens` já traz `descricao` de até 500 itens de uma vez. Só os itens que casam o termo procurado pagam a chamada de resultado — e é ela que domina o custo. Com ~10% de itens relevantes por termo, a fase 2 cai ~8×.

**3. ~~Resultado homologado é imutável.~~ ERRADO — retirado.** O payload de
`/resultados` carrega `dataCancelamento`, `motivoCancelamento` e
`situacaoCompraItemResultadoId`, e a Lei 14.133 art. 71 admite revogação e anulação
após a homologação. Os 122 itens medidos são um snapshot. Resultado coletado precisa
ser revalidado quando a `dataAtualizacaoGlobal` da ata avançar.

### Efeito combinado — a tabela da v1 estava dimensionalmente errada

A v1 publicava uma coluna "tempo total otimizado" aplicando o filtro de relevância
de 10%. **Retirada.** O filtro é **por termo de busca**; o backfill é **por corpus**.
Somar os dois numa coluna só produz um número que não existe: lido como custo por
termo, um catálogo de 100 gêneros custaria 12× mais que o backfill com que a tabela
se comparava; lido como corpus, a união dos itens que casam algum termo tende a
~100% dos itens alimentares e o fator 10% evapora.

O certo é separar em **duas grandezas com unidades diferentes**:

| | Construção do corpus (uma vez) | Custo marginal por termo |
|---|---|---|
| **Quadro** — `/itens`, até 500 descrições por chamada | 1 chamada por compra | 0 (consulta local) |
| **Valor** — `/resultados`, 1 chamada por item | — | proporcional aos itens relevantes |

Separar quadro de valor é a alavanca estrutural que faltava: o quadro é limitado,
amortizado e reusável por qualquer termo; o valor é 33× mais caro por unidade de
informação e é o único que precisa ser racionado.

**E amostragem resolve o racionamento.** Preço de referência é estimativa de
média/mediana com incerteza declarada — censo é desperdício. Para `n = (z·CV/r)²`
com z=1,96: CV 0,30 exige **n=35** para ±10% e **n=139** para ±5%. Contra os 6.331
`/resultados` por termo do recorte de E3, n=139 é **~46× menos**. A tela passa a
exibir n, o intervalo de confiança e o critério de parada — o que é **mais**
defensável numa auditoria que "somamos tudo o que achamos", não menos.

Isto está registrado como desenho recomendado para `pncp-compra-reference`, que está
adiada. Nada disso é implementado nesta entrega.

## Como ficar realmente on demand

**Nenhuma requisição de usuário pode esperar o PNCP.** A 1 req/6 s, um fan-out de
~20 chamadas seria ~2 min de espera na tela; e o limite é por origem, então a busca
de um usuário atrasaria a do outro. O desenho on-demand correto é:

- **Ler sempre do acervo local.** A UI nunca chama o PNCP em linha.
- **A busca dispara ingestão assíncrona.** Primeira busca de um termo devolve o que
  já existe mais o estado "coletando"; a segunda é instantânea. O corpus cresce pelo
  uso, não por varredura.
- **Fase 1 preguiçosa por unidade.** Em vez de agendar as 200, a primeira visita à
  aba Cobertura da unidade X dispara a fase 1 só de X — 2 a 3 chamadas, cacheadas
  por 24 h. O custo passa a ser proporcional às unidades efetivamente usadas.
- **Token bucket único por host**, compartilhado entre worker e ingestão sob demanda,
  com **prioridade para o que veio de usuário**. Sem isso o backfill consome a cota
  e a busca interativa nunca avança.
- **Single-flight.** Dois usuários abrindo a mesma ata disparam uma coleta, não duas.
- **Cache negativo.** Compra sem resultado, ou termo sem correspondência, precisa ser
  lembrado — senão cada nova busca repete o fan-out inteiro.
- **Circuit breaker POR HOST, não global.** Durante a medição `/consulta/v1` devolveu
  **504** por vários minutos enquanto `/api/pncp/v1` seguiu respondendo normalmente.
  As duas APIs têm saúde independente: derrubar as duas juntas tiraria a fase 2 do ar
  sem motivo.

## Recomendação

1. **E0 agora**, para validar contrato e telas.
2. **E1 como entrega**, com fase 2 estritamente sob demanda.
3. **E2/E3 conforme `core.units.uasg` for preenchida**, sem mudança de código — o
   worker já itera as unidades que têm o campo.
4. **E3b nunca.**

## Casamento por nome não resolve o `uasg` — é preciso curadoria

Testei o casamento automático das 29 unidades do sisub contra as 200 do PNCP, e
conferi contra as 3 UASGs que sabemos corretas:

| Unidade | Verdadeira | 1º match por nome | |
|---|---|---|---|
| `AFA` | 120060 | 120060 (candidato único) | certo |
| `DIRAD` | **120133** — Diretoria de Intendência da Aeronáutica | **120136** — Diretoria de Administração do Pessoal (candidato único) | **errado** |
| `GAP-AF` | **120623** — Grupamento de Apoio dos Afonsos | **120046** — Parque de Material Aeronáutico dos Afonsos (5 candidatos) | **errado** |

**2 de 3 erram.** O caso do `DIRAD` é o pior: candidato **único** e errado, sem
nenhum sinal de ambiguidade que dispare revisão — preencher `uasg` por heurística
gravaria o erro como fato e todas as atas da unidade viriam de outra OM. Portanto:
preencher `core.units.uasg` é curadoria manual, e este change **não** deve tentar
derivá-la.

---

# O escopo que a v2 realmente entrega: PCA em lote

Varrendo a especificação inteira do PNCP, existe **um único endpoint de lote**:
`/api/pncp/v1/orgaos/{cnpj}/pca/{ano}/csv`. Ele muda a classe de custo do problema.

| | **[medido]** |
|---|---|
| Custo | **1 requisição, 2 s, 8 MB** para toda a FAB |
| Conteúdo | **21.392 itens**, 35 UASGs, ano 2026 |
| Outros anos | 2025 (7,5 MB), **2027 já publicado** (4,8 MB) |
| Outro ente | prefeitura: 590 KB em 1,0 s |
| `UASG` por linha | **100%** |
| Itens alimentares (por classe CATMAT) | **1.300** · **620 CATMATs distintos** |
| CATMAT preenchido nesses itens | **78%** |
| **CATMATs já em `procurement.purchase_item`** | **375 de 620 (60%)** |
| UASGs que planejam gênero | **30** |
| Disco estimado | ~21 mil linhas por ano ≈ **10–20 MB** |

**Cobertura da FAB inteira em 3 requisições** (2025, 2026, 2027) — contra as dezenas
de milhares do caminho de atas, para um recorte menor.

E o ponto que decide a arquitetura: **o PCA tem código de catálogo, as atas não.**
O join com o sisub é igualdade de CATMAT, automático, com 55% de acerto imediato.
Foi a ausência desse código que tornou indecidível o casamento textual e removeu a
capability de evidência de preço (`review.md` §1).

Limite honesto: PCA é **plano**, não execução. Entrega demanda e estimativa, não
preço praticado. Preço praticado exige o caminho de atas, especificado em
`pncp-compra-reference` e adiado.
