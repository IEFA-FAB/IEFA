import { describe, expect, test } from "bun:test"
import { DomainError } from "../types/errors.ts"
import { runQuery, toNumeric, unwrapPgError } from "./drizzle.ts"

/**
 * Réplica do erro que o drizzle 0.45 lança: a `message` é SÓ o SQL, e o motivo real
 * (código do driver + texto) vive em `.cause`. Foi assim que uma queda de conexão
 * chegou na tela de `/global/recipes` como um dump de `select … from kitchen.folder`
 * sem uma palavra sobre conexão nenhuma.
 */
function drizzleQueryError(sql: string, cause: { code?: string; message: string }): Error {
	const err = new Error(`Failed query: ${sql}\nparams: `)
	;(err as Error & { cause?: unknown }).cause = Object.assign(new Error(cause.message), { code: cause.code })
	return err
}

const CONNECT_TIMEOUT = { code: "CONNECT_TIMEOUT", message: "write CONNECT_TIMEOUT" }

async function messageOf(op: () => Promise<unknown>, opts?: Parameters<typeof runQuery>[2]): Promise<string> {
	try {
		await runQuery("QUERY_FAILED", op, opts)
	} catch (e) {
		expect(e).toBeInstanceOf(DomainError)
		return (e as DomainError).message
	}
	throw new Error("runQuery deveria ter lançado")
}

describe("runQuery: mensagem de erro", () => {
	const failing =
		(cause = CONNECT_TIMEOUT) =>
		() =>
			Promise.reject(drizzleQueryError("select 1 from kitchen.folder", cause))

	test("sem prefixo: expõe código e texto da cause, não só o SQL", async () => {
		const msg = await messageOf(failing())
		expect(msg).toContain("[CONNECT_TIMEOUT]")
		expect(msg).toContain("write CONNECT_TIMEOUT")
		// O SQL continua na mensagem — é o que localiza a query no código.
		expect(msg).toContain("select 1 from kitchen.folder")
	})

	test("com prefixo + includeCode: o código não aparece duas vezes", async () => {
		const msg = await messageOf(failing({ code: "23505", message: "duplicate key value" }), {
			prefix: "Falha ao criar item",
			includeCode: true,
		})
		expect(msg).toStartWith("Falha ao criar item [23505]: ")
		expect(msg.match(/23505/g)).toHaveLength(1)
		expect(msg).toContain("duplicate key value")
	})

	test("com prefixo e sem includeCode: código fica de fora, texto da cause entra", async () => {
		const msg = await messageOf(failing({ code: "23505", message: "duplicate key value" }), { prefix: "Falha ao salvar" })
		// `includeCode` é quem decide se o SQLSTATE aparece — ver RunQueryOptions.
		expect(msg).not.toContain("23505")
		expect(msg).toStartWith("Falha ao salvar: ")
		expect(msg).toContain("duplicate key value")
	})

	/**
	 * `isMissingNutritionReferenceRelation` (ingredients.ts / ingredient-versions.ts)
	 * casa uma REGEX contra a mensagem do `DomainError` para cair no fallback de
	 * `nutrition_reference` ausente. Enquanto a mensagem era só o SQL, o texto
	 * `does not exist` vinha na cause e a regex nunca casava — o fallback estava morto.
	 */
	test("texto do Postgres chega à mensagem: o fallback de nutrição depende disso", async () => {
		const msg = await messageOf(failing({ code: "42P01", message: 'relation "nutrition_reference.food_item" does not exist' }), {
			prefix: "Falha ao buscar tabela alimentar",
			includeCode: true,
		})
		expect(msg).toMatch(/relation .*nutrition_reference\..* does not exist/i)
	})

	test("erro sem cause: mensagem preservada como está", async () => {
		const msg = await messageOf(() => Promise.reject(new Error("boom")))
		expect(msg).toBe("boom")
	})

	test("erro do driver sem wrap do drizzle: código entra, mensagem não duplica", async () => {
		const raw = Object.assign(new Error("write CONNECT_TIMEOUT"), { code: "CONNECT_TIMEOUT" })
		const msg = await messageOf(() => Promise.reject(raw))
		expect(msg).toBe("[CONNECT_TIMEOUT] write CONNECT_TIMEOUT")
	})

	test("DomainError atravessa intacto", async () => {
		const original = new DomainError("NOT_MINE", "não mexe")
		await expect(runQuery("QUERY_FAILED", () => Promise.reject(original))).rejects.toBe(original)
	})
})

describe("unwrapPgError", () => {
	test("desce a cadeia de cause até o erro com código", () => {
		expect(unwrapPgError(drizzleQueryError("select 1", CONNECT_TIMEOUT)).code).toBe("CONNECT_TIMEOUT")
	})

	test("cadeia circular não trava", () => {
		const a = new Error("a") as Error & { cause?: unknown }
		const b = new Error("b") as Error & { cause?: unknown }
		a.cause = b
		b.cause = a
		expect(unwrapPgError(a).code).toBeUndefined()
	})
})

/**
 * `numeric` do Postgres chega como STRING no driver, e o contrato gerado do Supabase
 * declara `number`. Ninguém desmentia a divergência: o TypeScript ficava calado e o
 * runtime entregava `"3.000"`. Foi assim que o formulário da ficha técnica passou a
 * acusar "Invalid input" em campo salvo e nunca tocado — o `z.number()` do validador
 * reprovava a linha antes de o usuário digitar.
 */
describe("toNumeric", () => {
	const KEYS = new Set(["net_quantity", "correction_factor"])

	// A linha do banco chega sem tipo útil (o driver não sabe o que é `numeric`), então o
	// teste espelha isso: `Record<string, unknown>` em vez de um literal, cujo tipo inferido
	// diria `net_quantity: string` e brigaria com o número esperado.
	const row = (value: Record<string, unknown>): Record<string, unknown> => toNumeric(value, KEYS)

	test("converte a chave declarada, deixa as outras em paz", () => {
		expect(row({ net_quantity: "3.000", name: "Arroz", rational_id: "0042" })).toEqual({
			net_quantity: 3,
			name: "Arroz",
			rational_id: "0042",
		})
	})

	test("desce em arrays e objetos aninhados — os ingredientes vêm dentro da receita", () => {
		expect(row({ ingredients: [{ net_quantity: "0.150" }, { net_quantity: "2" }] })).toEqual({
			ingredients: [{ net_quantity: 0.15 }, { net_quantity: 2 }],
		})
	})

	test("null da coluna anulável continua null", () => {
		expect(row({ correction_factor: null })).toEqual({ correction_factor: null })
	})

	test("número já convertido passa intacto", () => {
		expect(row({ net_quantity: 3 })).toEqual({ net_quantity: 3 })
	})

	test("string não numérica NÃO vira NaN — trocaria um erro visível por um silencioso", () => {
		expect(row({ net_quantity: "três" })).toEqual({ net_quantity: "três" })
		expect(row({ net_quantity: "" })).toEqual({ net_quantity: "" })
	})

	test("Date não é desmontado em objeto de propriedades", () => {
		const date = new Date("2026-08-18T00:00:00.000Z")
		expect(row({ created_at: date }).created_at).toBe(date)
	})
})
