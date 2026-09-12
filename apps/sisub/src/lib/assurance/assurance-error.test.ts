import { AssuranceRequiredError } from "@iefa/pbac"
import { describe, expect, test } from "vitest"
import {
	type AssurancePrompt,
	DEFAULT_ASSURANCE_REASON,
	ElevationCancelledError,
	isElevationCancelled,
	parseAssuranceRequired,
	resolveElevationStep,
	runWithElevation,
} from "@/lib/assurance/assurance-error"

/**
 * O que chega ao navegador depois da serialização do TanStack Start: um `Error` comum com as
 * propriedades próprias copiadas. A classe NÃO atravessa — é por isso que a detecção é por
 * campo, e é isto que estes testes fixam.
 */
function serializedAssuranceError(overrides: Record<string, unknown> = {}): Error {
	return Object.assign(new Error("Esta operação altera permissões de acesso."), {
		name: "AssuranceRequiredError",
		code: "MFA_REQUIRED",
		nextStep: "step-up",
		reason: "Esta operação altera permissões de acesso.",
		grade: "fresh",
		origin: "session",
		...overrides,
	})
}

describe("parseAssuranceRequired", () => {
	test("reconhece o erro serializado, que é o formato que o navegador realmente recebe", () => {
		expect(parseAssuranceRequired(serializedAssuranceError())).toEqual({
			nextStep: "step-up",
			reason: "Esta operação altera permissões de acesso.",
			grade: "fresh",
			origin: "session",
		})
	})

	test("reconhece a instância real de @iefa/pbac — o mesmo campo serve aos dois lados", () => {
		const error = new AssuranceRequiredError({
			nextStep: "challenge",
			reason: "Esta operação registra uma liquidação.",
			grade: "session",
			origin: "session",
		})

		expect(parseAssuranceRequired(error)).toEqual({
			nextStep: "challenge",
			reason: "Esta operação registra uma liquidação.",
			grade: "session",
			origin: "session",
		})
	})

	test("erro comum não abre modal nenhum", () => {
		expect(parseAssuranceRequired(new Error("Forbidden"))).toBeNull()
		expect(parseAssuranceRequired(null)).toBeNull()
		expect(parseAssuranceRequired("MFA_REQUIRED")).toBeNull()
		expect(parseAssuranceRequired({ code: "PERMISSION_DENIED" })).toBeNull()
	})

	test("encontra o pedido embrulhado em `cause`", () => {
		const wrapped = Object.assign(new Error("Não foi possível salvar."), { cause: serializedAssuranceError() })
		expect(parseAssuranceRequired(wrapped)?.nextStep).toBe("step-up")
	})

	test("`cause` apontando para o próprio erro não entra em laço", () => {
		const looping = new Error("boom") as Error & { cause?: unknown }
		looping.cause = looping
		expect(parseAssuranceRequired(looping)).toBeNull()
	})

	test("passo desconhecido cai em `challenge` — pedir o código é o caminho que funciona", () => {
		expect(parseAssuranceRequired(serializedAssuranceError({ nextStep: "reboot" }))?.nextStep).toBe("challenge")
		expect(parseAssuranceRequired(serializedAssuranceError({ nextStep: undefined }))?.nextStep).toBe("challenge")
	})

	test("sem `reason` o modal ainda diz alguma coisa, nunca uma tela muda", () => {
		const withoutReason = serializedAssuranceError({ reason: "   " })
		// Cai na `message`, que é o texto que o próprio erro carrega.
		expect(parseAssuranceRequired(withoutReason)?.reason).toBe("Esta operação altera permissões de acesso.")

		const bare = { code: "MFA_REQUIRED" }
		expect(parseAssuranceRequired(bare)?.reason).toBe(DEFAULT_ASSURANCE_REASON)
	})

	test("grau desconhecido vira `fresh`: prometer menos do que o sistema cobra é o erro barato", () => {
		expect(parseAssuranceRequired(serializedAssuranceError({ grade: "whatever" }))?.grade).toBe("fresh")
		expect(parseAssuranceRequired(serializedAssuranceError({ grade: "session" }))?.grade).toBe("session")
	})

	test("origem só é `api-key` quando o servidor disse exatamente isso", () => {
		expect(parseAssuranceRequired(serializedAssuranceError({ origin: "api-key" }))?.origin).toBe("api-key")
		expect(parseAssuranceRequired(serializedAssuranceError({ origin: 42 }))?.origin).toBe("session")
	})
})

