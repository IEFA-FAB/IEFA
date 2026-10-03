/**
 * Erros do vínculo de SARAM (`core.claim_saram`, migration 20261003100000; antes
 * `core.link_own_saram`) → frase para a tela.
 *
 * As duas travas mandam para a administração do SISTEMA, como `syncUserSaram` no sisub, e não
 * para o administrador do SUCONT: o console do sucont não mexe em SARAM (a correção é manual, no
 * banco). Token desconhecido (queda de conexão, timeout) não vai cru para a tela.
 */
const SARAM_LINK_ERRORS: Record<string, string> = {
	SARAM_LOCKED: "O SARAM já está vinculado à sua conta e não pode ser alterado por aqui. Para corrigi-lo, procure a administração do sistema.",
	SARAM_TAKEN: "Este SARAM já está vinculado a outra conta. Se ele é seu, procure a administração do sistema.",
	// Outra linha, de outro `id`, já detém este endereço. Reivindicá-lo apagaria o cadastro de
	// outra pessoa (o sisub faz isso deliberadamente; aqui não).
	EMAIL_TAKEN: "Seu e-mail já está registrado em outra conta do ERP. Procure o administrador do SUCONT.",
	USER_DATA_NOT_FOUND: "Sua conta ainda não está no cadastro de pessoas do ERP. Procure o administrador do SUCONT.",
	SARAM_INVALID: "O SARAM tem 6 ou 7 dígitos.",
	ACCOUNT_INSTITUTIONAL: "Esta conta está marcada como institucional e não tem SARAM. Procure a administração do sistema se ela for de uma pessoa.",
	REQUEST_PENDING: "Você já tem um pedido de vínculo de SARAM em análise pela administração do sistema.",
	REQUEST_LIMIT: "Limite de pedidos de vínculo atingido (5 por dia). Tente amanhã ou procure a administração do sistema.",
}

/**
 * Estado do vínculo (`core.saram_link_status`, a mesma função que o sisub lê). Valores do
 * contrato da change `saram-verified-link`.
 */
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

/** Desfecho de `core.claim_saram`: vinculou, abriu pedido (ou contestação), ou nada mudou. */
export type SaramClaimOutcome = "linked" | "requested" | "disputed" | "pending" | "unchanged"

/** O diálogo de primeiro acesso só insiste quando há o que a pessoa possa fazer por ali. */
export function saramStatusNeedsAction(status: SaramLinkStatusName | null): boolean {
	return status === "suggestion" || status === "homonyms" || status === "no_match"
}

/** O número digitado virou pedido para a administração (não há o que confirmar na tela). */
export function isSaramClaimPending(outcome: SaramClaimOutcome | null): boolean {
	return outcome === "requested" || outcome === "disputed" || outcome === "pending"
}

export type SaramLinkIdentity = {
	saram: string | null
	posto: string | null
	nomeGuerra: string | null
	registered: boolean
	status: SaramLinkStatusName | null
}

/**
 * `jsonb` de `core.saram_link_status` → o que a tela do sucont usa. O SARAM vinculado (verificado
 * ou legacy) fecha o diálogo; posto e nome de guerra só saem quando a conta pode vê-los
 * (`visible`): pedido pendente, SARAM gravado fora do fluxo verificado e legacy em conflito não
 * mostram o cadastro de ninguém.
 */
export function identityFromSaramStatus(raw: unknown): SaramLinkIdentity {
	const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
	const visible = o.visible === true
	const identity = visible && o.identity && typeof o.identity === "object" ? (o.identity as Record<string, unknown>) : null
	return {
		saram: typeof o.saram === "string" && o.saram.length > 0 ? o.saram : null,
		posto: identity && typeof identity.posto === "string" ? identity.posto : null,
		nomeGuerra: identity && typeof identity.nome_guerra === "string" ? identity.nome_guerra : null,
		registered: identity !== null,
		status: typeof o.status === "string" ? (o.status as SaramLinkStatusName) : null,
	}
}

export const SARAM_LINK_FALLBACK_MESSAGE = "Não foi possível salvar o SARAM. Tente de novo."

export function saramLinkErrorMessage(raw: string | null | undefined): string {
	return SARAM_LINK_ERRORS[(raw ?? "").trim()] ?? SARAM_LINK_FALLBACK_MESSAGE
}
