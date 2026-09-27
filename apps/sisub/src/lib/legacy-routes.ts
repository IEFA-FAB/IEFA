/**
 * Caminhos antigos → caminhos do glossário (change `sisub-ubiquitous-language`, D6).
 *
 * Rota renomeada não deixa arquivo de redirect na árvore: o caminho antigo entra aqui, e o
 * `beforeLoad` da raiz (`routes/__root.tsx`) redireciona antes de o router procurar a rota. A
 * raiz casa com qualquer URL, inclusive a que não existe mais, então favorito e link salvo
 * chegam no destino com os parâmetros e a query intactos.
 *
 * Cada entrada troca um PREFIXO de segmentos: `:nome` casa um segmento qualquer e é repetido no
 * destino; o que vier depois do prefixo (`/new`, `/<id>`, `/print/<id>`) segue igual. A entrada
 * fica um ciclo de deploy e sai no PR seguinte do lote; os próximos lotes acrescentam as suas.
 */
export const LEGACY_ROUTE_PREFIXES: readonly { from: string; to: string }[] = [
	// Lote 1: previsão de demanda, fases da despesa (Lei 4.320) e cardápio semanal modelo.
	{ from: "/kitchen/:kitchenId/suprimentos", to: "/kitchen/:kitchenId/demand-forecasts" },
	{ from: "/unit/:unitId/liquidations", to: "/unit/:unitId/liquidacoes" },
	{ from: "/unit/:unitId/payments", to: "/unit/:unitId/pagamentos" },
	{ from: "/global/weekly-plans", to: "/global/weekly-menus" },
]

const segmentsOf = (path: string) => path.split("/").filter(Boolean)

/**
 * Destino do caminho antigo, ou `null` quando o caminho não é antigo. Recebe e devolve só o
 * pathname: a query e o hash ficam com quem redireciona.
 */
export function resolveLegacyPath(pathname: string, prefixes: readonly { from: string; to: string }[] = LEGACY_ROUTE_PREFIXES): string | null {
	const segments = segmentsOf(pathname)
	for (const { from, to } of prefixes) {
		const pattern = segmentsOf(from)
		if (segments.length < pattern.length) continue
		const params = new Map<string, string>()
		const matches = pattern.every((part, i) => {
			const segment = segments[i] as string
			if (part.startsWith(":")) {
				params.set(part, segment)
				return true
			}
			return part === segment
		})
		if (!matches) continue
		const head = segmentsOf(to).map((part) => (part.startsWith(":") ? (params.get(part) ?? part) : part))
		return `/${[...head, ...segments.slice(pattern.length)].join("/")}`
	}
	return null
}
