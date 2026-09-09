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

## PDF sem camada de texto

Alguns documentos são digitalizados. O `rada:build` os **reporta** e não gera `.md`: ingerir
documento vazio é pior do que não ter o documento, porque tira a pergunta do caminho honesto
do "sem base" e a transforma em ruído. Esses precisam de OCR, que não está implementado.