describe("runWithElevation", () => {
	const prompt = (): AssurancePrompt => ({ nextStep: "step-up", reason: "r", grade: "fresh", origin: "session" })

	test("sem MFA_REQUIRED não abre modal e devolve o resultado", async () => {
		let elevations = 0
		const result = await runWithElevation(
			{ id: 1 },
			async (variables) => variables.id,
			async () => {
				elevations++
				return true
			}
		)

		expect(result).toBe(1)
		expect(elevations).toBe(0)
	})

	test("reexecuta com o PAYLOAD ORIGINAL depois da verificação", async () => {
		const payload = { module: "admin", level: 3, note: "formulário longo" }
		const seen: unknown[] = []
		let attempt = 0

		const result = await runWithElevation(
			payload,
			async (variables) => {
				seen.push(variables)
				attempt++
				if (attempt === 1) throw serializedAssuranceError()
				return "gravado"
			},
			async () => true
		)

		expect(result).toBe("gravado")
		expect(seen).toHaveLength(2)
		// Mesma REFERÊNCIA: nada releu o estado da tela entre uma tentativa e outra.
		expect(seen[0]).toBe(payload)
		expect(seen[1]).toBe(payload)
	})

	test("cancelar não reexecuta e devolve um erro que a tela sabe distinguir de falha", async () => {
		let calls = 0
		const failure = await runWithElevation(
			null,
			async () => {
				calls++
				throw serializedAssuranceError()
			},
			async () => false
		).catch((error: unknown) => error)

		expect(calls).toBe(1)
		expect(isElevationCancelled(failure)).toBe(true)
		expect(failure).toBeInstanceOf(ElevationCancelledError)
		expect((failure as ElevationCancelledError).prompt.nextStep).toBe("step-up")
	})

	test("erro que não é de garantia sobe intacto, sem passar pelo modal", async () => {
		const original = new Error("Unidade não encontrada")
		let elevations = 0

		const failure = await runWithElevation(
			null,
			async () => {
				throw original
			},
			async () => {
				elevations++
				return true
			}
		).catch((error: unknown) => error)

		expect(failure).toBe(original)
		expect(elevations).toBe(0)
	})

	test("segunda recusa propaga em vez de abrir outro modal — laço de modais não tem saída", async () => {
		let calls = 0
		let elevations = 0

		const failure = await runWithElevation(
			null,
			async () => {
				calls++
				throw serializedAssuranceError()
			},
			async () => {
				elevations++
				return true
			}
		).catch((error: unknown) => error)

		expect(calls).toBe(2)
		expect(elevations).toBe(1)
		expect(parseAssuranceRequired(failure)).not.toBeNull()
	})

	test("o cancelamento carrega o pedido original, para a tela explicar o que ficou pendente", () => {
		const cancelled = new ElevationCancelledError(prompt())
		expect(cancelled.prompt.reason).toBe("r")
		expect(isElevationCancelled(new Error("x"))).toBe(false)
	})
})

describe("resolveElevationStep", () => {
	test("conta sem fator verificado cai em cadastro, mesmo se o servidor pediu código", () => {
		expect(resolveElevationStep("challenge", 0)).toBe("enroll")
		expect(resolveElevationStep("step-up", 0)).toBe("enroll")
	})

	test("conta com fator pede código, mesmo se o servidor pediu cadastro", () => {
		// Cadastro concluído em outra aba entre a recusa e a abertura do modal.
		expect(resolveElevationStep("enroll", 1)).toBe("code")
	})

	test("enquanto a consulta não respondeu, vale o que o servidor disse", () => {
		expect(resolveElevationStep("enroll", undefined)).toBe("enroll")
		expect(resolveElevationStep("challenge", undefined)).toBe("code")
	})
})
