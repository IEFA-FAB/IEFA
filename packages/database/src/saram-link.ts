/**
 * @module saram-link
 * Contrato do vínculo de SARAM verificado (change `saram-verified-link`, migration 20261003100000)
 * e a leitura dele em linguagem simples.
 *
 * ## Por que mora aqui
 *
 * `core.saram_link_status` e as mutações da própria conta devolvem `jsonb`. Quem o lê: o domínio do
 * sisub (Drizzle), o sucont (RPC) e o rumaer (RPC). Este é o único pacote que os três já importam
 * sem mudar o grafo de deploy (`apps.manifest.json` resolve as dependências de cada app). Um
 * parser por app divergiria; uma frase por app também: a pessoa que usa o sisub e o sucont leria
 * dois nomes para o mesmo estado.
 *
 * ## O que a tela pode e não pode dizer
 *
 * Os valores do contrato (`legacy`, `institucional`, `email`/`cpf`/`admin`) nunca aparecem: a
 * frase diz o que aconteceu e o que fazer. Os candidatos só trazem posto, nome de guerra e OM (o
 * banco não manda SARAM, CPF nem nome completo deles).
 *
 * Puro: sem React, sem banco, sem relógio implícito (o `now` é parâmetro).
 */

// ── Contrato ────────────────────────────────────────────────────────────────

/** Tipo de conta: valor de domínio, não se traduz. */
export type SaramAccountKind = "pessoal" | "institucional"

export type SaramVerification = "email" | "cpf" | "admin" | "legacy"

export type SaramLinkStatusName =
	| "verified"
	| "legacy"
	| "institutional"
	| "pending_request"
	| "contested"
	| "suggestion"
	| "homonyms"
	| "locked_out"
	| "no_match"

export type SaramLinkAction = "confirm_candidate" | "verify_cpf" | "request_link" | "set_institutional" | "set_personal" | "withdraw_request"

export type EmailEligibility = "eligible" | "domain" | "unconfirmed" | "no_key"

export type MilitaryIdentitySummary = { posto: string | null; nomeGuerra: string | null; sgOrg: string | null }

/** Candidato da chave do e-mail. `ref` é opaco: nunca o SARAM. */
export type SaramCandidate = MilitaryIdentitySummary & { ref: number; heldByOther: boolean; holderVerified: boolean }

export type SaramLinkRequestSummary = {
	id: string
	kind: "link" | "dispute"
	saram: string
	justification: string
	createdAt: string
	claimVerifiedBy: "email" | "cpf" | null
}

export type SaramStatus = {
	status: SaramLinkStatusName
	accountKind: SaramAccountKind
	/** SARAM vinculado (verificado ou legacy); `null` sem vínculo. */
	saram: string | null
	verifiedBy: SaramVerification | null
	verifiedAt: string | null
	/** A conta vê os próprios dados militares (`identity`). */
	visible: boolean
	identity: MilitaryIdentitySummary | null
	/** Há um SARAM gravado fora do fluxo verificado (formulário antigo): não vale até verificar. */
	hasUnverifiedSaram: boolean
	request: SaramLinkRequestSummary | null
	candidates: SaramCandidate[]
	requiresCpfSuffix: boolean
	emailEligibility: EmailEligibility
	/** Bloqueio de tentativas DA CONTA (o de um SARAM aparece só no resultado da tentativa). */
	lockedUntil: string | null
	/** Tentativas que restam na janela de 1 hora. */
	attemptsLeft: number
	actions: SaramLinkAction[]
}

export type SaramLinkOutcomeName = "linked" | "disputed" | "mismatch" | "locked" | "requested" | "withdrawn" | "pending" | "unchanged" | "changed"

/** Efeito de virar institucional (`core.apply_institutional_account`). */
export type AccountKindEffects = { previousSaram: string | null; withdrawnRequests: number; cancelledArranchamentos: number }

