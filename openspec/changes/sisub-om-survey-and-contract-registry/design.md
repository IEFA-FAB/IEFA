# Design: sisub-om-survey-and-contract-registry

## Context

O pedido chegou como planilha: `Planilha_Levantamento_DIVISA_por_OM_27-08.xlsx`, 27 abas de OM (BASM…GAP-GL) mais `Instruções` e `Resumo Geral`. Cada aba tem sete linhas de categoria e, por linha, oito campos: investimento realizado em 2025, resumo do que foi feito, necessidade para 2026, observação sobre o valor, resumo da necessidade, situação anterior informada, prazo para homologação/contratação e observações. O rodapé identifica quem preencheu (nome, contato, função, data).

Estado atual do sistema, verificado em produção:

| Dado | Onde vive hoje | Serve ao DIVISA? |
|---|---|---|
| OM | `core.units` (31 linhas, 30 com `type`) | Sim — é a chave das abas |
| UASG da OM | `core.units.uasg` | **Não** — preenchida em 3 de 31 linhas |
| ATA de gênero | `procurement.procurement_arp` (+ `procurement_arp_item`) | Parcial — só alimento |
| Execução orçamentária | `finance.budget_credit`, `empenho`, `liquidacao`, `pagamento`, `reconciliation_decision` | Parcial — `empenho.arp_item_id` é FK **NOT NULL** para item de ATA de gênero |
| Contratação não-alimentar | — | **Não existe** |
| Catálogo Compras.gov | `compras_gov_integration.*` (material, serviço, sync log) | Só catálogo; nenhuma contratação |
| SIAFI × SILOMS | `sucont.siloms_siafi_balance` | Não — grão é (competência, UG, grupo de conta), sem natureza de despesa |
| Levantamento por OM anterior | `core.workforce_survey`/`_submission`/`_headcount`/`_category`/`_note` | É o precedente: populado (1/32/167/6/28) e **sem uma linha de código no repo** |

Restrições que moldam o desenho:

- **A planilha é o contrato com o usuário externo.** Chefe de SSUB responde no Excel hoje e vai continuar podendo. Import e export não são conveniência: são o caminho de adoção.
- **Categoria muda a cada campanha.** As sete de agora saíram de um ofício; a próxima edição terá outras. Enum em migration é acoplamento errado.
- **Contratação é dado durável; campanha é efêmera.** O registro de contratações precisa fazer sentido sozinho — para sucont, para o portal, para o ano que vem — sem saber que existe DIVISA.
- **Número de investimento é assinado por gente.** Sugestão automática pode errar; gravar sozinha, não.

Decisão de camada tomada pelo mantenedor: **tabelas no schema `core` do sisub**, operations em `@iefa/sisub-domain`, e não em schema/pacote cross-app novo.

## Goals / Non-Goals

**Goals:**

- Levantamento por OM vira dado consultável e comparável entre edições, com autor, data e status de resposta.
- As contratações de subsistência não-alimentares passam a ter registro próprio na OM, com tópico durável e valores de execução.
- O preenchimento é assistido pelo histórico: o sistema propõe valor realizado, situação anterior e prazo, com a evidência que sustentou cada proposta.
- Consolidado por OM e por categoria calculado pelo sistema, sem depender de fórmula de planilha.
- Import/export XLSX fechando o ciclo com quem responde no Excel.
- Reutilizável fora do sisub: `core` sem dependência de cozinha/rancho, tipado em `@iefa/database`, legível por outro app.

**Non-Goals:**

- Migrar `core.workforce_*` (fica registrado como dívida).
- Executar orçamento das contratações não-alimentares (`finance` segue exclusivo de gênero).
- Substituir o `apps/forms` para questionário genérico.
- Anexo documental, workflow de aprovação, notificação ativa e exposição às tools de IA — todos fora, conforme "Não-objetivos" da proposta.

## Decisions

### 1. Motor tipado em dinheiro, com categoria como dado

