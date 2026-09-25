/**
 * Conjuntos de grupos do cardápio ("templates de grupos").
 *
 * O grupo de uma preparação deixou de ser um vocabulário único (20260922150000):
 * cada refeição aponta para um conjunto, e a chave gravada em `item_group` vale
 * DENTRO daquele conjunto. Por isso a mesma chave aparece em conjuntos
 * diferentes — `bebida` está nos três — e por isso a validação de escrita é de
 * FORMA (a chave existe e é um slug), não de pertencimento: chave fora do
 * conjunto não é erro, é item para alguém recolocar. Recusar a escrita apagaria
 * a única pista de que ele existe.
 */

import { z } from "zod"
import { KitchenIdSchema, MenuGroupKeySchema, UuidSchema } from "./common.ts"

export const MenuGroupSchema = z.object({
	key: MenuGroupKeySchema,
	label: z.string().min(1).max(60),
})
export type MenuGroupInput = z.infer<typeof MenuGroupSchema>

export const FetchMenuGroupSetsSchema = z.object({
	kitchenId: KitchenIdSchema.nullable().optional(),
})
export type FetchMenuGroupSets = z.infer<typeof FetchMenuGroupSetsSchema>

export const CreateMenuGroupSetSchema = z.object({
	name: z.string().min(1).max(80),
	description: z.string().max(240).nullable().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
	sortOrder: z.number().int().nonnegative().optional(),
	/** Ordem do array = ordem de leitura das colunas. Chave repetida é recusada. */
	groups: z.array(MenuGroupSchema).min(1).max(20),
})
export type CreateMenuGroupSet = z.infer<typeof CreateMenuGroupSetSchema>

export const UpdateMenuGroupSetSchema = z.object({
	groupSetId: UuidSchema,
	name: z.string().min(1).max(80).optional(),
	description: z.string().max(240).nullable().optional(),
	sortOrder: z.number().int().nonnegative().optional(),
	/**
	 * Ausente = não mexe nos grupos. Presente = substitui a lista inteira, e é
	 * SÓ por isso que não aceita `null`: "o chamador não mexeu nos grupos" e
	 * "apague os grupos do conjunto" não podem ser a mesma coisa.
	 */
	groups: z.array(MenuGroupSchema).min(1).max(20).optional(),
})
export type UpdateMenuGroupSet = z.infer<typeof UpdateMenuGroupSetSchema>

export const DeleteMenuGroupSetSchema = z.object({
	groupSetId: UuidSchema,
})
export type DeleteMenuGroupSet = z.infer<typeof DeleteMenuGroupSetSchema>

/** Slug do conjunto que o editor usa quando a refeição não aponta para nenhum. */
export const DEFAULT_GROUP_SET_SLUG = "principal"

/**
 * Conjuntos globais semeados por 20260922150000, na ordem de leitura do cardápio.
 *
 * Espelha o seed da migration e é verificado contra ele em
 * `menu-groups.sql-contract.test.ts` — chave, rótulo e ordem. Serve também de
 * último recurso da interface (o conjunto `principal`) quando a busca no banco
 * não devolve conjunto nenhum: sem isso o editor abriria sem coluna alguma e o
 * cardápio pareceria vazio.
 */
export const DEFAULT_MENU_GROUP_SETS = [
	{
		slug: "principal",
		name: "Refeição principal",
		description: "Almoço e jantar: salada, prato principal, acompanhamento, guarnição, bebida e sobremesa.",
		groups: [
			{ key: "salada", label: "Salada" },
			{ key: "prato_principal", label: "Prato principal" },
			{ key: "acompanhamento", label: "Acompanhamento" },
			{ key: "guarnicao", label: "Guarnição" },
			{ key: "bebida", label: "Bebida" },
			{ key: "sobremesa", label: "Sobremesa" },
		],
	},
	{
		slug: "cafe",
		name: "Café da manhã",
		description: "Pães, frios e ovos, bolos e complementos, frutas e bebidas.",
		groups: [
			{ key: "pao", label: "Pães" },
			{ key: "proteina", label: "Frios e ovos" },
			{ key: "complemento", label: "Bolos e complementos" },
			{ key: "fruta", label: "Frutas" },
			{ key: "bebida", label: "Bebidas" },
		],
	},
	{
		slug: "ceia",
		name: "Ceia e lanches",
		description: "Lanche, complementos, frutas e bebidas — serve ceia, lanche de bordo e apoio.",
		groups: [
			{ key: "lanche", label: "Lanche" },
			{ key: "complemento", label: "Complementos" },
			{ key: "fruta", label: "Frutas" },
			{ key: "bebida", label: "Bebidas" },
		],
	},
] as const satisfies readonly { slug: string; name: string; description: string; groups: readonly MenuGroupInput[] }[]

/** Grupos do conjunto padrão — a lista que a interface usa quando não há conjunto. */
export const FALLBACK_MENU_GROUPS: readonly MenuGroupInput[] = DEFAULT_MENU_GROUP_SETS[0].groups

/**
 * Composição com que uma refeição de EVENTO nasce. Evento não é rotina: um coquetel tem
 * entradas e volantes, um jantar de gala tem entrada, prato principal e sobremesa. O editor
 * deixa renomear, reordenar e tirar qualquer um — isto só evita a refeição nascer sem coluna.
 */
export const DEFAULT_EVENT_MEAL_GROUPS: readonly MenuGroupInput[] = [
	{ key: "entrada", label: "Entradas" },
	{ key: "volante", label: "Volantes" },
	{ key: "prato_principal", label: "Prato principal" },
	{ key: "sobremesa", label: "Sobremesas" },
	{ key: "bebida", label: "Bebidas" },
]

/**
 * Grupos que o editor de evento oferece com um clique, além de digitar um novo. A chave é
 * estável por rótulo: "Volantes" de dois eventos cai na mesma coluna quando os dois são
 * aplicados no mesmo dia.
 */
export const EVENT_MEAL_GROUP_SUGGESTIONS: readonly MenuGroupInput[] = [
	...DEFAULT_EVENT_MEAL_GROUPS,
	{ key: "canape", label: "Canapés" },
	{ key: "salada", label: "Salada" },
	{ key: "guarnicao", label: "Guarnição" },
	{ key: "acompanhamento", label: "Acompanhamento" },
	{ key: "fruta", label: "Frutas" },
]