export type SaramLinkOutcome = {
	outcome: SaramLinkOutcomeName
	/** `mismatch`: tentativas restantes na janela de 1 hora. */
	attemptsLeft: number | null
	/** `locked`/`mismatch`: até quando a verificação está bloqueada. */
	lockedUntil: string | null
	/** `requested`/`disputed`: o pedido aberto. */
	requestId: string | null
	/** O legacy conferiu o próprio número por CPF. */
	upgraded: boolean
	/** `changed` para institucional: o que saiu junto. */
	effects: AccountKindEffects | null
	status: SaramStatus
}

const STATUS_NAMES: readonly SaramLinkStatusName[] = [
	"verified",
	"legacy",
	"institutional",
	"pending_request",
	"contested",
	"suggestion",
	"homonyms",
	"locked_out",
	"no_match",
]
const ACTIONS: readonly SaramLinkAction[] = ["confirm_candidate", "verify_cpf", "request_link", "set_institutional", "set_personal", "withdraw_request"]
const VERIFICATIONS: readonly SaramVerification[] = ["email", "cpf", "admin", "legacy"]
const ELIGIBILITIES: readonly EmailEligibility[] = ["eligible", "domain", "unconfirmed", "no_key"]
const OUTCOMES: readonly SaramLinkOutcomeName[] = ["linked", "disputed", "mismatch", "locked", "requested", "withdrawn", "pending", "unchanged", "changed"]

const str = (v: unknown): string | null => (v == null ? null : String(v))
const bool = (v: unknown): boolean => v === true || v === "true"
const oneOf = <T extends string>(allowed: readonly T[], v: unknown): T | null =>
	typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null
const record = (v: unknown): Record<string, unknown> => {
	const parsed = typeof v === "string" ? safeJson(v) : v
	return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
}

function safeJson(v: string): unknown {
	try {
		return JSON.parse(v)
	} catch {
		return null
	}
}

function toIdentity(v: unknown): MilitaryIdentitySummary | null {
	if (!v || typeof v !== "object") return null
	const o = v as Record<string, unknown>
	return { posto: str(o.posto), nomeGuerra: str(o.nome_guerra), sgOrg: str(o.sg_org) }
}

/**
 * `jsonb` de `core.saram_link_status` → `SaramStatus`. Valor fora do contrato cai no estado mais
 * conservador: sem vínculo (`no_match`), sem ação desconhecida, sem dado visível.
 */
export function parseSaramStatus(raw: unknown): SaramStatus {
	const o = record(raw)
	const request = o.request && typeof o.request === "object" ? (o.request as Record<string, unknown>) : null
	const candidates = Array.isArray(o.candidates) ? (o.candidates as Array<Record<string, unknown>>) : []
	return {
		status: oneOf(STATUS_NAMES, o.status) ?? "no_match",
		accountKind: o.account_kind === "institucional" ? "institucional" : "pessoal",
		saram: str(o.saram),
		verifiedBy: oneOf(VERIFICATIONS, o.verified_by),
		verifiedAt: str(o.verified_at),
		visible: bool(o.visible),
		identity: toIdentity(o.identity),
		hasUnverifiedSaram: bool(o.has_unverified_saram),
		request: request
			? {
					id: String(request.id),
					kind: request.kind === "dispute" ? "dispute" : "link",
					saram: String(request.saram ?? ""),
					justification: String(request.justification ?? ""),
					createdAt: String(request.created_at ?? ""),
					claimVerifiedBy: oneOf(["email", "cpf"] as const, request.claim_verified_by),
				}
			: null,
		candidates: candidates.map((c) => ({
			ref: Number(c.ref),
			posto: str(c.posto),
			nomeGuerra: str(c.nome_guerra),
			sgOrg: str(c.sg_org),
			heldByOther: bool(c.held_by_other),
			holderVerified: bool(c.holder_verified),
		})),
		requiresCpfSuffix: bool(o.requires_cpf_suffix),
		emailEligibility: oneOf(ELIGIBILITIES, o.email_eligibility) ?? "domain",
		lockedUntil: str(o.locked_until),
		attemptsLeft: Number(o.attempts_left ?? 0),
		actions: Array.isArray(o.actions) ? o.actions.flatMap((a) => (oneOf(ACTIONS, a) ? [a as SaramLinkAction] : [])) : [],
	}
}

