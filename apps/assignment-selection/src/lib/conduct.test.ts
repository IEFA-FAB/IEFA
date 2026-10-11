import { describe, expect, it } from "vitest"
import { deriveConduct, deriveScreenView, describeScreen, describeUndo, isShortcutTarget, personStatus } from "./conduct"

type Row = {
	id: number
	classificacao: number
	nome: string
	localidade: string | null
	show_card: boolean
	show_om: boolean
	hide_card: boolean
}

const row = (classificacao: number, over: Partial<Row> = {}): Row => ({
	id: classificacao,
	classificacao,
	nome: `M${classificacao}`,
	localidade: "GAP RJ",
	show_card: false,
	show_om: false,
	hide_card: false,
	...over,
})

const confirmedRow = (n: number) => row(n, { hide_card: true })

describe("deriveConduct", () => {
	it("começa chamando o primeiro da classificação, sem desfazer", () => {
		const state = deriveConduct([row(2), row(1), row(3)])
		expect(state.step).toBe("call")
		expect(state.current?.classificacao).toBe(1)
		expect(state.upcoming.map((p) => p.classificacao)).toEqual([2, 3])
		expect(state.undo).toBeNull()
	})

	it("chamado: o próximo passo é revelar e o desfazer tira o card do telão", () => {
		const state = deriveConduct([row(1, { show_card: true }), row(2)])
		expect(state.step).toBe("reveal")
		expect(state.current?.classificacao).toBe(1)
		expect(state.undo).toMatchObject({ kind: "uncall", changes: { show_card: false } })
	})

	it("revelado: o próximo passo é confirmar e o desfazer esconde a OM", () => {
		const state = deriveConduct([row(1, { show_card: true, show_om: true }), row(2)])
		expect(state.step).toBe("confirm")
		expect(state.undo).toMatchObject({ kind: "unreveal", person: { classificacao: 1 }, changes: { show_om: false } })
	})

	it("confirmado e ninguém chamado depois: foca o próximo e o desfazer reabre a escolha", () => {
		const state = deriveConduct([row(1, { show_card: true, show_om: true, hide_card: true }), row(2)])
		expect(state.step).toBe("call")
		expect(state.current?.classificacao).toBe(2)
		expect(state.undo).toMatchObject({ kind: "unconfirm", person: { classificacao: 1 }, changes: { hide_card: false } })
	})

	it("depois da próxima chamada, a confirmação anterior não é mais o que se desfaz", () => {
		// callPersonFn zera show_card de todos: o 1º confirmado fica sem a marca.
		const state = deriveConduct([confirmedRow(1), row(2, { show_card: true })])
		expect(state.undo?.kind).toBe("uncall")
		expect(state.undo?.person.classificacao).toBe(2)
	})

	it("desfeita a chamada, o mesmo militar volta a ser o próximo", () => {
		const state = deriveConduct([confirmedRow(1), row(2), row(3)])
		expect(state.current?.classificacao).toBe(2)
		expect(state.undo).toBeNull()
	})

	it("chamar fora de ordem e confirmar não pula ninguém: a fila parte da menor pendente", () => {
		// O 8º foi chamado fora de ordem e confirmado; 4º a 7º seguem na fila, nessa ordem.
		const state = deriveConduct([confirmedRow(1), confirmedRow(2), confirmedRow(3), row(4), row(5), row(6), row(7), confirmedRow(8), row(9)])
		expect(state.current?.classificacao).toBe(4)
		expect(state.upcoming.map((p) => p.classificacao)).toEqual([5, 6, 7, 9])
		expect(state.behind).toEqual([])
	})

	it("com alguém no telão, a fila são os demais pendentes desde o menor", () => {
		const state = deriveConduct([confirmedRow(1), row(2), row(3), row(8, { show_card: true })])
		expect(state.current?.classificacao).toBe(8)
		expect(state.upcoming.map((p) => p.classificacao)).toEqual([2, 3])
	})

	it("pulado sai da fila e vai para 'ficaram para trás'", () => {
		const state = deriveConduct([confirmedRow(1), row(2), row(3), row(4)], new Set([2]))
		expect(state.current?.classificacao).toBe(3)
		expect(state.upcoming.map((p) => p.classificacao)).toEqual([4])
		expect(state.behind.map((p) => p.classificacao)).toEqual([2])
		expect(state.isCurrentSkipped).toBe(false)
	})

	it("pulado chamado depois aparece no telão, não em 'ficaram para trás'", () => {
		const state = deriveConduct([row(2, { show_card: true }), row(3)], new Set([2]))
		expect(state.current?.classificacao).toBe(2)
		expect(state.step).toBe("reveal")
		expect(state.behind).toEqual([])
	})

	it("pulado confirmado sai de tudo", () => {
		const state = deriveConduct([confirmedRow(2), row(3)], new Set([2]))
		expect(state.behind).toEqual([])
		expect(state.current?.classificacao).toBe(3)
	})

	it("acabada a fila, os pulados voltam em ordem", () => {
		const state = deriveConduct([confirmedRow(1), row(2), row(4), confirmedRow(3)], new Set([2, 4]))
		expect(state.step).toBe("call")
		expect(state.current?.classificacao).toBe(2)
		expect(state.isCurrentSkipped).toBe(true)
		expect(state.upcoming.map((p) => p.classificacao)).toEqual([4])
		expect(state.behind).toEqual([])
	})

	it("todos confirmados: concluído", () => {
		const state = deriveConduct([confirmedRow(1), confirmedRow(2)])
		expect(state.step).toBe("done")
		expect(state.current).toBeNull()
		expect(state.confirmed).toBe(2)
		expect(state.total).toBe(2)
	})

	it("conta os sem OM só entre os não confirmados", () => {
		const state = deriveConduct([row(1, { localidade: null }), row(2, { localidade: null, hide_card: true }), row(3)])
		expect(state.missingOm).toBe(1)
	})

	it("edição vazia", () => {
		const state = deriveConduct([])
		expect(state).toMatchObject({ step: "done", current: null, total: 0, undo: null })
	})
})

