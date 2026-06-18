import { z } from "zod"

export const APP_MODULES = ["diner", "messhall", "unit", "kitchen", "kitchen-production", "global", "analytics", "local-analytics", "storage"] as const

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
})
export type CreateUserPermission = z.infer<typeof CreateUserPermissionSchema>

export const UpdateUserPermissionSchema = z.object({
	permissionId: z.string().min(1),
	level: z.number().int().min(0).max(2),
	mess_hall_id: z.number().nullable().optional(),
	kitchen_id: z.number().nullable().optional(),
	unit_id: z.number().nullable().optional(),
})
export type UpdateUserPermission = z.infer<typeof UpdateUserPermissionSchema>

export const DeleteUserPermissionSchema = z.object({ permissionId: z.string().min(1) })
export type DeleteUserPermission = z.infer<typeof DeleteUserPermissionSchema>
