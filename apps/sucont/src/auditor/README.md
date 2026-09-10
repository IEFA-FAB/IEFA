# Auditor SIAFI × SILOMS

Conciliação entre o saldo contábil (SIAFI) e o saldo físico/patrimonial (SILOMS)
das Unidades Gestoras do COMAER, por competência e por natureza de bem.

Portado de `lsantosnels/SIAFI-x-SILOMS-Auditor` (PR #207). A evolução do
upstream migrou para `lsantosnels/VMOBILE-AUDITOR-SUCONT-4`, que é o mesmo app
republicado com a interface refeita para celular. O estado da conferência de
upstream vive em `.claude/skills/sucont-upstream/sources.json`.

## O que mora aqui

| Caminho | Papel |
|---|---|
| `services/excelParser.ts` | Lê o relatório do Tesouro Gerencial no navegador |
| `services/dataProcessor.ts` | Normaliza, calcula deltas por escopo e classifica risco; gera a MSG institucional |
| `services/inter-om.ts` | Hipótese de transferência entre OMs sem contrapartida no SILOMS |
| `services/report*.ts` | Nota Analítica Estratégica: recorte, prompt, contrato de saída e montagem do Markdown |
| `components/` | Painel, matriz de calor, ranking, modo apresentação, modais |
| `theme.ts` | Cromo dos gráficos e as rampas de ICC e de risco, em token |
| `../server/auditor.fn.ts` | Persistência em `sucont.analysis_run`, `siloms_siafi_balance` e `generated_message` |
| `../../routes/api/auditor/report.post.ts` | Rota SSE que redige a nota |

## Defeitos corrigidos em relação ao upstream

O port não é uma tradução: estas leituras estavam erradas na origem e continuam
erradas lá. Mudança upstream que reintroduza qualquer uma delas é **regressão de
lá**, não pendência daqui.

| # | Como era na origem | Por que quebra | Onde está a correção |
|---|---|---|---|
| 1 | Risco calculado por UG e carimbado em todos os registros dela | O Intangível conciliado de uma UG herdava o "Crítico" do BMP — a tela e a MSG classificavam como crítica uma conta que estava zerada | `dataProcessor.ts` → `riskKey(ug, group)` |
| 2 | Competência contava como divergente com `difference > 0` | Resíduo de meio centavo do parse de moeda contava competência e empurrava a probabilidade | `dataProcessor.ts` → `saldoZerado` |
| 3 | Probabilidade sobre 12 meses fixos | Com série plurianual passava de 100% (chegou a 266%) e desequilibrava a mistura com o impacto | `dataProcessor.ts` → `periodCount` |
| 4 | Sem `hasPrevious` | "Não há competência anterior" e "a anterior era zero" ficavam indistinguíveis: o primeiro mês do recorte virava "+100%" numa MSG institucional | `types.ts`, `dataProcessor.ts` |
| 5 | `ugMapping.ts` como tabela literal | Desatualizada — não conhecia 120283 nem 121002 e trazia a 120627, inativa no SIAFI | `ugMapping.ts` deriva de `lib/ug/registry` |
| 6 | `prop isDarkMode` atravessando oito componentes | 226 escolhas entre dois hex; nenhuma acompanhava o tema do app | `theme.ts`, tudo em `var(--token)` |
| 7 | Tudo em memória do navegador | A análise sumia no F5; nada registrava qual arquivo produziu qual número, nem qual MSG foi para qual UG | `server/auditor.fn.ts` |
| 8 | Número da MSG digitado, começando em "XXX" | Dois operadores emitiam o mesmo número no mesmo dia | `sucont.message_number_seq` |
| 9 | "5 UGs que mais reduziram" saía de `sort` sem filtrar sinal | Numa competência com menos de cinco reduções, entravam unidades que **aumentaram** | `report.ts` → `buildTrends` |
| 10 | Percentual caía em `100` sem base anterior | Mesma mentira do item 4, agora na nota | `report.ts` → `deltaPct: number \| null` |
| 11 | Soma dos módulos apresentada como "Diferença Líquida Total" | Convida a ler compensação que não houve; as duas leituras são diagnósticos diferentes | `report.ts` → `absoluteDifference` e `netDifference` |
| 12 | Donut "Composição SIAFI × SILOMS (%)" | SIAFI e SILOMS são duas MEDIDAS do mesmo patrimônio, não duas partes dele: somá-los inventa um denominador | `CompositionDonuts.tsx` → conciliado × divergente |
| 13 | `detectInterOM` lia `previousSiafiValue \|\| 0`, pareava a mesma UG consigo, cruzava competências e cortava por ordem de iteração | Cada um dos quatro produz um par que não existe, ou esconde o par que existe | `inter-om.ts` |

## Registro sem saldo não é registro conciliado

`normalizeData` materializa as **três** naturezas de bem para toda linha do
arquivo, inclusive quando nenhum dos dois sistemas reporta nada naquela natureza.
É conveniente para o cruzamento e veneno para qualquer agregado: numa competência
com 84 UGs entram ~170 registros de zero absoluto.

Todo agregado novo passa por `hasBalance` (`services/report.ts`). Sem ele, esses
registros enchiam a tabela das maiores divergências com linhas de R$ 0,00,
contavam como "equilibrados" na preponderância — afirmando conciliação sobre
contas que ninguém reportou —, inflavam a contagem de UGs por grupo e faziam uma
natureza vazia projetar "ICC 100%" no telão.

A distinção é: zero nos dois sistemas é **ausência**; saldo igual e não-nulo nos
dois é **conciliação**, e continua contando.

## Nota Analítica Estratégica

Regra que sustenta o documento: **os números são do sistema, o texto é do
modelo.**

O prompt de origem mandava as 20 maiores divergências ao modelo e pedia que ele
as reimprimisse em Markdown ("a tabela deve ser impecável"). Reproduzir 20 linhas
de valores é exatamente o que um LLM erra sem avisar, e a nota sai assinada pela
SUCONT-4.

Aqui:

- `buildReportDataset` calcula tudo — totais, tabela, tendências nos três
  escopos, composição por grupo, hipóteses de transferência;
- o modelo recebe esse recorte para **raciocinar** e devolve só prosa, uma seção
  por campo (`analyticNoteJsonSchema`);
- `buildAnalyticNoteMarkdown` imprime as tabelas do dataset e encaixa a prosa
  entre elas. Não existe caminho em que a nota seja montada só com o retorno do
  modelo;
- cabeçalho institucional e fundamentação normativa também não são do modelo: a
  segunda vem de `#/lib/normas`, a mesma fonte que a MSG cobra da UG.

O recorte é montado no navegador e validado na rota (`report-request.ts`), como
no SAC-DGC: os filtros da tela vivem no estado do componente, e recalculá-los no
servidor criaria uma segunda definição de "o que está sendo analisado".

A rota é SSE pelo `idle_timeout` de 60 s do ALB compartilhado, com keep-alive a
cada 15 s. Nível 1 no módulo `sucont` basta — a nota é leitura da série. Nada
dela é persistido.

## Modo apresentação

Dez lâminas (uma consolidada, três por natureza de bem), na ordem em que a
SUCONT-4 apresenta a competência. Os gráficos são os **mesmos** componentes da
tela: uma segunda versão de cada um divergiria da primeira no primeiro ajuste, e
a lâmina passaria a mostrar um número que a tela não mostra.

Sem exportação para PPTX ou PNG, que na origem eram `pptxgenjs` e `html2canvas`.
O que a apresentação precisa é do telão; o documento para anexar é a nota, que já
sai em Markdown.

## Verificação

- `bun test --no-env-file src/auditor` — parsing, normalização, risco, hipótese
  de transferência, recorte da nota e montagem do documento.
- `bun run harness:build && bun run harness:serve && bun run harness:shot` — os
  gráficos nos dois temas. Nenhum linter enxerga cor errada num SVG.
