import { describe, expect, test } from "bun:test"
import {
	describeAttemptsLeft,
	describeEmailEligibility,
	describeSaramOutcome,
	describeSaramStatus,
	formatLocalTime,
	formatMilitaryIdentity,
	hasSaramAction,
	isSaramUnverified,
	maskCpf,
	onlyDigits,
	parseSaramOutcome,
	parseSaramStatus,
	SARAM_ERROR_MESSAGES,
	SARAM_FALLBACK_ERROR_MESSAGE,
	type SaramLinkStatusName,
	type SaramStatus,
	saramErrorMessage,
	saramStatusNeedsAttention,
	toNameCase,
	visibleSaramOf,
} from "./saram-link.ts"

const NOW = new Date("2026-10-03T15:00:00Z")
const TZ = "America/Sao_Paulo"

function status(overrides: Partial<SaramStatus> = {}): SaramStatus {
	return {
		...parseSaramStatus({}),
		...overrides,
	}
}

/** Palavras do contrato que a pessoa nunca lê. */
const JARGON = /\b(legacy|account_kind|saram_verified_by|verified_by|no_match|pending_request|homonyms)\b|conta institucional/

describe("parseSaramStatus", () => {
	test("converte o jsonb da função (snake_case) para o contrato", () => {
		const parsed = parseSaramStatus({
			status: "homonyms",
			account_kind: "pessoal",
			saram: null,
			verified_by: null,
			visible: false,
			has_unverified_saram: true,
			candidates: [{ ref: 7, posto: "3S", nome_guerra: "SILVA", sg_org: "1º GAP", held_by_other: true, holder_verified: "true" }],
			requires_cpf_suffix: true,
			email_eligibility: "eligible",
			locked_until: null,
			attempts_left: 3,
			actions: ["confirm_candidate", "verify_cpf", "inventada"],
		})
		expect(parsed.status).toBe("homonyms")
		expect(parsed.hasUnverifiedSaram).toBe(true)
		expect(parsed.candidates).toEqual([{ ref: 7, posto: "3S", nomeGuerra: "SILVA", sgOrg: "1º GAP", heldByOther: true, holderVerified: true }])
		expect(parsed.attemptsLeft).toBe(3)
		// Ação fora do contrato não vira botão.
		expect(parsed.actions).toEqual(["confirm_candidate", "verify_cpf"])
	})

	test("aceita o jsonb como string e cai no estado conservador quando não reconhece", () => {
		expect(parseSaramStatus('{"status":"verified","verified_by":"email","visible":true}').status).toBe("verified")
		const unknown = parseSaramStatus({ status: "qualquer", account_kind: "outro", verified_by: "x", email_eligibility: "y" })
		expect(unknown).toMatchObject({ status: "no_match", accountKind: "pessoal", verifiedBy: null, emailEligibility: "domain", visible: false, actions: [] })
		expect(parseSaramStatus("não é json").status).toBe("no_match")
	})

	test("pedido pendente sai com tipo, data e prova", () => {
		const parsed = parseSaramStatus({
			status: "contested",
			request: { id: "r1", kind: "dispute", saram: "1000001", justification: "é meu", created_at: "2026-10-01T10:00:00Z", claim_verified_by: "cpf" },
		})
		expect(parsed.request).toEqual({
			id: "r1",
			kind: "dispute",
			saram: "1000001",
			justification: "é meu",
			createdAt: "2026-10-01T10:00:00Z",
			claimVerifiedBy: "cpf",
		})
	})
})

describe("parseSaramOutcome", () => {
	test("desfecho, tentativas, bloqueio, efeitos e o estado novo", () => {
		const parsed = parseSaramOutcome({
			outcome: "changed",
			effects: { previous: "1000001", withdrawn_requests: 1, cancelled_arranchamentos: 4 },
			status: { status: "institutional", account_kind: "institucional", actions: ["set_personal"] },
		})
		expect(parsed.outcome).toBe("changed")
		expect(parsed.effects).toEqual({ previousSaram: "1000001", withdrawnRequests: 1, cancelledArranchamentos: 4 })
		expect(parsed.status.status).toBe("institutional")
		expect(parseSaramOutcome({ outcome: "mismatch", attempts_left: 2 }).attemptsLeft).toBe(2)
		expect(parseSaramOutcome({ outcome: "bobagem" }).outcome).toBe("unchanged")
	})
})

