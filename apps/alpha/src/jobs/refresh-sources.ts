/**
 * Rotina de atualização das fontes normativas.
 *
 * Roda agendada (semanal) e sob demanda. O passo que a torna útil não é
 * reindexar — é a **análise de impacto**: quando um dispositivo citado por uma
 * regra ativa muda de texto, a regra vai para `needs_review` e para de ser
 * aplicada. Sem isso, o verificador continuaria conferindo documentos contra
 * uma redação revogada, em silêncio, que é o pior modo de falha do sistema.
 */

import { supabase } from "../db/supabase.ts"
import type { LegalRef } from "../lib/legal-ref.ts"
import { canonicalRefLabel } from "../lib/ref-label.ts"
import { embedDocuments } from "../sources/embeddings.ts"
import { type IngestReport, ingestSource } from "../sources/pipeline.ts"
import { hasAdapter, listSources, resolveAdapter } from "../sources/registry.ts"

export interface ImpactResult {
	document_id: string
	changed_refs: string[]
	rules_flagged: number
}

export interface RefreshReport {
	sources: Array<{ source_id: string; skipped?: string; report?: IngestReport; error?: string }>
	impact: ImpactResult[]
}

interface NodeRow {
	ref_label: string | null
	body: string | null
}

async function loadDispositivos(documentId: string): Promise<Map<string, string>> {
	const { data, error } = await supabase.from("structure_node").select("ref_label, body").eq("document_id", documentId).not("ref_label", "is", null)

	if (error) throw new Error(`leitura de dispositivos falhou: ${error.message}`)

	const byLabel = new Map<string, string>()
	for (const node of (data ?? []) as NodeRow[]) {
		if (!node.ref_label) continue
		const key = canonicalRefLabel(node.ref_label)
		if (!byLabel.has(key)) byLabel.set(key, node.body ?? "")
	}
	return byLabel
}

/**
 * Compara a versão recém-ingerida com a que ela substituiu e marca as regras
 * afetadas.
 *
 * Dispositivo removido também conta como alterado: uma regra que cita artigo
 * revogado é tão inválida quanto uma que cita texto modificado.
 */
export async function analyzeImpact(newDocumentId: string, previousDocumentId: string): Promise<ImpactResult> {
	const [current, previous] = await Promise.all([loadDispositivos(newDocumentId), loadDispositivos(previousDocumentId)])

	const changed = new Set<string>()
	for (const [label, body] of previous) {
		const now = current.get(label)
		if (now === undefined || now !== body) changed.add(label)
	}

	if (changed.size === 0) return { document_id: newDocumentId, changed_refs: [], rules_flagged: 0 }

	const { data: rules, error } = await supabase.from("checklist_rule").select("id, legal_ref").eq("status", "active")
	if (error) throw new Error(`leitura de regras falhou: ${error.message}`)

	const affected = ((rules ?? []) as Array<{ id: string; legal_ref: LegalRef[] }>)
		.filter((rule) => (rule.legal_ref ?? []).some((ref) => changed.has(canonicalRefLabel(ref.dispositivo))))
		.map((rule) => rule.id)

	if (affected.length > 0) {
		const { error: updateError } = await supabase.from("checklist_rule").update({ status: "needs_review" }).in("id", affected)
		if (updateError) throw new Error(`marcação de regras falhou: ${updateError.message}`)
	}

	return { document_id: newDocumentId, changed_refs: [...changed], rules_flagged: affected.length }
}

async function previousVersionOf(sourceId: string, externalId: string, currentId: string): Promise<string | null> {
	const { data, error } = await supabase
		.from("document")
		.select("id")
		.eq("source_id", sourceId)
		.eq("external_id", externalId)
		.not("superseded_at", "is", null)
		.neq("id", currentId)
		.order("superseded_at", { ascending: false })
		.limit(1)
		.maybeSingle()

	if (error) throw new Error(`consulta da versão anterior falhou: ${error.message}`)
	return data?.id ?? null
}

export async function refreshAllSources(options: { apply?: boolean; onlySourceId?: string } = {}): Promise<RefreshReport> {
	const apply = options.apply ?? true
	const sources = (await listSources()).filter((source) => (options.onlySourceId ? source.id === options.onlySourceId : source.enabled))

	const report: RefreshReport = { sources: [], impact: [] }

	for (const source of sources) {
		if (!hasAdapter(source.id)) {
			report.sources.push({ source_id: source.id, skipped: "sem adapter registrado" })
			continue
		}

		try {
			const result = await ingestSource({ sourceId: source.id, adapter: resolveAdapter(source), embed: embedDocuments, apply })
			report.sources.push({ source_id: source.id, report: result })

			if (!apply) continue

			for (const item of result.items) {
				if (item.outcome !== "superseded") continue

				const { data: current } = await supabase
					.from("document")
					.select("id")
					.eq("source_id", source.id)
					.eq("external_id", item.external_id)
					.is("superseded_at", null)
					.maybeSingle()

				if (!current?.id) continue
				const previous = await previousVersionOf(source.id, item.external_id, current.id)
				if (previous) report.impact.push(await analyzeImpact(current.id, previous))
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			report.sources.push({ source_id: source.id, error: message })
			await supabase
				.from("normative_source")
				.update({ last_checked_at: new Date().toISOString(), last_error: message.slice(0, 500) })
				.eq("id", source.id)
		}
	}

	return report
}
