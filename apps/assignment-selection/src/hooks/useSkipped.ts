import { useEffect, useMemo, useState } from "react"

/**
 * Militares pulados na condução (ausentes na hora), por edição.
 *
 * Fica no `sessionStorage`, não no banco: não há coluna para isso, e o pulo é uma decisão
 * do operador sobre a fila deste controle, não um estado do militar no telão. Sobrevive a
 * recarregar a página; outro notebook não vê, e isso é aceitável porque o pulado continua
 * à vista em "Ficaram para trás" e volta sozinho quando a fila acaba.
 */
const storageKey = (editionId: string) => `assignment-selection:skipped:${editionId}`

/** Lê o que está gravado; qualquer coisa que não seja lista de inteiros vira lista vazia. */
export function parseSkipped(raw: string | null): number[] {
	if (!raw) return []
	try {
		const value: unknown = JSON.parse(raw)
		return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : []
	} catch {
		return []
	}
}

function read(editionId: string | null): number[] {
	if (!editionId || typeof window === "undefined") return []
	return parseSkipped(window.sessionStorage.getItem(storageKey(editionId)))
}

export function useSkipped(editionId: string | null) {
	const [ids, setIds] = useState<number[]>([])

	// Carrega depois de montar: o servidor não tem `sessionStorage`, e ler no primeiro render
	// faria o HTML do SSR divergir do cliente.
	useEffect(() => {
		setIds(read(editionId))
	}, [editionId])

	const write = (next: number[]) => {
		setIds(next)
		if (editionId) window.sessionStorage.setItem(storageKey(editionId), JSON.stringify(next))
	}

	const skipped = useMemo(() => new Set(ids), [ids])
	return {
		skipped,
		skip: (personId: number) => write([...ids.filter((id) => id !== personId), personId]),
		unskip: (personId: number) => write(ids.filter((id) => id !== personId)),
	}
}
