export {
	ASSURANCE_FRESHNESS_WINDOW_SECONDS,
	type AssertAssuranceOptions,
	type AssuranceGrade,
	type AssuranceRequirement,
	assertAssurance,
	NO_ASSURANCE,
	satisfiesAssurance,
} from "./assurance.ts"
export { resolveEffectivePermissions } from "./effective-permissions.ts"
export { type AssuranceNextStep, AssuranceRequiredError, type AssuranceRequiredErrorInit, PermissionDeniedError } from "./errors.ts"
export { type MinLevel, requireAnyPermission, requirePermission } from "./guards.ts"
export { hasAnyPermission, hasPermission } from "./has-permission.ts"
export {
	grantUnscopedModulePermission,
	myModulePermissionsQueryConfig,
	resolveModulePermissions,
	searchUsersByEmail,
	type UserEmailSearchRow,
} from "./module-permissions.ts"
export { type ModuleScopes, resolveModuleScopes, type ScopeAxis } from "./module-scopes.ts"
export { type AssuranceReachability, isProtectedAccount } from "./protected-account.ts"
export { NOT_EXPIRED, resolveUserPermissions } from "./resolve-permissions.ts"
export type { AppModule, CredentialOrigin, PermissionScope, UserContext, UserPermission } from "./types.ts"
