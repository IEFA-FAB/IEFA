/**
 * @module legal.fn
 * Leitura dos documentos legais vigentes e registro de ciência do usuário.
 */

import {
	clientIpFromForwardedFor,
	fetchLegalDocument,
	LEGAL_DOC_TYPES,
	type LegalDocument,
	listPendingAcknowledgements,
	recordAcknowledgement,
} from "@iefa/legal-kit"
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { z } from "zod"
import { envServer } from "@/env.server"
import { requireUserId } from "@/lib/auth.server"

function connection() {
	return { url: envServer.VITE_ASSIGNMENT_SELECTION_SUPABASE_URL, secretKey: envServer.ASSIGNMENT_SELECTION_SUPABASE_SECRET_KEY }
}

const docTypeSchema = z.enum(LEGAL_DOC_TYPES)

export type { LegalDocument }

// Público por contrato: termos de uso, política de privacidade e política de cookies
// precisam ser legíveis por quem ainda não tem sessão.
// nosemgrep: server-fn-missing-auth-guard
export const fetchLegalDocumentFn = createServerFn({ method: "GET" })
	.validator(z.object({ docType: docTypeSchema, locale: z.string().default("pt-BR") }))
	.handler(({ data }) => fetchLegalDocument({ ...connection(), docType: data.docType, locale: data.locale }))

/**
 * Documentos vigentes ainda sem ciência registrada para o usuário da sessão.
 *
 * O id do usuário vem SEMPRE da sessão validada no servidor, nunca do input.
 * Aceitar um `userId` do cliente
 * transformaria a leitura num oráculo de quem leu o quê e, no par de escrita
 * abaixo, permitiria registrar ciência em nome de terceiro.
 */
export const listPendingLegalDocumentsFn = createServerFn({ method: "GET" }).handler(async () => {
	const userId = await requireUserId()
	const pending = await listPendingAcknowledgements({ ...connection(), userId })
	return pending.filter((entry) => entry.acknowledgedAt === null).map((entry) => entry.document)
})

export const acknowledgeLegalDocumentsFn = createServerFn({ method: "POST" })
	.validator(z.object({ documentIds: z.array(z.string().uuid()).min(1).max(LEGAL_DOC_TYPES.length) }))
	.handler(async ({ data }) => {
		const userId = await requireUserId()
		const request = getRequest()
		const accepted = await recordAcknowledgement({
			...connection(),
			userId,
			documentIds: data.documentIds,
			ipAddress: clientIpFromForwardedFor(request?.headers.get("x-forwarded-for")),
			userAgent: request?.headers.get("user-agent") ?? null,
		})
		return { accepted }
	})