`survey_campaign` (ano-base, ano-alvo, status, prazo) → `survey_category` (código, rótulo, ordem, tópico, ND sugerida, orientação) → `survey_response` (uma por OM) → `survey_response_item` (uma por categoria da campanha).

O item tem colunas nomeadas — `realized_amount`, `realized_summary`, `needed_amount`, `needed_summary`, `amount_note`, `previous_situation`, `deadline`, `deadline_note`, `notes` — e não pares chave/valor.

*Alternativas descartadas:* (a) **EAV genérico** ou reaproveitar o `apps/forms`: perderia soma, comparação entre anos e cruzamento com contratação — todo consumidor teria de reinterpretar texto; (b) **enum de categoria em migration**: cada nova edição do levantamento viraria DDL; (c) **uma tabela por campanha**: inviável de consolidar.

`deadline` é **date** e `deadline_note` é **texto**, deliberadamente separados: na planilha atual a mesma célula traz `2027-09-01`, `-` e `Já existe contrato de manutenção de equipamentos do rancho. PAG 67273.003551/2024-71`. Misturar os três num campo só é o que impede filtrar por vencimento.

### 2. Tópico durável no contrato, categoria efêmera na campanha

`subsistence_contract.topic` usa um vocabulário fechado e estável (`uniformes`, `climatizacao`, `obra_reforma`, `mobiliario`, `utensilios`, `capacitacao`, `equipamento`, `generos_alimenticios`, `outros`); `survey_category.topic` aponta para o mesmo vocabulário. As duas categorias de ar-condicionado da campanha atual (aquisição e manutenção) mapeiam ambas para `climatizacao` — a distinção aquisição/manutenção é da campanha, não do contrato, e o contrato já a expressa por `kind` e natureza de despesa.

*Alternativa descartada:* FK direta do contrato para `survey_category`. Amarraria dado durável a campanha efêmera e impediria que sucont ou outro app usassem o registro sem conhecer o DIVISA.

### 3. Sugestão derivada, aceite explícito, evidência gravada

`deriveItemSuggestion(unit, category, contracts, baselineYear)` é função **pura** em `packages/sisub-domain/src/utils/survey-crosswalk.ts`:

- `realized_amount` sugerido = soma de `valor_pago` (na falta, `valor_liquidado`) dos contratos da OM no tópico da categoria com competência no ano-base;
- `previous_situation` sugerida = ATA/contrato vigente com número e vigência, ou "Sem ATA vigente" quando nenhum cobre a data;
- `deadline` sugerido = menor `vigencia_fim` futura entre os contratos do tópico;
- `evidence` = ids dos contratos que entraram na conta.

A sugestão **nunca** é gravada por rotina. Ao aceitar, o valor vai para as colunas normais, `fill_source` vira `suggested_accepted` e `suggestion_snapshot` (jsonb) guarda o que foi sugerido e com base em quê. Divergência entre o informado e a sugestão é exibida como alerta, não corrigida.

*Alternativa descartada:* pré-preencher o item na criação da resposta. O usuário assinaria número que não digitou, e a origem se perderia na primeira edição.

### 4. Vínculo item ↔ contratação é N:N com parcela atribuída

`survey_response_item_contract(item_id, contract_id, amount_attributed, link_source)`. Um pregão de utensílios pode responder por duas categorias; uma categoria pode somar três contratações. `amount_attributed` nulo significa "o contrato inteiro"; preenchido, é a parcela — e a soma das parcelas **não** é validada contra o total do contrato, porque rateio de contrato entre finalidades é decisão da OM, não regra de banco.

### 5. Totais sempre derivados; nenhuma view `SECURITY DEFINER`

Consolidação por OM e por categoria mora em `utils/survey-consolidation.ts`, pura, e é servida por operation. Nada de coluna de total nem de view.

