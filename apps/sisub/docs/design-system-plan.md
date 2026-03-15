# Design System Plan — sisub

## Visão geral

O objetivo é centralizar decisões visuais, eliminar hardcoded colors e padronizar padrões de uso sem over-engineering. O sistema é organizado em 4 camadas:

```
1. Tokens         → styles.css  (já existe, ajustar)
2. Primitives     → src/components/ui/  (refinar CVA)
3. Patterns       → src/components/ui/ + common/  (field.tsx, button-group, etc.)
4. Feature/Domain → src/components/features/  (wrappers semânticos seletivos)
```

---

## Camada 1 — Tokens

### Decisões

| Problema | Decisão | Classificação |
|---|---|---|
| `--radius: 1.5rem` produz shapes muito arredondados | Reduzir para `0.5rem` (valor padrão shadcn/zinc) | **Token** |
| Shadows com opacity 0 | Adicionar opacidade real ou documentar como "flat design" intencional | **Token** |
| Font dark usa `DM Sans` (não carregada) | Alinhar ambos os temas para `Manrope` | **Token** |
| Cores success/warning/info ausentes | Adicionar `--success`, `--warning` como aliases semânticos | **Token** |

### Novos tokens semânticos a adicionar em `styles.css`

```css
/* Status semantics */
--success: oklch(0.6907 0.1554 160.3454);     /* green, usa chart-2 como base */
--success-foreground: oklch(1.0000 0 0);
--warning: oklch(0.8214 0.1600 82.5337);      /* amber, usa chart-3 */
--warning-foreground: oklch(0.2000 0 0);
```

E no `.dark`:
```css
--success: oklch(0.6907 0.1554 160.3454);
--success-foreground: oklch(1.0000 0 0);
--warning: oklch(0.8214 0.1600 82.5337);
--warning-foreground: oklch(0.2000 0 0);
```

E registrar em `@theme inline`:
```css
--color-success: var(--success);
--color-success-foreground: var(--success-foreground);
--color-warning: var(--warning);
--color-warning-foreground: var(--warning-foreground);
```

---

## Camada 2 — Primitives

### Button

**Estado atual:** CVA bem estruturado, 6 variants × 8 sizes. Problema: hierarquia de uso invertida (`outline` > `default` na prática) e variants inválidas usadas externamente.

**Decisão:** Manter CVA atual. Ajustar defaultVariants. Documentar hierarquia:
- `default` = ação primária (CTA principal)
- `outline` = ação secundária / alternativa
- `ghost` = ação terciária / toolbars
- `destructive` = ações destrutivas
- `secondary` = informacional
- `link` = texto navegacional

**Variants inválidas a remover nos callsites:** `floating`, `present`, `missing`, `extra` → substituir por variante correta.

**Size:** `sm` é o default real do produto. Considerar alterar `defaultVariants.size` para `"sm"` ou documentar que `sm` deve ser explícito.

### Input

**Estado atual:** Thin wrapper sobre `@base-ui/react/input`. Sem variants — único problema é ausência de `size` prop.

**Decisão:** Não adicionar variantes. O tamanho é fixo `h-8` — adequado. Se necessário, `className` resolve.

### Badge

**Estado atual:** CVA bem estruturado. Variants `present/missing/extra` inválidas usadas externamente → são status customizados que deveriam usar `outline` + `className` de cor.

**Decisão:** Adicionar variantes `success` e `warning` aproveitando os novos tokens:
```ts
success: "bg-success/10 text-success border-success/30",
warning: "bg-warning/10 text-warning border-warning/30",
```

### Card

**Estado atual:** Tem `size` prop (default/sm). Padrão `className` longo para stat cards.

**Decisão:** Não alterar o primitive. Criar wrapper `StatCard` semântico.

---

## Camada 3 — Patterns

### `field.tsx` — Capitalizar uso

O `Field` + `FieldGroup` + `FieldLabel` + `FieldError` já existe e está correto. Deve ser adotado nos formulários de feature como padrão de formulário.

**Padrão a adotar:**
```tsx
<FieldGroup>
  <Field>
    <FieldLabel>Nome</FieldLabel>
    <Input ... />
    <FieldError errors={field.state.meta.errors} />
  </Field>
</FieldGroup>
```

### `MealStatusButton` — Wrapper para MealButton

`MealButton` tem responsabilidade clara mas usa cores hardcoded. Refatorar internamente para usar tokens semânticos.

---

## Camada 4 — Feature/Domain Wrappers

### Wrappers justificados pela recorrência

| Wrapper | Justificativa | Aparece em |
|---|---|---|
| `StatCard` | Padrão card com accent lateral + icon + value aparece 3× em SimplifiedMilitaryStats | SimplifiedMilitaryStats |
| `PageHeader` | **Já existe** — manter | 10+ routes |
| `DialogFormFooter` | Pattern cancelar/confirmar com loading state | 5+ dialogs |

### Wrappers NÃO justificados

| Candidato | Motivo da rejeição |
|---|---|
| `FormField` para label+input | Layout local varia muito (horizontal, cols-4, cols-1) — usar `Field` diretamente |
| `ConfirmDialog` | Não há recorrência suficiente — os 3 dialogs existentes têm conteúdo muito diferente |

---

## Prioridades de Implementação

### Quick wins (baixo risco, alto impacto)

1. **Corrigir radius** — alterar `--radius` de `1.5rem` para `0.5rem` em `styles.css`
2. **Corrigir font dark** — remover `DM Sans` e usar `Manrope` no `.dark`
3. **Adicionar tokens success/warning** — sem risco de quebra
4. **Remover variants inválidas** — `floating`, `present`, `missing`, `extra` → substituir callsites

### Alto impacto visual

5. **Refatorar MealButton** — trocar cores hardcoded por tokens semânticos
6. **Refatorar SimplifiedMilitaryStats** — trocar `emerald-500`/`amber-500` por `success`/`warning`
7. **Refatorar PlanningBoard statusColor** — trocar `bg-green-500`/`bg-amber-500` por tokens

### Médio prazo

8. **Adicionar variants success/warning ao Badge** — aproveitando os novos tokens
9. **Criar StatCard wrapper** — se o padrão de stat cards crescer
10. **Adotar Field nos formulários** — migrar 1 formulário como referência

### Menor impacto / maior risco

11. **Substituir `<button>` crus** — apenas onde estilização e acessibilidade são problemáticas
12. **Refatorar template strings** — trocar `${}` em className por `cn()` com objetos

---

## Convenções estabelecidas

### className
- `className` é escape hatch para **layout local** (margin, width, flex-grow)
- **Não** para mudar intenção visual de um primitive
- Se uma classe aparece 5+ vezes com a mesma intenção → virar variant ou wrapper

### Variants
- Apenas variants com 3+ usos reais justificam existência
- Variants por intenção semântica, não por apresentação
- `size` por escala funcional, não pixels específicos

### Wrappers semânticos
- Criados quando há combinação recorrente com **nome de domínio** (ex.: `MealButton`, `StatCard`)
- Não criados apenas pela repetição de classes
