/**
 * @module security-email.server
 * Aviso de segurança por e-mail — entrega ADICIONAL, declaradamente best-effort (D16).
 *
 * ## O canal garantido é o banco, não este arquivo
 *
 * O sisub não tem e-mail transacional. O único do monorepo é
 * `apps/portal/src/lib/journal/email.server.ts` (Resend), e o cabeçalho dele já diz o que
 * este também é: sem provider configurado, a função não faz nada. Prometer aviso por e-mail
 * a cada remoção de segundo fator criaria uma garantia de detecção que falha em silêncio —
 * pior do que não prometer.
 *
 * Por isso: quem registra o evento é `access_control.mfa_reset_log` +
 * `access_control.sensitive_operation_log`, gravados ANTES de a resposta voltar. O e-mail
 * vem depois, nunca lança, e **nunca** é condição para a operação concluir. A ausência de
 * provider aparece em `capabilities.server.ts` (`securityEmail: false`) em vez de sumir.
 *
 * ## Por que a mensagem é montada em código, e não lida de uma tabela
 *
 * O journal lê `journal.email_templates` porque tem meia dúzia de mensagens em duas línguas,
 * editáveis por quem não mexe no repo. Aqui são dois avisos de segurança, em português, cujo
 * texto é parte do controle — mudá-los sem revisão é mudar o que o titular é avisado que
 * aconteceu com a conta dele. Template em banco seria uma superfície a mais para um texto
 * que deve mudar por PR.
 *
 * SOMENTE server-side (lê `process.env`). Nunca importe de código client-side.
 *
 * @domain app
 */

import { LEGAL_CONTACT_EMAIL } from "@iefa/legal-kit/contact"

/** Avisos que este módulo sabe montar. */
export type SecurityNoticeKind =
	/** O titular usou um código de recuperação e ficou sem segundo fator. */
	| "mfa-removed-by-recovery-code"
	/** Um administrador removeu o segundo fator do titular (etapa 7 do plano). */
	| "mfa-removed-by-admin"
	/** Uma chave de API do MCP está perto de vencer — aviso PRÉVIO, nunca posterior. */
	| "mcp-key-expiring"

/** Dados que só o aviso de chave a vencer precisa. */
export type McpKeyExpiringDetails = { label: string; expiresAt: Date }

/**
 * `true` quando há provider de e-mail configurado.
 *
 * Lido de `process.env` direto, e não de `env.server.ts`, pelo mesmo motivo das capacidades
 * de IA: o schema de env valida no carregamento do módulo, e uma variável OPCIONAL declarada
 * lá viraria mais um jeito de o boot quebrar por causa de um fluxo que não é essencial.
 */
export function isSecurityEmailConfigured(): boolean {
	return Boolean(process.env.SISUB_RESEND_API_KEY)
}

const FROM = process.env.SISUB_SECURITY_EMAIL_FROM ?? `SISUB <${LEGAL_CONTACT_EMAIL}>`

const PUBLIC_URL = (process.env.SISUB_PUBLIC_URL ?? "https://sisub.iefa.com.br").replace(/\/+$/, "")

/** Endereço da tela de segurança, para o titular agir se não foi ele. */
const SECURITY_URL = `${PUBLIC_URL}/diner/security`

/** Endereço da tela de chaves de API, para o titular renovar a que vai vencer. */
const MCP_KEYS_URL = `${PUBLIC_URL}/diner/mcp-keys`

function formatMoment(at: Date): string {
	return at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
}

function buildNotice(kind: SecurityNoticeKind, at: Date, details?: McpKeyExpiringDetails): { subject: string; body: string } {
	const moment = formatMoment(at)
	const footer =
		`<p>Se não foi você, entre em contato imediatamente com ${LEGAL_CONTACT_EMAIL} e troque sua senha.</p>` +
		`<p><a href="${SECURITY_URL}">Segurança da conta</a></p>`

	if (kind === "mcp-key-expiring") {
		// Único aviso deste módulo que fala de algo que AINDA NÃO aconteceu: os outros dois
		// informam um fato consumado, este existe para que o vencimento não seja surpresa. Por
		// isso não leva o rodapé de "se não foi você" — não houve ação de ninguém a contestar.
		return {
			subject: "SISUB — sua chave de API do MCP está perto de vencer",
			body:
				`<p>A chave de API <strong>${details?.label ?? "sem nome"}</strong> vence em ` +
				`${details ? formatMoment(details.expiresAt) : "breve"}.</p>` +
				`<p>Depois dessa data o cliente MCP para de autenticar. Gere uma nova chave em ` +
				`<a href="${MCP_KEYS_URL}">Chaves de API (MCP)</a> e substitua a configuração do cliente.</p>` +
				`<p>Se você não usa mais essa chave, não precisa fazer nada — ela deixará de valer sozinha.</p>`,
		}
	}

	if (kind === "mfa-removed-by-admin") {
		return {
			subject: "SISUB — seu segundo fator foi removido por um administrador",
			body:
				`<p>Em ${moment}, um administrador removeu a verificação em duas etapas da sua conta no SISUB ` +
				`e nenhuma sessão sua continua com a verificação em duas etapas válida.</p><p>Cadastre um novo dispositivo no próximo acesso.</p>${footer}`,
		}
	}

	return {
		subject: "SISUB — um código de recuperação foi utilizado na sua conta",
		body:
			`<p>Em ${moment}, um código de recuperação foi utilizado na sua conta do SISUB. ` +
			`A verificação em duas etapas foi removida e precisa ser cadastrada novamente.</p>${footer}`,
	}
}

export type SendSecurityNoticeInput = {
	/** Endereço do TITULAR, lido da sessão ou do cadastro — nunca do payload do cliente. */
	to: string | null | undefined
	kind: SecurityNoticeKind
	/** Quando o evento aconteceu. Default: agora. */
	at?: Date
	/** Só para `mcp-key-expiring`: qual chave, e até quando ela vale. */
	details?: McpKeyExpiringDetails
}

/**
 * Tenta avisar o titular. Devolve `true` se despachou, `false` se pulou ou falhou.
 *
 * **Nunca lança.** O chamador trata o retorno como informação (`emailNotified` na resposta),
 * não como erro: a operação já concluiu e já está registrada quando isto roda.
 */
export async function sendSecurityNotice(input: SendSecurityNoticeInput): Promise<boolean> {
	try {
		const apiKey = process.env.SISUB_RESEND_API_KEY
		if (!apiKey || !input.to) return false

		const { subject, body } = buildNotice(input.kind, input.at ?? new Date(), input.details)
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({ from: FROM, to: input.to, subject, html: body }),
			// Deadline explícito: este envio roda DEPOIS de a operação concluir e de os dois
			// registros estarem gravados, mas ainda dentro da requisição. Sem prazo, um provider
			// lento seguraria a resposta de uma recuperação de conta já feita — o mesmo formato
			// de defeito dos deadlines de fetch do `@iefa/supabase-kit`.
			signal: AbortSignal.timeout(5000),
		})
		return response.ok
	} catch {
		// Provider fora do ar não pode derrubar uma recuperação de conta já concluída e
		// registrada. A indisponibilidade CONFIGURADA (sem chave) é a que aparece em
		// `capabilities`; esta aqui é transitória e o log em banco já cobre o evento.
		return false
	}
}
