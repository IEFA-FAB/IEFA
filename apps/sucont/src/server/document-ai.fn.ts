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

/**
 * Prazo da geração, ABAIXO do `idle_timeout` de 60 s do ALB compartilhado
 * (`infra/foundation/alb.tf`). Esta server function não manda byte nenhum até terminar:
 * com o prazo igual ao do ALB (era 60 s), o balanceador cortava primeiro e o usuário via
 * um 504 em vez da mensagem abaixo. Os 10 s de folga cobrem a gravação do histórico e a
 * volta da resposta. O caminho de documento mediu 16–22 s com o opus-4-6
 * (`AI-PROVIDERS.md`, bench de 2026-08-21). Se a geração passar a encostar neste prazo, o
 * caminho é SSE com keep-alive, como `routes/api/sacdgc/analyze.post.ts`, não subir o número.
 */
const GENERATION_DEADLINE_MS = 50_000

const TIMEOUT_MESSAGE = "O processamento demorou mais que o esperado (timeout). Tente com um rascunho mais curto."

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

		// O prazo ABORTA a chamada no provider. Um `Promise.race` só com o timer parava de
		// esperar e deixava o modelo gerando até o fim, contando no teto do usuário por uma
		// resposta que ninguém ia ler.
		const generation = new AbortController()
		const deadline = setTimeout(() => generation.abort(), GENERATION_DEADLINE_MS)
		// O race com o abort garante o prazo mesmo se um adapter de reserva ignorar o signal.
		const timedOut = new Promise<never>((_, reject) => {
			generation.signal.addEventListener("abort", () => reject(new Error(TIMEOUT_MESSAGE)), { once: true })
		})

		let generated: FabDocumentData | DataAnalysisData
		try {
			generated = await Promise.race([
				// Dono da chamada vem da sessão, nunca do input — é a chave dos tetos por usuário.
				generateJson<FabDocumentData | DataAnalysisData>({
					userId: ctx.userId,
					system,
					user,
					schema: isFab ? fabSchema : analysisSchema,
					abortController: generation,
				}),
				timedOut,
			])
		} catch (error) {
			// O abort também rejeita a chamada do adapter ("Request aborted"): a mensagem que
			// chega à tela é a do prazo, não a do SDK.
			if (generation.signal.aborted) throw new Error(TIMEOUT_MESSAGE)
			throw error
		} finally {
			clearTimeout(deadline)
		}

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
