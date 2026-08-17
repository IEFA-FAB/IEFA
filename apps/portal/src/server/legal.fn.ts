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
import { getRequest, setResponseStatus } from "@tanstack/react-start/server"
import { z } from "zod"
import { envServer } from "@/lib/env.server"
import { getIefaAuthClient } from "@/lib/supabase.server"

function connection() {
	return { url: envServer.VITE_IEFA_SUPABASE_URL, secretKey: envServer.IEFA_SUPABASE_SECRET_KEY }
}

const docTypeSchema = z.enum(LEGAL_DOC_TYPES)

export type { LegalDocument }

/** Id da sessão validada no servidor. O cliente nunca informa de quem é a ciência. */
async function requireUserId(): Promise<string> {
	const {
		data: { user },
	} = await getIefaAuthClient().auth.getUser()
	if (!user) {
		setResponseStatus(401)
		throw new Error("UNAUTHORIZED")
	}
	return user.id
}

// Público por contrato: termos de uso, política de privacidade e política de cookies.
// nosemgrep: server-fn-missing-auth-guard
export const fetchLegalDocumentFn = createServerFn({ method: "GET" })
	.validator(z.object({ docType: docTypeSchema, locale: z.string().default("pt-BR") }))
	.handler(({ data }) => fetchLegalDocument({ ...connection(), docType: data.docType, locale: data.locale }))

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