/** `jsonb` das mutações da própria conta (`{ outcome, …, status }`) → `SaramLinkOutcome`. */
export function parseSaramOutcome(raw: unknown): SaramLinkOutcome {
	const o = record(raw)
	const effects = o.effects && typeof o.effects === "object" ? (o.effects as Record<string, unknown>) : null
	return {
		outcome: oneOf(OUTCOMES, o.outcome) ?? "unchanged",
		attemptsLeft: o.attempts_left == null ? null : Number(o.attempts_left),
		lockedUntil: str(o.locked_until),
		requestId: str(o.request_id),
		upgraded: bool(o.upgraded),
		effects: effects
			? {
					previousSaram: str(effects.previous),
					withdrawnRequests: Number(effects.withdrawn_requests ?? 0),
					cancelledArranchamentos: Number(effects.cancelled_arranchamentos ?? 0),
				}
			: null,
		status: parseSaramStatus(o.status),
	}
}

/**
 * O SARAM que a conta pode mostrar como identidade — espelho de `core.visible_saram` para quem lê
 * `core.user_data` pelo client tipado (console de acessos do sucont): conta pessoal com vínculo
 * verificado (`email`/`cpf`/`admin`), ou `legacy` sem o mesmo SARAM verificado em outra conta.
 * SARAM gravado fora do fluxo verificado, pedido pendente e conta de seção não identificam ninguém.
 */
export function visibleSaramOf(
	row: { saram: string | null; saram_verified_by: string | null; account_kind: string | null },
	verifiedElsewhere: (saram: string) => boolean
): string | null {
	const saram = row.saram?.trim() || null
	if (!saram || row.account_kind === "institucional") return null
	if (row.saram_verified_by === "email" || row.saram_verified_by === "cpf" || row.saram_verified_by === "admin") return saram
	if (row.saram_verified_by === "legacy" && !verifiedElsewhere(saram)) return saram
	return null
}

// ── Erros estáveis das funções → frase com o próximo passo ──────────────────

const ADMIN_HELP = "Se precisar de ajuda, procure a administração do sistema."

/**
 * Frase de cada erro estável das funções `core.*` do vínculo. O domínio do sisub e o sucont leem
 * daqui: a mesma recusa diz a mesma coisa nos dois apps. Toda frase diz o que fazer em seguida.
 */
export const SARAM_ERROR_MESSAGES = {
	SARAM_INVALID: "O SARAM tem 6 ou 7 dígitos. Confira o número e tente de novo.",
	CPF_INVALID: "O CPF tem 11 dígitos. Confira o número e tente de novo.",
	CPF_SUFFIX_INVALID: "Informe os 4 últimos dígitos do seu CPF.",
	JUSTIFICATION_INVALID: "Explique o pedido em 10 a 1000 caracteres.",
	ACCOUNT_KIND_INVALID: "Tipo de conta inválido. Atualize a página e tente de novo.",
	DECISION_INVALID: "Decisão inválida. Atualize a página e tente de novo.",
	NOTE_REQUIRED: "Informe o motivo (mínimo de 10 caracteres).",
	ACCOUNT_INSTITUTIONAL: "Esta conta está marcada como conta de seção e não tem SARAM. Se ela é de uma pessoa, marque-a como pessoal antes.",
	SARAM_ALREADY_LINKED: "Esta conta já tem SARAM vinculado. Para trocá-lo, procure a administração do sistema.",
	SARAM_LOCKED: "O SARAM já está vinculado à sua conta e não pode ser alterado por aqui. Para corrigi-lo, procure a administração do sistema.",
	REQUEST_PENDING: "Você já tem um pedido de vínculo em análise. Desista dele antes de fazer outro.",
	REQUEST_LIMIT: `Limite de pedidos de vínculo atingido (5 por dia). Tente amanhã. ${ADMIN_HELP}`,
	EMAIL_NOT_ELIGIBLE: "A identificação automática só vale para e-mail @fab.mil.br confirmado. Use o SARAM e o CPF, ou peça o vínculo à administração.",
	SARAM_TAKEN: "Este SARAM está verificado em outra conta. Desvincule-o lá antes, ou decida pela contestação.",
	SARAM_LINK_CHANGED: "O vínculo desta conta mudou desde que a tela foi aberta. Atualize e confira de novo.",
	ACCOUNT_KIND_CHANGED: "O tipo desta conta mudou desde que a tela foi aberta. Atualize e confira de novo.",
	REQUEST_NOT_PENDING: "Este pedido já foi decidido ou retirado. Atualize a fila.",
	REQUEST_NOT_FOUND: "Este pedido não está mais em análise (já foi decidido ou retirado). A tela foi atualizada.",
	ACCOUNT_INSTITUTIONAL_NO_MEALS: "Conta de seção não se arrancha nem registra presença. Quem vai comer usa a própria conta.",
	SARAM_LINK_OUTSIDE_FUNCTION: `O banco recusou uma mudança de vínculo fora do caminho verificado. ${ADMIN_HELP}`,
	USER_DATA_NOT_FOUND: `Sua conta ainda não está no cadastro de pessoas. ${ADMIN_HELP}`,
	CANDIDATE_NOT_FOUND: "A sugestão mudou (o cadastro de pessoal foi atualizado). A tela foi atualizada: confira de novo.",
} as const satisfies Record<string, string>

