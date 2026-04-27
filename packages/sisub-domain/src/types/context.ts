import type { AppModule, PermissionScope, UserPermission } from "@iefa/pbac"

export interface UserContext {
	userId: string
	permissions: UserPermission[]
}

export type { AppModule, PermissionScope, UserPermission }
