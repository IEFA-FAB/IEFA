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

export const UuidSchema = z.uuid()
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
 * Chave do grupo de uma preparação dentro da refeição.
 *
 * Era um enum de cinco valores fixos, iguais para toda refeição — foi assim que
 * os pães do café acabaram em "acompanhamento" e os salgados da ceia em "prato
 * principal". Desde 20260922150000 o vocabulário é do CONJUNTO da refeição
 * (`kitchen.menu_group_set`), e a chave vale dentro dele: a mesma `bebida`
 * aparece em conjuntos diferentes, e o almoço ganhou `salada`.
 *
 * A validação aqui é de FORMA, não de pertencimento. Quem decide o que a tela
 * oferece é o conjunto; recusar na escrita uma chave fora dele transformaria
 * "este item ficou órfão depois que o conjunto mudou" em erro sem saída — hoje
 * ele aparece na coluna "Fora do conjunto" e se arrasta de volta. null/ausente
 * = sem grupo, e continua sendo o estado de item legado.
 */
export const MenuGroupKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, "chave de grupo inválida: use minúsculas, dígitos e _ (2 a 40 caracteres)")
export type MenuGroupKey = z.infer<typeof MenuGroupKeySchema>

/**
 * Teto da proporção (%). Acima de 100 é real: turma de curso de formação come mais que o per
 * capita médio (150% = uma porção e meia por comensal). O teto é só freio contra digitação —
 * 300 cabe no pior caso medido; o banco tem o mesmo limite (20260921192000).
 */
export const MAX_RECOMMENDED_PROPORTION = 300

/** Proporção recomendada de consumo (%). Advisory — sem soma forçada dentro do grupo. */
export const RecommendedProportionSchema = z.number().min(0).max(MAX_RECOMMENDED_PROPORTION).optional()
export type RecommendedProportion = z.infer<typeof RecommendedProportionSchema>

/**
 * Contexto explícito de uma edição: de QUAL tela ela partiu.
 *
 * Decide fork local vs. nova versão global e é obrigatório — sem default. Inferir da
 * permissão do usuário produziria comportamento dependente de quem ele é: alguém com
 * `global:2` **e** `kitchen:2` editando pela tela da cozinha alteraria o catálogo global
 * sem querer.
 */
export const EditScopeSchema = z.discriminatedUnion("scope", [
	z.object({ scope: z.literal("global") }),
	z.object({ scope: z.literal("kitchen"), kitchenId: KitchenIdSchema }),
])
export type EditScope = z.infer<typeof EditScopeSchema>
