## Why

Os três regimes de cardápio do sisub (semanal, evento e apoio) cresceram em épocas diferentes e hoje
seguem regras diferentes para duas perguntas que deveriam ter uma resposta só:

1. **Como o cardápio é composto.** O evento já é flexível: refeições próprias (nome, horário,
   grupos, efetivo) com preparações dentro. O apoio é uma lista plana de preparações, sem grupos e
   sem refeições. Isso não cabe na norma: o Módulo 7 descreve o Lanche de Bordo C como "uma ou mais
   refeições, incluindo sobremesa e bebida, e um lanche", e o Lanche de Apoio acima de 8 h como
   "uma refeição e um lanche". Também descreve a composição por componentes (carboidrato, proteína,
   legume, leguminosa, sobremesa; sanduíche e bebida). E os padrões de evento da SDAB
   (A Especial/Solene, B Institucional/Intermediário, C Simples/Operacional) descrevem cada formato
   de serviço (café da manhã, brunch, almoço, coquetel, jantar, kit operacional) por **quantidade de
   preparações por grupo** ("duas proteínas", "seis a oito variedades salgadas", "dois sucos"). O
   sisub não tem onde guardar essa contagem.

2. **Quem define a quantidade.** A regra pedida é: o **catálogo global** (SDAB) passa só
   quantidades **relativas** (% do efetivo, porções por pessoa ou por kit, número de preparações por
   grupo); o **local** (cozinha) passa as **absolutas** (efetivo, pax, ocorrências por mês, kits).
   Hoje só o editor global do cardápio semanal cumpre isso, e só na tela:
   - os editores globais de evento e de apoio aceitam pax por preparação, efetivo da refeição e
     ocorrências por mês;
   - o servidor e o banco não distinguem global de local em nenhum campo de quantidade;
   - aplicar um modelo global direto no calendário usa o número global como está. Um semanal global
     (que só tem %) é aplicado com todas as porções nulas, e a compra conta essas preparações como 0.
     Informar o efetivo do dia depois não recalcula (`updateHeadcount` só reescala quando já
     havia efetivo);
   - adaptar (copiar) um global leva pax, efetivo e ocorrências junto, e o pax herdado ganha do
     efetivo local sem aviso (`resolveItemDemand`).

Dados de produção (leitura em 2026-09-29): 11 apoios globais, todos vazios; 0 padrões de lanche;
0 pedidos de lanche; 1 evento global (2 itens, sem efetivo); 4 semanais globais (969 itens, 959 com %,
nenhum com pax). Nada viola a regra nova, e a reestruturação do apoio não tem dado a migrar.

## What Changes

- **Uma composição para evento e apoio.** O apoio passa a usar a mesma estrutura do evento:
  refeições próprias (nome livre, horário do calendário, grupos, efetivo local) com preparações
  dentro. Um apoio simples nasce com uma refeição "Kit" e sem exigir grupo: na tela continua sendo
  "um monte de preparações". Quem precisar separa "Refeição" e "Lanche" ou marca os componentes.
- **Quantidade de preparações por grupo.** Cada grupo de uma refeição de evento ou de apoio pode
  dizer quantas preparações espera (mínimo e máximo: "Proteínas 2", "Salgados 6 a 8"). O editor mostra
  a contagem e avisa quando o cardápio fica fora dela; nunca bloqueia. É o que permite cadastrar os
  padrões de evento A/B/C da SDAB como modelos globais.
- **Global é relativo, local é absoluto.** Pax por preparação, efetivo da refeição (semanal, evento e
  apoio) e ocorrências por mês passam a ser proibidos em modelo global, no banco, no servidor e na
  tela. O relativo é um só campo, o `recommended_proportion`: "% do efetivo" no semanal e no evento,
  "porções por kit" (ou por pessoa) no apoio. O padrão de lanche deixa de guardar porções por kit
  em `headcount_override`.
