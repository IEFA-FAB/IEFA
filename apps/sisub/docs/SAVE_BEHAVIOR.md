# Comportamento de salvamento — sisub

Regra única para decidir **como** uma tela grava o que o usuário edita. Antes deste
documento, o app tinha 7 mecanismos diferentes (dialog, botão na página, barra fixa, inline
por campo, autosave com debounce, "salvar tudo", sheet) escolhidos tela a tela. Resultado:
a mesma ação ("mudei um campo") às vezes grava sozinha, às vezes some se você sair da tela,
às vezes grava uma versão nova sem você perceber.

## A decisão

Pergunte, nesta ordem:

1. **Gravar cria uma versão (histórico, restauração, diff)?** → **Salvamento explícito com
   rascunho** (modo A). Autosave aqui geraria uma versão por tecla.
2. **Gravar é um evento irreversível ou de fluxo** (lançamento de estoque, evento financeiro,
   publicação, mudança de status, concessão de acesso)? → **Ação explícita** (modo C), com
   confirmação quando não houver desfazer.
3. **O registro ainda não existe** (criar)? → **Criação explícita** (modo D).
4. **Nenhum dos anteriores** — edição de um registro existente, sem versão → **Autosave**
   (modo B).

Hoje só duas entidades do sisub são versionadas: **insumo** (`kitchen.ingredient_version`,
snapshot jsonb) e **preparação** (linha nova por versão, `base_recipe_id`).

## Os quatro modos

### A — Salvamento explícito com rascunho (entidades versionadas)

Cada Salvar é um evento: vira uma versão, com autor e data. Entre um Salvar e outro, a
edição é um **rascunho local**.

- `useDraft` (`src/hooks/forms/useDraft.ts`) guarda o estado em edição enquanto ele difere
  do salvo. Sair da tela, trocar de aba ou fechar o card **não perde nada**: voltar
  restaura o rascunho.
- `PendingChanges` fica **ao lado do botão Salvar**: "3 alterações não salvas"; ao abrir,
  lista campo, valor salvo e valor novo, e oferece **Descartar alterações**.
- O botão Salvar fica desabilitado sem alteração (editar sem mudar nada não grava versão).
  Exceções: criar, e personalizar uma preparação global numa cozinha — nesses casos
  Salvar grava mesmo sem alteração.
- `OpenDraftsMenu`, no cabeçalho do app, lista os rascunhos abertos em qualquer tela, com
  link de volta. Sem ele, um rascunho esquecido ficaria esquecido por dias.
- Sem aviso de `beforeunload`: o rascunho sobrevive a recarregar e a fechar o navegador,
  então o aviso só incomodaria.
- **Rascunho desatualizado**: se o registro salvo mudou depois que a edição começou (outra
  pessoa gravou), a lista avisa que Salvar vai gravar por cima. A assinatura é o próprio
  baseline do formulário. Por isso salvar um item filho, que gera versão do insumo mas não
  muda os campos do form, não conta como mudança. O diff é sempre contra o salvo **atual**:
  a lista mostra exatamente o que o Salvar muda.
- **Rascunho é do usuário**: trocar de sessão na aba (o logout não recarrega a página)
  descarta todos. Num terminal compartilhado, o próximo usuário não vê, nem salva em nome
  próprio, o rascunho de quem saiu.
- **Um rascunho por registro**: a tela que usa `useDraft` remonta ao trocar de registro
  (`key` na rota). Reaproveitado pelo router, o form levava os valores editados de um
  insumo para o próximo. Na preparação, a chave é a **versão** aberta: um rascunho da v3
  nunca é aplicado sobre a v4.
- **Depois de salvar, o baseline vem primeiro**: espere o refetch e só então limpe o
  rascunho e redefina o form. Na ordem inversa, o form mostra o valor novo contra o
  baseline antigo e o rascunho renasce.
- A barra (`DraftSaveBar`) é o componente que assina os valores do form. Assinar no topo do
  formulário re-renderizava todas as abas a cada tecla.

Onde a barra fixa convive com sub-editores que salvam por conta própria (itens de compra e
de produto no insumo; fluxo e equipamentos na preparação), **a barra da entidade só aparece
nas abas dela**, ou quando há alteração dela pendente. Assim nunca há dois Salvar
concorrentes na mesma tela.

**Um formulário não pode conter outro editor.** A aba de um sub-editor fica fora do
`<form>` da entidade: com os inputs dentro, Enter num campo do sub-editor submetia o form
de fora e gravava uma versão da entidade. Painéis do Tabs podem ficar em qualquer lugar
dentro do `Tabs`, então basta fechar o `<form>` antes deles.

### B — Autosave (registros sem versão)

A tela grava sozinha e **não tem botão Salvar**.