export type SaramErrorToken = keyof typeof SARAM_ERROR_MESSAGES

export const SARAM_FALLBACK_ERROR_MESSAGE = "Não foi possível concluir agora. Tente de novo em instantes; se continuar, procure a administração do sistema."

/** Token cru do banco (ou mensagem já traduzida) → frase. Desconhecido não vai cru para a tela. */
export function saramErrorMessage(raw: string | null | undefined): string {
	const token = (raw ?? "").trim()
	if (token in SARAM_ERROR_MESSAGES) return SARAM_ERROR_MESSAGES[token as SaramErrorToken]
	return SARAM_FALLBACK_ERROR_MESSAGE
}

// ── Leitura em linguagem simples ────────────────────────────────────────────

/** Tom visual do estado: decide ícone e cor semântica na tela, nunca a cor sozinha. */
export type SaramTone = "ok" | "info" | "attention" | "blocked"

export type SaramStatusView = {
	tone: SaramTone
	/** Rótulo curto (selo). */
	badge: string
	title: string
	description: string
	/** Há algo que a pessoa pode (ou deve acompanhar) fazer: o aviso de entrada aparece. */
	needsAttention: boolean
	/** Texto do aviso não bloqueante e o rótulo do botão que leva à ação. */
	notice: { text: string; cta: string } | null
}

/** Estados que pedem ação (ou acompanhamento) da pessoa: o aviso de entrada aparece. */
const ATTENTION: ReadonlySet<SaramLinkStatusName> = new Set(["suggestion", "homonyms", "no_match", "locked_out", "pending_request", "contested"])

export function saramStatusNeedsAttention(status: Pick<SaramStatus, "status"> | null | undefined): boolean {
	return !!status && ATTENTION.has(status.status)
}

/** A conta pessoal ainda não tem vínculo que valha (o arranchamento continua, sinalizado). */
export function isSaramUnverified(status: Pick<SaramStatus, "status" | "accountKind"> | null | undefined): boolean {
	if (!status || status.accountKind === "institucional") return false
	return status.status !== "verified" && status.status !== "legacy"
}

export function hasSaramAction(status: Pick<SaramStatus, "actions"> | null | undefined, action: SaramLinkAction): boolean {
	return !!status && status.actions.includes(action)
}

/** "NANNI" → "Nanni"; "DA SILVA" → "da Silva". Siglas (posto, OM) não passam por aqui. */
export function toNameCase(value: string | null | undefined): string {
	if (!value) return ""
	return value
		.toLocaleLowerCase("pt-BR")
		.split(/(\s+)/)
		.map((word) => (/^(da|de|do|das|dos|e)$/.test(word) ? word : word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1)))
		.join("")
}

