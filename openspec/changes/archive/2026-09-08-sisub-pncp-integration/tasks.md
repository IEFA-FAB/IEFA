## 0. Pré-requisito sem código

- [ ] 0.1 [dados] Curar `core.units.uasg` das 26 unidades faltantes pela tela `unit/$unitId/settings` (o campo já dispara `fetchUasgInfoFn` aos 6 dígitos e devolve nome oficial, UF, município e órgão — a conferência é do próprio operador). Destrava de 3 para 28 unidades e não depende de nada deste change

## 1. Banco

- [x] 1.1 [database] Migration em `compras_gov_integration`: coluna `source text not null default 'compras_gov'` em `compras_sync_log` + backfill + índice
- [x] 1.2 [database] Migration em `compras_gov_integration`: tabela `pncp_pca_item` com chave natural `(cnpj_orgao, ano_pca, id_item_pca)`, coluna `removed_at`, RLS ligada **sem policy**, índices por `(cnpj_orgao, ano_pca)` e por `codigo_item`
- [x] 1.2b [database] Tabela `pncp_pca_snapshot` — por `(cnpj_orgao, ano_pca)`: hash do último arquivo aplicado, `applied_at`, contagem de linhas. É o estado de invalidação do cache
- [x] 1.3 [database] Aplicar as migrations e regenerar `generated.ts`

## 2. Isolar o log de sync (pré-requisito da ingestão)

- [x] 2.1 [api] Filtrar `hasLiveSync` e `recoverStaleSyncs` por `source` em `workers/compras-sync/index.ts`
- [x] 2.2 [api] Filtrar por `source` as consultas de `api/routes/compras-admin.ts`, incluindo `/sync/latest`
- [x] 2.3 [api] Teste provando que um sync de origem `pncp` em `running` não bloqueia nem corrompe um sync `compras_gov`

## 3. Ingestão do PCA

- [x] 3.1 [api] Cliente do CSV: requisição serial, status HTTP avaliado **antes** do corpo, `content-type` ignorado, retentativa com backoff. Casos cobertos por teste com fixture: `204` vazio, `500` com corpo de texto, `429` com corpo HTML
- [x] 3.2 [sisub-domain] Parser do CSV em função pura: resolução de coluna **por nome de cabeçalho**, BOM, separador `;`, decimal com vírgula; coluna esperada ausente aborta com erro nomeando a coluna. Testes sem banco
- [x] 3.3 [sisub-domain] Subpath dedicado no `package.json` (molde do `./gtin`) para o worker não arrastar o barrel de `utils`, que reexporta Drizzle
- [x] 3.4 [api] Ingestão: 1 requisição por `(cnpj, ano)`, **reconciliação de snapshot** escopada a `(cnpj_orgao, ano_pca)` numa única transação — linha ausente do arquivo novo recebe `removed_at`, nunca é apagada; gravação em `compras_sync_log`/`compras_sync_step` com `source = 'pncp'`
- [x] 3.4b [api] Guarda de completude antes de reconciliar: arquivo truncado ou queda anômala de volume aborta a reconciliação em vez de marcar o plano inteiro como removido (a origem responde `Content-Length: None`, chunked)
- [x] 3.4c [api] Invalidação por hash: guardar o SHA-256 do arquivo aplicado em `pncp_pca_snapshot` e pular a reconciliação inteira quando o novo for idêntico — medido byte-idêntico entre coletas; evita 21 mil escritas sem mudança de estado
- [x] 3.4d [api] NÃO enviar `If-None-Match`/`If-Modified-Since`: medido que o CSV responde `no-store` **sem `ETag` e sem `Last-Modified`**
- [x] 3.5 [api] Rota admin de disparo e status espelhando `compras-admin.ts`, protegida por `x-admin-secret`
- [x] 3.6 [api] Testes de reconciliação: (a) reingerir conteúdo idêntico não escreve nada; (b) item ausente do arquivo novo recebe `removed_at`; (c) outro órgão/ano não é afetado; (d) arquivo truncado não marca nada como removido
- [ ] 3.7 [api] Sonda de mudança opcional por `/consulta/v1/pca/atualizacao` (`tamanhoPagina=10&pagina=1`, ler `totalRegistros`): **7,5 KB vs 8 MB**. Validar antes a semântica de `totalRegistros` — a janela de 3 dias devolveu 5.608 para 35 UASGs, o que não bate com o CSV byte-idêntico; se o contador for de itens e não de planos, a sonda não serve como guarda

## 4. Leitura no sisub

- [x] 4.1 [design] **Decisão bloqueante:** a tela mora em `/analytics` (leitura agregada da FAB) ou no módulo de unidade? Registrar no `design.md` antes de 4.2
- [x] 4.2 [sisub] Server fn de leitura agregada por UASG e por classe CATMAT, com `limit` e `total`, no guard já existente do módulo escolhido
- [x] 4.3 [sisub] Server fn de cobertura de catálogo: quantos CATMATs do PCA existem em `purchase_item` e quantos não, sem qualquer inferência por descrição. Cobertura é **derivada na leitura**, nunca persistida — insumo cadastrado depois muda a resposta sem nova ingestão
- [x] 4.3b [sisub] Toda leitura exclui itens com `removed_at` das somas de demanda, e exibe a data da última ingestão do órgão/ano mostrado
- [x] 4.4 [sisub] Tela somente leitura: itens planejados por UASG e classe, com quantidade, unidade de fornecimento e valor unitário **rotulado como estimado em plano**
- [x] 4.5 [sisub] Exibir as contagens de cobertura: itens sem CATMAT (22% medidos) e sem quantidade (30% medidos) contados e visíveis; soma de quantidade declara quantos itens ficaram de fora
- [x] 4.6 [sisub] Listagem das UASGs que planejam gênero, com código e nome oficial, para servir à curadoria da task 0.1
- [x] 4.7 [sisub] Nenhum ponto da tela oferece dado do PCA como amostra de pesquisa de preço

## 5. Fechamento

- [ ] 5.1 [api] Rodar a ingestão para a FAB, ano corrente, e conferir contra o medido: **21.392 linhas, 35 UASGs, 1.300 itens alimentares, 620 CATMATs distintos, 375 já no catálogo**
- [x] 5.2 [root] Regra opengrep: proibir escrita em `procurement.compras_amostra` / `upsert_compras_amostras` a partir de código do PNCP — o invariante "não toca na prova de auditoria" precisa de gate, não só de spec
- [x] 5.3 [root] `bun run check:deploy` verde caso `apps/api/package.json` tenha mudado
- [x] 5.4 [root] `bun run test` (turbo) e gate de integração verdes
- [x] 5.5 [root] `bun run check` (Biome + typecheck) verde
- [ ] 5.6 [root] `/code-review` rodado e achados relatados no PR
