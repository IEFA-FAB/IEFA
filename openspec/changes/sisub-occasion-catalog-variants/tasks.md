## 0. Antes de começar

- [x] 0.1 Q1–Q3 respondidas pela SDAB em 2026-10-05 (design D8, D9, D6); Q4 e Q5 seguem abertas e não bloqueiam
- [x] 0.2 Repetir a leitura de "Estado dos dados" do design.md no banco; se mudou, atualizar a tabela de D6

## 1. Banco: estrutura (espera o mantenedor)

- [x] 1.1 [database] Migration `kitchen_menu_template_folder`: tabela, índice único de irmãs, `menu_template.folder_id`, `menu_template_event_meal.source_template_id` (FK `on delete set null`), índice único de nome de modelo por pasta, índices das FKs, grants como as demais de `kitchen`, comentários
- [x] 1.2 [database] Conferir colisão de timestamp, `audit:rls` verde, `db:push --dry-run` só com a migration; depois de aplicada, `db:types` + `db:drizzle:pull`
- [x] 1.3 [sisub] Teste de integração: nome repetido entre pastas irmãs e entre modelos da mesma pasta recusado pelo índice; FK de origem vira nulo ao apagar o modelo

## 2. Domínio: pastas

- [x] 2.1 [sisub-domain] Schemas e operações `listTemplateFolders`, `createTemplateFolder`, `updateTemplateFolder` (nome, descrição, ordem), `deleteTemplateFolder` (só vazia), `moveTemplateToFolder`; `global:2` para escrever, `global:1` para ler
- [x] 2.2 [sisub-domain] Regras: dois níveis, mesmo `template_type`, modelo local sem pasta, nome livre na pasta ao criar, renomear, mover e restaurar (`TEMPLATE_NAME_TAKEN_IN_FOLDER`); `listTemplates` devolve `folder_id` e, na cozinha, a pasta do modelo de origem
- [x] 2.3 [sisub-domain] Testes de operação de cada recusa e da ordem entre irmãs
- [x] 2.4 [sisub] Server fns em `src/server/template-folders.fn.ts` com `requireAuthThenRun`

## 3. Domínio: variante e composição

- [x] 3.1 [sisub-domain] `GLOBAL_EVENT_SINGLE_MEAL` em criar, editar e copiar para o global; mensagem com a orientação
- [x] 3.2 [sisub-domain] `TemplateEventMealSchema.sourceTemplateId` opcional; `writeEventMeals` grava; origem invisível para a cozinha grava nulo
- [x] 3.3 [sisub-domain] `forkTemplate` grava `source_template_id` nas refeições copiadas
- [x] 3.4 [sisub-domain] `composeOccasionMenu` (`kitchen:2`): várias fontes, ids novos, horário por refeição (sugerido se ausente), sem absolutos de global, `base_template_id` nulo com mais de uma fonte
- [x] 3.5 [sisub-domain] `duplicateTemplateAsVariant` (`global:2`): cópia na mesma pasta, primeiro nome livre ("(cópia)", "(cópia 2)")
- [x] 3.7 [sisub-domain] `ApplyEventTemplateSchema.slots` e `applyEventTemplate`: horário da aplicação vence o da refeição sem gravar; teste do coquetel aplicado no almoço e no jantar
- [x] 3.6 [sisub-domain] Testes: café A + almoço B; modelo editado depois não muda o evento; origem na lixeira; segunda refeição em global recusada; kit de duas partes aceito

## 4. Chave do grupo pelo rótulo

- [x] 4.1 [sisub] `resolveGroupKeys`/`upsertEventMeal`: rótulo de outra identidade recalcula a chave e move as preparações; caixa/acento não
- [x] 4.2 [sisub] Testes unitários em `event-meals.test.ts` (renomear com itens, colisão de chave, só caixa)

## 5. Banco: reorganização dos dados (espera o mantenedor; janela combinada com a SDAB)

- [x] 5.1 [database] Migration de dados `kitchen_occasion_catalog_reorganize`: pastas das duas imagens, separação do `9be7dd33` (brunch embutido vira "Brunch Padrão B (cadastro anterior)" na lixeira), modelos nas pastas, `aa466501` na lixeira, chaves de grupo pelo rótulo; guardada por id, numa transação
- [x] 5.2 [database] Conferência depois de aplicar: mesma contagem total de itens e de refeições (39 + 24 + 15 do evento, ativos + lixeira), cada modelo global de evento com ≤ 1 refeição, nenhum nome repetido na mesma pasta, nenhum item com `item_group` fora da composição da refeição
- [x] 5.3 [sisub] Teste de integração da regra de chave (mesma função usada na migration e no editor, se possível compartilhada em `sisub-domain/schemas`)

## 6. Telas

- [x] 6.1 [sisub] `GlobalTemplateCatalog` em árvore (pasta, subpasta, modelos; chevron; ordem gravada); ações de pasta e de modelo com `global:2`; "Sem pasta" no fim; lixeira mantida
- [x] 6.2 [sisub] Diálogos de pasta (criar, renomear, descrição) e "Mover para…" (combobox de caminho)
- [x] 6.3 [sisub] Editor de evento global: uma refeição, "Horário sugerido"; "Duplicar como variante" no lugar de "Adicionar refeição"
- [x] 6.10 [sisub] Diálogos de aplicar e de montar evento: horário por refeição ao lado do efetivo, preenchido com o sugerido
- [x] 6.11 [sisub] Painel de classificação de lanche: em modelo da pasta "Lanche de Apoio › Classe C", aviso de que a classe C de apoio é classificada como Lanche de Bordo C
- [x] 6.4 [sisub] Cozinha → Eventos: árvore "Modelos da SDAB" com seleção múltipla e "Montar evento"; origem na refeição do evento
- [x] 6.5 [sisub] Editor do evento local: "Adicionar refeição de um modelo"
- [x] 6.6 [sisub] Cozinha → Cardápios de Apoio: apoios da cozinha agrupados pela pasta do modelo de origem
- [x] 6.7 [sisub] `DayOccasionDialog`: combobox com caminho da pasta no rótulo e na busca
- [x] 6.8 [sisub] Diálogo "Adaptar" de evento global sem escolha de refeições
- [ ] 6.9 [sisub] `react-doctor` e conferência visual na cozinha de treino

## 7. Tools de IA e MCP

- [x] 7.1 [sisub-domain] Tools de listagem devolvem o caminho da pasta; descrição de criar/editar evento global diz "uma refeição por modelo"
- [x] 7.2 [sisub-mcp] Descrições das tools de template atualizadas

## 8. Catálogo de edge cases e fechamento

- [x] 8.1 Reescrever CG-PAD-01 ("a cozinha monta café A + almoço B"); novos CG-ORG-01 (pasta e ordem), CG-ORG-02 (duas variantes na mesma pasta), CG-EVT-04 (save de modelo sem conferência de versão, LACUNA); atualizar GC-AGD-08
- [x] 8.2 `bun run check`, `bun run lint --concurrency=2`, `bun run test --concurrency=2`
