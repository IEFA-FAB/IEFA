# RADA-e — coleta e ingestão

O RADA-e é o Regulamento de Administração da Aeronáutica em forma eletrônica: uma portaria
do GABAER e quinze manuais, de A a O, publicados no índice da DIREF **na intranet do
COMAER**. É o corpus que o ChatRADA responde.

## A restrição que define tudo

A intranet não é alcançável de fora. Não existe versão disto que rode no ECS, em Actions ou
em cron — só na máquina de quem está conectado à rede, sob demanda. O CLI se recusa a rodar
com `CI` no ambiente, porque lá ele só poderia falhar, ou passar por engano contra outra
coisa.

Duas consequências práticas:

- **O acervo mora fora do repositório** (`RADA_ARCHIVE_DIR`, por padrão `~/rada-e`), e o
  `knowledge/` gerado é gitignored. Este repositório é **público** e o material é interno da
  FAB.
- **O endereço do índice não está no código.** Vem de `RADA_INDEX_URL` — nome de host da
  intranet também não entra em repositório público.

## Fluxo

```bash
cd apps/alpha

bun run rada:fetch            # na intranet: mostra o que mudou, não escreve
bun run rada:fetch --apply    # na intranet: baixa para o acervo
bun run rada:build            # SEM rede: acervo -> knowledge/*.md
bun run ingest:all            # ingere na base (chunks + embeddings)
```

`rada:build` é o que permite continuar trabalhando **depois de sair da intranet**: uma vez
coletado, o acervo é local e a conversão não toca a rede.

### Quando a coleta cai no meio

Acesso intermitente é o caso normal, não a exceção. `meta/pendencias.tsv` no acervo registra
o que faltou, uma linha por item, e:

```bash
bun run rada:fetch --pending    # na próxima vez que estiver na intranet
```

recupera o que der e mantém na lista o que falhar de novo.

## O que a página da DIREF realmente entrega

Vale saber antes de confiar na contagem de módulos:

| | Módulos | O que são |
|---|---|---|
| 10 | A, B, C, D, E, F, I, J, K, N | PDF direto |
| 5 | G, H, L, M, O | **página de outro sistema** — SISCONTAER, DIRAD, SISPNR, SISHT, SISTRAN |

Os cinco últimos não são arquivo: são índices com dezenas de PDFs cada, de layout próprio.
O segundo salto é trabalho por sistema, e o CLI os **reporta** em vez de fingir que coletou.
Na primeira coleta completa esses cinco renderam 82 PDFs — o módulo G sozinho tem 25
submódulos.

### Certificados

Quatro hosts servem certificado autoassinado, e **dois estão vencidos** (SISPNR desde
2024-11-20, SISHT desde 2025-02-25). Sem `--insecure-tls` esses módulos são reportados, não
baixados: a falha aparece em vez de virar corpus incompleto em silêncio. A flag existe
porque a alternativa real, numa intranet sem CA distribuída, é não coletar — mas usá-la é
declarar que se confia na rede, e por isso ela é explícita.

## Por que `embedding_model` importa aqui

`markdown-ingest.ts` grava `embedding_model` em cada chunk e usa a fábrica compartilhada
(`lib/embeddings.ts`, Bedrock no padrão). Não é detalhe: a RPC `alpha.match_chunks_cosine`
filtra `c.embedding_model = embedding_model_filter`, e nulo não é igual a nada. Chunk
ingerido sem esse campo tem vetor e ainda assim só é alcançável por full-text — some da
busca semântica sem erro nenhum.

## PDF sem camada de texto — OCR local

Do acervo de 92 PDFs, **um** não tem camada de texto: 21 páginas, zero objetos de fonte.
Não é digitalização — é render digital com o texto em vetor —, o que aliás faz o OCR sair
muito bom.

O `rada:build` detecta isso (extração devolve vazio) e roda OCR **na máquina**:

```
pdftoppm -r 300 -gray -png   →   tesseract -l por --psm 1
```

**Por que local.** O material é interno da FAB; mandar página de norma para serviço de OCR
de terceiro publicaria o documento.

**Por que dois binários do sistema e não uma lib.** `tesseract` lê imagem, não PDF, e o
poppler rasteriza. A alternativa em JS (`tesseract.js`) traria dezenas de MB de WASM para o
`node_modules` de um app que roda em produção, por uma função que só existe no fluxo local
de coleta — o custo cairia no lugar errado.

### O que instalar

`tesseract` e `pdftoppm` (poppler-utils) vêm da distribuição. O modelo de português
normalmente **não** vem, e sem ele o OCR erra acento e palavra comum. Não precisa de sudo:

```bash
mkdir -p ~/rada-e/tessdata
curl -sSL -o ~/rada-e/tessdata/por.traineddata \
  https://github.com/tesseract-ocr/tessdata_fast/raw/main/por.traineddata
```

O `rada:build` procura em `RADA_TESSDATA_DIR`, ou em `<acervo>/tessdata`. Faltando qualquer
peça, ele **reporta o que falta e como resolver** em vez de gerar documento vazio.

### Custo e cache

Cerca de 3 s por página (65 s nas 21 páginas deste documento). O resultado é cacheado por
**sha256 do PDF** em `<acervo>/ocr/`, então reconstruir o corpus não repete o
reconhecimento — só um PDF que mudou de verdade é reprocessado. `--no-ocr` pula a etapa.

### A marca fica na citação

OCR é leitura, não transcrição fiel: número trocado é o erro típico, e numa norma isso
importa. O documento reconhecido leva `(texto obtido por OCR)` no `source`, que é o campo
que viaja no `metadata` de cada chunk e aparece na citação — quem lê a resposta consegue
saber, sem abrir o acervo.

### Uma armadilha que isto expôs

`pdf.js` **transfere** o `ArrayBuffer` para o worker: depois de `pdfToSubmissionText(bytes)`,
o `bytes` do chamador volta com `byteLength` 0. Foi assim que a primeira tentativa de OCR
recebeu "Document stream is empty". `to-text.ts` passou a copiar internamente, com teste de
regressão — nenhum chamador presente ou futuro precisa saber disso.
