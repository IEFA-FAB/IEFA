# Cobertura de testes — estado e proposta

Levantamento feito em 2026-09-01, com os números medidos no repositório. Não é
um plano de "aumentar cobertura": é a lista do que hoje **pode quebrar em
produção sem nenhum teste falhar antes**, em ordem de dano.

## Onde estamos

| Camada | Medida | Situação |
|---|---|---|
| Lógica pura do domínio | 45 módulos em `packages/sisub-domain/src/operations`, 9 com teste | Melhor coberto do repo, mas concentrado em authz e matemática |
| Server functions (sisub) | 60 arquivos `*.fn.ts`; as decisões de `receiving` e `liquidation` já saíram para o domínio e têm teste | **Ainda o maior buraco.** É onde moram autorização, ordem de escrita e tradução de erro |
| Funções SQL | 26 migrations declaram função ou trigger | Só a suíte de integração as executa — e ela roda em skip por padrão |
| UI | 340 componentes/rotas `.tsx`, 0 testes de componente | Nenhuma cobertura. Regressão visual e de estado só aparece em uso |
| Contratos de IA (chat + MCP) | Testes de contrato nos dois lados | Bem servido: `model-args`, `inputSchema` × `toJsonSchema` |

O gate do CI cobre biome, typecheck, opengrep, codeql, trivy, zizmor, gitleaks,
`bun audit`, os testes de contrato e a integração contra o banco real. O que ele
**não** cobre é justamente o que a lista abaixo endereça.

## Rodada 1 (#255) — acondicionamento, lotes e núcleo

| Arquivo | O que trava |
|---|---|
| `operations/conditioning.test.ts` | 29 casos. Inclui a regressão de decisão "in natura não classifica" — a regra que, se acrescentada, daria classe errada a 295 itens com cara de conferida |
| `operations/conditioning.sql-contract.test.ts` | Vocabulário TS × `CHECK` do banco. Divergir é silencioso: passa no formulário e estoura no insert com uma mensagem que não diz o campo |
| `operations/receipt-lots.test.ts` | Invariante da soma dos lotes, código sintético sem colisão, veredito por lote |
| `operations/gs1-specification.test.ts` | Precedência `nao_atende` > `indeterminado` > `atende`, e a impressão digital que invalida veredito quando a exigência muda |
| `gs1-sync/gpc.test.ts` | Atributos GPC (antes descartados), dedupe por código, recorte por segmento |
| `inventory-cycle.e2e.operations.test.ts` | Entrega com **duas validades**: dois movimentos, duas linhas em `stock_lot`, FEFO na ordem certa, e efetivação recusada quando a soma dos lotes não fecha |

## Rodada 2 — o buraco das server functions, primeira lasca

| Arquivo | O que trava |
|---|---|
| `operations/receiving-math.ts` + teste | Custo unitário na unidade base (a nota preça a embalagem, o ledger valora o gênero) e a regra de divergência sem motivo |
| `operations/liquidation-math.ts` + teste | Valor sugerido da NS, competência, número de NS e — a mais importante — contra qual unidade o escopo é verificado |
| `operations/inventory-vocabulary.ts` | Tipos de movimento e situações de recebimento como constante, não string solta em quinze arquivos |
| `operations/sql-vocabulary.contract.test.ts` | 11 pares SQL × TypeScript lidos das migrations reais, mais a **partição entrada/saída** dos tipos de movimento |
| `.opengrep/rules/money-rounding.yaml` | `toFixed(2)` em valor monetário |

### O que a extração já encontrou

**`Number(total.toFixed(2))` arredonda meio-centavo sempre para baixo.** `(10.005).toFixed(2)` é `"10.00"`, porque 10,005 em binário é 10,00499…. Num item é um centavo; numa NS que soma dezenas de linhas o viés é sistemático e reaparece na conciliação contra o SIAFI como diferença sem origem rastreável. Corrigido com `roundToCents`, que normaliza a representação antes de arredondar, e virou regra de opengrep.

**A partição de custeio não tinha quem a verificasse.** As triggers de custo médio classificam cada tipo de movimento em entrada ou saída por listas literais no SQL. Um tipo novo fora das duas passa pelo ledger sem afetar `inventory.stock_cost` — o saldo anda, o custo médio não — e isso só aparece no balancete do mês seguinte. Agora um teste exige que as duas listas cubram exatamente o vocabulário e não se sobreponham.

