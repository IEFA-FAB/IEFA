import { z } from "zod"
import { CIRCULO_ORDER, GENERO_ORDER, GRUPO_ORDER } from "@/lib/uniforms/labels"

/** Grupos e categorias válidos como filtro na busca de uniformes. */
// Deriva de GRUPO_ORDER (fonte única) para não divergir de labels.ts.
export const GRUPOS = GRUPO_ORDER
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

/**
 * Campo de texto vindo da URL. O parser de search params do TanStack converte
 * `?q=5` em NÚMERO, e um `z.string()` cru rejeita isso — a home inteira caía no
 * erro de rota em cima da busca mais comum do catálogo ("5", "11"). Só quebrava
 * ao abrir/recarregar o link (navegando por dentro o valor já é string), que é
 * justamente o caso de link compartilhado.
 */
const urlText = z.preprocess((v) => (v == null || v === "" ? undefined : String(v)), z.string().optional())

/** Estado de busca/filtro — vive nos search params da home (`/`). */
export const uniformSearchSchema = z.object({
	grupo: z.enum(GRUPOS).optional(),
	categoria: z.enum(CATEGORIAS).optional(),
	q: urlText,
	sort: z.enum(["ordem", "numero", "art", "nome", "grupo"]).optional(),
	dir: z.enum(["asc", "desc"]).optional(),
})

export type UniformSearch = z.infer<typeof uniformSearchSchema>

/**
 * Estado da tela de detalhe (`/uniformes/$id`). Mora na URL, não em `useState`:
 * é o que a pessoa quer compartilhar — "o 5º A feminino de sargentos com capa"
 * é um link, não uma sequência de cliques. Tudo opcional; o que faltar cai no
 * padrão do catálogo (oficiais, masculino) em `resolveVariantSelection`.
 */
export const uniformViewSchema = z.object({
	circulo: z.enum(CIRCULO_ORDER).optional(),
	genero: z.enum(GENERO_ORDER).optional(),
	/** Sub-variação (`gestante`, `tropa_montada`…); ausente = variação padrão. */
	sub: urlText,
	/** Peça cuja imagem alternativa está ativa; ausente = imagem base da variante. */
	look: urlText,
})

export type UniformView = z.infer<typeof uniformViewSchema>
