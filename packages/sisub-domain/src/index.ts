// Types

// Guards
export {
	type AssetKind,
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
	ConditionIssue,
	DeclaredIngredient,
	EquipmentCondition,
	FlowGraphStep,
	FlowValidationResult,
	IngredientBalance,
	JsonSchemaObject,
	MaintenanceDue,
	MaintenanceDueState,
} from "./utils/index.ts"
// Utils
export {
	collectFinalOutputs,
	computeMaintenanceDue,
	computeMaterialBalance,
	deriveEquipmentCondition,
	EQUIPMENT_CONDITIONS,
	findFlowCycle,
	isUnitUnavailable,
	MAINTENANCE_DUE_STATES,
	toJsonSchema,
	unitCountsForFitness,
	validateFlow,
} from "./utils/index.ts"
