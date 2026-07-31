/**
 * Resolução de referência legal contra o corpus ingerido.
 *
 * É o guard de citação do verificador: um achado que cita dispositivo
 * inexistente é descartado antes de virar `compliance_finding`. O modo de falha
 * que isso previne não é deixar passar uma inconformidade — é **apontar uma
 * inconformidade citando artigo que não existe**, que queima a confiança do ACI
 * de forma irrecuperável.
 */

import { supabase } from "../db/supabase.ts"
import type { LegalRef } from "../lib/legal-ref.ts"
import { canonicalRefLabel, parseNormaIdentity } from "../lib/ref-label.ts"

export interface ResolvedRef extends LegalRef {
	resolved: true
	document_id: string
	node_id: string
	ref_label: string
}

export interface UnresolvedRef extends LegalRef {
	resolved: false
	reason: "norma_ausente" | "dispositivo_ausente"
}

export type RefResolution = ResolvedRef | UnresolvedRef

interface NormaIndex {
	documentId: string
	byLabel: Map<string, string>
}

/**
 * Índice de dispositivos por norma, carregado uma vez por execução.
 *
 * Resolver dispositivo a dispositivo com ida ao banco tornaria a verificação
 * proporcional ao número de achados; o corpus inteiro de uma norma cabe em
 * memória (a Lei 14.133 tem ~1.500 dispositivos).
 */
export class LegalRefResolver {
	private readonly cache = new Map<string, NormaIndex | null>()

	private async loadNorma(norma: string): Promise<NormaIndex | null> {
		const cached = this.cache.get(norma)
		if (cached !== undefined) return cached

		const { data: documents, error } = await supabase
			.from("document")
			.select("id, title")
			.is("superseded_at", null)
			.in("document_type", ["LEI", "DECRETO", "IN_SEGES"])

		if (error) throw new Error(`consulta de normas falhou: ${error.message}`)

		const wanted = parseNormaIdentity(norma)
		const match = wanted
			? (documents ?? []).find((document: { id: string; title: string }) => {
					const title = canonicalRefLabel(document.title)
					return title.includes(wanted.numero) && title.includes(wanted.ano)
				})
			: undefined

		if (!match) {
			this.cache.set(norma, null)
			return null
		}

		const { data: nodes, error: nodesError } = await supabase
			.from("structure_node")
			.select("id, ref_label")
			.eq("document_id", match.id)
			.not("ref_label", "is", null)

		if (nodesError) throw new Error(`consulta de dispositivos falhou: ${nodesError.message}`)

		const byLabel = new Map<string, string>()
		for (const node of (nodes ?? []) as Array<{ id: string; ref_label: string }>) {
			const key = canonicalRefLabel(node.ref_label)
			// Primeira ocorrência vence: incisos repetidos entre blocos de um mesmo
			// artigo apontam para o mesmo dispositivo do ponto de vista da citação.
			if (!byLabel.has(key)) byLabel.set(key, node.id)
		}

		const index = { documentId: match.id, byLabel }
		this.cache.set(norma, index)
		return index
	}

	async resolve(ref: LegalRef): Promise<RefResolution> {
		const norma = await this.loadNorma(ref.norma)
		if (!norma) return { ...ref, resolved: false, reason: "norma_ausente" }

		const key = canonicalRefLabel(ref.dispositivo)
		const nodeId = norma.byLabel.get(key)
		if (!nodeId) return { ...ref, resolved: false, reason: "dispositivo_ausente" }

		return { ...ref, resolved: true, document_id: norma.documentId, node_id: nodeId, ref_label: ref.dispositivo }
	}

	async resolveAll(refs: LegalRef[]): Promise<RefResolution[]> {
		const resolutions: RefResolution[] = []
		for (const ref of refs) resolutions.push(await this.resolve(ref))
		return resolutions
	}
}

export { canonicalRefLabel, parseNormaIdentity }
