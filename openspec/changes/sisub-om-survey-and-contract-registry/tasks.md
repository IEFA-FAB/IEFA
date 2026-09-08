# Tasks: sisub-om-survey-and-contract-registry

## 1. Banco — schema `core`

- [ ] 1.1 [database] Migration `core.survey_campaign` + `core.survey_category`: campanha (code único, título, finalidade, `baseline_year`, `target_year`, status `draft|open|closed`, prazo, autor) e categoria (código, rótulo, `sort_order`, `topic`, ND sugerida, orientação, `deleted_at`), unique (campaign_id, code); RLS ligada sem policy e grants a `service_role`, como as tabelas irmãs do `core`
- [ ] 1.2 [database] Migration `core.survey_response` + `core.survey_response_item`: resposta única por (campaign_id, unit_id) com status/responsável/submissão; item único por (response_id, category_id) com `realized_amount`/`needed_amount` `numeric(14,2)` anuláveis, resumos, `amount_note`, `previous_situation`, `deadline` (date) + `deadline_note`, `notes`, `fill_source`, `suggestion_snapshot` jsonb; índices por campanha e por unidade
- [ ] 1.3 [database] Migration `core.subsistence_contract`: espécie, NUP, número, ano, UASG, objeto, fornecedor, ND, `topic` (check do vocabulário durável), vigência, valores, `external_source`/`external_id`/`last_synced_at`; unique parcial (external_source, external_id) e unique parcial (unit_id, kind, numero, uasg, ano); índice (unit_id, topic, vigencia_fim)
- [ ] 1.4 [database] Migration `core.survey_response_item_contract`: (item_id, contract_id) único, `amount_attributed` anulável, `link_source` `auto|manual`, FKs com `on delete cascade` no item e `restrict` no contrato
- [ ] 1.5 [database] Migration de saneamento de `core.units`: `uasg` das OMs do levantamento a partir de lista explícita conferida contra `UG_INFO` (`apps/sucont/src/subitens/constants.ts`), inserção da OM `BABV` e reconciliação do code `CINDACTA 2`/`CINDACTA II` — sem heurística por nome, UASG não conferida fica nula
- [ ] 1.6 [database] Aplicar as migrations no projeto remoto e regenerar `generated.ts` + schema Drizzle pelos scripts do package; exportar os tipos novos em `packages/database/src/sisub.ts`

## 2. Domínio puro (`@iefa/sisub-domain`)

- [ ] 2.1 [sisub-domain] `utils/unit-code.ts`: `normalizeUnitCode` (caixa alta, sem acento, espaço colapsado, romano→arábico, apelidos conhecidos) + teste cobrindo `CINDACTA II`→`CINDACTA 2` e sigla desconhecida
- [ ] 2.2 [sisub-domain] `utils/survey-crosswalk.ts`: `deriveItemSuggestion` pura (realizado somando pago com fallback em liquidado no ano-base, situação anterior com ATA vigente ou "Sem ATA vigente", prazo da menor vigência futura, evidência com ids) + testes de unidade dos três ramos e do caso sem contratação
- [ ] 2.3 [sisub-domain] `utils/survey-consolidation.ts`: totais por OM e por categoria, cobertura de resposta e divergência informado × apurado, distinguindo não respondido de zero + testes
- [ ] 2.4 [sisub-domain] `operations/survey.ts`: campanha (criar/abrir/fechar/reabrir), categoria (criar/desativar, recusando exclusão de categoria respondida), resposta (obter-ou-criar idempotente, salvar item, submeter, validar) com autorização por `_ctx` — dono lido da linha, nunca do input
- [ ] 2.5 [sisub-domain] `operations/subsistence-contract.ts`: CRUD escopado por `unit_id`, upsert por identidade externa, vínculo item↔contratação e regra de somente leitura dos valores espelhados
- [ ] 2.6 [sisub-domain] Testes de authz das operations novas (`*.authz.test.ts`), provando não-vacuidade: remover o guard faz o teste falhar
- [ ] 2.7 [sisub-domain] `operations/training.ts`: passos de reset das tabelas novas na ordem de FK — vínculos e itens antes de `survey_response`; `subsistence_contract` depois dos vínculos

## 3. Ingestão das fontes existentes

- [ ] 3.1 [sisub-domain] Projeção idempotente de `procurement.procurement_arp` → `core.subsistence_contract` (`external_source='procurement_arp'`, tópico `generos_alimenticios`), sem linha por empenho
- [ ] 3.2 [sisub-domain] Derivação dos valores empenhado/liquidado/pago pela cadeia `finance.empenho → liquidacao → pagamento` para as contratações projetadas, recalculável a cada execução
- [ ] 3.3 [sisub] Server fn de disparo da projeção com `admin` nível 2 e relatório do que foi criado/atualizado
- [ ] 3.4 [api] Cliente do Compras.gov para contratações por UASG: resolver na tarefa qual módulo cobre contrato com valor executado (contratos, atas ou OCDS), com paginação e timeout
- [ ] 3.5 [api] Worker `workers/contratacoes-sync`: itera as UASGs de `core.units`, faz upsert por identificador externo, grava passo/heartbeat/parada em `compras_gov_integration.compras_sync_log`/`compras_sync_step`, registra OM sem UASG como passo ignorado com motivo
- [ ] 3.6 [api] Rota de disparo e de consulta de progresso do worker, no padrão das rotas de sync já existentes