- Campo discreto (select, checkbox, toggle): grava na mudança.
- Texto: grava no blur ou com debounce de 1,5 s.
- `AutoSaveStatus` mostra `Salvando… / Salvo às 14:32 / Não salvou — Tentar de novo`, no
  lugar do botão. **Sem toast de sucesso a cada gravação**: numa tela que salva sozinha o
  toast vira ruído. O erro continua avisando.
- Só grava estado válido. Enquanto o campo estiver inválido, mostre o erro no campo e não
  grave.
- Gravações da mesma tela entram numa fila, na ordem em que foram feitas (`scope` da
  mutation, como em `useSaveTemplateEdit`).

### C — Ação explícita (eventos irreversíveis e de fluxo)

Lançamento de estoque, eventos financeiros, publicação de ATA, mudança de status, acesso.
O botão nomeia a ação ("Lançar entrada", "Publicar", "Conceder"), nunca "Salvar". Sem
desfazer, pede confirmação.

### D — Criação explícita

O registro ainda não existe e tem campos obrigatórios: botão **Criar**. Dialog curto (até
uns 6 campos) é aceitável. Formulário longo abre a página do registro. Não use dialog para
**editar** formulário longo: a edição acontece no lugar (página ou card que abre na lista).

## Onde o rascunho mora — e por quê

**No armazenamento local do navegador**, família `sisub:draft:*`
(`src/lib/drafts/draft-store.ts`), declarada na Política de Cookies 1.5.0. Sobrevive à
navegação, ao F5, à recarga automática depois de uma publicação e a fechar o navegador. O
mapa em memória é o que as telas leem; o armazenamento é espelho gravado a cada mudança.

**Por que local, e não de sessão** (pedido do mantenedor: local, a menos que o dado seja
sensível). O rascunho guarda dado de **catálogo** que o próprio usuário já vê: nome, pasta,
unidade, nutrientes, especificação de compra com preço de referência, ficha técnica. Não é
dado pessoal nem classificado. O mais sensível é o preço de referência, e ele já é visível a
quem tem acesso ao catálogo; o rascunho só existe no aparelho dessa pessoa. Travas para o
computador compartilhado:

- **Dono:** outra conta entrando no navegador descarta todos os rascunhos. Guarda só uma
  assinatura curta da conta (FNV-1a de 32 bits), sem volta ao identificador. A amarração
  acontece no render do cabeçalho, antes de qualquer tela restaurar rascunho.
- **Validade:** rascunho parado há mais de 7 dias é descartado ao carregar.
- **Só no dispositivo:** nada vai ao servidor antes do Salvar.

Chave nova de armazenamento entra no inventário da política **antes** de ir ao ar
(`packages/legal-kit/src/cookie-inventory.test.ts` cobra). A família `sisub:draft:*` já
cobre qualquer tela nova que use `useDraft`.

## Componentes

| Peça | Arquivo | Uso |
|------|---------|-----|
| `useDraft` | `src/hooks/forms/useDraft.ts` | Rascunho + alterações pendentes + aviso de saída (modo A) |
| `computeDraftChanges` | `src/lib/drafts/draft-diff.ts` | Diff puro com rótulos. Campo sem especificação ainda conta (rótulo = nome do campo) |
| `PendingChanges` | `src/components/features/shared/PendingChanges.tsx` | Ao lado do Salvar (modo A) |
| `DraftSaveBar` | `src/components/features/shared/DraftSaveBar.tsx` | Barra fixa do modo A: rascunho, pendências, Voltar, Salvar |
| `useItemCards` / `itemDraftKey` | `src/hooks/forms/useItemCards.ts` | Lista de itens editados no próprio card, com o selo de rascunho |
| `OpenDraftsMenu` | `src/components/layout/OpenDraftsMenu.tsx` | Cabeçalho do app; lista os rascunhos abertos |
| `AutoSaveStatus` / `autoSaveStateOf` | `src/components/features/shared/AutoSaveStatus.tsx` | No lugar do Salvar (modo B) |
| `CollapsibleItemCard` | `src/components/features/shared/CollapsibleItemCard.tsx` | Item de lista que edita no próprio card |
| `UnsavedChangesGuard` | `src/components/features/local/planning/UnsavedChangesGuard.tsx` | Bloqueio de saída dos editores de cardápio (legado; ver pendências) |

## Classificação das telas

"Feito" = já segue o padrão. "Pendente" = decisão tomada, migração ainda por fazer.

### Modo A — explícito com rascunho

| Tela | Estado |
|------|--------|
| Insumo: Detalhes + Nutrição (`IngredientDetailForm`) | Feito |
| Insumo: itens de compra (`PurchaseItemEditor`, card na lista) | Feito — era dialog |
| Insumo: itens de produto (`IngredientItemEditor`, card na lista) | Feito — era dialog |
| Insumo: editar pelo dialog da árvore (`IngredientForm`) | Feito: agora grava versão (antes não gravava). Rascunho não se aplica a dialog curto |
| Preparação (`RecipeForm`, 5 rotas) | Feito |
| Insumo: ações em lote e localizar/substituir | Feito: cada insumo alterado ganha versão, no servidor (ver "O que entra na versão") |

