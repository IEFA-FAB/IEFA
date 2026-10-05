import { z } from "zod"
import { UuidSchema } from "./common.ts"
import { OCCASION_TEMPLATE_TYPES } from "./templates.ts"

/**
 * Pastas do catálogo global de eventos e cardápios de apoio (`kitchen.menu_template_folder`).
 * Dois níveis: Padrão B → Coquetel; Lanche de Bordo → Classe A. A organização é da SDAB e não tem
 * regra: o sistema não deriva padrão, classe nem horário da pasta.
 */
export const MAX_TEMPLATE_FOLDER_DEPTH = 2

const FolderNameSchema = z.string().trim().min(1).max(120)
const FolderDescriptionSchema = z.string().trim().max(500)

export const OccasionTemplateTypeSchema = z.enum(OCCASION_TEMPLATE_TYPES)

export const ListTemplateFoldersSchema = z.object({
	templateType: OccasionTemplateTypeSchema.optional(),
})
export type ListTemplateFolders = z.infer<typeof ListTemplateFoldersSchema>

export const CreateTemplateFolderSchema = z.object({
	templateType: OccasionTemplateTypeSchema,
	/** Ausente = pasta raiz. */
	parentId: UuidSchema.optional(),
	name: FolderNameSchema,
	description: FolderDescriptionSchema.optional(),
})
export type CreateTemplateFolder = z.infer<typeof CreateTemplateFolderSchema>

export const UpdateTemplateFolderSchema = z.object({
	folderId: UuidSchema,
	name: FolderNameSchema.optional(),
	/** `null` limpa; ausente não mexe. */
	description: FolderDescriptionSchema.nullable().optional(),
})
export type UpdateTemplateFolder = z.infer<typeof UpdateTemplateFolderSchema>

/** Troca a pasta de lugar com a irmã vizinha (`-1` sobe, `1` desce). */
export const MoveTemplateFolderSchema = z.object({
	folderId: UuidSchema,
	delta: z.union([z.literal(-1), z.literal(1)]),
})
export type MoveTemplateFolder = z.infer<typeof MoveTemplateFolderSchema>

export const DeleteTemplateFolderSchema = z.object({
	folderId: UuidSchema,
})
export type DeleteTemplateFolder = z.infer<typeof DeleteTemplateFolderSchema>

/** Põe um modelo global numa pasta (`null` = sem pasta). */
export const SetTemplateFolderSchema = z.object({
	templateId: UuidSchema,
	folderId: UuidSchema.nullable(),
})
export type SetTemplateFolder = z.infer<typeof SetTemplateFolderSchema>