describe("estado → aviso e ações", () => {
	const ALL: SaramLinkStatusName[] = ["verified", "legacy", "institutional", "pending_request", "contested", "suggestion", "homonyms", "locked_out", "no_match"]

	test("o aviso de entrada aparece só para quem tem algo a fazer ou acompanhar", () => {
		const withNotice = ALL.filter((s) => saramStatusNeedsAttention({ status: s }))
		expect(withNotice).toEqual(["pending_request", "contested", "suggestion", "homonyms", "locked_out", "no_match"])
		for (const s of ALL) {
			const view = describeSaramStatus(status({ status: s }), NOW, TZ)
			expect(view.needsAttention).toBe(saramStatusNeedsAttention({ status: s }))
			expect(Boolean(view.notice)).toBe(view.needsAttention)
		}
	})

	test("nenhuma frase mostra o vocabulário do contrato", () => {
		for (const s of ALL) {
			const view = describeSaramStatus(
				status({
					status: s,
					verifiedBy: s === "legacy" ? "legacy" : "email",
					accountKind: s === "institutional" ? "institucional" : "pessoal",
					identity: { posto: "3S", nomeGuerra: "NANNI", sgOrg: "1º GAP" },
					candidates: [{ ref: 1, posto: "3S", nomeGuerra: "NANNI", sgOrg: "1º GAP", heldByOther: false, holderVerified: false }],
					lockedUntil: "2026-10-03T16:00:00Z",
					request: { id: "r", kind: "link", saram: "1000001", justification: "x", createdAt: "2026-10-02T12:00:00Z", claimVerifiedBy: null },
				}),
				NOW,
				TZ
			)
			for (const text of [view.badge, view.title, view.description, view.notice?.text ?? "", view.notice?.cta ?? ""]) {
				expect(text).not.toMatch(JARGON)
				expect(text).not.toContain("—")
			}
		}
	})

	test("sugestão pergunta pelo nome, com posto e OM", () => {
		const view = describeSaramStatus(
			status({ status: "suggestion", candidates: [{ ref: 1, posto: "3S", nomeGuerra: "NANNI", sgOrg: "1º GAP", heldByOther: false, holderVerified: false }] }),
			NOW,
			TZ
		)
		expect(view.title).toBe("Identificamos você como 3S Nanni (1º GAP). É você?")
		expect(view.notice?.cta).toBe("Confirmar")
	})

	test("bloqueio diz até que horas, no fuso local", () => {
		const view = describeSaramStatus(status({ status: "locked_out", lockedUntil: "2026-10-03T15:47:00Z" }), NOW, TZ)
		expect(view.description).toContain("até 12:47")
		expect(view.notice?.text).toContain("até 12:47")
	})

	test("vínculo antigo em linguagem humana: nada a fazer, ou o porquê de os dados sumirem", () => {
		expect(describeSaramStatus(status({ status: "legacy", visible: true }), NOW, TZ).description).toContain("Nada a fazer agora")
		expect(describeSaramStatus(status({ status: "legacy", visible: false }), NOW, TZ).description).toContain("verificado em outra conta")
	})

	test("sem identificação explica o motivo pelo e-mail", () => {
		expect(describeEmailEligibility("domain")).toContain("@fab.mil.br")
		expect(describeEmailEligibility("no_key")).toContain("padrão")
		expect(describeEmailEligibility("unconfirmed")).toContain("confirmado")
		expect(describeEmailEligibility("eligible")).toContain("nome de guerra mudou")
	})

	test("conta não verificada é sinalizada; seção, verificada e antiga, não", () => {
		expect(isSaramUnverified({ status: "no_match", accountKind: "pessoal" })).toBe(true)
		expect(isSaramUnverified({ status: "pending_request", accountKind: "pessoal" })).toBe(true)
		expect(isSaramUnverified({ status: "verified", accountKind: "pessoal" })).toBe(false)
		expect(isSaramUnverified({ status: "legacy", accountKind: "pessoal" })).toBe(false)
		expect(isSaramUnverified({ status: "institutional", accountKind: "institucional" })).toBe(false)
		expect(hasSaramAction({ actions: ["verify_cpf"] }, "verify_cpf")).toBe(true)
		expect(hasSaramAction(null, "verify_cpf")).toBe(false)
	})
})

