/**
 * @module email.server
 * Envio de e-mail transacional do journal (convite, decisão, lembrete).
 *
 * Renderiza os templates de `journal.email_templates` e despacha via Resend
 * QUANDO `RESEND_API_KEY` estiver definido no ambiente. Sem provider configurado,
 * a função é best-effort e não faz nada (a notificação in-app continua sendo a
 * entrega garantida). Nunca lança — falha de e-mail não pode derrubar o fluxo.
 *
 * SOMENTE server-side (usa a service key para ler templates).
 */

import { createClient } from "@supabase/supabase-js"
import { envServer } from "@/lib/env.server"

type TemplateName = "review_invitation" | "decision_made" | "review_reminder"

function journalDb() {
	return createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		db: { schema: "journal" },
		auth: { persistSession: false },
	})
}

/** Substituição simples de {{chave}} pelos valores fornecidos. */
function render(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => vars[key] ?? "")
}

const FROM = process.env.JOURNAL_EMAIL_FROM ?? "IEFA Journal <no-reply@iefa.fab.mil.br>"
const APP_URL = process.env.PORTAL_PUBLIC_URL ?? "https://iefa.fab.mil.br"

export interface SendJournalEmailInput {
	to: string
	template: TemplateName
	/** Idioma preferido do destinatário (default pt). */
	lang?: "pt" | "en"
	/** Variáveis substituídas no assunto/corpo do template. */
	vars?: Record<string, string>
}

/**
 * Envia um e-mail transacional. Retorna `true` se despachou, `false` se pulou
 * (sem provider configurado ou template ausente). Nunca lança.
 */
export async function sendJournalEmail(input: SendJournalEmailInput): Promise<boolean> {
	try {
		const apiKey = process.env.RESEND_API_KEY
		if (!apiKey) return false // sem provider — silenciosamente pula (in-app cobre)
		if (!input.to) return false

		const { data: template } = await journalDb()
			.from("email_templates")
			.select("subject_pt, subject_en, body_pt, body_en")
			.eq("name", input.template)
			.maybeSingle()
		if (!template) return false

		const lang = input.lang ?? "pt"
		const vars = { app_url: APP_URL, ...(input.vars ?? {}) }
		const subject = render(lang === "en" ? (template.subject_en ?? template.subject_pt) : template.subject_pt, vars)
		const body = render(lang === "en" ? (template.body_en ?? template.body_pt) : template.body_pt, vars)

		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({ from: FROM, to: input.to, subject, html: body }),
		})
		return res.ok
	} catch {
		return false
	}
}
