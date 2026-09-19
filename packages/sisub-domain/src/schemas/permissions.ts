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

/**
 * Módulos que só existem SEM escopo: `admin` (gestão de acesso) e `global` (catálogo da SDAB)
 * valem para a FAB inteira, e toda checagem deles é sem escopo — `requirePermission(ctx,
 * "admin", 2)`.
 *
 * Só que consulta sem escopo ACEITA grant escopado (`hasPermission`: "consulta sem escopo aceita
 * qualquer escopo concedido" — é o que abre a rota do módulo a quem tem uma cozinha). Então um
 * `admin` concedido "só para a unidade 5" passaria em toda checagem de admin como se fosse
 * pleno: o escopo não recorta nada, só engana quem concede. Recusar na concessão é o único
 * lugar em que isso fecha sem mexer na semântica de todas as outras checagens.
 */
export const UNSCOPED_ONLY_MODULES = ["admin", "global"] as const

type ScopeFields = { unit_id?: number | null; kitchen_id?: number | null; mess_hall_id?: number | null }

/** Mensagem de recusa quando `module` não aceita escopo e `scope` traz um — senão `null`. */
export function unscopedModuleViolation(module: string, scope: ScopeFields): string | null {
	if (!(UNSCOPED_ONLY_MODULES as readonly string[]).includes(module)) return null
	const scoped = [scope.unit_id, scope.kitchen_id, scope.mess_hall_id].some((id) => id != null)
	return scoped ? `O módulo "${module}" vale para toda a FAB e não aceita escopo de unidade, cozinha ou refeitório` : null
}

export const FetchUserPermissionsSchema = z.object({ userId: z.string().min(1) })
export type FetchUserPermissions = z.infer<typeof FetchUserPermissionsSchema>

export const SearchUsersByEmailSchema = z.object({ email: z.string().min(1) })
export type SearchUsersByEmail = z.infer<typeof SearchUsersByEmailSchema>

export const FetchUserPermissionsAdminSchema = z.object({ userId: z.string().min(1) })
export type FetchUserPermissionsAdmin = z.infer<typeof FetchUserPermissionsAdminSchema>

/** Campos do grant, antes da regra entre eles — separados para o `.superRefine` não esconder a forma. */
const CreateUserPermissionFieldsSchema = z.object({
	userId: z.string().min(1),
	module: z.enum(APP_MODULES),
	level: z.number().int().min(0).max(2),
	mess_hall_id: z.number().nullable().optional(),
	kitchen_id: z.number().nullable().optional(),
	unit_id: z.number().nullable().optional(),
	/** Ausente ou `null` = grant permanente. */
	expires_at: AccessExpirySchema.optional(),
})

export const CreateUserPermissionSchema = CreateUserPermissionFieldsSchema.superRefine((value, ctx) => {
	const violation = unscopedModuleViolation(value.module, value)
	if (violation) ctx.addIssue({ code: "custom", message: violation, path: ["module"] })
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
