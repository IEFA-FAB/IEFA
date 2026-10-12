import { useMemo, useState } from "react"

/**
 * Militares pulados na condução (ausentes na hora), por edição.
 *
 * Fica só na memória desta tela: não há coluna no banco, e o pulo é uma decisão do operador
 * sobre a fila deste controle, não um estado do militar no telão. Gravar no navegador
 * (`sessionStorage`) faria da chave um item novo do inventário da Política de Cookies, e o
 * ganho seria só sobreviver a um recarregamento: recarregou, o ausente volta a ser "o
 * próximo" e o operador pula de novo. Trocar de edição zera a lista.
 */
export function useSkipped(editionId: string | null) {
	const [state, setState] = useState<{ editionId: string | null; ids: number[] }>({ editionId, ids: [] })
	const ids = state.editionId === editionId ? state.ids : []

	const skipped = useMemo(() => new Set(ids), [ids])
	return {
		skipped,
		skip: (personId: number) => setState({ editionId, ids: [...ids.filter((id) => id !== personId), personId] }),
		unskip: (personId: number) => setState({ editionId, ids: ids.filter((id) => id !== personId) }),
	}
}
