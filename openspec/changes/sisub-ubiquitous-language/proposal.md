## Why

O sisub fala a língua da Lei 14.133/2021, da Lei 4.320/1964 e da subsistência do COMAER na tela, mas não no código nem no banco. O mesmo conceito tem até cinco nomes, e um termo da norma aparece para outro conceito:

- o **anexo quantitativo do TR** (estimativa das quantidades, Lei 14.133, art. 18, § 1º, IV) é `procurement.procurement_list` no banco, `ata`/`ataId`/`AtaWizard`/`ata.ts` no TypeScript, `procurement/$ataId` na rota, `list_atas`/`get_ata_details` nas tools de IA e `/ata/:ataId` na API. Na lei, só a Ata de Registro de Preços é ata (art. 6º, XLVI). O prompt do chat precisa avisar o modelo: "nas tools ele aparece como 'ata' por nome legado — NÃO é ata";
- a **previsão de demanda** da cozinha já é `kitchen_demand_forecast` no banco, mas continua `KitchenAtaDraft`, `draftId` e rota `suprimentos/$draftId`;
- a **pesquisa de preços** é `procurement_pesquisa_preco` numa tabela e `price_research_emission` na vizinha; a amostra é `compras_amostra`;
- **liquidação** é `finance.liquidacao` no banco e `liquidation` (falso cognato: em inglês é dissolução de sociedade) no TypeScript;
- `budget_credit.dotacao` guarda o crédito **recebido** pela UG executora, que não tem dotação;
- o anexo guarda o acréscimo de quantidade em `max_margin_percent` (margem é a de preferência, art. 26) e o status `published` (publicar é divulgar no PNCP, art. 54), contra a spec `procurement-terminology`;
- "Preparação" na tela é `recipe` no código, e `preparation` no código são outras três coisas;
- **"rancho"** nomeia três conceitos conforme a frase: um refeitório ("rancho dos oficiais", o seletor do Comensal), uma cozinha com os seus refeitórios ("rancho da DIRAD", "material de rancho") ou a subsistência da unidade ("chefe do rancho", "despesa do rancho"). O banco ainda tem uma tabela `kitchen.rancho` que repete, em 62 das 66 linhas, um refeitório de `kitchen.mess_halls`;
- o **arranchamento** do comensal (o militar se arrancha) é `kitchen.meal_forecasts`, `useMealForecast`, rota `diner/forecast`, rótulo "Previsão" e API `/api/rancho_previsoes`, o mesmo "forecast" da previsão de comensais do cardápio e da previsão de demanda.

O inventário completo, com contagens, está em `design.md`. Nome errado não é só estética: o modelo do chat, o auditor que lê o banco e o próximo desenvolvedor concluem o conceito pelo nome.

## What Changes

- **Glossário do sisub** (`specs/ubiquitous-language/spec.md`): uma tabela por processo — planejamento, pesquisa de preços, contratação de origem, ARP, execução orçamentária, ordem de fornecimento, recebimento, almoxarifado, subsistência, pessoal — com termo da norma, fonte, identificador, nome no banco, rótulo de tela e todos os nomes atuais a substituir.
- **Critérios de nome**: um conceito, um nome em todas as camadas; identificador em inglês, salvo termo sem equivalente fiel pelo teste da NSCA (AGENTS.md); sem prefixo redundante (`procurement.procurement_*` → `procurement.*`); siglas legais consagradas (NE, NS, OB, NC, RP, ARP, PCA, ETP, TR, DFD, CATMAT, UASG, UG, ND, PTRES, PI, SARAM, OM, NUP) podem ser identificador; valor de domínio na língua da norma.
- **Plano de execução em nove lotes** (`design.md` D9), do que não toca o banco ao que depende de decisão de modelo (lote 8b, `kitchen.rancho`), cada lote de banco em expand → código → contract, como em `20260927010000`/`20260927020000`.
- **Gate por camada**: regra de opengrep com os termos descartados (TS, rotas, tools, migrations novas) e teste de contrato no banco vivo. "Rancho" fica proibido em identificador e rótulo novos, salvo "Fiscal de rancho". A lista cresce a cada lote concluído.
- **Decisões do usuário (2026-09-27)** incorporadas: `empenho`/`liquidacao`/`pagamento` em português (fases da despesa, Lei 4.320, arts. 58-65; `pagamento` é exceção registrada à regra do inglês); `kitchen.meal_forecasts` → `kitchen.arranchamento`; **"rancho" sai da linguagem ubíqua** (cozinha, refeitório ou unidade), com a única exceção do nome da função **"Fiscal de rancho"**, rótulo do módulo de presença e distinto do fiscal do contrato (art. 117). Os demais casos seguem o padrão defensável, com o motivo em `design.md` D2.
- **Classificação de cada ocorrência de "rancho"** em banco, código, tela, prompts, API e docs, com o destino de `kitchen.rancho` separado em rename e refatoração (`design.md` D10).
- **O que não se renomeia**, com o motivo: espelhos de API externa, nomes de terceiro (UG "RANCHO-DIRAD" no SIAFI), texto livre de usuário, IDs de módulo do PBAC, `recipe`/`ingredient`, as colunas das tabelas de despesa, migrations históricas.