- **Aplicar pede o efetivo.** "Aplicar ao calendário" (semanal) e "Aplicar evento ou apoio" passam a
  receber o efetivo de cada refeição (kits, no apoio). Vem preenchido com o do cardápio local e vazio
  no global. Vazio é permitido e vira pendência "efetivo a definir" no dia. Informar o efetivo depois
  calcula as porções das preparações com % (hoje fica nulo para sempre).
- **Adaptar não leva absolutos do global.** A cópia de um modelo global leva preparações, grupos, %,
  porções por kit e contagem por grupo; efetivo, pax e ocorrências ficam para a cozinha preencher.
  "Adaptar" deixa escolher quais refeições do modelo levar (um padrão de evento tem seis formatos; o
  evento real usa um ou dois).
- **Sem efetivo não some da compra em silêncio.** A estimativa e a previsão de demanda passam a
  listar a preparação sem efetivo como pendência, em vez de descartá-la (`if (!headcount) continue`).
  O fluxo "Prever demanda para compra" ganha o aviso "cardápio sem efetivo", ao lado do já existente
  "apoio sem ocorrências mensais" (GC-PRV-02). Modelo global continua fora da estimativa e da
  previsão, agora recusado também no servidor.

## Capabilities

### New Capabilities
- `menu-occasion-composition`: refeições próprias em evento e apoio, grupos com quantidade de
  preparações, apoio simples de uma refeição, escolha de refeições ao adaptar.
- `menu-quantity-scope`: global relativo, local absoluto; o efetivo na aplicação; pendência de
  efetivo; recálculo das porções quando o efetivo chega; estimativa e previsão sem descarte
  silencioso.

### Modified Capabilities
- `menu-exception-flow`: o apoio (ex-exceção) passa a existir também como modelo global, só com
  quantidades relativas. A spec atual diz "não existe exceção global/SDAB", e a produção já tem 11.

## Impact

**Apps afetados**: `sisub` (editores de evento, apoio e semanal, global e local; diálogos de aplicar e
adaptar; quantitativo do dia; fluxo "Prever demanda para compra"); `sisub-mcp` (descrições e schemas
das tools de template: o servidor passa a recusar absolutos em global).

**Packages**: `@iefa/sisub-domain` (schemas e operações de template, `demand-math`, estimativa,
previsão, pedidos de lanche, tools de agente), `@iefa/database` (migration + tipos).

**Banco** (migration, espera o mantenedor): gatilhos que recusam quantidade absoluta em linha de
modelo global (`menu_template_items.headcount_override`, `menu_template_meal`,
`menu_template_event_meal.base_headcount`, `menu_template.expected_monthly_occurrences`); teto do
`recommended_proportion` de 300 para 1000 (porções por kit); backfill do apoio para refeições
próprias e das porções por kit dos padrões para `recommended_proportion`. Nenhuma tabela nova, nenhum
grant novo, nada no guard de reset de treino.

**LGPD**: nenhum dado pessoal novo.

## Não-objetivos

- **Não** fundir evento e apoio num tipo só. Eles dividem a estrutura, mas o apoio é recorrente
  (ocorrências por mês no anexo quantitativo, pedido de lanche) e o evento é pontual.
- **Não** trocar a grade do cardápio semanal (7 dias × tipos de refeição, grupos pelo conjunto do
  tipo de refeição) por refeições próprias. A rotina é uniforme e a grade serve. Ciclo de N semanas
  também fica fora.
- **Não** cadastrar os padrões de evento A/B/C por migration. Eles são conteúdo da SDAB e entram
  pelo catálogo global, por quem tem `global:2`, depois desta entrega.
- **Não** criar coluna de classificação "padrão A/B/C" no evento. Nome e descrição do modelo
  bastam; a regra de quando cada padrão vale (eventos indicados) não é calculada pelo sistema.
- **Não** renomear `menu_template_event_meal` para um nome neutro nesta entrega (ver design D2).
- **Não** resolver o selo "modelo global atualizado" na cópia (CG-EVT-03) nem "tirar do dia só uma
  refeição do evento" (GC-AGD-10). Continuam lacunas no catálogo de edge cases.
