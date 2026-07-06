import { z } from "zod"

export const KitchenIdSchema = z.number().int().positive()
export type KitchenId = z.infer<typeof KitchenIdSchema>

export const DateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
	.refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" })
export type DateString = z.infer<typeof DateSchema>

export const DateRangeSchema = z.object({
	startDate: DateSchema,
	endDate: DateSchema,
})
export type DateRange = z.infer<typeof DateRangeSchema>

export const UuidSchema = z.string().uuid()
export type Uuid = z.infer<typeof UuidSchema>

/** Campos de endereço brasileiro compartilhados (cozinha + unidade). UF 2 letras, CEP máx. 9. */
export const AddressFieldsSchema = z.object({
	address_logradouro: z.string().nullable(),
	address_numero: z.string().nullable(),
	address_complemento: z.string().nullable(),
	address_bairro: z.string().nullable(),
	address_municipio: z.string().nullable(),
	address_uf: z.string().max(2, "UF deve ter 2 letras").nullable(),
	address_cep: z.string().max(9, "CEP inválido").nullable(),
})
export type AddressFields = z.infer<typeof AddressFieldsSchema>

export const PaginationSchema = z.object({
	page: z.number().int().optional(),
	pageSize: z.number().int().optional(),
})
export type Pagination = z.infer<typeof PaginationSchema>

export const SortOrderSchema = z.number().int().nonnegative().optional()
export type SortOrder = z.infer<typeof SortOrderSchema>

/**
 * Grupo canônico de uma preparação dentro de uma refeição. Ordem de declaração =
 * ordem de leitura no cardápio (prato principal → ... → sobremesa). null/ausente = sem grupo.
 */
export const MENU_ITEM_GROUPS = ["prato_principal", "acompanhamento", "guarnicao", "bebida", "sobremesa"] as const
export const MenuItemGroupSchema = z.enum(MENU_ITEM_GROUPS)
export type MenuItemGroup = z.infer<typeof MenuItemGroupSchema>

/** Proporção recomendada de consumo (%). Advisory — sem soma forçada dentro do grupo. */
export const RecommendedProportionSchema = z.number().min(0).max(100).optional()
export type RecommendedProportion = z.infer<typeof RecommendedProportionSchema>
