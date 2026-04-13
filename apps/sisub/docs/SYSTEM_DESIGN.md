# SYSTEM DESIGN — Arquitetura de Componentes SISUB

## 1. Modelo Mental (3 frases)

> **"Onde fica este componente?"** — Responda três perguntas:
> 1. Ele sabe sobre `refeições`, `cozinhas`, `soldados`, `rancho`? → `features/<domínio>/`
> 2. Ele é parte do chrome do app (header, sidebar, erros, nav)? → `layout/`
> 3. É um primitivo visual sem domínio e sem lógica? → `ui/`

> **Regra do skeleton:** o skeleton vive ao lado do componente que ele imita — no mesmo folder.

> **Regra da rota:** a rota é o único lugar que pode ser view-model. Hooks = ponte de dados. Server functions = model. Feature components = view.

---

## 2. Estrutura de Componentes

```
src/components/
│
├── ui/              # ATOMS — primitivos sem domínio (shadcn / base-ui)
│   └── button, input, badge, card, dialog, section-label, info-panel, ...
│
├── layout/          # CHROME — sabe do router, não busca dados
│   ├── AppShell.tsx
│   ├── PageHeader.tsx
│   ├── AnimatedThemeToggler.tsx
│   ├── sidebar/
│   │   ├── AppSidebar.tsx, NavMain.tsx, NavUser.tsx, MainSurface.tsx, ...
│   └── errors/
│       ├── DefaultCatchBoundary.tsx, NotFound.tsx, ClientErrorBoundary.tsx
│
├── providers/       # WIRING — efeitos colaterais, orquestração de sessão
│   ├── RealtimeProvider.tsx
│   └── OnboardingDialogs.tsx
│
└── features/        # ORGANISMS — conhecem o domínio, podem ter hooks próprios
    ├── analytics/
    │   ├── DashboardCard.tsx, MetricsOverview.tsx, ...
    │   └── DashboardSkeleton.tsx       # co-localizado com o feature
    ├── diner/
    │   ├── DayCard.tsx, MealButton.tsx, BulkMealSelector.tsx, ...
    │   └── DayCardSkeleton.tsx
    ├── messhall/
    │   ├── PresenceTable.tsx, FiscalDialog.tsx, EvaluationDialog.tsx, ...
    │   └── PresenceTableSkeleton.tsx
    ├── local/
    │   ├── PresenceTable.tsx, ProcurementTable.tsx, QRAutoCheckinCard.tsx
    │   └── planning/
    ├── global/
    │   ├── ProductForm.tsx, PermissionsManager.tsx, ...
    │   └── places-manager/
    └── shared/       # Organisms usados por 2+ features
        ├── RecipeForm.tsx, RecipesManager.tsx, IngredientSelector.tsx, ...
        └── ScopeSelector.tsx
```

---

## 3. Árvore de Decisão — Onde Vai um Novo Componente?

```
É um primitivo visual (Button, Input, Card, wrapper Base-UI)?
  SIM → components/ui/

É parte do chrome do app (header, sidebar, nav, error boundary)?
  SIM → components/layout/

É um Provider de contexto ou side-effect wrapper de sessão?
  SIM → components/providers/

Sabe sobre o domínio (refeições, cozinhas, ordens militares)?
  SIM → Pertence a UM domínio?
          SIM → components/features/<domínio>/
          NÃO (2+ features usam) → components/features/shared/

É um skeleton de um componente específico?
  SIM → Vive no mesmo folder do componente que imita

Nenhum dos acima?
  → Provavelmente é lógica, não componente → hooks/ ou lib/
```

---

## 4. Atomic Design como Mental Model

Não existem pastas `atoms/`, `molecules/`, `organisms/`. A hierarquia existe nas regras acima.

| Nível Atomic | Onde no Projeto | Critério |
|---|---|---|
| **Atoms** | `components/ui/` | Zero domínio; existe em qualquer app React |
| **Molecules** | `components/ui/` ou `components/layout/` | Combina atoms; ainda sem domínio |
| **Organisms** | `components/features/<domain>/` | Sabe do domínio; pode ter hooks próprios |
| **Templates** | `routes/**/*.route.tsx` | Define estrutura de página (layout route) |
| **Pages** | `routes/**/*.tsx` | Conteúdo + View-Model |

**Molecule vs. Organism** é uma ferramenta de raciocínio, não de pasta. Pergunta: *"Este componente faz sentido sozinho com dados próprios?"* → organism. *"Só existe dentro de um componente maior?"* → molecule, fica inline ou em subfolder `_parts/`.

---

## 5. Camadas da Aplicação (MVC adaptado)

```
server/*.fn.ts          → MODEL: createServerFn + Supabase + Zod. Sem React.
hooks/data/*.ts         → DATA BRIDGE: React Query wrappers das server functions.
routes/**/*.tsx         → VIEW-MODEL: estado local + event handlers + prop wiring.
components/features/*/  → VIEW: render; pode ter hooks próprios.
```

### Template de rota (padrão obrigatório)

