import type { PcaItem } from "@iefa/sisub-domain/pncp-pca"

/**
 * @module pncp-pca-sync/reconcile
 * Regras puras da reconciliação de snapshot. Sem banco e sem rede — o worker aplica, o teste
 * exercita direto.
 *
 * O CSV é o plano **completo** do par órgão/ano. Isso obriga duas coisas que upsert-merge não
 * faz:
 *
 *  1. **O que sumiu do arquivo precisa ser marcado como removido.** Item retirado do plano
 *     ficaria no acervo para sempre, inflando a demanda planejada em silêncio.
 *  2. **Reconciliar só sobre arquivo comprovadamente completo.** A origem responde
 *     `Content-Length: None` (chunked), então arquivo truncado é indistinguível de arquivo
 *     curto. Sem guarda, uma conexão cortada marcaria o plano inteiro como removido.
 */

/** Queda relativa de volume acima da qual a reconciliação é abortada por suspeita de truncamento. */
export const MAX_SHRINK_RATIO = 0.5

export interface SnapshotGuardInput {
	incomingRows: number
	/** Linhas vivas no acervo para o mesmo par órgão/ano. `0` na primeira coleta. */
	knownRows: number
}

export type SnapshotGuardVerdict = { ok: true } | { ok: false; reason: string }

/**
 * Decide se é seguro reconciliar. Primeira coleta sempre passa; arquivo vazio nunca passa
 * (seria "apagar tudo"); queda acima de `MAX_SHRINK_RATIO` é tratada como suspeita.
 */
export function checkSnapshotSanity({ incomingRows, knownRows }: SnapshotGuardInput): SnapshotGuardVerdict {
	if (incomingRows <= 0) {
		return { ok: false, reason: "arquivo sem nenhuma linha aproveitável — recusado para não marcar o plano inteiro como removido" }
	}
	if (knownRows === 0) return { ok: true }

	const shrink = (knownRows - incomingRows) / knownRows
	if (shrink > MAX_SHRINK_RATIO) {
		const pct = Math.round(shrink * 100)
		return {
			ok: false,
			reason: `queda anômala de volume: ${knownRows} → ${incomingRows} linhas (−${pct}%), acima do limite de ${Math.round(MAX_SHRINK_RATIO * 100)}%`,
		}
	}
	return { ok: true }
}

export interface ReconcilePlan {
	/** Ids presentes no arquivo — inseridos ou atualizados. */
	upsertIds: string[]
	/** Ids que estavam vivos no acervo e sumiram do arquivo — recebem `removed_at`. */
	removeIds: string[]
	/** Ids que estavam marcados como removidos e voltaram ao plano — `removed_at` volta a null. */
	restoreIds: string[]
}

export interface ReconcileInput {
	incoming: readonly Pick<PcaItem, "idItemPca">[]
	/** Estado atual do acervo para o par órgão/ano. */
	known: readonly { idItemPca: string; removed: boolean }[]
}

/**
 * Compara o arquivo novo com o acervo e devolve o que fazer. Não toca em banco: quem aplica é o
 * worker, numa transação.
 */
export function planReconciliation({ incoming, known }: ReconcileInput): ReconcilePlan {
	const incomingIds = new Set(incoming.map((i) => i.idItemPca))
	const upsertIds = [...incomingIds]

	const removeIds: string[] = []
	const restoreIds: string[] = []

	for (const row of known) {
		const present = incomingIds.has(row.idItemPca)
		if (!present && !row.removed) removeIds.push(row.idItemPca)
		if (present && row.removed) restoreIds.push(row.idItemPca)
	}

	return { upsertIds, removeIds, restoreIds }
}

/** SHA-256 hex do conteúdo, para invalidação: a origem não envia ETag nem Last-Modified. */
export async function contentHash(content: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}