Duas razões: a auditoria de RLS (`20260825155457_security_definer_views_and_anon_rpc_lockdown.sql`) fechou justamente esse caminho; e a planilha de origem prova o custo de total gravado/derivado por atalho — no `Resumo Geral`, `G8` soma `BABV!D11` fora da ordem das demais parcelas e `F10`/`G9` são obtidas subtraindo as outras do total geral, de modo que um erro em qualquer parcela vaza silenciosamente para a categoria "Utensílios"/"Mesas e Cadeiras". O consolidado do sistema vai divergir da planilha; a divergência é a correção e precisa aparecer como nota no relatório.

### 6. Dedup do registro: origem externa manda

```
unique (external_source, external_id) where external_id is not null
unique (unit_id, kind, numero, uasg, ano) where external_id is null
```

Linha vinda de `procurement_arp` grava `external_source='procurement_arp'` + `external_id=<uuid da ARP>`; do Compras.gov, `external_source='compras_gov'` + id da API; cadastrada à mão, `external_source='manual'` e chave natural. Reimportar não duplica, e o operador continua podendo cadastrar contratação que nenhuma fonte conhece — que é o caso de quase tudo no DIVISA hoje.

Projeção do `finance`: não cria linha nova por empenho. A cadeia `empenho → liquidacao → pagamento` **soma** para o contrato de origem `procurement_arp` correspondente, mantendo `valor_empenhado/liquidado/pago` como espelho recalculável, nunca como digitação.

### 7. Compras.gov por UASG: worker no `apps/api`, reusando o log de sync

Worker novo `apps/api/src/workers/contratacoes-sync`, no padrão de `workers/compras-sync` (cliente com paginação, passos, heartbeat, `stop_requested`), gravando progresso em `compras_gov_integration.compras_sync_log`/`compras_sync_step` com `step_name` próprio por UASG. Entrada: lista de UASGs derivada de `core.units.uasg`; saída: upsert em `core.subsistence_contract` com `external_source='compras_gov'`.

**Pré-condição dura**: hoje `uasg` existe em 3 de 31 linhas (AFA `120060`, DIRAD `120133`, GAP-AF `120623`). O backfill usa `UG_INFO` de `apps/sucont/src/subitens/constants.ts`, que já mapeia UG→sigla para toda a FAB (`120643` = BASM, `120641` = BAPV, `120637` = BABV…). No mesmo passo: criar `BABV` (está na planilha, não está em `core.units`) e reconciliar `CINDACTA 2` com a aba `CINDACTA II`.

*Alternativa descartada:* inferir execução por natureza de despesa a partir do `sucont.siloms_siafi_balance`. O grão de lá é (competência, UG, grupo de conta) — não tem ND/subitem, então não distingue ar-condicionado de reforma. Entraria como terceira fonte só depois que aquela tabela ganhasse subitem.

### 8. Casamento aba → OM é determinístico e falha alto

`normalizeUnitCode` (pura): caixa alta, sem acento, espaço colapsado, algarismo romano → arábico (`CINDACTA II` → `CINDACTA 2`), mais uma tabela pequena de apelidos conhecidos. Aba que não casa **não** vira unidade nova nem é ignorada em silêncio: a importação devolve a lista de abas não reconhecidas e não grava nada até que sejam resolvidas.

### 9. PBAC sem módulo novo

| Ação | Módulo | Nível | Escopo |
|---|---|---|---|
| Ver levantamento da OM / registro de contratações | `unit` | 1 | `unit_id` |
| Responder, editar, submeter, cadastrar contratação | `unit` | 2 | `unit_id` |
| Criar/abrir/fechar campanha, definir categorias, importar planilha | `admin` | 2 | global |
| Consolidado global (somente leitura) | `analytics` | 2 | global |