Esta change é só a proposta. Código, banco, rotas e tools mudam nos lotes, cada um no seu PR.

## Capabilities

### New Capabilities
- `ubiquitous-language`: glossário do sisub e regras de nome para banco, código, rotas, tools de IA/MCP e tela, com o gate que as mantém.

### Modified Capabilities
- Nenhuma. Complementa `procurement-terminology` (que cobriu só a tela e o CSV e deixou os identificadores `ata*` como dívida, D9 de `sisub-procurement-planning-flows`).

## Impact

**Apps:** `sisub` (rotas, server fns, hooks, componentes, query keys, tools do chat, prompts, analytics), `api` (rota admin `/api/admin/price-research/ata/:ataId` e worker `pesquisa-preco`), `sisub-mcp` (nenhuma tool renomeada; só os tipos regerados), `api` também na rota restrita `/api/rancho_previsoes` → `/api/arranchamentos` (lote 7), `docs` (`pbac/modulos.mdx`, lote 8a). Lote 6 (SARAM) toca `sucont` e `rumaer`. A proposta `lgpd-military-roster-key` passa a nomear `saram` a coluna da view `core.military_identity`.

**Packages:** `@iefa/sisub-domain` (operações, schemas, vocabulários), `@iefa/database` (migrations, `generated.ts`, Drizzle).

**Banco (nos lotes, não nesta change):** até 16 tabelas renomeadas com view de compatibilidade (incluindo `kitchen.meal_forecasts` e, se não houver fusão, `kitchen.rancho`), cerca de 20 colunas espelhadas por trigger, 5 funções recriadas, 5 CHECKs com valor trocado. Cada migration e cada contract esperam o mantenedor.

**Gate:** `.opengrep/rules/ubiquitous-language.yaml` e um teste de contrato de integração. Os dois são definição de gate e esperam o mantenedor.

## Não-objetivos

- Renomear colunas legadas em português que não conflitam com o glossário (`finance.empenho.valor_total`, `numero_ob`, `data`...). Ficam como dívida até um lote próprio; coluna nova já nasce no idioma certo.
- Renomear os IDs de módulo do PBAC (`diner`, `messhall`, `unit`, `kitchen`, `storage`...). São dado de permissão gravado em `access_control`, e trocá-los é mudança de acesso.
- Singular × plural de tabela (`mess_halls`, `recipes`, `meal_presences`): cosmético, sem conflito de conceito.
- Mudar o modelo de dados. A fusão de `kitchen.rancho` em `kitchen.mess_halls` (recomendada em D10.1) é change própria (`sisub-workforce-by-mess-hall`); ligar a contratação planejada à contratação de origem também.
- Reescrever texto livre de usuário (avaliações, observações do efetivo) ou nome de terceiro que contenha "rancho".
- Tocar migrations já aplicadas.
- Traduzir texto de norma ou de documento legal.