```tsx
export const Route = createFileRoute("/_protected/_modules/<modulo>/<pagina>")({
  beforeLoad: ({ context }) => requirePermission(context, "modulo", nivel),
  head: () => ({ meta: [{ title: "Título - SISUB" }] }),
  component: NomePagina,
})

function NomePagina() {
  // ── VIEW-MODEL ──────────────────────────────────────────────────────
  const { data, isPending } = useFeatureData()
  const { mutate } = useFeatureMutation()
  const [localState, setLocalState] = useState(...)

  // ── VIEW ────────────────────────────────────────────────────────────
  return (
    <FeatureOrganism
      data={data}
      isPending={isPending}
      onAction={mutate}
    />
  )
}
```

### Regras para arquivos de rota

| O que | Onde |
|---|---|
| Event handlers | Dentro da função de rota |
| Helpers puros usados só nessa rota | Topo do arquivo da rota |
| Helpers puros usados em 2+ rotas | `lib/<domínio>.ts` |
| Se rota passa de ~200 linhas | Extrair helpers para `lib/`, não criar componente extra |
| Organisms que precisam de muitos props | Podem ter hooks próprios para evitar prop-drilling |

---

## 6. Hooks

```
hooks/
├── auth/       # useAuth, useProfile — dados da sessão autenticada
├── business/   # useFiscalOps, useExportCSV — lógica de negócio
├── data/       # useRecipes, useMealForecast, usePlanning, ... — React Query
└── ui/         # useTheme, useUserSync — estado de interface
```

**Regra:** hooks de `data/` chamam server functions via `useQuery`/`useMutation`. Nunca chamam Supabase diretamente (isso é responsabilidade das server functions).

---

## 7. Barrel Files — Não Usar

Manter imports diretos por path completo (`@/components/features/diner/DayCard`).

**Por quê:**
- Barrel files quebram "Go to Definition" no IDE (vai ao `index.ts`, não ao arquivo)
- O path completo já informa a proveniência do componente
- Bun/Vite tree-shaking funciona melhor com imports diretos

**Exceção:** se `features/shared/` crescer para 10+ arquivos, um `index.ts` somente nessa pasta é aceitável.

---

## 8. Convenções de Nomenclatura

| Tipo | Convenção | Exemplo |
|---|---|---|
| Componente React | PascalCase | `DayCard.tsx`, `PageHeader.tsx` |
| Componente ui/ (shadcn) | kebab-case (exceção) | `button.tsx`, `card.tsx` |
| Hook | camelCase com `use` | `useMealForecast.ts` |
| Server function | camelCase com `Fn` | `fetchForecastFn`, `upsertMenuFn` |
| Skeleton | Sufixo `Skeleton` | `DayCardSkeleton.tsx` |
| Subfolder de partes internas | Prefixo `_parts/` | `_parts/DayCardHeader.tsx` |
| Route layout | `route.tsx` | `_modules/route.tsx` |
| Route page | `index.tsx` ou `nome.tsx` | `forecast.tsx`, `index.tsx` |

---

## 9. Casos Especiais

### Organisms com dados próprios (ex: `DashboardCard`)
Organismos podem chamar hooks diretamente quando:
- Isso evita prop-drilling excessivo no route
- O componente é usado em apenas uma rota
- Extrair os dados para a rota tornaria o arquivo da rota significativamente mais complexo

Se o organismo for reutilizado em 2+ rotas com dados diferentes, extrair a lógica de dados para o route.

### Subfeatures complexas (ex: `planning/`, `places-manager/`)
Subfolders são aceitos quando a feature tem 5+ componentes relacionados. Estrutura interna:
```
features/local/planning/
├── PlanningBoard.tsx      # componente principal (organism)
├── DayDrawer.tsx          # sub-organismo
├── MenuItemCard.tsx       # molecule interna
└── _parts/                # se molecules crescerem
```

### Diálogos de domínio
Diálogos que conhecem o domínio (`FiscalDialog`, `EvaluationDialog`, `SaramDialog`) ficam na pasta da feature a que pertencem, não em `providers/`.

`OnboardingDialogs` é a exceção: ela é app-level (orquestra múltiplos diálogos de onboarding de sessão) e fica em `providers/`.

### Layout com dados de sessão (ex: `NavUser`)
Componentes em `layout/` podem consumir hooks de `hooks/auth/` (dados de sessão/perfil do usuário autenticado). Isso **não** viola a regra "layout não busca dados", que se refere a dados de **domínio** (refeições, cozinhas, etc.). Dados de sessão são cross-cutting e necessários para o chrome do app.

### Realtime subscriptions (ex: `useRealtimeSubscription`)
Hooks de Realtime usam o Supabase client diretamente (WebSockets são client-side por natureza). Por isso vivem em `hooks/realtime/`, **não** em `hooks/data/`, para não violar a regra "data hooks só usam useQuery/useMutation sobre server functions".

---

## 10. Relação com STYLE_CONTRACT.md

Este documento (`SYSTEM_DESIGN.md`) define **onde** os componentes ficam e **como** as camadas se comunicam.

O `STYLE_CONTRACT.md` define **como** os componentes são estilizados (tokens, variants, primitivos).

Ambos são complementares. Um componente bem arquitetado segue os dois contratos.
