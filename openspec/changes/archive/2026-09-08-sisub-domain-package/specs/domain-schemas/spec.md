## Capability: domain-schemas

Schemas Zod compartilhados que servem como source of truth para validação de input e inferência de tipos em ambos os consumers (sisub + sisub-mcp).

## Requirements

### Schemas Comuns (common.ts)

- `KitchenIdSchema` — `z.number().int().positive()`
- `DateSchema` — `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` (ISO 8601 date only)
- `DateRangeSchema` — `z.object({ startDate: DateSchema, endDate: DateSchema })`
- `UuidSchema` — `z.string().uuid()`
- `PaginationSchema` — `z.object({ page: z.number().int().optional(), pageSize: z.number().int().optional() })`
- `SortOrderSchema` — `z.number().int().nonnegative().optional()`

### Schemas Planning (planning.ts)

- `DailyMenuFetchSchema` — kitchenId + dateRange (GET menus por intervalo)
- `DayDetailsFetchSchema` — kitchenId + date (GET detalhe de um dia)
- `UpsertDailyMenuSchema` — kitchenId + serviceDate + mealTypeId + forecastedHeadcount?
- `AddMenuItemSchema` — dailyMenuId + recipeId + plannedPortionQuantity? + excludedFromProcurement?
- `UpdateMenuItemSchema` — menuItemId + plannedPortionQuantity? + excludedFromProcurement? (0|1)
- `RemoveMenuItemSchema` — menuItemId (soft-delete)
- `RestoreMenuItemSchema` — menuItemId (restore)
- `UpdateHeadcountSchema` — dailyMenuId + forecastedHeadcount
- `UpdateSubstitutionsSchema` — menuItemId + substitutions (Record<string, SubstitutionEntry>)
- `GetTrashItemsSchema` — kitchenId + dateRange

### Schemas Templates (templates.ts)

- `ListTemplatesSchema` — kitchenId? (null = global only)
- `GetTemplateSchema` — templateId (UUID)
- `TemplateItemSchema` — dayOfWeek + mealTypeId + recipeId + headcountOverride?
- `CreateTemplateSchema` — name + description? + kitchenId? + templateType ("weekly"|"event") + items?: TemplateItemSchema[]
- `CreateBlankTemplateSchema` — name + description? + kitchenId? + templateType
- `ForkTemplateSchema` — sourceTemplateId + targetKitchenId? + newName?
- `UpdateTemplateSchema` — templateId + name? + description? + templateType? + items?: TemplateItemSchema[]
- `DeleteTemplateSchema` — templateId (soft-delete)
- `RestoreTemplateSchema` — templateId
- `ApplyTemplateSchema` — templateId + kitchenId + startDate + endDate + startDayOfWeek (1-7)

### Schemas Recipes (recipes.ts)

- `FetchRecipeSchema` — recipeId + includeAlternatives? (boolean)
- `ListRecipesSchema` — kitchenId? + search? + globalOnly? (boolean)
- `ListRecipeVersionsSchema` — rootRecipeId (UUID)
- `IngredientSchema` — productId + netQuantity + isOptional + priorityOrder
- `CreateRecipeSchema` — name + preparationMethod? + portionYield + preparationTimeMinutes? + cookingFactor? + rationalId? + kitchenId? + ingredients?: IngredientSchema[]
- `CreateRecipeVersionSchema` — extends CreateRecipeSchema + baseRecipeId + version

### Schemas Meal Types (meal-types.ts)

- `FetchMealTypesSchema` — kitchenId? (null = global only)
- `CreateMealTypeSchema` — name + sortOrder? + kitchenId?
- `UpdateMealTypeSchema` — mealTypeId + name? + sortOrder? + kitchenId? (null = make global)
- `DeleteMealTypeSchema` — mealTypeId (soft-delete)
- `RestoreMealTypeSchema` — mealTypeId

### Schemas Kitchens (kitchens.ts)

- `ListKitchensSchema` — (sem params, retorna todas)
- `ListUnitKitchensSchema` — unitId

## Constraints

- Todos os schemas devem ser exportados como `const` (para inferência de tipo funcionar)
- Cada schema deve ter `z.infer<typeof Schema>` exportado como tipo nomeado
- Nomes de campos nos schemas usam **camelCase** (conversão para snake_case acontece na operation)
- Schemas não devem conter lógica de negócio — apenas shape + validação de formato
- `DateSchema` deve rejeitar datas inválidas (não apenas regex — `.refine()` com `!isNaN(Date.parse(v))`)
- Schemas compostos devem reusar os primitivos (DailyMenuFetchSchema usa KitchenIdSchema + DateRangeSchema)

## JSON Schema Generation

- Exportar helper `toJsonSchema(schema)` em `utils/json-schema.ts`
- Usar `zod-to-json-schema` com options: `{ $refStrategy: "none" }` (inline tudo, MCP não suporta $ref)
- Deve funcionar com Zod 4.x (verificar compatibilidade do zod-to-json-schema)