/** "3S Nanni". Vazio quando o cadastro não traz nem posto nem nome de guerra. */
export function formatMilitaryName(identity: Pick<MilitaryIdentitySummary, "posto" | "nomeGuerra"> | null | undefined): string {
	if (!identity) return ""
	return [identity.posto?.trim(), toNameCase(identity.nomeGuerra?.trim())].filter(Boolean).join(" ")
}

/** "3S Nanni (1º GAP)". */
export function formatMilitaryIdentity(identity: MilitaryIdentitySummary | null | undefined): string {
	const name = formatMilitaryName(identity)
	const om = identity?.sgOrg?.trim()
	if (!name) return om ?? ""
	return om ? `${name} (${om})` : name
}

/** Como o vínculo foi conferido, para a frase "verificado …". */
export function describeVerification(by: SaramVerification | null): string {
	switch (by) {
		case "email":
			return "pelo seu e-mail institucional"
		case "cpf":
			return "pelo SARAM e o CPF"
		case "admin":
			return "pela administração do sistema"
		case "legacy":
			return "antes da verificação automática"
		default:
			return ""
	}
}

/** Por que o e-mail não identificou a pessoa sozinho (estado `no_match`). */
export function describeEmailEligibility(eligibility: EmailEligibility): string {
	switch (eligibility) {
		case "eligible":
			return "Seu e-mail institucional não corresponde a ninguém no cadastro de pessoal. Isso acontece quando o nome ou o nome de guerra mudou depois de criado o e-mail, ou quando você ainda não está na última carga do cadastro."
		case "domain":
			return "A identificação automática só funciona com e-mail @fab.mil.br, e esta conta usa outro endereço."
		case "unconfirmed":
			return "Seu e-mail ainda não foi confirmado, e a identificação automática só usa e-mail confirmado."
		case "no_key":
			return "Seu e-mail não segue o padrão nome de guerra + iniciais (tem ponto, hífen ou outro formato), então ele não serve para a identificação automática."
	}
}

/**
 * Hora local de um instante, para "até …": "14:32" no mesmo dia; "04/10 às 00:12" em outro. O fuso
 * é o do navegador (parâmetro para o teste).
 */
export function formatLocalTime(iso: string | null | undefined, now: Date = new Date(), timeZone?: string): string {
	if (!iso) return ""
	const at = new Date(iso)
	if (Number.isNaN(at.getTime())) return ""
	const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone }).format(at)
	const day = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone }).format(d)
	return day(at) === day(now) ? time : `${day(at)} às ${time}`
}

/** "3 de outubro de 2026". */
export function formatLocalDate(iso: string | null | undefined, timeZone?: string): string {
	if (!iso) return ""
	const at = new Date(iso)
	if (Number.isNaN(at.getTime())) return ""
	return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone }).format(at)
}

/** "Restam 3 tentativas nesta hora." — visível antes de bloquear. */
export function describeAttemptsLeft(attemptsLeft: number | null | undefined): string {
	const n = Math.max(0, Number(attemptsLeft ?? 0))
	if (n === 0) return "Não restam tentativas nesta hora."
	return n === 1 ? "Resta 1 tentativa nesta hora. Depois dela, a verificação fica bloqueada por até 1 hora." : `Restam ${n} tentativas nesta hora.`
}

