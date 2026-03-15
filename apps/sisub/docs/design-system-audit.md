# Design System Audit — sisub

> Stack: Vite 8 + React 19 + TanStack Router + Tailwind v4 + shadcn/ui (new-york, zinc, cssVariables) + @base-ui/react primitives + CVA + class-variance-authority

---

## 1. Token System (styles.css)

### Estado atual
O projeto usa **Tailwind v4 com `@theme inline`** — os tokens CSS são declarados como `--color-*` e mapeados para classes Tailwind automaticamente.

**Tokens existentes e consistentes:**
- Paleta semântica completa: `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`
- Sidebar: tokens dedicados `--sidebar-*`
- Charts: `--chart-1` a `--chart-5`
- Radius: `--radius: 1.5rem` → derivados `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`
- Shadows: escalas definidas mas com **opacity 0** (sombras efetivamente invisíveis)
- Fonts: Manrope (sans) e JetBrains Mono (mono), auto-hospedadas

**Problemas identificados:**

| Problema | Detalhe |
|---|---|
| Radius global 1.5rem ignorado | Componentes usam `rounded-lg` (108×), `rounded-md` (96×), `rounded-xl` (35×) hardcoded em vez de `rounded-lg` / tokens semânticos |
| Shadows nulas | `--shadow-opacity: 0` torna todas as sombras invisíveis, mas componentes usam `shadow-sm`, `shadow-lg` sem efeito real |
| `--radius` grande demais | 1.5rem produz botões e inputs com bordas "pill" — incompatível com o estilo técnico-militar do produto |
| Font inconsistente no dark | `.dark` usa `'DM Sans'` mas a fonte não é carregada; `light` usa `Manrope` |

---

## 2. Radius — Inconsistência Crítica

```
rounded-lg   108 ocorrências  ← mais comum na prática
rounded-md    96 ocorrências
rounded-full  70 ocorrências  ← só para avatares/dots/badges pill
rounded-xl    35 ocorrências
rounded-2xl   19 ocorrências
rounded-none   7 ocorrências
rounded-sm     5 ocorrências
rounded-3xl    6 ocorrências
rounded-4xl    1 ocorrência (apenas badge CVA)
```

**Diagnóstico:** O token `--radius: 1.5rem` gera `rounded-lg = 1.5rem`, mas o code base usa `rounded-lg` esperando o comportamento padrão do Tailwind (0.5rem). Há um desvio real entre o que o token diz e o que os devs assumem. Os botões e inputs têm shape radicalmente arredondado que talvez não seja intencional em todos os contextos.

---

## 3. Cores Hardcoded — Maior Violação do Design System

Usos de cores fora dos tokens semânticos:

| Cor hardcoded | Ocorrências | Arquivo principal |
|---|---|---|
| `bg-green-500` | 8 | MealButton, PlanningBoard |
| `bg-blue-500` | 7 | MealButton, AuthScreen |
| `text-blue-600` | 6 | AuthScreen, routes |
| `text-blue-500` | 5 | AuthScreen |
| `border-green-500` | 5 | MealButton |
| `text-green-600/700` | 7 | MealButton |
| `bg-emerald-500` / `text-emerald-*` | 3 | SimplifiedMilitaryStats |
| `bg-amber-500` / `text-amber-*` | 3 | SimplifiedMilitaryStats |
| `bg-gray-50` / `text-gray-*` | 5 | MealButton |
| `ring-blue-500` | 3 | MealButton (`focus:ring-blue-500`) |
| `ring-purple-500` | 2 | PermissionsManager |
| `ring-orange-500` | 2 | PermissionsManager |

**Pior ofensor:** `MealButton.tsx` — usa `green-*`, `gray-*`, `blue-500` e `bg-white` em vez dos tokens `primary`, `muted`, `ring`, `background`.

---

## 4. Variants — Uso e Inconsistências

### Button

```
variant="outline"      111×  ← dominante (deveria ser variant secundária)
variant="ghost"         44×
variant="secondary"     21×
variant="destructive"   14×
variant="default"        9×
variant="floating"       3×  ← NÃO EXISTE no CVA → zero-efeito / risco de bug
variant="present"        1×  ← NÃO EXISTE
variant="missing"        1×  ← NÃO EXISTE
variant="extra"          1×  ← NÃO EXISTE
```

