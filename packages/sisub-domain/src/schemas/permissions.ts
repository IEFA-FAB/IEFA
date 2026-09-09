import { z } from "zod"

/**
 * Prazo de validade de uma concessão: instante ISO 8601, ou `null` para "nunca expira".
 *
 * `null` TEM significado — é o valor gravado na coluna e o que LIMPA um prazo existente.
 * `undefined` (campo ausente) é "não mexe", e é por isso que `updateUserPermission`
 * ramifica em `!== undefined` em vez de usar `?? null`: um cliente antigo, que não conhece
 * o campo, não pode apagar o prazo de ninguém só por omiti-lo.
 *
 * Data no passado é ACEITA de propósito: é a forma de encerrar um acesso agora, e o
 * console a mostra como expirada. Recusá-la só trocaria uma operação legítima por um erro.
 */
export const AccessExpirySchema = z.iso.datetime({ offset: true }).nullable()

export const APP_MODULES = ["diner", "messhall", "unit", "kitchen", "kitchen-production", "global", "admin", "analytics", "local-analytics", "storage"] as const

export const FetchUserPermissionsSchema = z.object({ userId: z.string().min(1) })
export type FetchUserPermissions = z.infer<typeof FetchUserPermissionsSchema>

export const SearchUsersByEmailSchema = z.object({ email: z.string().min(1) })
export type SearchUsersByEmail = z.infer<typeof SearchUsersByEmailSchema>

export const FetchUserPermissionsAdminSchema = z.object({ userId: z.string().min(1) })
export type FetchUserPermissionsAdmin = z.infer<typeof FetchUserPermissionsAdminSchema>

export const CreateUserPermissionSchema = z.object({
	userId: z.string().min(1),
	module: z.enum(APP_MODULES),
	level: z.number().int().min(0).max(2),
	mess_hall_id: z.number().nullable().optional(),
	kitchen_id: z.number().nullable().optional(),
	unit_id: z.number().nullable().optional(),
	/** Ausente ou `null` = grant permanente. */
	expires_at: AccessExpirySchema.optional(),
})
export type CreateUserPermission = z.infer<typeof CreateUserPermissionSchema>

export const UpdateUserPermissionSchema = z.object({
	permissionId: z.string().min(1),
	level: z.number().int().min(0).max(2),
	mess_hall_id: z.number().nullable().optional(),
	kitchen_id: z.number().nullable().optional(),
	unit_id: z.number().nullable().optional(),
	/** `undefined` = não mexe no prazo; `null` = torna o grant permanente. */
	expires_at: AccessExpirySchema.optional(),
})
export type UpdateUserPermission = z.infer<typeof UpdateUserPermissionSchema>

export const DeleteUserPermissionSchema = z.object({ permissionId: z.string().min(1) })
export type DeleteUserPermission = z.infer<typeof DeleteUserPermissionSchema>
