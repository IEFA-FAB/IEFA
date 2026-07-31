/**
 * Seleção do modelo AGU aplicável a uma submissão.
 *
 * A escolha é por tipo de documento, natureza do objeto e categoria do modelo —
 * e só entre modelos **vigentes**. Se nada casar, a comparação estrutural não
 * roda e o motivo fica registrado: comparar contra um modelo qualquer produziria
 * um relatório pior do que não comparar.
 */

import { supabase } from "../db/supabase.ts"
import { normalizeTitle } from "../lib/text.ts"

export interface ModelCandidate {
	id: string
	title: string
	version_label: string | null
	source: string | null
}

export type ObjetoTipo = "COMPRAS" | "SERVICOS" | "OBRAS" | "TIC"

/** Palavras que identificam o modelo pelo título, por tipo de documento. */
const KIND_KEYWORDS: Record<string, string[]> = {
	TR: ["termo de referencia"],
	ETP: ["estudo tecnico preliminar"],
	EDITAL: ["edital"],
}

/** Palavras que identificam a natureza do objeto no título do modelo. */
const OBJETO_KEYWORDS: Record<ObjetoTipo, string[]> = {
	COMPRAS: ["compras"],
	SERVICOS: ["servicos"],
	OBRAS: ["obras"],
	TIC: ["tic"],
}

export interface ModelSelection {
	model: ModelCandidate | null
	reason?: "nenhum_modelo_para_o_tipo" | "nenhum_modelo_vigente"
}

export async function selectApplicableModel(docKind: string, objeto: ObjetoTipo | null): Promise<ModelSelection> {
	const { data, error } = await supabase.from("document").select("id, title, version_label, source").eq("document_type", "MODELO_AGU").is("superseded_at", null)

	if (error) throw new Error(`consulta de modelos falhou: ${error.message}`)

	const candidates = (data ?? []) as ModelCandidate[]
	if (candidates.length === 0) return { model: null, reason: "nenhum_modelo_vigente" }

	const kindWords = KIND_KEYWORDS[docKind] ?? []
	const byKind = candidates.filter((candidate) => kindWords.some((word) => normalizeTitle(candidate.title).includes(word)))

	if (byKind.length === 0) return { model: null, reason: "nenhum_modelo_para_o_tipo" }
	if (byKind.length === 1 || !objeto) return { model: byKind[0] }

	// Entre modelos do mesmo tipo, o que menciona a natureza do objeto ganha;
	// sem menção, fica o primeiro — determinístico pela ordem de título.
	const byObjeto = byKind.filter((candidate) => OBJETO_KEYWORDS[objeto].some((word) => normalizeTitle(candidate.title).includes(word)))

	const sorted = (byObjeto.length > 0 ? byObjeto : byKind).sort((left, right) => left.title.localeCompare(right.title))
	return { model: sorted[0] }
}