## 4. Server functions do `sisub`

- [ ] 4.1 [sisub] `server/survey.fn.ts`: listar campanhas, obter resposta da OM com itens e sugestões, salvar item, aceitar sugestão, submeter, validar — `createServerFn({method}).validator(z.object(...))`, cliente Supabase per-request no handler
- [ ] 4.2 [sisub] `server/subsistence-contract.fn.ts`: listar/criar/editar/excluir contratação da OM e gerenciar vínculos
- [ ] 4.3 [sisub] Schemas Zod das bordas coagindo `numeric` que volta como string do PostgREST; teste cobrindo o ciclo salvar→ler→reabrir sem "Invalid input"
- [ ] 4.4 [sisub] Guards de autorização nas fns (`unit` 1/2 escopado, `admin` 2, `analytics` 2) com teste de contrato exaustivo por fn

## 5. Telas — OM

- [ ] 5.1 [sisub] Rota `/unit/$unitId/levantamentos`: lista de campanhas abertas e respondidas, status da resposta e prazo
- [ ] 5.2 [sisub] Rota `/unit/$unitId/levantamentos/$campaignId`: formulário por categoria com realizado, necessidade, resumos, prazo (data + nota) e observações; distinção visível entre vazio e zero
- [ ] 5.3 [sisub] Painel de sugestão por item: valor proposto, evidência (contratações que sustentam), aceite explícito e alerta de divergência quando o informado difere
- [ ] 5.4 [sisub] Submissão da resposta com identificação do responsável (nome, função/posto, contato) e bloqueio de edição conforme o status da campanha
- [ ] 5.5 [sisub] Rota `/unit/$unitId/contratacoes`: registro de contratações da OM ao lado de empenhos/liquidações, com origem visível e valores espelhados em somente leitura

## 6. Telas — SDAB (admin e analytics)

- [ ] 6.1 [sisub] Rota `/admin/levantamentos`: criar campanha, definir categorias (código, rótulo, ordem, tópico, ND, orientação), abrir/fechar, acompanhar cobertura
- [ ] 6.2 [sisub] Importação do caderno XLSX na tela de admin: pré-visualização, relatório de abas/categorias não resolvidas e gravação atômica só após resolução
- [ ] 6.3 [sisub] Exportação: caderno por OM pré-preenchido (com coluna de sugestão identificada) e caderno restrito à própria OM para `unit` nível 1
- [ ] 6.4 [sisub] Rota `/analytics/levantamentos`: consolidado por OM e por categoria, cobertura nominal dos pendentes e divergência informado × apurado, somente leitura
- [ ] 6.5 [sisub] Itens de navegação em `NavItems.tsx` para as rotas novas, respeitando os níveis de PBAC
- [ ] 6.6 [sisub] Revisão de estilo das telas novas: flat design do sisub, sem faixa de acento lateral acima de 1px

## 7. Planilha (XLSX)

- [ ] 7.1 [sisub] Adicionar `xlsx` ao `apps/sisub` no mesmo pin de tarball da SheetJS usado por `api` e `sucont` (bump é manual — dependabot não acompanha dependência por URL)
- [ ] 7.2 [sisub] `lib/survey-workbook.ts` puro: parse de aba→OM, linha→categoria, normalização de moeda (texto, separador de milhar, célula vazia ≠ zero) e separação prazo-data × prazo-texto + testes com as células reais da planilha DIVISA
- [ ] 7.3 [sisub] Geração do caderho de exportação: instruções, aba por OM e resumo recalculado (sem fórmula derivada por subtração), com nota sobre a origem do consolidado
- [ ] 7.4 [sisub] Teste de ida e volta: exportar → reimportar não altera nenhum valor

## 8. Seed e validação de ponta a ponta

- [ ] 8.1 [database] Seed da campanha "DIVISA 2026" com as sete categorias na ordem da planilha e seus tópicos
- [ ] 8.2 [sisub] Importar o arquivo real preenchido (`Planilha_Levantamento_DIVISA_por_OM_27-08.xlsx`) num ambiente não produtivo e conferir cobertura, totais e as abas que não casam
- [ ] 8.3 [sisub] Teste de integração contra o banco real, com rollback, cobrindo resposta idempotente, unicidade do registro e reprojeção sem duplicata — falhando sob `SISUB_INTEGRATION_REQUIRED` se as tabelas não existirem
- [ ] 8.4 [sisub] Conferir que o consolidado do sistema diverge do `Resumo Geral` da planilha apenas onde a planilha soma errado, e registrar a comparação no PR

## 9. Fechamento

- [ ] 9.1 [root] `bun run check` (biome + typecheck) e `bun run test` verdes
- [ ] 9.2 [root] Abrir PR com nota sobre a migration aplicada, a escrita em `core.units` de produção e a divergência esperada contra a planilha; rodar `/code-review` e relatar os achados no PR
