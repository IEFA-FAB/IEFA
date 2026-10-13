/**
 * Stub do `#/server/user.fn` para o harness — mesmo motivo dos demais: o módulo
 * real declara server functions do TanStack Start e importa `lib/*.server`, que
 * lê credencial na carga; o harness roda em Vite puro.
 *
 * O estado do vínculo vem semeado no cache do react-query (`hub.tsx`, `?saram=<estado>`), então
 * `fetchMySaramStatusFn` existe só para o grafo de imports resolver. As mutações devolvem
 * desfechos plausíveis (nomes inventados): é o que permite ver o aviso e o diálogo "Meu cadastro
 * militar" em cada estado sem tocar no Supabase.
 */

import { parseSaramOutcome, parseSaramStatus, type SaramLinkOutcome, type SaramStatus } from "@iefa/database/saram-link"

const ACTIONS_UNLINKED = ["verify_cpf", "request_link", "set_institutional"]

/** Estados do contrato, em `jsonb` (snake_case) como a função do banco devolve. */
export const HARNESS_SARAM_STATES: Record<string, unknown> = {
	verified: { status: "verified", saram: "0000003", verified_by: "email", visible: true, identity: { posto: "1T", nome_guerra: "FICTICIO", sg_org: "IEFA" } },
	suggestion: {
		status: "suggestion",
		email_eligibility: "eligible",
		attempts_left: 5,
		candidates: [{ ref: 101, posto: "3S", nome_guerra: "FICTICIO", sg_org: "1º GAP" }],
		actions: ["confirm_candidate", ...ACTIONS_UNLINKED],
	},
	homonyms: {
		status: "homonyms",
		requires_cpf_suffix: true,
		attempts_left: 4,
		candidates: [
			{ ref: 201, posto: "2S", nome_guerra: "EXEMPLO", sg_org: "GAP-SJ" },
			{ ref: 202, posto: "CAP", nome_guerra: "EXEMPLO", sg_org: "DIRAD" },
		],
		actions: ["confirm_candidate", ...ACTIONS_UNLINKED],
	},
	no_match: { status: "no_match", email_eligibility: "no_key", attempts_left: 5, actions: ACTIONS_UNLINKED },
	pending_request: {
		status: "pending_request",
		request: {
			id: "00000000-0000-4000-8000-000000000001",
			kind: "link",
			saram: "0000001",
			justification: "Mudei o nome de guerra.",
			created_at: new Date().toISOString(),
		},
		actions: ["withdraw_request"],
	},
	institutional: { status: "institutional", account_kind: "institucional", actions: ["set_personal"] },
}

export function harnessSaramStatus(name: string | null): SaramStatus {
	return parseSaramStatus(HARNESS_SARAM_STATES[name ?? "verified"] ?? HARNESS_SARAM_STATES.verified)
}

const outcome = (name: string, state: string, extra: Record<string, unknown> = {}): SaramLinkOutcome =>
	parseSaramOutcome({ outcome: name, status: HARNESS_SARAM_STATES[state], ...extra })

export async function fetchMySaramStatusFn(): Promise<SaramStatus> {
	return harnessSaramStatus("verified")
}
export async function confirmSaramCandidateFn({ data }: { data: { candidateRef: number; cpfSuffix?: string } }): Promise<SaramLinkOutcome> {
	if (data.cpfSuffix && data.cpfSuffix !== "1234") return outcome("mismatch", "homonyms", { attempts_left: 3 })
	return outcome("linked", "verified")
}
export async function verifySaramByCpfFn(_: { data: { saram: string; cpf: string } }): Promise<SaramLinkOutcome> {
	return outcome("mismatch", "no_match", { attempts_left: 4 })
}
export async function requestSaramLinkFn(_: { data: { saram: string; justification: string } }): Promise<SaramLinkOutcome> {
	return outcome("requested", "pending_request")
}
export async function withdrawSaramRequestFn(_: { data: { requestId: string } }): Promise<SaramLinkOutcome> {
	return outcome("withdrawn", "no_match")
}
export async function setOwnAccountKindFn({ data }: { data: { kind: string } }): Promise<SaramLinkOutcome> {
	return data.kind === "institucional" ? outcome("changed", "institutional") : outcome("changed", "no_match")
}

export async function syncSucontIdentityFn(): Promise<{ ok: boolean }> {
	return { ok: true }
}
