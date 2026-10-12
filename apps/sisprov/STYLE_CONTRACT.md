# STYLE CONTRACT — sisprov

## 1. Objetivo

Dar ao SISPROV a mesma fonte de verdade visual que o sisub tem, desde o primeiro PR, para que a
dívida visual não nasça. O SISPROV é operação de almoxarifado e gestão (previsão de demanda,
ordem de fornecimento, distribuição), a mesma natureza do sisub, e adota o sistema dele: flat
design técnico-militar, cores sóbrias, hierarquia por token semântico, sete níveis tipográficos.

Este contrato registra só as DIFERENÇAS em relação a `apps/sisub/docs/STYLE_CONTRACT.md`. O que
não está aqui vale como lá. Nunca o Pale Brutalism do portal nem o institucional do rumaer.
Decisão: `openspec/changes/sisprov-foundation` (D2).

## 2. Fonte de verdade

Mesma ordem de prioridade do sisub:

1. **Tokens** (`src/styles.css` via `@theme inline`), copiados do sisub sem alteração de valor.
2. **Primitives** (`src/components/ui/`), copiados do sisub. Mudança num primitivo compartilhado
   se faz no sisub primeiro e se traz para cá; o SISPROV não diverge um primitivo em silêncio.
3. **Patterns** (`field.tsx`, `item.tsx`, `empty.tsx`): obrigatórios onde cabem.
4. **Wrappers semânticos** (`src/components/layout/`): `AppShell`, `PageHeader`.
5. **Feature-level overrides** (`src/routes/`, `src/components/`): `className` só estrutural.

## 3. O que é diferente do sisub

| Tema | sisub | sisprov |
| --- | --- | --- |
| Escopo na URL | cozinha, refeitório, unidade (`/storage/$kitchenId`) | OM pelo grant; a URL não carrega escopo nesta fundação. Quando as telas de OM chegarem, o padrão é `/<modulo>/$unitId/...`, decidido no change que o criar |
| Casca | `AppShell` com troca de módulo, paleta de comandos, rascunhos abertos, breadcrumbs derivados | `AppShell` menor: sidebar com um item por módulo acessível, navegação interna do módulo ativo, trilha de dois níveis, usuário e tema. Cresce quando o conteúdo pedir, nunca antes |
| Hub | grupos de módulos por cor (Usuário, Operacional, Gestão, Governança, Sistema) | três cards, um por papel, nas cores `primary` (Planejamento), `warning` (Almoxarifado), `governance` (Administração); sem grupo |
| Estado vazio de módulo | não existe (módulos cheios) | `ModuleFoundation`: diz o que ainda não existe e em que change chega. Não é "nenhum resultado" |
| Salvamento | `SAVE_BEHAVIOR.md` (rascunho por conta, autosave, ação nomeada) | adota o mesmo documento quando a primeira tela de edição chegar (`sisprov-catalog`); até lá não há formulário de entidade |
| Fontes | Manrope + JetBrains Mono (woff2) | iguais, em `public/fonts/` |
| Landing pública | `_public/` com tutorial e changelog | só os documentos legais; `/` redireciona. Os utilitários de landing (`text-hero`, `text-eyebrow`) não existem aqui |

## 4. Regras próprias

- **A tela nunca oferece o que a política nega.** Todo botão de escrita se pinta por
  `useSisprovAccess()` com a MESMA regra que o gate do servidor (`lib/auth.server.ts`). A
  negativa de rota devolve ao hub com `?denied=` e a tela explica.
- **Vazio, carregando e falha são três telas.** Leitura remota vai por React Query; o componente
  recebe os três estados. Falha de permissões no `_protected` grava conjunto vazio stale e o hub
  diz "não foi possível ler suas permissões", nunca "sem acesso".
- **Sem faixa de acento lateral**, sem cor crua da paleta do Tailwind, sem `font-*`/`text-<tamanho>`
  em feature, sem `title` como tooltip, sem `<button>` cru onde `Button` atende. Iguais ao sisub.
- **Dívida do lint de Tailwind começa em zero** (`tailwind-lint-baseline.json`) e só desce.

## 5. Dívida registrada

Nenhuma em 2026-10-11. Arquivos copiados do rumaer (`AuthScreen`, `themeService`) passaram
pelo lint sem aviso ou foram ajustados neste PR; o que não passou está listado aqui, com número.
