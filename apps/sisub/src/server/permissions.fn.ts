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
import { withAtomicAudit } from "@/lib/audit.server"
import { requireAuth, requireUserId } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { tryRevokeRecoveryCodesIfProtected } from "@/lib/mfa-recovery.server"
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

/*
 * Concessão, alteração e revogação: a mudança e a linha de `access_control.sensitive_operation_log`
 * entram na MESMA transação, pela função SQL que a operação de domínio chama
 * (`withAtomicAudit`, migration 20260921130000). O alvo registrado (quem, módulo, escopo, nível
 * antes → depois, prazo) sai do BANCO — da linha gravada ou removida —, não do payload.
 */

export const createUserPermissionFn = createServerFn({ method: "POST" })
	.validator(CreateUserPermissionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("createUserPermissionFn", async ({ assurance, audit }) => {
			const created = await createUserPermission(getDb(), ctx, data, assurance, audit)
			// A conta pode ter acabado de virar PROTEGIDA (design.md D9): quem alcança
			// empenho não tem código de recuperação, e os que ela já tinha valeriam a
			// partir de agora para uma operação que a mudança existe para fechar.
			await tryRevokeRecoveryCodesIfProtected(data.userId)
			return created
		}).catch(handleDomainError)
	})

export const updateUserPermissionFn = createServerFn({ method: "POST" })
	.validator(UpdateUserPermissionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withAtomicAudit("updateUserPermissionFn", async ({ assurance, audit }) => {
			const updated = await updateUserPermission(getDb(), ctx, data, assurance, audit)
			// O alvo sai da LINHA alterada, nunca do payload: `UpdateUserPermissionSchema`
			// só traz o id do grant, e subir o nível de um grant é uma das formas de a conta
			// virar protegida.
			if (updated.user_id) await tryRevokeRecoveryCodesIfProtected(updated.user_id)
			return updated
		}).catch(handleDomainError)
	})

export const deleteUserPermissionFn = createServerFn({ method: "POST" })
	.validator(DeleteUserPermissionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		// A linha removida vai INTEIRA para o log (a função a lê no próprio delete): depois
		// dela, o `permissionId` não aponta para linha nenhuma, e o log é o único lugar onde
		// o acesso revogado ainda existe.
		return withAtomicAudit("deleteUserPermissionFn", ({ assurance, audit }) => deleteUserPermission(getDb(), ctx, data, assurance, audit)).catch(
			handleDomainError
		)
	})
