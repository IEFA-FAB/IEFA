# Catálogo Global — modelos da SDAB

Menu: **Catálogo Global → Modelos de cardápio** (Eventos Modelo, Cardápios de Apoio Modelo, Cardápios Semanais).
Ler exige `global:1`; editar exige `global:2`. Na cozinha, o modelo se ADAPTA (cópia local).

### CG-EVT-01 — "A cozinha adapta um evento modelo"
- **O sistema precisa:** a cópia chega com a refeição do modelo, os grupos (com a quantidade de
  preparações esperada) e a % de cada preparação, **sem** efetivo, pax nem ocorrências: o número é da
  cozinha. A refeição guarda de qual modelo veio. Modelo global de evento tem uma refeição só (é uma
  variante); escolher refeições ao copiar vale para evento da cozinha e kit de duas partes.
- **UX:** Eventos → "Modelos da SDAB" (árvore de pastas) → marca o modelo → "Montar evento".
- **Cobertura:** `e2e/tests/global-catalog-events.spec.ts` · `templates.operations.test.ts › forkTemplate
  de evento escolhendo as refeições…` · `› forkTemplate de apoio global leva o kit e as porções por kit…`

### CG-EVT-02 — "A SDAB edita o modelo global"
- **O sistema precisa:** edição in-place no escopo global; refeições com ids próprios; a cópia de
  cada cozinha não muda.
- **Cobertura:** `templates.operations.test.ts › evento global editado na cozinha…` (domínio).
  E2E da tela global: **LACUNA** — a conta dedicada do e2e não tem `global:2`.

### CG-EVT-03 — "O modelo global mudou depois que a cozinha adaptou"
- **Hoje:** a cópia não sabe que o modelo mudou.
- **Caminho proposto:** selo "modelo atualizado" na cópia, como o de versão de preparação.
- **Cobertura:** **LACUNA**

### CG-QTD-01 — "A SDAB pôs efetivo num modelo global"
- **Realidade:** o modelo global levava "300 pax" e a cozinha de 80 comensais comprava para 300.
- **O sistema precisa:** modelo global guarda só quantidade relativa (%, porções por kit, preparações por
  grupo). Pax, efetivo e ocorrências são recusados no servidor e no banco; a tela global nem mostra.
- **Cobertura:** `templates.summary.test.ts › modelo global só com quantidade relativa` ·
  `templates.operations.test.ts › modelo global recusa pax e ocorrências`

### CG-PAD-01 — "O evento real junta café do Padrão A com almoço do Padrão B"
- **Realidade:** café, brunch, almoço, coquetel e jantar de um padrão são VARIANTES, não um conjunto: o
  café Padrão B não é servido com o almoço Padrão B. As nutricionistas tinham cadastrado as cinco num
  modelo só, e aplicar "o café" punha as cinco no dia (corrigido em 2026-10-05, migration 20261005130000).
- **O sistema precisa:** um modelo global de evento por variante (uma refeição; a segunda é recusada);
  a cozinha monta o evento escolhendo modelos de pastas diferentes, cada um vira uma refeição copiada,
  com procedência e o horário escolhido; editar o modelo depois não muda o evento. O grupo "Salgados 4
  a 6" avisa quando a cozinha põe 3, sem impedir salvar.
- **UX:** Eventos → "Modelos da SDAB" → marca os modelos → "Montar evento" → horário de cada refeição;
  no editor do evento, "Refeição de um modelo" acrescenta outra.
- **Cobertura:** `templates.operations.test.ts › montar evento: café de um padrão + almoço de outro…` ·
  `› evento global é uma variante…`. Aviso de contagem na tela: **LACUNA** de e2e.

### CG-ORG-01 — "A SDAB organiza o catálogo do jeito dela"
- **Realidade:** Eventos em padrão → formato (Café da Manhã, Brunch, Almoço, Coquetel, Jantar, nessa
  ordem); Apoio em família → classe. A ordem não é alfabética e muda sem deploy.
- **O sistema precisa:** pastas de dois níveis com nome, descrição e ordem da SDAB; pasta só remove
  vazia; modelo sem pasta aparece em "Sem pasta", nunca some. A pasta não vira regra (Lanche de Apoio C é
  classificado como Bordo C, D9).
- **Cobertura:** `templates.operations.test.ts › pastas do catálogo…` · `template-catalog-tree.test.ts`.

### CG-ORG-02 — "Duas opções de brunch na mesma pasta"
- **Realidade:** a SDAB cadastrou o brunch Padrão B duas vezes, por engano; pode haver duas opções de
  verdade, mas com nomes diferentes.
- **O sistema precisa:** nome único entre os modelos ativos da pasta (índice no banco + mensagem);
  "Duplicar como variante" escolhe o primeiro nome livre; restaurar com o nome tomado volta como
  "(restaurado)".
- **Cobertura:** `templates.operations.test.ts › pastas do catálogo…`.

### CG-EVT-04 — "Editor do modelo aberto enquanto ele muda por fora"
- **Realidade:** `saveTemplateEdit` não confere a versão que a tela viu (`menu_template` não tem
  `updated_at`); o autosave de uma tela velha regrava o conteúdo inteiro.
