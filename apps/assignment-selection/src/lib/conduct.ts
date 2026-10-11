import type { Edition, Person } from "@iefa/database/assignment-selection"

/**
 * Condução da escolha, derivada só das flags do militar (`show_card`, `show_om`,
 * `hide_card`). Nada aqui vive em memória do navegador: recarregar a página, trocar de
 * notebook ou abrir um segundo controlador chega ao mesmo passo.
 *
 * O ciclo de cada militar:
 *   chamar   → `callPersonFn` (só ele com `show_card`; zera `show_om` de todos)
 *   revelar  → `show_om = true` (a OM aparece no card e no mapa)
 *   confirmar → `hide_card = true` (o card sai, o rosto vai para o mapa)
 *
 * O confirmado mantém `show_card` até a próxima chamada, que o apaga. É isso que deixa
 * desfazer a confirmação enquanto ninguém novo foi chamado.
 */

type PersonFlags = Pick<Person, "id" | "classificacao" | "nome" | "localidade" | "show_card" | "show_om" | "hide_card">

export type ConductStep = "call" | "reveal" | "confirm" | "done"

export type UndoAction<P extends PersonFlags = PersonFlags> =
	/** Chamou e ainda não revelou: tira o card do telão. */
	| { kind: "uncall"; person: P; changes: { show_card: false } }
	/** Revelou: esconde a OM, o card continua no telão. */
	| { kind: "unreveal"; person: P; changes: { show_om: false } }
	/** Confirmou e ninguém foi chamado depois: o card volta com a OM revelada. */
	| { kind: "unconfirm"; person: P; changes: { hide_card: false } }

export interface ConductState<P extends PersonFlags = PersonFlags> {
	/** Passo da ação principal. */
	step: ConductStep
	/** Militar em foco: o que está no telão, senão o próximo a chamar. */
	current: P | null
	/** Quem vem depois do militar em foco, na ordem de classificação. */
	upcoming: P[]
	/**
	 * Não confirmados que ficaram para trás (ausente na hora, chamado fora de ordem).
	 * Não somem da tela: o operador os chama quando o locutor pedir.
	 */
	behind: P[]
	undo: UndoAction<P> | null
	total: number
	confirmed: number
	/** Ainda sem OM preenchida, entre os não confirmados. */
	missingOm: number
}

export function byClassification<P extends Pick<Person, "classificacao">>(persons: readonly P[]): P[] {
	return [...persons].sort((a, b) => a.classificacao - b.classificacao)
}

/** O militar em destaque no telão: a mesma regra de `routes/index.tsx`. */
export function findOnStage<P extends Pick<Person, "show_card" | "hide_card" | "classificacao">>(persons: readonly P[]): P | null {
	return byClassification(persons).find((p) => p.show_card && !p.hide_card) ?? null
}

export function deriveConduct<P extends PersonFlags>(persons: readonly P[]): ConductState<P> {
	const ordered = byClassification(persons)
	const pending = ordered.filter((p) => !p.hide_card)
	const confirmed = ordered.length - pending.length
	const missingOm = pending.filter((p) => !p.localidade).length
	const onStage = ordered.find((p) => p.show_card && !p.hide_card) ?? null

	// Fronteira: a maior classificação já confirmada. A fila segue dela para a frente,
	// então quem ficou para trás (ausente) não volta a ser "o próximo" a cada passo.
	const frontier = ordered.reduce((max, p) => (p.hide_card && p.classificacao > max ? p.classificacao : max), Number.NEGATIVE_INFINITY)
	const anchor = onStage?.classificacao ?? frontier
	const ahead = pending.filter((p) => p !== onStage && p.classificacao > anchor)
	const behind = pending.filter((p) => p !== onStage && p.classificacao < anchor)

	const base = { total: ordered.length, confirmed, missingOm, behind }

	if (onStage) {
		const step: ConductStep = onStage.show_om ? "confirm" : "reveal"
		const undo: UndoAction<P> = onStage.show_om
			? { kind: "unreveal", person: onStage, changes: { show_om: false } }
			: { kind: "uncall", person: onStage, changes: { show_card: false } }
		return { ...base, step, current: onStage, upcoming: ahead, undo }
	}

	// Ninguém em cena. Quem confirmou por último ainda tem `show_card` (a próxima chamada
	// o apaga); é ele que o desfazer devolve ao telão.
	const justConfirmed = [...ordered].reverse().find((p) => p.show_card && p.hide_card) ?? null
	const undo: UndoAction<P> | null = justConfirmed ? { kind: "unconfirm", person: justConfirmed, changes: { hide_card: false } } : null

	// Sem ninguém à frente da fronteira, a fila volta para quem ficou para trás.
	const queue = ahead.length > 0 ? ahead : behind
	const [current = null, ...upcoming] = queue
	return {
		...base,
		behind: ahead.length > 0 ? behind : [],
		step: current ? "call" : "done",
		current,
		upcoming,
		undo,
	}
}