/** Leitura do estado para a tela e para o aviso de entrada. */
export function describeSaramStatus(status: SaramStatus, now: Date = new Date(), timeZone?: string): SaramStatusView {
	const identity = formatMilitaryIdentity(status.identity)
	switch (status.status) {
		case "verified":
			return {
				tone: "ok",
				badge: "Verificado",
				title: identity ? `Você está identificado como ${identity}` : "Seu SARAM está vinculado",
				description: `Vínculo conferido ${describeVerification(status.verifiedBy)}${status.verifiedAt ? ` em ${formatLocalDate(status.verifiedAt, timeZone)}` : ""}. Nada a fazer.`,
				needsAttention: false,
				notice: null,
			}
		case "legacy":
			return {
				tone: "info",
				badge: "Em revisão",
				title: identity ? `Você está identificado como ${identity}` : "Seu SARAM está vinculado",
				description: status.visible
					? "Este vínculo é antigo (de antes da verificação automática) e está em revisão pela administração do sistema. Nada a fazer agora: seus dados continuam aparecendo."
					: "Este vínculo é antigo e o mesmo SARAM foi verificado em outra conta, por isso seus dados militares não aparecem. A administração do sistema vai revisar; se o SARAM é seu, confira-o pelo CPF.",
				needsAttention: false,
				notice: null,
			}
		case "institutional":
			return {
				tone: "info",
				badge: "Conta de seção",
				title: "Esta é uma conta de seção ou OM",
				description:
					"Ela não tem SARAM nem arranchamento próprio. Todo o resto continua igual: módulos, permissões, senha e verificação em duas etapas. Os militares arrancham pela própria conta.",
				needsAttention: false,
				notice: null,
			}
		case "pending_request":
			return {
				tone: "info",
				badge: "Pedido em análise",
				title: "Seu pedido de vínculo está com a administração",
				description: `Você pediu o vínculo do SARAM ${status.request?.saram ?? ""}${status.request?.createdAt ? ` em ${formatLocalDate(status.request.createdAt, timeZone)}` : ""}. A administração do sistema vai decidir; enquanto isso, você continua arranchando normalmente.`,
				needsAttention: true,
				notice: { text: "Seu pedido de vínculo do SARAM está em análise.", cta: "Ver pedido" },
			}
		case "contested":
			return {
				tone: "info",
				badge: "Contestação em análise",
				title: "Sua contestação está com a administração",
				description: `O SARAM ${status.request?.saram ?? ""} já está vinculado a outra conta. A administração do sistema vai comparar as duas e decidir; você continua arranchando normalmente.`,
				needsAttention: true,
				notice: { text: "Sua contestação de SARAM está em análise.", cta: "Ver contestação" },
			}
		case "suggestion": {
			const candidate = formatMilitaryIdentity(status.candidates[0])
			return {
				tone: "attention",
				badge: "Confirme sua identidade",
				title: candidate ? `Identificamos você como ${candidate}. É você?` : "Encontramos seu cadastro. É você?",
				description: "Encontramos este cadastro pelo seu e-mail institucional. Confirmando, seus dados militares passam a aparecer no sistema.",
				needsAttention: true,
				notice: { text: candidate ? `Identificamos você como ${candidate}. Confirme em um clique.` : "Confirme seu cadastro militar.", cta: "Confirmar" },
			}
		}
		case "homonyms":
			return {
				tone: "attention",
				badge: "Escolha seu cadastro",
				title: "Encontramos mais de um cadastro para o seu e-mail",
				description: "Escolha o seu e confirme com os 4 últimos dígitos do seu CPF. Só mostramos posto, nome de guerra e OM.",
				needsAttention: true,
				notice: { text: "Encontramos mais de um cadastro para o seu e-mail. Escolha o seu.", cta: "Escolher" },
			}
		case "locked_out": {
			const until = formatLocalTime(status.lockedUntil, now, timeZone)
			return {
				tone: "blocked",
				badge: "Tentativas bloqueadas",
				title: "Muitas tentativas sem conferir",
				description: `Por segurança, a verificação pelo CPF fica bloqueada ${until ? `até ${until}` : "por até 1 hora"}. Depois disso, você pode tentar de novo. Se preferir, peça o vínculo à administração agora.`,
				needsAttention: true,
				notice: {
					text: `A verificação do seu SARAM está bloqueada ${until ? `até ${until}` : "por até 1 hora"}. Você pode pedir o vínculo à administração.`,
					cta: "Ver opções",
				},
			}
		}
		case "no_match":
			return {
				tone: "attention",
				badge: "Não identificado",
				title: "Não conseguimos identificar você pelo e-mail",
				description: describeEmailEligibility(status.emailEligibility),
				needsAttention: true,
				notice: { text: "Seu cadastro militar ainda não está vinculado a esta conta.", cta: "Vincular" },
			}
	}
}

