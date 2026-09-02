/**
 * @module documents-ai.fn
 * Redação assistida das comunicações oficiais (NSCA 5-3/2026, Anexo I).
 *
 * Duas decisões que moldam tudo aqui:
 *
 * 1. **O modelo escreve texto, não identidade.** Assunto, parágrafos, referências e
 *    anexos vêm dele; numeração, NUP, OM, data e signatário não. Número de ofício
 *    inventado é erro que só aparece depois do despacho, quando já virou expediente.
 * 2. **Documento classificado não vai para provider nenhum.** Grau de sigilo diferente
 *    de ostensivo é recusado antes de qualquer chamada, e a recusa fica registrada.
 */

import { createServerFn } from "@tanstack/react-start"
import { setResponseStatus } from "@tanstack/react-start/server"
import { z } from "zod"
import { generateJson } from "@/lib/ai.server"
import { requireUserId } from "@/lib/auth.server"
import { type DocumentKind, findKind } from "@/lib/comaer/catalog"
import { KIND_CATALOG, NORM_RULES } from "@/lib/comaer/prompt"
import { type AiProposal, AiProposalSchema } from "@/lib/comaer/schema"
import { getDocumentsServerClient } from "@/lib/supabase.server"
import { aiProposalJsonSchema } from "./documents-ai.schema"

const SYSTEM = `${NORM_RULES}

${KIND_CATALOG}`

function buildPrompt(kind: DocumentKind, scope: string, mode: "redigir" | "revisar", draft: string): string {
	const context = [
		`Espécie escolhida no formulário: ${kind.id} — ${kind.label} (${kind.legalBasis}). Troque-a se o rascunho pedir outra, e diga qual no campo "especie".`,
		`Âmbito escolhido no formulário: ${scope === "externo" ? "externo ao COMAER" : scope === "comaer" ? "entre Organizações Militares do COMAER" : "interno à própria Organização Militar"}. Troque-o se o rascunho indicar outro.`,
		kind.suggestedOpening ? `O primeiro parágrafo deve começar por "${kind.suggestedOpening.trim()}".` : "",
		kind.numberedParagraphs ? "" : "Esta espécie não numera parágrafos; escreva texto corrido em parágrafos distintos.",
	]
		.filter(Boolean)
		.join("\n")

	const task =
		mode === "redigir"
			? "Redija o texto do documento a partir das anotações abaixo."
			: "Revise o texto abaixo para a norma: corrija tom, impessoalidade e estrutura, preserve TODOS os fatos, números e datas, e não acrescente informação que não esteja no original."

	return `${context}\n\n${task}\n\n---\n${draft}\n---`
}

/**
 * Trilha da geração. Nunca derruba a resposta — mas registra também a FALHA e a recusa
 * por sigilo, que é o que torna auditável a afirmação de que documento classificado não
 * foi submetido a provider.
 */
async function recordGeneration(entry: { userId: string; mode: string; kind: string; draft: string; result?: AiProposal; error?: string }): Promise<void> {
	try {
		await getDocumentsServerClient()
			.from("ai_generation")
			.insert({
				owner_id: entry.userId,
				mode: entry.mode,
				kind: entry.kind,
				draft: entry.draft,
				result: entry.result ?? null,
				error: entry.error ?? null,
			})
	} catch {
		// Trilha é acessória: perdê-la não pode custar ao usuário o texto já gerado.
	}
}

export const draftWithAiFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			draft: z.string().trim().min(10, "Escreva ao menos uma frase para a IA trabalhar.").max(8000),
			kind: z.string(),
			scope: z.enum(["interno-om", "comaer", "externo"]),
			classification: z.enum(["ostensivo", "reservado", "secreto", "ultrassecreto"]),
			mode: z.enum(["redigir", "revisar"]),
		})
	)
	.handler(async ({ data }): Promise<AiProposal> => {
		// Dono da chamada vem da sessão: é ele que chaveia os tetos de consumo e o registro.
		const userId = await requireUserId()

		const kind = findKind(data.kind)
		if (!kind) {
			setResponseStatus(422)
			throw new Error(`Espécie desconhecida: ${data.kind}`)
		}

		if (data.classification !== "ostensivo") {
			await recordGeneration({ userId, mode: data.mode, kind: data.kind, draft: data.draft, error: `recusado: sigilo ${data.classification}` })
			setResponseStatus(422)
			throw new Error("Documento classificado não é enviado a provider de IA. Redija o texto manualmente (art. 7º § 2º e normas de salvaguarda).")
		}

		try {
			const raw = await generateJson<unknown>({
				userId,
				system: SYSTEM,
				user: buildPrompt(kind, data.scope, data.mode, data.draft),
				schema: aiProposalJsonSchema,
			})
			const result = AiProposalSchema.parse(raw)
			await recordGeneration({ userId, mode: data.mode, kind: data.kind, draft: data.draft, result })
			return result
		} catch (error) {
			const message = error instanceof Error ? error.message : "Falha desconhecida na geração."
			await recordGeneration({ userId, mode: data.mode, kind: data.kind, draft: data.draft, error: message })
			throw error
		}
	})
