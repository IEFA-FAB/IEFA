import { useNavigate, useSearch } from "@tanstack/react-router"
import type { ToolStage } from "#/lib/types"

/** Etapa sentinela: nenhuma filtragem, mostra o catálogo inteiro. */
export const ALL_STAGES = "todas" as const

export type StageFilter = ToolStage | typeof ALL_STAGES

export interface HubFilters {
	query: string
	stage: StageFilter
	/** Questão do RAC (5–43), ou `null` para nenhuma. */
	rac: number | null
	isFiltered: boolean
	setQuery: (value: string) => void
	setStage: (value: StageFilter) => void
	setRac: (value: number | null) => void
	clear: () => void
}

/**
 * Filtros do hub, na URL (`?q=`, `?etapa=`, `?rac=`) — ver o `validateSearch` da
 * rota raiz. Link de filtro é compartilhável e sobrevive ao F5.
 *
 * A **etapa** substituiu a categoria antiga: "Auditoria"/"Automação"/"IA" diziam o
 * que a ferramenta é por dentro, e o analista chega ao hub sabendo em que ponto do
 * trabalho está, não que gênero de tela quer.
 *
 * A **questão do RAC** é o escopo — o mesmo papel que `kitchen`/`unit` têm no
 * sisub: a coisa do mundo real sobre a qual se trabalha. Quem persegue a Q34 acha
 * a ferramenta pelo número, sem precisar saber que ela se chama "Subitens
 * Genéricos".
 */
export function useHubFilters(): HubFilters {
	const search = useSearch({ strict: false })
	const navigate = useNavigate()

	const query = search.q ?? ""
	const stage = (search.etapa ?? ALL_STAGES) as StageFilter
	// `z.coerce` na raiz já entrega número; `NaN` de um valor inválido vira null.
	const racRaw = search.rac
	const rac = typeof racRaw === "number" && Number.isFinite(racRaw) ? racRaw : null

	return {
		query,
		stage,
		rac,
		isFiltered: query.trim() !== "" || stage !== ALL_STAGES || rac !== null,
		setQuery: (value) => {
			navigate({ to: ".", search: (prev) => ({ ...prev, q: value.trim() === "" ? undefined : value }), replace: true })
		},
		// Etapa e questão filtram o catálogo: escolher a partir de outra tela leva para ele.
		setStage: (value) => {
			navigate({ to: "/", search: (prev) => ({ ...prev, etapa: value === ALL_STAGES ? undefined : value }) })
		},
		setRac: (value) => {
			navigate({ to: "/", search: (prev) => ({ ...prev, rac: value ?? undefined }) })
		},
		clear: () => {
			navigate({ to: ".", search: (prev) => ({ ...prev, q: undefined, etapa: undefined, rac: undefined }), replace: true })
		},
	}
}