export type SaramOutcomeView = { kind: "success" | "info" | "error"; title: string; description: string }

/** O que dizer depois de uma mutação da própria conta. */
export function describeSaramOutcome(result: SaramLinkOutcome, now: Date = new Date(), timeZone?: string): SaramOutcomeView {
	const identity = formatMilitaryIdentity(result.status.identity)
	switch (result.outcome) {
		case "linked":
			return {
				kind: "success",
				title: result.upgraded ? "Vínculo confirmado pelo CPF" : "SARAM vinculado",
				description: identity ? `Você está identificado como ${identity}.` : "Seus dados militares passam a aparecer no sistema.",
			}
		case "disputed":
			return {
				kind: "info",
				title: "Contestação enviada",
				description:
					"Este SARAM já está vinculado a outra conta verificada. A administração do sistema vai comparar as duas e decidir; até lá, nada muda na outra conta e você continua arranchando.",
			}
		case "mismatch": {
			const until = formatLocalTime(result.lockedUntil, now, timeZone)
			return {
				kind: "error",
				title: "Os dados não conferem",
				description: until
					? `Os dados não conferem com o cadastro, e a verificação ficou bloqueada até ${until}. Enquanto isso, você pode pedir o vínculo à administração.`
					: `Confira os números e tente de novo. ${describeAttemptsLeft(result.attemptsLeft)}`,
			}
		}
		case "locked": {
			const until = formatLocalTime(result.lockedUntil, now, timeZone)
			return {
				kind: "error",
				title: "Verificação bloqueada por enquanto",
				description: `Houve muitas tentativas sem conferir, e a verificação fica bloqueada ${until ? `até ${until}` : "por até 1 hora"}. Se preferir, peça o vínculo à administração agora.`,
			}
		}
		case "requested":
			return {
				kind: "success",
				title: result.status.status === "contested" ? "Contestação enviada" : "Pedido enviado",
				description: "A administração do sistema vai analisar. Você continua arranchando normalmente e pode desistir do pedido a qualquer momento.",
			}
		case "pending":
			return { kind: "info", title: "Pedido já em análise", description: "Este SARAM já está pedido e aguarda a administração do sistema." }
		case "withdrawn":
			return { kind: "info", title: "Pedido retirado", description: "Você pode verificar de outro jeito ou fazer um pedido novo quando quiser." }
		case "changed": {
			if (result.status.accountKind === "institucional") {
				const n = result.effects?.cancelledArranchamentos ?? 0
				return {
					kind: "success",
					title: "Conta marcada como de seção",
					description:
						n > 0
							? `${n === 1 ? "1 arranchamento de hoje em diante foi cancelado" : `${n} arranchamentos de hoje em diante foram cancelados`}. O resto da conta continua igual.`
							: "Ela não tem mais SARAM nem arranchamento próprio. O resto da conta continua igual.",
				}
			}
			return { kind: "success", title: "Conta marcada como pessoal", description: "Agora vincule o seu SARAM para os seus dados militares aparecerem." }
		}
		case "unchanged":
			return { kind: "info", title: "Nada mudou", description: "A conta já estava assim." }
	}
}

// ── Campos numéricos ────────────────────────────────────────────────────────

/** Só dígitos, até `max`. */
export function onlyDigits(value: string, max: number): string {
	return value.replace(/\D/g, "").slice(0, max)
}

/** Máscara progressiva do CPF: "12345678901" → "123.456.789-01". */
export function maskCpf(value: string): string {
	const d = onlyDigits(value, 11)
	if (d.length <= 3) return d
	if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
	if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
	return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** Exemplo de justificativa: mostrado no campo do pedido para a pessoa saber o que escrever. */
export const SARAM_REQUEST_EXAMPLE = "Ex.: Sou o 3S Silva, do 1º GAP. Mudei o nome de guerra em 2024 e meu e-mail ainda é o antigo (silvajs@fab.mil.br)."