Segue o corte já feito no split `global`→`admin` (PR #215): governança de plataforma no `admin`, relatório sistêmico no `analytics`, operação da OM no `unit` — ao lado de `credit`, `empenhos`, `liquidations`, `payments` e `reconciliation`, que já vivem em `/unit/$unitId/`.

### 10. Tipos e valores

Colunas monetárias são `numeric(14,2)`. O PostgREST devolve `numeric` como **string**; os schemas Zod usam coerção explícita na borda (o mesmo tropeço do `catalog_scope`/FTP, PR #206, onde campo salvo era reprovado como "Invalid input"). Percentual e total nunca são persistidos.

## Risks / Trade-offs

- **Migration mergeada sem ser aplicada** → o app quebra com `42P01`, como na #225. Mitigação: aplicar a migration antes ou junto do merge e conferir o run do CI/CD depois.
- **Gate de integração verde e vazio** (a suíte faz early-return quando a tabela não existe) → o teste novo precisa falhar sob `SISUB_INTEGRATION_REQUIRED`, não pular.
- **Reset de treino cai por FK** → `survey_response_item_contract` e `survey_response_item` entram em `RESET_STEPS` **antes** de `survey_response`; `subsistence_contract` depois dos vínculos.
- **Backfill de `uasg` errado** → sync do Compras.gov traz contratação de outra OM para dentro do levantamento. Mitigação: backfill por lista explícita conferida contra `UG_INFO`, sem heurística por nome; UASG não conferida fica nula e a OM apenas não sincroniza.
- **API de dados abertos sem SLA** → worker idempotente, falha registrada no `compras_sync_log`, e o preenchimento manual nunca depende dele.
- **Sugestão automática mascarando erro de fonte** → toda sugestão exibe a evidência; aceitar grava snapshot; divergência vira alerta e não correção.
- **Consolidado do sistema ≠ `Resumo Geral` da planilha** → é esperado (a planilha soma errado), mas precisa de nota explícita no relatório e no PR, senão parece bug.
- **`xlsx` por tarball da SheetJS** → dependabot não acompanha dependência por URL; o pin `0.20.3` do `sisub` tem de ser bumpado junto com os de `api` e `sucont`.
- **Escrita em `core.units` de produção** (28 `uasg`, unidade nova, code reconciliado) → tudo por `id` nas FKs, mas é dado vivo: fazer em migration versionada, não por MCP.

## Migration Plan

1. Migration única no `core`: 6 tabelas (`survey_campaign`, `survey_category`, `survey_response`, `survey_response_item`, `subsistence_contract`, `survey_response_item_contract`), RLS ligada sem policy, grants para `service_role`, índices por (campanha, unidade) e por (unidade, tópico, vigência).
2. Migration de saneamento de `core.units`: `uasg` das 28 OMs, `BABV` novo, code do CINDACTA reconciliado.
3. Regenerar `generated.ts` e o schema Drizzle; tipos em `packages/database/src/sisub.ts`.
4. Domínio: operations + utils puros + testes de unidade da sugestão e da consolidação; passos de reset de treino.
5. Server fns e telas do `unit`; depois `admin` (campanha, import/export) e `analytics` (consolidado).
6. Worker `contratacoes-sync` no `apps/api`, atrás da lista de UASG saneada.
7. Seed da campanha DIVISA 2026 (7 categorias) e importação do arquivo real preenchido como validação de ponta a ponta.

Rollback: as tabelas nascem isoladas — `drop` das 6 e reversão do saneamento de `units` não afetam cardápio, produção nem `finance`. O worker é desligável por não ser agendado.

## Open Questions

- **Qual endpoint do Compras.gov cobre contratação por UASG** com valor executado — o módulo de contratos, o de atas ou o OCDS. `packages/compras-api/openapi.json` só descreve Alice/OCDS; o cliente atual usa `dadosabertos.compras.gov.br` para catálogo. A escolha é da tarefa do worker e não bloqueia o resto.
- **Natureza de despesa por categoria**: o levantamento vai fixar ND/subitem sugerido por categoria (ex.: `33.90.30` vs `44.90.52`)? Se sim, vira coluna preenchida no seed; se não, fica nula e o cruzamento usa só o tópico.
- **Resposta trava após submissão?** O desenho prevê `draft → submitted → validated`, com reabertura por `admin`. Confirmar se a SDAB quer edição livre até o fechamento da campanha.
- **`core.workforce_*`**: migrar para o motor novo, manter como está ou arquivar? Fora do corte, mas precisa de destino antes que vire a terceira cópia do mesmo conceito.
