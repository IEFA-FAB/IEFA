import { z } from "zod"

/** Grupos e categorias válidos como filtro na busca de uniformes. */
export const GRUPOS = ["historicos", "representacao", "servicos", "educacao_fisica", "desfile"] as const
export const CATEGORIAS = ["oficiais", "cadetes", "suboficiais", "sargentos", "alunos_formacao", "pracas"] as const

export const SORT_OPTIONS = [
	{ value: "ordem", label: "Ordem padrão" },
	{ value: "numero", label: "Número do uniforme" },
	{ value: "art", label: "Art. de referência" },
	{ value: "nome", label: "Nome (A–Z)" },
	{ value: "grupo", label: "Grupo" },
] as const

export type SortKey = (typeof SORT_OPTIONS)[number]["value"]

export const SORT_LABELS = Object.fromEntries(SORT_OPTIONS.map((o) => [o.value, o.label])) as Record<SortKey, string>

/** Estado de busca/filtro — vive nos search params da home (`/`). */
export const uniformSearchSchema = z.object({
	grupo: z.enum(GRUPOS).optional(),
	categoria: z.enum(CATEGORIAS).optional(),
	q: z.string().optional(),
	sort: z.enum(["ordem", "numero", "art", "nome", "grupo"]).optional(),
	dir: z.enum(["asc", "desc"]).optional(),
})

export type UniformSearch = z.infer<typeof uniformSearchSchema>
