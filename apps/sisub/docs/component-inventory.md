# Component Inventory — sisub

## Camadas do sistema

```
src/components/
├── ui/              → Primitives (shadcn/ui + @base-ui)
├── common/          → Wrappers semânticos compartilhados
│   ├── layout/      → AppShell, PageHeader, sidebar/
│   ├── dialogs/
│   ├── errors/
│   ├── providers/
│   ├── skeletons/
│   └── ui/          → CopyButton, Table, DynamicIcon, HeroHighlight
└── features/        → Feature components
    ├── global/      → Admin: AddUserDialog, EditUserDialog, Products, Permissions
    ├── local/        → Kitchen: PresenceTable, PlanningBoard, QRAutoCheckin
    │   └── planning/ → (14 componentes)
    ├── diner/       → Diner: DayCard, MealButton, BulkMealSelector, Stats
    ├── messhall/    → MessHall: Filters, FiscalDialog, SaramDialog, PresenceTable
    ├── shared/      → Cross-feature: RecipeForm, IngredientSelector, ScopeSelector
    └── analytics/   → (não explorado)
```

---

## A. UI Primitives (`src/components/ui/`)

| Componente | Tipo | CVA | Estado |
|---|---|---|---|
| `button.tsx` | Primitive | ✅ 6 variants, 8 sizes | Bom — variants inválidas usadas externamente |
| `input.tsx` | Primitive | ❌ | Bom — sem variantes |
| `badge.tsx` | Primitive | ✅ 6 variants | Bom |
| `card.tsx` | Primitive | ❌ (prop size) | Bom — overclassname em features |
| `dialog.tsx` | Primitive | ❌ | OK |
| `sheet.tsx` | Primitive | ❌ | OK |
| `drawer.tsx` | Primitive | ❌ | OK |
| `select.tsx` | Primitive | ❌ | OK |
| `textarea.tsx` | Primitive | ❌ | OK |
| `table.tsx` | Primitive | ❌ | OK |
| `tabs.tsx` | Primitive | ❌ | OK |
| `alert.tsx` | Primitive | ✅ | OK |
| `dropdown-menu.tsx` | Primitive | ❌ | OK |
| `popover.tsx` | Primitive | ❌ | OK |
| `field.tsx` | Pattern | ✅ (orientation) | Disponível, **subutilizado** |
| `item.tsx` | Primitive | ✅ | OK |
| `input-group.tsx` | Primitive | ✅ | OK |
| `button-group.tsx` | Primitive | ✅ | OK |
| `empty.tsx` | Primitive | ❌ | OK |
| `spinner.tsx` | Primitive | ❌ | OK |
| `kbd.tsx` | Primitive | ❌ | OK |
| `skeleton.tsx` | Primitive | ❌ | OK |
| `avatar.tsx` | Primitive | ❌ | OK |
| `accordion.tsx` | Primitive | ❌ | OK |
| `tooltip.tsx` | Primitive | ❌ | OK |
| `breadcrumb.tsx` | Primitive | ❌ | OK |
| `sidebar.tsx` | Complex Pattern | ❌ | OK (shadcn/sidebar) |

---

## B. Common — Wrappers e Layout

| Componente | Tipo | Status |
|---|---|---|
| `common/layout/AppShell.tsx` | Layout wrapper | **Wrapper semântico** — ótimo |
| `common/layout/PageHeader.tsx` | Semantic wrapper | **Wrapper semântico** — bem feito, padrão a preservar |
| `common/layout/sidebar/` | Sidebar | OK |
| `common/ui/Table.tsx` | Feature-aware table | Pattern customizado do shadcn |
| `common/ui/CopyButton.tsx` | Semantic wrapper | Small, focado |
| `common/ui/DynamicIcon.tsx` | Utility | OK |
| `common/ui/HeroHighlight.tsx` | Visual component | OK |

---

## C. Feature Components

