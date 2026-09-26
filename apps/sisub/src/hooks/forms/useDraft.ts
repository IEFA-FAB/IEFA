import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { computeDraftChanges, type DraftChange, type DraftFields, isDraftValueEqual } from "@/lib/drafts/draft-diff"
import { type DraftEntry, draftStore } from "@/lib/drafts/draft-store"

/**
 * Rascunho local de um formulário com SALVAMENTO EXPLÍCITO — o caso das entidades
 * versionadas, em que cada Salvar grava uma versão (ver `docs/SAVE_BEHAVIOR.md`).
 *
 * - Guarda o estado em edição em `draftStore` enquanto ele difere do salvo; sair da tela
 *   e voltar restaura o rascunho (`onRestore`).
 * - Devolve a lista de alterações pendentes, que `PendingChanges` mostra ao lado do Salvar.
 * - Avisa no `beforeunload` enquanto há alteração: o rascunho mora em memória e morre no F5.
 * - `baseStamp` (ex.: `updated_at`) marca o rascunho como `stale` quando o registro mudou
 *   no servidor depois que a edição começou. O diff é SEMPRE contra o salvo atual, então a
 *   lista mostra exatamente o que o Salvar vai sobrescrever.
 *
 * Depois de salvar, chame `clear()` e redefina o baseline do formulário (`form.reset(values)`).
 */
export interface UseDraftOptions<T extends Record<string, unknown>> {
	/** `null` desliga o rascunho (ex.: modo preview de versão). */
	key: string | null
	title: string
	href?: string | null
	baseline: T
	current: T
	baseStamp?: string | null
	fields?: DraftFields<T>
	onRestore: (values: T) => void
}

export interface DraftState {
	changes: DraftChange[]
	isDirty: boolean
	/** Preenchido quando a tela abriu restaurando um rascunho. */
	restored: { savedAt: number; stale: boolean } | null
	clear: () => void
}

export function useDraft<T extends Record<string, unknown>>({
	key,
	title,
	href = null,
	baseline,
	current,
	baseStamp = null,
	fields,
	onRestore,
}: UseDraftOptions<T>): DraftState {
	const [restored, setRestored] = useState<DraftState["restored"]>(null)
	// Pula a gravação no mesmo commit da restauração: `current` ainda é o valor salvo
	// e apagaria o rascunho que acabou de ser aplicado.
	const skipPersist = useRef(false)

	// Os objetos chegam novos a cada render; a identidade que importa é a do conteúdo.
	const baselineJson = JSON.stringify(baseline)
	const currentJson = JSON.stringify(current)
	// biome-ignore lint/correctness/useExhaustiveDependencies: recalcula pelo conteúdo serializado, não pela referência
	const changes = useMemo(() => computeDraftChanges(baseline, current, fields), [baselineJson, currentJson])
	const isDirty = key != null && changes.length > 0

	// biome-ignore lint/correctness/useExhaustiveDependencies: restaura uma vez por chave; baseline/onRestore do primeiro render bastam
	useEffect(() => {
		setRestored(null)
		if (key == null) return
		const entry = draftStore.get<T>(key)
		if (!entry || isDraftValueEqual(entry.values, baseline)) return
		skipPersist.current = true
		onRestore(entry.values)
		setRestored({ savedAt: entry.savedAt, stale: entry.baseStamp != null && baseStamp != null && entry.baseStamp !== baseStamp })
	}, [key])

	// biome-ignore lint/correctness/useExhaustiveDependencies: grava pelo conteúdo serializado; título/href/stamp acompanham
	useEffect(() => {
		if (key == null) return
		if (skipPersist.current) {
			skipPersist.current = false
			return
		}
		if (changes.length === 0) {
			draftStore.delete(key)
			return
		}
		const existing = draftStore.get<T>(key)
		// Sem isto cada render regravaria o store, que notifica o indicador global, que
		// re-renderiza a tela: laço.
		if (existing && JSON.stringify(existing.values) === currentJson) return
		draftStore.set<T>({
			key,
			values: current,
			baseStamp: existing?.baseStamp ?? baseStamp,
			title,
			href,
			changeCount: changes.length,
			savedAt: Date.now(),
		})
	}, [key, currentJson, changes.length])

	useEffect(() => {
		if (!isDirty) return
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault()
			event.returnValue = ""
		}
		window.addEventListener("beforeunload", warn)
		return () => window.removeEventListener("beforeunload", warn)
	}, [isDirty])

	return {
		changes: key == null ? [] : changes,
		isDirty,
		restored,
		clear: () => {
			if (key != null) draftStore.delete(key)
			setRestored(null)
		},
	}
}

/** Todos os rascunhos abertos na aba — alimenta o indicador global. */
export function useOpenDrafts(): DraftEntry[] {
	return useSyncExternalStore(draftStore.subscribe, draftStore.list, () => EMPTY)
}

const EMPTY: DraftEntry[] = []
