import { z } from "zod"

/** OM (`core.units.id`), o eixo de escopo do SISPROV. */
export const unitIdSchema = z.number().int().positive()

/** Paginação das listagens: toda lista limitada diz de quantos é recorte (`total`). */
export const paginationSchema = z.object({
	limit: z.number().int().min(1).max(200).default(50),
	offset: z.number().int().min(0).default(0),
})

export type Pagination = z.infer<typeof paginationSchema>