**Problema:** `variant="outline"` é usado como a chamada-à-ação padrão, mas no CVA atual é uma variant secundária. A hierarquia visual está invertida na prática.

### Size

```
size="sm"      102×  ← virou o "default" real
size="icon"     14×
size="icon-sm"   3×
size="lg"        2×
size="default"   2×
size="md"        1×  ← NÃO EXISTE no CVA → fallback para "default"
```

**Problema:** `size="sm"` é usado em 85%+ dos casos. O `size="default"` (h-8) é raramente usado. Isso sugere que o "default" real deveria ser o `sm` atual, ou que a escala de tamanhos não reflete a intenção do produto.

---

## 5. Elementos HTML Crus (sem primitives)

Usos de `<button>` sem o componente `Button`:

| Arquivo | Linhas | Justificativa |
|---|---|---|
| `auth/view/AuthScreen.tsx` | L573, L594 | Botões ocultar/mostrar senha — candidatos a ButtonIcon |
| `auth/view/ResetPasswordScreen.tsx` | L229, L274 | Idem |
| `PermissionsManager.tsx` | L569 | Botão de toggle num builder complexo |
| `SubstitutionModal.tsx` | L109 | Botão de seleção com styling custom |
| `RecipeSelector.tsx` | L148 | Item clicável de lista |
| `ScopeSelector.tsx` | L82 | Botão de seleção inline |
| `IngredientSelector.tsx` | L54, L117 | Itens clicáveis |
| `sidebar.tsx` | L267 | Interno do shadcn — OK |
| `animated-theme-toggler.tsx` | L56 | Toggle custom — OK |
| `routes/diner/menu.tsx` | L115, L132, L149 | Botões de refeição — principal candidato |

---

## 6. Template Strings em className (Anti-pattern)

`PlanningBoard.tsx` L272–277 usa template string para compor classes:
```tsx
className={`
  p-2 relative transition-colors cursor-pointer group
  ${!isCurrentMonth ? "bg-muted/10 text-muted-foreground" : "bg-background"}
  ${isToday ? "bg-primary/5" : ""}
  ${isSelected ? "ring-2 ring-primary ring-inset bg-primary/10" : "hover:bg-muted/50"}
`}
```
→ Deve ser refatorado para `cn()` com objeto condicional.

---

## 7. Formulários — Padrão Não Capitalizado

Formulários em `AddUserDialog`, `EditUserDialog`, etc. usam:
```tsx
<div className="grid grid-cols-4 items-center gap-4">
  <Label className="text-right">Campo</Label>
  <div className="col-span-3">
    <Input ... />
    <span className="text-destructive text-sm">{erro}</span>
  </div>
</div>
```

O projeto **já tem** `field.tsx` com `Field`, `FieldGroup`, `FieldLabel`, `FieldError` que resolve exatamente este padrão — mas não é usado nos formulários de feature.

---

## 8. Card — Uso e Sobrecarga

Cards em `SimplifiedMilitaryStats` recebem classNames longos e repetidos para criar stat cards:
```tsx
<Card className="group bg-gradient-to-br from-card to-muted/10 text-card-foreground border border-border/50 border-l-4 border-l-emerald-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
```

Esse padrão de "stat card com accent lateral" aparece 3× com cores diferentes (primary, emerald-500, amber-500). Candidato a wrapper semântico `StatCard`.

---

## 9. Shadows — Problema de Configuração

Todas as sombras têm `opacity: 0`:
```css
--shadow-sm: 0px 2px 0px 0px hsl(... / 0.00), 0px 1px 2px -1px hsl(... / 0.00);
```

`hover:shadow-lg`, `shadow-sm` são usados no código mas não têm efeito visual. Décision: ou as sombras são intencionalmente "flat" (design plano), ou é um bug da configuração do tema.

---

## 10. Padrões de Foco/Hover Inconsistentes

- `Button` usa `focus-visible:ring-[3px]` via CVA ✅  
- `MealButton` usa `focus:ring-2 focus:ring-blue-500 focus:ring-offset-1` ❌ (hardcoded, non-semantic)  
- `Input` usa `focus-visible:ring-[3px]` via CVA ✅  
- `<button>` crus não têm estilo de foco ❌
