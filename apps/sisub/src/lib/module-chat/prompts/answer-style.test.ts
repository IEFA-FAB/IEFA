import { describe, expect, test } from "vitest"
import type { ChatModule } from "@/types/domain/module-chat"
import { getModuleConfig } from "../tools/registry"
import type { ToolContext } from "../tools/shared"
import { ANSWER_STYLE_PROMPT } from "./answer-style"

const MODULES: ChatModule[] = ["global", "kitchen", "unit", "local-analytics"]

function ctx(scopeId?: number): ToolContext {
	return {
		userId: "user-1",
		module: "kitchen",
		scopeId,
		permissions: [],
		supabase: {} as ToolContext["supabase"],
		db: {} as ToolContext["db"],
	}
}

/**
 * As regras de apresentação são o que impede o modelo de transcrever o JSON da tool —
 * a listagem do módulo global saiu como uma tabela de UUIDs. Um módulo novo (ou um refactor
 * do escopo de rota) que deixe o prompt de fora reproduz o mesmo resultado sem erro nenhum.
 */
describe("prompt de apresentação", () => {
	test.each(MODULES)("módulo %s carrega as regras, com e sem escopo de rota", (module) => {
		expect(getModuleConfig(module, 3, ctx()).systemPrompt).toContain(ANSWER_STYLE_PROMPT)
		expect(getModuleConfig(module, 3, ctx(7)).systemPrompt).toContain(ANSWER_STYLE_PROMPT)
	})

	test("o escopo obrigatório da rota continua no prompt junto das regras", () => {
		const prompt = getModuleConfig("kitchen", 3, ctx(7)).systemPrompt

		expect(prompt).toContain("cozinha de ID 7")
		expect(prompt).toContain(ANSWER_STYLE_PROMPT)
	})

	test("proíbe UUID no texto e explica que o id é para a chamada seguinte", () => {
		expect(ANSWER_STYLE_PROMPT).toContain("NUNCA escreva IDs (UUIDs) no texto da resposta")
		expect(ANSWER_STYLE_PROMPT).toContain("chamar a próxima ferramenta")
	})
})
