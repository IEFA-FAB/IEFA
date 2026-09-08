# Proposal: sisub-om-survey-and-contract-registry

## Why

A SDAB levanta, por planilha Excel de 27 abas, quanto cada OM investiu em 2025 e quanto precisa em 2026 nas sete categorias de infraestrutura do rancho — uniformes, aquisição e manutenção de ar-condicionado, reparos estruturais, mesas e cadeiras, utensílios e treinamento (`Planilha_Levantamento_DIVISA_por_OM_27-08.xlsx`). O arquivo circula por e-mail, cada OM devolve a sua aba, alguém consolida à mão e o resultado morre num arquivo: no ano seguinte o levantamento recomeça do zero, sem memória do que foi respondido nem de qual contratação sustentou cada número.

Duas evidências de que isso já é dívida, não hipótese:

1. **Já aconteceu antes e ficou órfão.** `core.workforce_survey` / `workforce_submission` / `workforce_headcount` existem no banco de produção com 1 levantamento, 32 submissões e 167 linhas respondidas — e **nenhum arquivo do repositório referencia essas tabelas**. Um levantamento por OM foi ingerido no `core` sem nenhuma tela, servidor ou operação. O DIVISA é o segundo pedido do mesmo formato.
2. **O cruzamento que a planilha pede o sistema não consegue fazer.** As colunas "Situação anterior informada" e "Prazo para homologação / contratação" são preenchidas à mão com número de PAG e situação de ATA (`PAG 67273.004608/2025-31`, "Sem ATA vigente"). O sisub tem execução orçamentária (`finance.budget_credit`, `empenho`, `liquidacao`, `pagamento`) e ATAs (`procurement.procurement_arp`), mas **só de gênero alimentício**: `finance.empenho.arp_item_id` é FK NOT NULL para item de ATA de alimento. Contratação de ar-condicionado, reforma, mobiliário, uniforme ou capacitação — despesa afeta ao sistema corporativo de subsistência sem ser alimento — **não tem onde existir** no modelo atual.

## What Changes

Afeta **sisub** (4 telas novas, server fns, PBAC), **packages/database** (migration no schema `core`), **packages/sisub-domain** (operations + utils puros) e **apps/api** (worker de sincronização por UASG). Nenhum outro app muda, mas as tabelas nascem no `core` — sem dependência de cozinha, rancho ou cardápio — para que sucont, portal ou um sistema futuro leiam o mesmo dado.

- **Motor de levantamento por OM.** Tabelas novas `core.survey_campaign`, `survey_category`, `survey_response` e `survey_response_item`: campanha define ano-base, ano-alvo e as categorias; cada OM tem uma resposta; o grão é (resposta × categoria) com valor realizado, valor necessário, resumos, prazo e observações. Categoria é **dado**, não enum — a próxima campanha muda a lista sem migration.
- **Registro de contratações de subsistência.** Tabela nova `core.subsistence_contract`: ATA, contrato, dispensa, inexigibilidade ou empenho direto de uma OM, com NUP/PAG, objeto, natureza de despesa, fornecedor, vigência e valores (total, empenhado, liquidado, pago). Classificada por **tópico durável** (`uniformes`, `climatizacao`, `obra_reforma`, `mobiliario`, `utensilios`, `capacitacao`, `equipamento`, `generos_alimenticios`, `outros`) — vocabulário estável, independente de qualquer campanha, que é o que torna o registro reutilizável fora do DIVISA.
- **Cruzamento automático.** `core.survey_response_item_contract` liga item respondido a contratação, com a parcela atribuída e a origem do vínculo (automático ou manual). O sistema **sugere** valor realizado, situação anterior e prazo a partir das contratações da OM no ano-base; a sugestão nunca sobrescreve o que a OM informou — ela é aceita explicitamente e o que sustentou a sugestão fica gravado.
- **Três fontes alimentam o registro**: (a) cadastro manual/importado pela OM; (b) projeção do que já existe — `procurement.procurement_arp` e a cadeia `finance.empenho → liquidacao → pagamento`, marcadas com origem externa para nunca duplicarem; (c) sincronização do Compras.gov por UASG, worker novo em `apps/api`.
- **Pré-condição dura para (c): `core.units.uasg` está preenchido em 3 de 31 linhas.** O backfill entra neste change, com o mapa UG→sigla que já existe em `apps/sucont/src/subitens/constants.ts`. No mesmo saneamento: `BABV` está na planilha e **não existe** em `core.units`, e a aba `CINDACTA II` não casa com o code `CINDACTA 2`.
- **Import/export XLSX.** Importar a planilha preenchida (27 abas → campanha + respostas) e exportar tanto o caderno por OM pré-preenchido quanto o consolidado. `xlsx` (tarball SheetJS 0.20.3) passa a ser dependência do `sisub`, no mesmo pin de `api` e `sucont`.
- **Consolidação recalculada.** Total por OM e por categoria é **derivado**, nunca gravado. O consolidado do sistema vai divergir do `Resumo Geral` da planilha, e isso é correção: naquela aba, `G8` soma `BABV!D11` fora de ordem e `F10`/`G9` são obtidas por subtração do total em vez de soma das parcelas.
- **PBAC sem módulo novo**: a OM responde e cadastra contratação com `unit` nível 2 no escopo dela (leitura nível 1); a campanha é criada, aberta, fechada e importada com `admin` nível 2; o consolidado global é `analytics` nível 2, somente leitura.

