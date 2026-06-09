import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Estado de UI persistido em `sessionStorage` (sobrevive à navegação dentro da
 * aba, é descartado ao fechá-la). SSR-safe: hidrata via efeito após o mount,
 * evitando mismatch de hidratação.
 *
 * Use para preservar filtros/toggles/seleções quando o usuário entra em uma
 * página de detalhe e volta — sem isso o componente remonta e o estado some.
 */

const memoryFallback = new Map<string, string>()

function readStore(key: string): string | null {
	try {
		return window.sessionStorage.getItem(key)
	} catch {
		return memoryFallback.has(key) ? (memoryFallback.get(key) as string) : null
	}
}

function writeStore(key: string, value: string): void {
	try {
		window.sessionStorage.setItem(key, value)
	} catch {
		memoryFallback.set(key, value)
	}
}

export interface PersistMeta {
	/** `true` após resolver a leitura do storage (sempre via efeito pós-mount). */
	hydrated: boolean
	/** `true` quando havia um valor salvo no storage (distingue "salvo vazio" do default). */
	hadStored: boolean
}

export interface PersistOptions<T> {
	serialize?: (value: T) => string
	deserialize?: (raw: string) => T
}

export function usePersistentState<T>(
	/** Chave do storage. `null` desativa a persistência (comporta-se como `useState`). */
	key: string | null,
	defaultValue: T,
	options?: PersistOptions<T>
): [T, (value: T | ((prev: T) => T)) => void, PersistMeta] {
	const serialize = options?.serialize ?? (JSON.stringify as (value: T) => string)
	const deserialize = options?.deserialize ?? (JSON.parse as (raw: string) => T)

	const [state, setState] = useState<T>(defaultValue)
	const [meta, setMeta] = useState<PersistMeta>({ hydrated: false, hadStored: false })

	// Mantém key/serialize atuais sem recriar o setter.
	const keyRef = useRef(key)
	keyRef.current = key
	const serializeRef = useRef(serialize)
	serializeRef.current = serialize
	const deserializeRef = useRef(deserialize)
	deserializeRef.current = deserialize

	// Hidrata do storage após o mount (não durante o render → sem mismatch de SSR).
	useEffect(() => {
		if (key == null) {
			setMeta({ hydrated: true, hadStored: false })
			return
		}
		const raw = readStore(key)
		if (raw !== null) {
			try {
				setState(deserializeRef.current(raw))
				setMeta({ hydrated: true, hadStored: true })
				return
			} catch {
				// valor corrompido → cai para o default
			}
		}
		setMeta({ hydrated: true, hadStored: false })
	}, [key])

	const set = useCallback((value: T | ((prev: T) => T)) => {
		setState((prev) => {
			const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value
			const k = keyRef.current
			if (k != null) writeStore(k, serializeRef.current(next))
			return next
		})
	}, [])

	return [state, set, meta]
}
