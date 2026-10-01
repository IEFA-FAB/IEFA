import { describe, expect, test } from "bun:test"
import { toJsonSchema } from "@iefa/sisub-domain"
import { AGENT_APPLY_TEMPLATE_MAX_DATES, AgentApplyTemplateSchema } from "@iefa/sisub-domain/agent"
import { templateTools } from "./templates.ts"

/**
 * `apply_template` do MCP segue o contrato de agente: só preenche refeição vazia, no máximo
 * {@link AGENT_APPLY_TEMPLATE_MAX_DATES} datas por chamada. Antes expunha o schema da tela, com
 * `conflictMode: "replace"` num intervalo sem teto: uma instrução embutida numa receita podia
 * apagar meses de planejamento numa chamada.
 *
 * As recusas abaixo voltam antes da credencial: nenhuma chega ao banco, e o teste não precisa
 * de um.
 */

const tool = templateTools.find((t) => t.schema.name === "apply_template")
if (!tool) throw new Error("apply_template não está registrada")
const applyTemplate = tool

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111"
const VALID = { templateId: TEMPLATE_ID, kitchenId: 5, targetDates: ["2099-03-02"], startDayOfWeek: 1 }

function dates(count: number): string[] {
	return Array.from({ length: count }, (_, i) => new Date(Date.UTC(2099, 0, 1 + i)).toISOString().slice(0, 10))
}

async function call(args: Record<string, unknown>) {
	const result = await applyTemplate.handler(args, "credencial-que-nao-deve-ser-usada")
	return { isError: "isError" in result ? result.isError : undefined, text: result.content[0]?.text ?? "" }
}

describe("apply_template do MCP: entrada recusada", () => {
	test("conflictMode é recusado, não ignorado calado", async () => {
		// Sem o `.strict()`, o zod 4 descartaria a chave e a chamada rodaria em "skip" sem o
		// cliente saber que pediu "replace".
		const result = await call({ ...VALID, conflictMode: "replace" })

		expect(result.isError).toBe(true)
		expect(result.text).toContain("conflictMode")
		expect(result.text).toContain("targetDates")
		expect(result.text).toContain("tela")
	})

	test("startDate/endDate (entrada antiga) são recusados e o erro aponta targetDates", async () => {
		const { targetDates: _targetDates, ...withoutDates } = VALID
		const result = await call({ ...withoutDates, startDate: "2099-03-02", endDate: "2099-06-30" })

		expect(result.isError).toBe(true)
		expect(result.text).toContain("startDate")
		expect(result.text).toContain("targetDates")
	})

	test("dates (entrada antiga) é recusado mesmo junto de targetDates", async () => {
		const result = await call({ ...VALID, dates: ["2099-03-02"] })

		expect(result.isError).toBe(true)
		expect(result.text).toContain("dates")
	})

	test(`mais de ${AGENT_APPLY_TEMPLATE_MAX_DATES} datas é recusado`, async () => {
		const result = await call({ ...VALID, targetDates: dates(AGENT_APPLY_TEMPLATE_MAX_DATES + 1) })

		expect(result.isError).toBe(true)
		expect(result.text).toContain("targetDates")
	})

	test(`${AGENT_APPLY_TEMPLATE_MAX_DATES} datas passam da validação`, () => {
		const schema = AgentApplyTemplateSchema.strict()
		expect(schema.safeParse({ ...VALID, targetDates: dates(AGENT_APPLY_TEMPLATE_MAX_DATES) }).success).toBe(true)
	})
})

describe("apply_template do MCP: contrato compartilhado com o chat do sisub", () => {
	test("o inputSchema é o do agente, só com additionalProperties: false a mais", () => {
		const exposed = applyTemplate.schema.inputSchema
		const agent = toJsonSchema(AgentApplyTemplateSchema)

		expect(exposed).toEqual(toJsonSchema(AgentApplyTemplateSchema.strict()))
		expect(exposed.properties).toEqual(agent.properties)
		expect(exposed.required).toEqual(agent.required)
		expect(exposed).toMatchObject({ additionalProperties: false })
		expect(Object.keys(exposed.properties ?? {})).not.toContain("conflictMode")
		expect(Object.keys(exposed.properties ?? {})).not.toContain("startDate")
	})

	test("a descrição explica targetDates, o teto e que substituir é só pela tela", () => {
		const description = applyTemplate.schema.description

		expect(description).toContain("targetDates")
		expect(description).toContain(`no máximo ${AGENT_APPLY_TEMPLATE_MAX_DATES} datas`)
		expect(description).toContain("nunca apaga nem substitui")
		expect(description).toContain("tela de planejamento")
	})
})