- **O sistema precisa:** recusar gravar sobre versão superada, como a preparação (`EDIT-SAFETY.md`).
- **Cobertura:** **LACUNA**. A migration 20261005130000 foi aplicada sem edição em curso; uma tela velha
  que tentasse regravar as refeições movidas cai em `EVENT_MEAL_ID_TAKEN`.

### CG-TIP-01 — "Tipo de refeição global de teste aparecendo para todas as cozinhas"
- **Realidade:** fixture `[TEST] Refeição …` vazada de suíte de integração aparece nos seletores de horário.
- **O sistema precisa:** o faxineiro (`apps/sisub/scripts/purge-test-fixtures.ts`) recolher; suíte não pode vazar.
- **Cobertura:** o faxineiro roda antes/depois da suíte completa no CI; vazamento visto em 2026-09-26.

## Preparações — edição simultânea e edição esquecida

### CG-PRE-01 — "Duas nutricionistas editam a mesma preparação"
- **Realidade:** uma abre a v5 e demora; a outra grava a v6. A primeira salva por cima da v5 e
  a mudança da v6 some da preparação vigente (fica só no histórico, sem ninguém perceber).
- **O sistema precisa:** recusar gravar sobre versão superada (servidor, sob o lock da
  linhagem) e, na tela, avisar antes do Salvar e levar o rascunho para a vigente sem desfazer
  o que a outra gravou (merge de três vias; campo mudado pelos dois lados fica sinalizado).
- **Cobertura:** `recipes.operations.test.ts › saveRecipeEdit recusa gravar a partir de uma
  versão já superada` · `rebase-draft.test.ts` · `recipe-lineage.test.ts › pickLineageHead`.

### CG-PRE-02 — "A cozinha reabre o global que ela já adaptou"
- **Realidade:** link antigo ou rascunho aponta para a versão global; salvar forkaria de novo
  por cima da adaptação da cozinha.
- **O sistema precisa:** tratar o fork da cozinha como a versão vigente dela e recusar.
- **Cobertura:** `recipes.operations.test.ts › fork: recusa partir de um global superado…`.

### CG-PRE-03 — "Editei, conferi e fui embora sem salvar"
- **Realidade:** até 2026-09-26 a ficha não tinha rascunho nem aviso: a edição sumia (caso do
  Arroz Integral, conferido em 24/09 sem versão nova). Terminal do rancho é compartilhado.
- **O sistema precisa:** rascunho local por conta (sobrevive a F5, fechar o navegador e trocar
  de conta, por 7 dias); Fluxo e Equipamentos, que não têm rascunho, pedem confirmação ao sair.
- **Cobertura:** `draft-store.persist.test.ts` (por conta, formato antigo, validade). Guarda
  de saída do Fluxo/Equipamentos: **LACUNA** de teste (só verificação manual).

### CG-PRE-04 — "Salvei durante a publicação de uma versão nova do SISUB"
- **Realidade:** em 2026-09-28 as nutricionistas revisavam o catálogo enquanto o sisub ia ao
  ar 7 vezes em 3 horas. No deploy rolante as tasks velhas e novas atendem juntas; uma
  server function que a task não conhece devolve `500` em JSON que o cliente do TanStack
  tomava por sucesso: "Nova versão criada", rascunho apagado, nada gravado. A consulta da
  versão vigente, nova naquele deploy, voltava o mesmo erro como dado e bloqueava o Salvar com
  "versão vundefined". O 502 do ALB aparecia como HTML cru no toast.
- **O sistema precisa:** tratar como erro legível toda resposta que o servidor não confirmou
  (e dizer que o SISUB está sendo atualizado quando veio de outro build), só apagar o
  rascunho com a linha gravada na mão e avisar a aba desatualizada que há versão nova.
- **Cobertura:** `server-fn-response.test.ts` (500 do h3, 502 do ALB, HTML com 200,
  notFound, build diferente, `assertSavedRow`) · `draft-diff.test.ts › fitDraftToShape`
  (rascunho atravessa publicação que mudou o formulário). Aviso de aba desatualizada:
  **LACUNA** de teste (sem teste de componente no sisub; cabeçalho conferido no build local). Mistura de versões no ALB
  (stickiness): **LACUNA**, depende de o cookie `AWSALB` entrar na Política de Cookies.

### CG-PRE-05 — "Pedi ao assistente para mudar a preparação, e alguém já tinha salvo outra versão"
- **Realidade:** no chat do catálogo global o assistente lê a v5 e propõe mudar o fator de
  cocção; antes da confirmação, outra nutricionista grava a v6 na tela. Até 2026-10-01 o
  `update_recipe` fazia `UPDATE` direto na linha lida: reescrevia a v5 já publicada (o cardápio
  que a usou mudava de ficha por baixo) e a v6 não recebia a mudança.
- **O sistema precisa:** a tool gravar versão nova pela mesma operation da tela, a partir da
  versão que o modelo leu e o cartão descreveu, e recusar sem gravar se ela não for mais a
  vigente.
- **UX:** o assistente recebe "a versão vigente agora é a v6; nada foi gravado" e relê antes de
  propor de novo.
- **Cobertura:** `recipes.operations.test.ts › agentUpdateRecipe recusa versão superada sem gravar
  nada` e `› agentUpdateRecipe cria versão nova preservando a ficha…` · `global-update-recipe.test.ts`
  · `sisub-domain/agent/recipes.test.ts`.