**Asserção instável trocada por identidade.** `training.operations.test.ts` comparava a contagem GLOBAL de produção antes e depois do reset. A suíte roda contra o banco de produção por ~16 minutos: em 2026-09-01 ela falhou com 2499 contra 2498 porque usuários cadastraram receitas globais durante o run. O que a asserção quer provar é que o reset não APAGOU dado de produção — então passa a capturar uma amostra de ids antes e exigi-los intactos depois. Inserção concorrente deixa de importar; apagar qualquer linha da amostra falha.

## Proposta, em ordem de dano

### 1. Server functions — o buraco de 55 arquivos

O padrão que impede testar hoje é o acoplamento: a fn faz auth, monta query
PostgREST e traduz erro no mesmo `.handler()`. A regra do repo ("não importar
`@/server/*` de teste unitário") existe porque `env.server.ts` valida credencial
na carga do módulo — e ela empurra a solução certa:

- **Extrair a decisão para `src/lib/` ou para uma operation do domínio**, deixando no
  `.handler()` só auth + I/O. É o que já foi feito em `stock-math`, `demand-math` e
  `production-issue`, e é por isso que esses três têm teste.
- **Prioridade** pelo dano: `receiving.fn` (movimenta ledger), `liquidation.fn` e
  `reconciliation.fn` (dinheiro), `permissions.fn` (IDOR já corrigido uma vez ali),
  `purchase_item.fn` (catálogo global).

### 2. Funções SQL fora da integração

26 migrations declaram função ou trigger. `finalize_goods_receipt`,
`register_production_issue` e os triggers de custo médio decidem saldo e
valoração contábil — e hoje só a suíte de integração os executa, em skip por
padrão. Um erro neles não é um bug de tela: é saldo errado num ledger
append-only, que só se corrige com movimento de ajuste.

- **Marcar essas funções como caminho obrigatório de integração** e rodar a
  suíte no CI de PR, não só depois do merge.
- Hoje o gate de integração roda `SISUB_RUN_INTEGRATION` com banco real e
  rollback. Manter isso — banco efêmero não substitui: metade dos defeitos que
  a suíte pega são de FK, RLS e trigger que só existem no banco de verdade.

### 3. Migrations não têm teste nenhum

Uma migration é código, roda uma vez e não tem rollback prático. As três classes
de erro que já apareceram no repositório:

- valor de `CHECK` divergindo do vocabulário da aplicação;
- backfill que classifica errado e fica com cara de dado conferido;
- ordem de FK/coluna que só falha com dado real.

O teste de contrato SQL×TS que este PR introduziu (`conditioning.sql-contract.test.ts`)
é barato e pega a primeira classe. **Vale generalizá-lo**: um teste que varre
`packages/database/supabase/migrations` e confere que todo `CHECK ... IN (...)`
cujo vocabulário existe em TS bate com a constante. Candidatos imediatos:
`equipment_role.category`, `catalog_scope`, `stock_movement.type`,
`goods_receipt.status`.

### 4. UI: 340 componentes, zero testes

Não proponho testar 340 componentes — proponho cobrir os **fluxos onde errar
custa caro**, com Playwright (o change `add-playwright-e2e` já existe em
`openspec/changes`):

1. conferência de recebimento com múltiplos lotes e temperatura fora da faixa;
2. login + troca de cozinha (o `beforeLoad` que já causou 502);
3. edição de ficha técnica (fator de correção, substituição).

Antes disso, o mais barato: **extrair para função pura a lógica que hoje mora no
componente** — cálculo de saldo, validação de formulário, ordenação. Este PR fez
isso com `lotBalance` e `describeConditioning`, que a tela consome mas o teste
exercita sem montar React.

### 5. Testes de contrato entre pacotes

`@iefa/sisub-domain/agent` já tem contrato dos dois lados (chat e MCP), e é o
melhor padrão do repositório. Falta o equivalente para:

- `@iefa/legal-kit` × documentos publicados no banco (existe `contact.test.ts`,
  falta o inventário de cookies × cookies realmente setados);
- `@iefa/pbac` × módulos declarados nos apps — hoje um módulo novo pode não ter
  policy e ninguém percebe até o 403.

## Como medir sem enganar

- `bun run test` da raiz, nunca `bunx vitest run` da raiz — o alias `@/` não
  resolve e gera falsos positivos.
- Integração em skip é **esperado**, não falha. Desconfie do run que passa rápido
  demais: já houve suíte de integração rodando vazia e verde.
- Cobertura por linha não é a métrica: 680 testes verdes convivem com 55 server
  functions sem teste porque o que está coberto é o que já era fácil de cobrir.
  A métrica útil é a da tabela acima — quantos caminhos que mexem em dinheiro,
  saldo ou autorização têm um teste que falha se eles quebrarem.
