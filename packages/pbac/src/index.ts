export { PermissionDeniedError } from "./errors.ts"
export { type MinLevel, requireAnyPermission, requirePermission } from "./guards.ts"
export { hasPermission } from "./has-permission.ts"
export {
	grantUnscopedModulePermission,
	myModulePermissionsQueryConfig,
	resolveModulePermissions,
	searchUsersByEmail,
	type UserEmailSearchRow,
} from "./module-permissions.ts"
export { resolveUserPermissions } from "./resolve-permissions.ts"
export type { AppModule, PermissionScope, UserContext, UserPermission } from "./types.ts"
