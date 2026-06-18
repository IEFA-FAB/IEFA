/**
 * Re-exports purchase_item write schemas from @iefa/sisub-domain.
 * Definitions live in packages/sisub-domain/src/schemas/procurement.ts.
 * Kept here so existing consumers (IngredientsService, tests) import unchanged.
 */

// biome-ignore lint/performance/noBarrelFile: thin back-compat re-export; definitions live in the domain package
export {
	type PurchaseItemIngredientWrite,
	PurchaseItemIngredientWriteSchema,
	type PurchaseItemWrite,
	PurchaseItemWriteSchema,
} from "@iefa/sisub-domain"
