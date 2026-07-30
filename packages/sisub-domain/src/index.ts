// Types

// Guards
export {
	type AssetKind,
	assertVersionBaseScope,
	authorizeAssetMutation,
	requireAnyPermission,
	requireAssetWriteForScope,
	requireKitchen,
	requireMessHall,
	requirePermission,
	requireUnit,
	resolveAssetOwner,
	resolveKitchenFromMenu,
	resolveKitchenFromMenuItem,
	resolveKitchenFromTemplate,
	validateRecipeAccess,
	validateTemplateAccess,
} from "./guards/index.ts"
// Operations
// biome-ignore lint/performance/noReExportAll: intentional barrel re-export for package consumers
export * from "./operations/index.ts"
// Schemas
// biome-ignore lint/performance/noReExportAll: intentional barrel re-export for package consumers
export * from "./schemas/index.ts"
export type { AppModule, PermissionScope, ProcurementNeed, ProcurementParams, UserContext, UserPermission } from "./types/index.ts"
export { DomainError, NotFoundError, PermissionDeniedError, ValidationError } from "./types/index.ts"
export type {
	BalanceStatus,
	DeclaredIngredient,
	FlowGraphStep,
	FlowValidationResult,
	IngredientBalance,
	JsonSchemaObject,
} from "./utils/index.ts"
// Utils
export { collectFinalOutputs, computeMaterialBalance, findFlowCycle, toJsonSchema, validateFlow } from "./utils/index.ts"