/** Rótulo do botão de desfazer: diz o efeito no telão, não o nome da flag. */
export function describeUndo(undo: UndoAction): string {
	const who = `${undo.person.classificacao}º ${undo.person.nome}`
	switch (undo.kind) {
		case "uncall":
			return `Desfazer chamada de ${who}`
		case "unreveal":
			return `Esconder a OM de ${who}`
		case "unconfirm":
			return `Reabrir a escolha de ${who}`
	}
}

/** O que a plateia está vendo agora. */
export type ScreenView =
	| { kind: "no-edition" }
	| { kind: "other-edition"; activeName: string | null }
	| { kind: "locked"; behind: Exclude<ScreenView, { kind: "locked" | "no-edition" | "other-edition" }> }
	| { kind: "board" }
	| { kind: "card"; person: Pick<Person, "classificacao" | "nome" | "localidade">; revealed: boolean }

export function deriveScreenView(
	editions: readonly Pick<Edition, "id" | "name" | "active" | "locked">[],
	editionId: string | null,
	persons: readonly Pick<Person, "classificacao" | "nome" | "localidade" | "show_card" | "show_om" | "hide_card">[]
): ScreenView {
	if (!editionId) return { kind: "no-edition" }
	const active = editions.find((e) => e.active) ?? null
	if (!active || active.id !== editionId) return { kind: "other-edition", activeName: active?.name ?? null }

	const onStage = findOnStage(persons)
	const view: Extract<ScreenView, { kind: "board" | "card" }> = onStage ? { kind: "card", person: onStage, revealed: onStage.show_om } : { kind: "board" }
	return active.locked ? { kind: "locked", behind: view } : view
}

function describeOpenView(view: Extract<ScreenView, { kind: "board" | "card" }>): string {
	if (view.kind === "board") return "Quadro de vagas e mapa"
	const who = `${view.person.classificacao}º ${view.person.nome}`
	return view.revealed ? `Card de ${who} com a OM ${view.person.localidade ?? "?"}` : `Card de ${who}, OM ainda oculta`
}

/** Frase curta do que está no telão, para a faixa fixa e para o leitor de tela. */
export function describeScreen(view: ScreenView): { headline: string; detail: string | null } {
	switch (view.kind) {
		case "no-edition":
			return { headline: "Nenhuma edição cadastrada", detail: null }
		case "other-edition":
			return {
				headline: view.activeName ? `Telão mostra a edição ${view.activeName}` : "Telão sem edição ativa",
				detail: "Nada desta edição aparece na projeção até ativá-la.",
			}
		case "locked":
			return { headline: "Tela de espera", detail: `Ao liberar: ${describeOpenView(view.behind)}` }
		case "board":
		case "card":
			return { headline: describeOpenView(view), detail: null }
	}
}

/**
 * O atalho da ação principal (Enter) só vale fora de campo e de botão: ali o Enter já tem
 * dono, e roubá-lo confirmaria um militar enquanto o operador escolhe a OM.
 */
export function isShortcutTarget(target: { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown } | null): boolean {
	if (!target?.tagName) return true
	if (target.isContentEditable) return false
	if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY"].includes(target.tagName.toUpperCase())) return false
	if (target.closest?.("[role=dialog],[role=alertdialog],[role=listbox],[role=combobox],[role=menu],[role=tablist]")) return false
	return true
}

export type PersonStatus = "confirmed" | "revealed" | "called" | "missing-om" | "ready"

/** Situação de um militar na lista de preparo. */
export function personStatus(person: Pick<Person, "localidade" | "show_card" | "show_om" | "hide_card">): PersonStatus {
	if (person.hide_card) return "confirmed"
	if (person.show_card) return person.show_om ? "revealed" : "called"
	return person.localidade ? "ready" : "missing-om"
}