### Modo B — autosave

| Tela | Estado |
|------|--------|
| Insumo: ciclo de entrega, alergênicos | Feito (fora do snapshot da versão; o rótulo diz isso) |
| Cardápio semanal da cozinha, eventos/exceções | Feito (autosave 1,5 s + `AutoSaveStatus`). O Salvar explícito continua só para o fork de template global |
| Previsão do comensal, descrição de item de ATA, itens do cardápio do dia, custo da abertura de estoque | Já gravam sozinhos. **Pendente**: trocar o indicador próprio (ou nenhum) por `AutoSaveStatus` |
| Plano semanal global | **Pendente**: hoje só explícito |
| Configurações da cozinha, da unidade e do estoque; política de validade; avaliação; perfil | **Pendente**: hoje botão na página |
| Fluxo de produção e equipamentos da preparação | **Pendente**: hoje "Salvar fluxo" / botão da aba. Gravam na versão atual, sem versão própria |
| Gerenciador de locais (`DirtyChangesBar`, "Salvar tudo") | **Pendente**: sair do modo edição descarta tudo sem aviso |

### Modo C — ação explícita

Estoque (entrada, contagem, saída, ajuste, abertura), financeiro (empenho, liquidação,
pagamento, conciliação, SIAFI), publicação e status de ATA, pedidos de lanche, status de
equipamento e de tarefa, permissões, políticas, MFA. **Já seguem o padrão**; o que falta é
só a revisão de rótulo ("Salvar" → nome da ação) onde o botão ainda diz "Salvar".

### Modo D — criação explícita

Os dialogs de "Novo …" (pasta, insumo, preparação, local, equipamento, tipo de refeição, …)
e os formulários de novo cardápio (que já guardam rascunho próprio em `sessionStorage`,
declarado na política). **Já seguem o padrão.**

## O que entra na versão — e quem a grava

**A versão é gravada pelo servidor, na mesma transação da escrita.** Toda server function
que altera o agregado do insumo roda dentro de `withIngredientVersions`
(`src/server/ingredient-versioning.server.ts`) e declara quais insumos tocou. Não existe
mais versão pedida pelo cliente depois: fora da transação, ela podia não acontecer, e as
ações em lote e o localizar/substituir nunca pediam.
`ingredient-versioning.contract.test.ts` reprova POST novo em `ingredients.fn.ts` ou
`purchase_item.fn.ts` que não versione nem esteja isento com motivo.

- **Item de compra é catálogo compartilhado (N:N).** Editar ou apagar um item de compra
  grava versão de **todo** insumo vinculado, não só do que está aberto na tela.
- **Item de produto que muda de insumo** grava versão nos dois insumos.
- **Gravações simultâneas** não colidem no número da versão: há um lock consultivo por
  insumo, e a segunda gravação deduplica.

**Fica fora da versão, por decisão (2026-09-26):**

| O quê | Por quê |
|-------|---------|
| Renomear ou mover pasta | Não é mudança do insumo. A versão guarda o nome da pasta da época, e o próximo save do insumo leva o nome novo |
| Apagar e restaurar insumo | Ciclo de vida, não conteúdo. Restaurar devolve o insumo idêntico ao histórico |
| Alergênicos | Quase imutáveis. Gravam sozinhos, e a tela diz que ficam fora do histórico |
| Ciclo de entrega | É **sugestão** de compra. O que vale é o ciclo que cada item de ATA grava para si |
| Conservação, temperatura, validade mínima e atributos GS1 do item de compra | São a **sugestão** da especificação. O que aconteceu de fato fica registrado no lote, no recebimento (classe recebida e divergência) |

### Preparações

Versão da preparação é linha nova (`saveRecipeEdit`). Alguns caminhos alteram a versão
aberta sem criar outra:

- **Renomear pelo localizar/substituir e mover de pasta:** metadados de listagem, não
  conteúdo da ficha. Continuam sem versão.
- **Fluxo de produção e equipamentos:** gravam na versão atual e são copiados para a
  próxima. É dívida: uma ficha antiga pode ter o fluxo alterado depois. Vão virar autosave
  com versão própria quando entrarem no modo B.

## Pendências conhecidas

- **Script de correlação CATMAT** (`apps/api/scripts/catmat-match-orchestrator.ts`): altera
  o código CATMAT de itens de compra direto no banco, sem versão. O próximo save de cada
  insumo leva o valor, mas o autor fica errado. Roda à mão e raramente; quando voltar a
  rodar, deve passar pelo mesmo registro.
- **Dois guards**: `UnsavedChangesGuard` (bloqueia a navegação) e `useDraft` (guarda e
  deixa sair). Quando os editores de cardápio passarem a usar rascunho, o guard deixa de
  ser necessário, porque sair não perde mais nada.
