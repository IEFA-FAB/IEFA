import { useNavigate, useSearch } from "@tanstack/react-router"
import { useSucontAccess } from "#/auth/pbac"
import { resolveDivision } from "#/lib/modules"
import { ALL_STAGES, type StageFilter, type SucontDivision } from "#/lib/types"

export interface HubFilters {
	query: string
	stage: StageFilter
	/** Questão do RAC (1–39), ou `null` para nenhuma. */
	rac: number | null
	/** Divisão da SUCONT em que se está. Nunca nula: sem `?divisao=` vale o padrão. */
	division: SucontDivision
	/** Módulo(s) que um guard de rota negou, ou `null`. Ver `?denied=` na raiz. */
	denied: string | null
	/** Dispensa o aviso de negativa, tirando `?denied=` da URL. */
	dismissDenied: () => void
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
	const { permissions } = useSucontAccess()

	const query = search.q ?? ""
	const stage = (search.etapa ?? ALL_STAGES) as StageFilter
	// `z.coerce` na raiz já entrega número; `NaN` de um valor inválido vira null.
	const racRaw = search.rac
	const rac = typeof racRaw === "number" && Number.isFinite(racRaw) ? racRaw : null
	// A divisão pedida na URL só vale se o usuário a alcança; senão, a primeira
	// acessível. Sem isso, tanto a ausência de `?divisao=` quanto um `?divisao=` de
	// outra divisão abriam um catálogo que o usuário não pode usar.
	const division = resolveDivision(permissions, search.divisao)

	return {
		query,
		stage,
		rac,
		division,
		denied: typeof search.denied === "string" && search.denied !== "" ? search.denied : null,
		// `replace`, e não push: o aviso não é um lugar a que se volte com o botão
		// "voltar" do navegador.
		dismissDenied: () => {
			navigate({ to: ".", search: (prev) => ({ ...prev, denied: undefined }), replace: true })
		},
		isFiltered: query.trim() !== "" || stage !== ALL_STAGES || rac !== null,
		// Todo setter apaga o `denied` junto: ele fala da navegação que foi barrada, não
		// do recorte que se monta agora. Sem isso o aviso ficava pregado na tela pelo
		// resto da sessão e viajava em qualquer link copiado dali.
		setQuery: (value) => {
			navigate({ to: ".", search: (prev) => ({ ...prev, q: value.trim() === "" ? undefined : value, denied: undefined }), replace: true })
		},
		// Etapa e questão filtram o catálogo: escolher a partir de outra tela leva para ele.
		setStage: (value) => {
			navigate({ to: "/", search: (prev) => ({ ...prev, etapa: value === ALL_STAGES ? undefined : value, denied: undefined }) })
		},
		setRac: (value) => {
			navigate({ to: "/", search: (prev) => ({ ...prev, rac: value ?? undefined, denied: undefined }) })
		},
		// A divisão sobrevive ao "limpar": ela não é filtro, é o módulo em que se está.
		// Zerá-la aqui jogaria o usuário da SUCONT-3 para o catálogo da SUCONT-4 sem
		// que ele tivesse trocado de módulo.
		clear: () => {
			navigate({ to: ".", search: (prev) => ({ ...prev, q: undefined, etapa: undefined, rac: undefined, denied: undefined }), replace: true })
		},
	}
}
