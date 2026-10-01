import { createPromptNonce } from "@iefa/ai-provider/untrusted"
import type { DocumentInsert } from "@iefa/database/sucont"
import { createServerFn } from "@tanstack/react-start"
import { generateJson } from "#/lib/ai.server"
import { requireDivisionAccess } from "#/lib/auth.server"
import { adaptDraftInputSchema, buildDocumentPrompt } from "#/lib/document-prompt"
import { getSucontServerClient } from "#/lib/supabase.server"
import { analysisSchema, fabSchema } from "#/server/document-schemas"

// ── Tipos exportados (usados pelos componentes) ──────────────
export type { DocumentType } from "#/lib/document-prompt"

export interface FabDocumentData {
	organization: string
	subOrganization?: string
	documentNumber: string
	acronym: string
	year: string
	city: string
	date: string
	protocol: string
	sender: string
	recipient: string
	subject: string
	references?: string[]
	annexes?: string[]
	paragraphs: string[]
	signerName: string
	signerRank: string
	signerPosition: string
	urgency?: boolean
}

export interface DataAnalysisData {
	title: string
	subtitle: string
	author: string
	date: string
	summary: string
	keyMetrics: { label: string; value: string; trend: "up" | "down" | "neutral" }[]
	tableData: {
		headers: string[]
		rows: string[][]
	}
	analysis: string[]
	conclusion: string
	recommendations: string[]
}

// ── Server Function ──────────────────────────────────────────
export const adaptDraftFn = createServerFn({ method: "POST" })
	.validator(adaptDraftInputSchema)
	.handler(async ({ data }) => {
		// A Automação de Documentos é da SUCONT-4 — o fecho obrigatório do ofício é o
		// dela, e é o que `divisions` declara em `lib/data.ts`.
		const ctx = await requireDivisionAccess("sucont-4")
		const { draft, type } = data
		const isFab = type === "FAB_OFFICE"

		// Persona, regras e formato no `system`; o rascunho vai delimitado no `user`.
		const { system, user } = buildDocumentPrompt({ type, draft, nonce: createPromptNonce() })

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("O processamento demorou mais que o esperado (timeout). Tente com um rascunho mais curto.")), 60000)
		)

		const generated = await Promise.race([
			// Dono da chamada vem da sessão, nunca do input — é a chave dos tetos por usuário.
			generateJson<FabDocumentData | DataAnalysisData>({ userId: ctx.userId, system, user, schema: isFab ? fabSchema : analysisSchema }),
			timeoutPromise,
		])

		// Persiste no histórico de documentos da seção (não bloqueia o retorno em caso de falha).
		try {
			const title = isFab ? (generated as FabDocumentData).subject : (generated as DataAnalysisData).title
			// `generated` é um objeto validado; o cast satisfaz o tipo Json da coluna jsonb.
			const generatedJson = generated as unknown as DocumentInsert["generated"]
			await getSucontServerClient()
				.from("document")
				.insert({ type, title: title ?? null, draft, generated: generatedJson, created_by: ctx.userId })
		} catch {
			// histórico é acessório — falha não deve derrubar a geração.
		}

		return generated
	})
