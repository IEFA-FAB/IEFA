/**
 * @module permissions.fn
 * User permission resolution and admin CRUD for the sisub RBAC system.
 * Thin wrappers over @iefa/sisub-domain (operations/permissions).
 * LEVELS: 0=deny (explicit block), 1=read, 2=write. Deny entries are stripped from fetchUserPermissionsFn output.
 * MODULES: diner | messhall | unit | kitchen | kitchen-production | global | analytics | local-analytics | storage.
 * SCOPE: permissions can be scoped to mess_hall_id, kitchen_id, or unit_id (at most one per row).
 * @domain core
 * @migration done
 */

import {
	CreateUserPermissionSchema,
	createUserPermission,
	DeleteUserPermissionSchema,
	deleteUserPermission,
	FetchUserPermissionsAdminSchema,
	FetchUserPermissionsSchema,
	fetchUserPermissionsAdmin,
	listEffectiveUserPermissions,
	SearchUsersByEmailSchema,
	searchUsersByEmail,
	UpdateUserPermissionSchema,
	updateUserPermission,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import type { AppModule, UserPermission } from "@/types/domain/permissions"

export type UserSearchResult = {
	id: string
	email: string
	nrOrdem: string | null
}

export type PermissionRow = {
	id: string
	module: AppModule
	level: number
	mess_hall_id: number | null
	kitchen_id: number | null
	unit_id: number | null
}

/**
 * Effective permission set (deny entries stripped, implicit "diner" allow injected).
 * Unauthenticated by design — foundational lookup used while bootstrapping a session.
 */
export const fetchUserPermissionsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchUserPermissionsSchema)
	.handler(async ({ data }): Promise<UserPermission[]> => {
		return (await listEffectiveUserPermissions(getDb(), data).catch(handleDomainError)) as unknown as UserPermission[]
	})

export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.inputValidator(SearchUsersByEmailSchema)
	.handler(async ({ data }): Promise<UserSearchResult[]> => {
		const ctx = await requireAuth()
		return (await searchUsersByEmail(getDb(), ctx, data).catch(handleDomainError)) as unknown as UserSearchResult[]
	})

export const fetchUserPermissionsAdminFn = createServerFn({ method: "GET" })
	.inputValidator(FetchUserPermissionsAdminSchema)
	.handler(async ({ data }): Promise<PermissionRow[]> => {
		const ctx = await requireAuth()
		return (await fetchUserPermissionsAdmin(getDb(), ctx, data).catch(handleDomainError)) as unknown as PermissionRow[]
	})

export const createUserPermissionFn = createServerFn({ method: "POST" })
	.inputValidator(CreateUserPermissionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createUserPermission(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateUserPermissionFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateUserPermissionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateUserPermission(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteUserPermissionFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteUserPermissionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteUserPermission(getDb(), ctx, data).catch(handleDomainError)
	})