describe("desfechos", () => {
	const base = parseSaramOutcome({ status: { status: "no_match" } })

	test("tentativas restantes aparecem antes de bloquear", () => {
		const view = describeSaramOutcome({ ...base, outcome: "mismatch", attemptsLeft: 1 }, NOW, TZ)
		expect(view.kind).toBe("error")
		expect(view.description).toContain("Resta 1 tentativa")
		expect(describeAttemptsLeft(3)).toBe("Restam 3 tentativas nesta hora.")
		expect(describeAttemptsLeft(0)).toBe("Não restam tentativas nesta hora.")
	})

	test("a falha que bloqueia diz até quando e o caminho alternativo", () => {
		const view = describeSaramOutcome({ ...base, outcome: "mismatch", attemptsLeft: 0, lockedUntil: "2026-10-03T16:00:00Z" }, NOW, TZ)
		expect(view.description).toContain("até 13:00")
		expect(view.description).toContain("pedir o vínculo")
		expect(describeSaramOutcome({ ...base, outcome: "locked", lockedUntil: "2026-10-04T03:10:00Z" }, NOW, TZ).description).toContain("até 04/10 às 00:10")
	})

	test("virar seção diz quantos arranchamentos saíram", () => {
		const view = describeSaramOutcome(
			{
				...base,
				outcome: "changed",
				effects: { previousSaram: null, withdrawnRequests: 0, cancelledArranchamentos: 2 },
				status: status({ accountKind: "institucional", status: "institutional" }),
			},
			NOW,
			TZ
		)
		expect(view.description).toContain("2 arranchamentos")
	})

	test("todo desfecho tem frase", () => {
		for (const outcome of ["linked", "disputed", "mismatch", "locked", "requested", "withdrawn", "pending", "unchanged", "changed"] as const) {
			const view = describeSaramOutcome({ ...base, outcome }, NOW, TZ)
			expect(view.title.length).toBeGreaterThan(3)
			expect(view.description).not.toMatch(JARGON)
		}
	})
})

describe("erros com o próximo passo", () => {
	test("token conhecido vira frase; desconhecido não vai cru para a tela", () => {
		expect(saramErrorMessage("REQUEST_PENDING")).toBe(SARAM_ERROR_MESSAGES.REQUEST_PENDING)
		expect(saramErrorMessage(" SARAM_INVALID ")).toBe(SARAM_ERROR_MESSAGES.SARAM_INVALID)
		expect(saramErrorMessage("connection reset by peer")).toBe(SARAM_FALLBACK_ERROR_MESSAGE)
		expect(saramErrorMessage(null)).toBe(SARAM_FALLBACK_ERROR_MESSAGE)
	})

	test("toda mensagem diz o que fazer, sem código cru", () => {
		for (const message of Object.values(SARAM_ERROR_MESSAGES)) {
			expect(message).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/)
			expect(message.length).toBeGreaterThan(20)
		}
	})
})

describe("formatação", () => {
	test("nome, identidade, hora local", () => {
		expect(toNameCase("JOAO DA SILVA")).toBe("Joao da Silva")
		expect(formatMilitaryIdentity({ posto: "3S", nomeGuerra: "NANNI", sgOrg: null })).toBe("3S Nanni")
		expect(formatMilitaryIdentity(null)).toBe("")
		expect(formatLocalTime("2026-10-03T18:30:00Z", NOW, TZ)).toBe("15:30")
		expect(formatLocalTime("inválido", NOW, TZ)).toBe("")
	})

	test("campos numéricos: só dígitos e máscara progressiva do CPF", () => {
		expect(onlyDigits("12a3-4", 3)).toBe("123")
		expect(maskCpf("123")).toBe("123")
		expect(maskCpf("1234")).toBe("123.4")
		expect(maskCpf("1234567")).toBe("123.456.7")
		expect(maskCpf("123.456.789-0199")).toBe("123.456.789-01")
	})
})

describe("visibleSaramOf (espelho de core.visible_saram)", () => {
	const none = () => false
	test("verificado identifica; sem verificação, seção e vazio não", () => {
		for (const by of ["email", "cpf", "admin"])
			expect(visibleSaramOf({ saram: "1000001", saram_verified_by: by, account_kind: "pessoal" }, none)).toBe("1000001")
		expect(visibleSaramOf({ saram: "1000001", saram_verified_by: null, account_kind: "pessoal" }, none)).toBeNull()
		expect(visibleSaramOf({ saram: "1000001", saram_verified_by: "email", account_kind: "institucional" }, none)).toBeNull()
		expect(visibleSaramOf({ saram: " ", saram_verified_by: "email", account_kind: "pessoal" }, none)).toBeNull()
	})

	test("legacy só enquanto o mesmo SARAM não está verificado em outra conta", () => {
		const row = { saram: "1000001", saram_verified_by: "legacy", account_kind: "pessoal" }
		expect(visibleSaramOf(row, none)).toBe("1000001")
		expect(visibleSaramOf(row, (s) => s === "1000001")).toBeNull()
	})
})