### global/
| Componente | Responsabilidade | Observações |
|---|---|---|
| `AddUserDialog.tsx` | Form dialog | Padrão de form antigo — não usa `Field` |
| `EditUserDialog.tsx` | Form dialog | Idem |
| `DeleteUserDialog.tsx` | Confirm dialog | Simples, OK |
| `FolderForm.tsx` | Form | Não usa `Field` |
| `ProductForm.tsx` | Form complexo | Não usa `Field` |
| `ProductItemForm.tsx` | Form | Não usa `Field` |
| `PermissionsManager.tsx` | Admin builder complexo | `<button>` crus, `ring-purple/orange-500` hardcoded |
| `ProductsTreeManager.tsx` | Tree UI | Complexa |
| `ProductsTreeNode.tsx` | Tree node | Complexo |
| `SuperAdminHero.tsx` | Hero component | Simples |

### diner/
| Componente | Responsabilidade | Observações |
|---|---|---|
| `DayCard.tsx` | Card de dia com refeições | Bom uso de tokens — com alguns overrides locais OK |
| `MealButton.tsx` | Botão toggle de refeição | **Problema**: cores hardcoded (green/gray/blue) |
| `BulkMealSelector.tsx` | Seletor bulk | Complexo |
| `MessHallSelector.tsx` | Selector de rancho | OK |
| `DefaultMessHallSelector.tsx` | Selector default | OK |
| `SimplifiedMilitaryStats.tsx` | Stats dashboard | **Problema**: `emerald-500`, `amber-500` hardcoded |
| `UnifiedStatusToasts.tsx` | Toast manager | OK |

### local/planning/
| Componente | Responsabilidade | Observações |
|---|---|---|
| `PlanningBoard.tsx` | Calendar planning board | Template string className, `bg-green-500`/`bg-amber-500` |
| `DayDrawer.tsx` | Drawer de detalhe | OK |
| `MenuItemCard.tsx` | Card de item de cardápio | OK |
| `RecipeSelector.tsx` | Selector com `<button>` cru | Candidato a refatoração |
| `TemplateManager.tsx` | Manager de templates | OK |
| `TemplateEditor.tsx` | Editor de template | OK |
| `TemplateGridCell.tsx` | Célula do grid | OK |
| `TemplatePalette.tsx` | Paleta de templates | OK |
| `MealTypeManager.tsx` | Manager de tipos | OK |
| `MealTypeForm.tsx` | Form de tipo | Não usa `Field` |
| `TrashDrawer.tsx` | Lixeira drawer | OK |
| `ApplyTemplateDialog.tsx` | Dialog de aplicação | OK |
| `SubstitutionModal.tsx` | Modal de substituição | `<button>` cru |
| `KitchenSelector.tsx` | Selector de cozinha | OK |

### shared/
| Componente | Responsabilidade | Observações |
|---|---|---|
| `RecipeForm.tsx` | Form de receita | Maior form — não usa `Field` |
| `RecipesManager.tsx` | Manager | OK |
| `RecipeDiffViewer.tsx` | Diff viewer | OK |
| `IngredientSelector.tsx` | Selector com `<button>` crus | Candidato |
| `ScopeSelector.tsx` | Selector de escopo | `<button>` cru |

---

## D. Componentes Duplicados / Conflitantes

| Conflito | Detalhe |
|---|---|
| `local/PresenceTable.tsx` + `messhall/PresenceTable.tsx` | Dois componentes com o mesmo nome para contextos diferentes — OK se intencional |
| `MealButton` não usa `Button` primitive | Em modo compact usa `Button` importado mas sem import declarado (possível bug ou import implícito via re-export) |
| `Badge` de `lucide-react` importado em `PlanningBoard.tsx` | Confusão: há dois `Badge` — o ícone do Lucide e o componente UI. PlanningBoard importa ambos acidentalmente |

---

## E. Observação: field.tsx vs padrão manual

O `field.tsx` já existe com:
- `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `FieldError`
- Suporte a orientação vertical/horizontal/responsive
- Integração com `aria-invalid` e estados de erro

**Não é usado em nenhum dos formulários de feature.** Os formulários continuam com o padrão manual `grid grid-cols-4 + Label + Input + span.text-destructive`.