## Capabilities

### New Capabilities

- `om-survey-campaign`: campanha de levantamento por OM — ciclo de vida, categorias como dado, resposta por unidade, grão por categoria e regra de submissão.
- `subsistence-contract-registry`: registro de contratações de subsistência não-alimentares por OM, com tópico durável, chave natural, origem externa e valores de execução.
- `survey-contract-crosswalk`: derivação de sugestão (valor realizado, situação anterior, prazo) a partir das contratações, vínculo item↔contratação e regra de precedência sobre o dado informado.
- `contract-sources-ingestion`: projeção de `procurement_arp` e da cadeia de execução do `finance` para o registro, sincronização do Compras.gov por UASG e saneamento de `core.units` (uasg, BABV, CINDACTA).
- `survey-spreadsheet-io`: importação da planilha DIVISA preenchida, exportação do caderno por OM e do consolidado, com casamento aba→OM tolerante.
- `survey-consolidation-report`: consolidado por OM e por categoria, cobertura de resposta da campanha e apresentação somente leitura na Análise Global.

### Modified Capabilities

Nenhuma — `openspec/specs/` não tem specs publicadas. O afrouxamento do módulo `unit` está descrito em `om-survey-campaign` e `subsistence-contract-registry`.

## Impact

- **packages/database**: uma migration no schema `core` (6 tabelas novas), RLS ligada sem policy como as irmãs e grants para `service_role`; `UPDATE` de saneamento em `core.units` (uasg de 28 OMs, `BABV` novo, code do CINDACTA). Regenerar `generated.ts` e o schema Drizzle. **Nenhuma view `SECURITY DEFINER`** — o consolidado é calculado no domínio, não em view (ver `20260825155457_security_definer_views_and_anon_rpc_lockdown.sql`).
- **packages/sisub-domain**: `operations/survey.ts` e `operations/subsistence-contract.ts`; `utils/survey-crosswalk.ts` (sugestão) e `utils/survey-consolidation.ts` (totais), puros e testáveis sem banco. `operations/training.ts` ganha os passos de reset, com as tabelas filhas **antes** de `survey_response` e `subsistence_contract`, senão o reset de treino cai por FK.
- **apps/sisub**: rotas `/unit/$unitId/levantamentos`, `/unit/$unitId/levantamentos/$campaignId`, `/unit/$unitId/contratacoes`, `/admin/levantamentos` e `/analytics/levantamentos`; `server/survey.fn.ts` e `server/subsistence-contract.fn.ts`; itens de navegação; dependência nova `xlsx`.
- **apps/api**: worker `contratacoes-sync` contra `dadosabertos.compras.gov.br`, no padrão de `workers/compras-sync` (log de sync + passos), acionado por UASG.
- **Dado existente que muda**: `core.units` ganha `uasg` em 28 linhas e uma unidade nova (`BABV`); o code `CINDACTA 2` é reconciliado. Toda FK para `units` é por `id`, então nada quebra, mas é escrita em tabela de produção e precisa de nota no PR.
- **Riscos**: (a) migration precisa ser aplicada **antes ou junto** do merge — foi assim que a #225 derrubou produção com `42P01`; (b) `numeric` volta do PostgREST como **string**, e schema Zod que espera `number` reprova campo salvo (o caso do `catalog_scope`/FTP, PR #206); (c) o gate de integração dá verde vazio quando a tabela não existe, então o teste novo tem de falhar sob `SISUB_INTEGRATION_REQUIRED`; (d) `xlsx` por URL de tarball não é acompanhado pelo dependabot — bump é manual; (e) a API de dados abertos do Compras.gov não tem SLA: o worker precisa ser idempotente e a falta dele não pode travar o preenchimento manual.

## Não-objetivos

- **Migrar `core.workforce_*` para o motor novo.** As 32 submissões de efetivo continuam onde estão; o change registra a dívida e desenha o motor de modo a comportá-las depois, mas não move dado nesta entrega.
- **Substituir o `apps/forms`.** Isto não é questionário genérico: o grão é dinheiro por categoria com cruzamento contra contratação. Pergunta de texto livre com lógica condicional continua sendo do `forms`.
- **Executar orçamento das contratações não-alimentares.** O registro guarda empenhado/liquidado/pago como informação; não emite empenho, não liquida e não concilia — `finance` segue exclusivo de gênero.
- **Fluxo de aprovação/homologação da contratação.** O levantamento registra prazo e situação; workflow de aprovação com trâmite é outro problema.
- **Anexo de documento (PDF do PAG, ata assinada).** Puxa bucket, retenção e revisão LGPD; fica para change próprio.
- **Notificação ativa de campanha aberta ou prazo vencido** (e-mail/push). A tela mostra quem não respondeu; ninguém é avisado automaticamente.
- **Exposição às tools de IA (chat de módulo + MCP).** Fora do corte. Quando entrar, segue o contrato de `@iefa/sisub-domain/agent`: `limit` + `total`, `.nullish()` em opcional e teto de 60k caracteres.
- **Preenchimento automático que grava sozinho.** A sugestão sempre exige aceite humano — número de investimento assinado por chefe de SSUB não pode nascer de heurística silenciosa.