describe("describeUndo", () => {
	it("diz o efeito com o militar", () => {
		const person = row(7, { nome: "FULANO" })
		expect(describeUndo({ kind: "uncall", person, changes: { show_card: false } })).toBe("Desfazer chamada de 7º FULANO")
		expect(describeUndo({ kind: "unreveal", person, changes: { show_om: false } })).toBe("Esconder a OM de 7º FULANO")
		expect(describeUndo({ kind: "unconfirm", person, changes: { hide_card: false } })).toBe("Reabrir a escolha de 7º FULANO")
	})
})

describe("deriveScreenView / describeScreen", () => {
	const editions = [
		{ id: "a", name: "2026", active: true, locked: false },
		{ id: "b", name: "2025", active: false, locked: false },
	]

	it("edição que não está no telão", () => {
		const view = deriveScreenView(editions, "b", [])
		expect(view).toEqual({ kind: "other-edition", activeName: "2026" })
		expect(describeScreen(view).headline).toBe("Telão mostra a edição 2026")
	})

	it("sem ninguém em cena: quadro de vagas", () => {
		expect(describeScreen(deriveScreenView(editions, "a", [row(1)])).headline).toBe("Quadro de vagas e mapa")
	})

	it("card sem OM e com OM", () => {
		const called = deriveScreenView(editions, "a", [row(7, { nome: "FULANO", show_card: true })])
		expect(describeScreen(called).headline).toBe("Card de 7º FULANO, OM ainda oculta")
		const revealed = deriveScreenView(editions, "a", [row(7, { nome: "FULANO", show_card: true, show_om: true })])
		expect(describeScreen(revealed).headline).toBe("Card de 7º FULANO com a OM GAP RJ")
	})

	it("confirmado não está mais no telão", () => {
		const view = deriveScreenView(editions, "a", [row(1, { show_card: true, show_om: true, hide_card: true })])
		expect(view.kind).toBe("board")
	})

	it("bloqueado diz o que aparece ao liberar", () => {
		const locked = [{ ...editions[0], locked: true }, editions[1]]
		const view = deriveScreenView(locked, "a", [row(7, { nome: "FULANO", show_card: true })])
		expect(view.kind).toBe("locked")
		expect(describeScreen(view)).toEqual({ headline: "Tela de espera", detail: "Ao liberar: Card de 7º FULANO, OM ainda oculta" })
	})
})

describe("isShortcutTarget", () => {
	it("aceita o corpo da página e recusa campo, botão e lista aberta", () => {
		expect(isShortcutTarget(null)).toBe(true)
		expect(isShortcutTarget({ tagName: "BODY", closest: () => null })).toBe(true)
		expect(isShortcutTarget({ tagName: "INPUT" })).toBe(false)
		expect(isShortcutTarget({ tagName: "BUTTON" })).toBe(false)
		expect(isShortcutTarget({ tagName: "DIV", isContentEditable: true })).toBe(false)
		expect(isShortcutTarget({ tagName: "DIV", closest: () => ({}) })).toBe(false)
	})
})

describe("personStatus", () => {
	it("cobre o ciclo inteiro", () => {
		expect(personStatus(row(1, { localidade: null }))).toBe("missing-om")
		expect(personStatus(row(1))).toBe("ready")
		expect(personStatus(row(1, { show_card: true }))).toBe("called")
		expect(personStatus(row(1, { show_card: true, show_om: true }))).toBe("revealed")
		expect(personStatus(row(1, { show_card: true, show_om: true, hide_card: true }))).toBe("confirmed")
		expect(personStatus(row(1, { hide_card: true }))).toBe("confirmed")
	})
})
