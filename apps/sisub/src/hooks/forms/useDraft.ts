import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { computeDraftChanges, type DraftChange, type DraftFields, isDraftValueEqual } from "@/lib/drafts/draft-diff"
import { type DraftEntry, draftStore } from "@/lib/drafts/draft-store"

/**
 * Rascunho local de um formulário com SALVAMENTO EXPLÍCITO — o caso das entidades
 * versionadas, em que cada Salvar grava uma versão (ver `docs/SAVE_BEHAVIOR.md`).
 *
 * - Guarda o estado em edição em `draftStore` enquanto ele difere do salvo; sair da tela
 *   e voltar restaura o rascunho (`onRestore`).
 * - Devolve a lista de alterações pendentes, que `PendingChanges` mostra ao lado do Salvar.
 * - O rascunho fica no armazenamento local (`draft-store`): F5, recarga automática e fechar o
 *   navegador não o apagam, então não há aviso de `beforeunload` — ele só incomodaria.
 * - `stale`: o registro salvo mudou depois que o rascunho começou (outra pessoa gravou). A
 *   assinatura padrão é o próprio baseline serializado — mudar algo que o formulário não
 *   edita (um item filho que gera versão, por exemplo) não conta. O diff é SEMPRE contra o
 *   salvo atual, então a lista mostra exatamente o que o Salvar vai sobrescrever.
 *
 * O componente que usa este hook deve ser remontado ao trocar de registro (`key` na rota):
 * a restauração roda uma vez por montagem.
 *
 * Depois de salvar, espere o baseline refletir o servidor (refetch) e só então chame
 * `clear()`/`discardDraft(key)` e redefina o formulário — na ordem inversa, o formulário
 * volta ao valor novo enquanto o baseline ainda é o antigo, e o rascunho renasce.
 */
export interface UseDraftOptions<T extends Record<string, unknown>> {
	/** `null` desliga o rascunho (ex.: modo preview de versão). */
	key: string | null
	title: string
	href?: string | null
	baseline: T
	current: T
	/**
	 * Assinatura própria do registro salvo. Padrão (`undefined`): o baseline serializado.
	 * `null` = ainda não se sabe (baseline carregando) — não acusa desatualizado.
	 */
	baseStamp?: string | null
	fields?: DraftFields<T>
	onRestore: (values: T) => void
}

export interface DraftState {
	changes: DraftChange[]
	isDirty: boolean
	/** O registro mudou no servidor depois que o rascunho começou. */
	stale: boolean
	/** Quando a tela abriu restaurando um rascunho, a hora em que ele foi gravado. */
	restoredAt: number | null
	clear: () => void
}

/** Apaga o rascunho de uma chave — para quem salva fora do componente que tem o hook. */
export function discardDraft(key: string) {
	draftStore.delete(key)
}

export function useDraft<T extends Record<string, unknown>>({
	key,
	title,
	href = null,
	baseline,
	current,
	baseStamp,
	fields,
	onRestore,
}: UseDraftOptions<T>): DraftState {
	const [restoredAt, setRestoredAt] = useState<number | null>(null)
	// Pula a gravação no mesmo commit da restauração: `current` ainda é o valor salvo
	// e apagaria o rascunho que acabou de ser aplicado.
	const skipPersist = useRef(false)

	const baselineJson = JSON.stringify(baseline)
	const currentJson = JSON.stringify(current)
	const stamp = baseStamp === undefined ? baselineJson : baseStamp
	// Sem memo de propósito: `format`/`expand` leem listas que carregam depois (pastas, itens
	// de compra); memorizado pelo conteúdo, o rótulo ficava preso ao "indisponível".
	const changes = key == null ? [] : computeDraftChanges(baseline, current, fields)
	const isDirty = changes.length > 0
	const entry = key == null ? undefined : draftStore.get<T>(key)
	const stale = isDirty && entry?.baseStamp != null && stamp != null && entry.baseStamp !== stamp

	// biome-ignore lint/correctness/useExhaustiveDependencies: restaura uma vez por chave; baseline/onRestore do primeiro render bastam
	useEffect(() => {
		setRestoredAt(null)
		if (key == null) return
		const saved = draftStore.get<T>(key)
		if (!saved || isDraftValueEqual(saved.values, baseline)) return
		skipPersist.current = true
		onRestore(saved.values)
		setRestoredAt(saved.savedAt)
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
		if (existing && existing.baseStamp != null && JSON.stringify(existing.values) === currentJson && existing.changeCount === changes.length) return
		draftStore.set<T>({
			key,
			values: current,
			baseStamp: existing?.baseStamp ?? stamp,
			title,
			href,
			changeCount: changes.length,
			savedAt: Date.now(),
		})
	}, [key, currentJson, baselineJson, changes.length])

	return {
		changes,
		isDirty,
		stale,
		restoredAt,
		clear: () => {
			if (key != null) draftStore.delete(key)
			setRestoredAt(null)
		},
	}
}

/** Todos os rascunhos abertos na aba — alimenta o indicador global. */
export function useOpenDrafts(): DraftEntry[] {
	return useSyncExternalStore(draftStore.subscribe, draftStore.list, () => EMPTY)
}

/**
 * Conjunto de chaves com rascunho. Só re-renderiza quando o CONJUNTO muda — as listas
 * de itens usam isto para o selo "Rascunho não salvo" sem re-renderizar a cada tecla.
 */
export function useDraftKeys(): Set<string> {
	const keys = useSyncExternalStore(draftStore.subscribe, draftStore.keys, () => "")
	return new Set(keys ? keys.split("\n") : [])
}

const EMPTY: DraftEntry[] = []
