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
	fetchUserPermissionsAdmin,
	listEffectiveUserPermissions,
	SearchUsersByEmailSchema,
	searchUsersByEmail,
	UpdateUserPermissionSchema,
	updateUserPermission,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth, requireUserId } from "@/lib/auth.server"
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
	/** Prazo do grant. `null` = permanente. */
	expires_at: string | null
	/** `true` quando o grant já venceu — calculado com o `now()` do banco, não do browser. */
	expired: boolean
}

/**
 * Effective permission set do PRÓPRIO usuário (deny entries removidos, allow implícito
 * "diner" injetado). O `userId` vem da sessão (`requireUserId`), NUNCA do cliente — senão
 * qualquer um leria as permissões de qualquer `userId` (IDOR / divulgação de autorização).
 */
export const fetchUserPermissionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<UserPermission[]> => {
	const userId = await requireUserId()
	return (await listEffectiveUserPermissions(getDb(), { userId }).catch(handleDomainError)) as unknown as UserPermission[]
})

export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.validator(SearchUsersByEmailSchema)
	.handler(async ({ data }): Promise<UserSearchResult[]> => {
		const ctx = await requireAuth()
		return (await searchUsersByEmail(getDb(), ctx, data).catch(handleDomainError)) as unknown as UserSearchResult[]
	})

export const fetchUserPermissionsAdminFn = createServerFn({ method: "GET" })
	.validator(FetchUserPermissionsAdminSchema)
	.handler(async ({ data }): Promise<PermissionRow[]> => {
		const ctx = await requireAuth()
		return (await fetchUserPermissionsAdmin(getDb(), ctx, data).catch(handleDomainError)) as unknown as PermissionRow[]
	})

export const createUserPermissionFn = createServerFn({ method: "POST" })
	.validator(CreateUserPermissionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withSensitiveAudit(
			"createUserPermissionFn",
			ctx,
			() => createUserPermission(getDb(), ctx, data),
			() => ({
				userId: data.userId,
				module: data.module,
				level: data.level,
				mess_hall_id: data.mess_hall_id ?? null,
				kitchen_id: data.kitchen_id ?? null,
				unit_id: data.unit_id ?? null,
				expires_at: data.expires_at ?? null,
			})
		).catch(handleDomainError)
	})

export const updateUserPermissionFn = createServerFn({ method: "POST" })
	.validator(UpdateUserPermissionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withSensitiveAudit(
			"updateUserPermissionFn",
			ctx,
			() => updateUserPermission(getDb(), ctx, data),
			() => ({
				permissionId: data.permissionId,
				level: data.level,
				mess_hall_id: data.mess_hall_id ?? null,
				kitchen_id: data.kitchen_id ?? null,
				unit_id: data.unit_id ?? null,
				// `undefined` = o chamador não mexeu no prazo; gravar `null` afirmaria que ele
				// tornou o grant permanente, que é outra coisa.
				expires_at: data.expires_at,
			})
		).catch(handleDomainError)
	})

export const deleteUserPermissionFn = createServerFn({ method: "POST" })
	.validator(DeleteUserPermissionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		// O alvo sai do que FOI removido, e não do payload: a remoção é destrutiva, então
		// depois dela o `permissionId` não aponta para linha nenhuma. Registrar só o id
		// deixaria a trilha incapaz de dizer de quem era o acesso revogado — inclusive para
		// os grants criados antes desta auditoria existir, que é justamente o caso em que
		// não há linha de concessão neste log para cruzar.
		return withSensitiveAudit(
			"deleteUserPermissionFn",
			ctx,
			() => deleteUserPermission(getDb(), ctx, data),
			(result) => ({
				permissionId: data.permissionId,
				userId: result.removed?.userId ?? null,
				module: result.removed?.module ?? null,
				level: result.removed?.level ?? null,
			})
		).catch(handleDomainError)
	})
