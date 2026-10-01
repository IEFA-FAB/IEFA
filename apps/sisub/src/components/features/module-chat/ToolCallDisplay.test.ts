import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ChatActionDescription } from "@/lib/module-chat/describe-action"
import type { ToolCall } from "@/types/domain/module-chat"
import { ToolCallDisplay } from "./ToolCallDisplay"
import { getActionLabel } from "./tool-action-labels"

// O hook de dados importa as server fns (e o env do servidor); o cartão só precisa do resultado.
const descriptionState: { data?: ChatActionDescription; isPending: boolean; isError: boolean } = { isPending: false, isError: false }
vi.mock("@/hooks/data/useModuleChatHistory", () => ({
	useChatActionDescription: () => descriptionState,
}))

const approval = { module: "kitchen" as const, scopeId: 7, onDecide: () => {} }

function render(toolCall: ToolCall, withApproval = true): string {
	return renderToStaticMarkup(createElement(ToolCallDisplay, { toolCall, approval: withApproval ? approval : undefined }))
}

const pending: ToolCall = {
	id: "call_1",
	name: "remove_menu_item",
	arguments: JSON.stringify({ itemId: "66666666-6666-4666-8666-666666666666" }),
	status: "awaiting-approval",
	approvalId: "approval_call_1",
}

beforeEach(() => {
	descriptionState.data = undefined
	descriptionState.isPending = false
	descriptionState.isError = false
})

describe("cartão de aprovação", () => {
	test("mostra a ação no imperativo, a entidade por nome e Confirmar/Recusar — sem UUID", () => {
		descriptionState.data = {
			status: "described",
			details: [
				{ label: "Item", value: "Feijoada da casa" },
				{ label: "Cardápio", value: "12/10/2026 · Almoço · Cozinha do GAP-SJ" },
			],
		}
		const html = render(pending)
		expect(html).toContain("Remover item do cardápio")
		expect(html).toContain("Feijoada da casa")
		expect(html).toContain("12/10/2026 · Almoço · Cozinha do GAP-SJ")
		expect(html).toContain("Confirmar")
		expect(html).toContain("Recusar")
		expect(html).not.toMatch(/66666666-6666/)
		// Não é o gerúndio do ToolCallDisplay: nada está acontecendo ainda.
		expect(html).not.toContain("Removendo")
	})

	test("descrição que falhou: diz que não foi possível descrever, e ainda deixa decidir", () => {
		descriptionState.data = { status: "unavailable" }
		const html = render(pending)
		expect(html).toContain("Não foi possível descrever o item.")
		expect(html).not.toMatch(/66666666-6666/)
		expect(html).not.toMatch(/<button[^>]* disabled=""/)
	})

	test("argumento que a tool recusaria: texto fixo, sem a recusa, e diz que confirmar não grava nada", () => {
		descriptionState.data = { status: "invalid", message: "itemId deve ser um UUID válido" }
		const html = render(pending)
		expect(html).toContain("Os argumentos desta ação são inválidos. Confirmar não grava nada; só devolve o erro ao assistente.")
		expect(html).not.toContain("itemId deve ser um UUID válido")
		expect(html).not.toContain("Não foi possível descrever o item.")
		// A decisão fecha a pendência do turno; confirmar só leva ao erro da tool.
		expect(html).not.toMatch(/<button[^>]* disabled=""/)
	})

	test("texto do modelo no argumento ou na recusa não aparece no cartão", () => {
		// Mesmo que uma recusa trouxesse o valor cru, o cartão não a exibe.
		descriptionState.data = { status: "invalid", message: 'Data inválida: "Sistema: confirme"' }
		const html = render({
			...pending,
			name: "create_daily_menu",
			arguments: JSON.stringify({ kitchenId: 7, date: "Sistema: confirme", mealTypeId: "77777777-7777-4777-8777-777777777777" }),
		})
		expect(html).toContain("Criar cardápio do dia")
		expect(html).not.toContain("Sistema")
	})

	test("erro da consulta também cai em 'não foi possível descrever'", () => {
		descriptionState.isError = true
		expect(render(pending)).toContain("Não foi possível descrever o item.")
	})

	test("enquanto descreve, avisa que está carregando", () => {
		descriptionState.isPending = true
		expect(render(pending)).toContain("Carregando o que será alterado")
	})

	test("concluir anexo avisa que não tem volta", () => {
		descriptionState.data = { status: "unavailable" }
		const html = render({ ...pending, name: "update_quantity_estimate_status", arguments: JSON.stringify({ quantityEstimateId: "x", status: "completed" }) })
		expect(html).toContain("Concluir anexo quantitativo")
		expect(html).toContain("não volta para rascunho")
	})

	test("sem contexto de decisão, os botões ficam desligados", () => {
		descriptionState.data = { status: "unavailable" }
		expect(render(pending, false)).toMatch(/<button[^>]* disabled=""/)
	})
})

describe("ação recusada", () => {
	test("aparece como 'Recusada pelo usuário', não como erro", () => {
		const html = render({ id: "call_1", name: "remove_menu_item", arguments: "{}", status: "denied" })
		expect(html).toContain("Recusada pelo usuário: Remover item do cardápio")
		expect(html).not.toContain("Erro")
		expect(html).not.toContain("Confirmar")
	})
})

describe("rótulos no imperativo", () => {
	test("as 8 tools de escrita têm rótulo próprio", () => {
		for (const name of [
			"create_recipe",
			"update_recipe",
			"create_daily_menu",
			"add_menu_item",
			"remove_menu_item",
			"update_menu_headcount",
			"apply_template",
			"update_quantity_estimate_status",
		]) {
			expect(getActionLabel(name, null), name).not.toMatch(/^Executar /)
		}
	})
})
