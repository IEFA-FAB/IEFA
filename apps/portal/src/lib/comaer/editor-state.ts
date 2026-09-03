/**
 * @module comaer/editor-state
 * Estado do documento durante a conversa: o que mudou no turno e como desfazê-lo.
 *
 * Puro e fora do componente porque é a regra que decide se dá para confiar na IA mexendo
 * no documento. Sem ver o que mudou, o redator relê o documento inteiro a cada mensagem;
 * sem desfazer, ele não deixa o modelo mexer.
 *
 * A unidade é o TURNO, não o remendo: uma única mensagem pode disparar três chamadas de
 * ferramenta, e desfazer uma delas deixaria o documento num meio-termo que ninguém pediu.
 */

import { dropModelNulls } from "./tools/definitions"
import { applyPatch, PatchError } from "./tools/patch"
import type { DocumentInput } from "./types"

export interface ConversationTurn {
	/** O documento como estava ANTES do turno — é para cá que o desfazer volta. */
	before: DocumentInput
	/** Blocos tocados no turno, para o preview destacar. */
	touched: string[]
	/** Quantos remendos entraram — o que a tela mostra como "3 alterações". */
	changes: number
}

export interface EditorState {
	document: DocumentInput
	turns: ConversationTurn[]
	/**
	 * Nome da ferramenta cujo remendo foi recusado.
	 *
	 * O documento fica intacto, mas a transcrição continua mostrando “↳ write_body” como se
	 * algo tivesse acontecido. Sem isto, o usuário vê a ferramenta rodar e não mudar nada, e
	 * conclui que a folha é que está errada.
	 */
	rejectedPatch?: string
}

export function initialEditorState(document: DocumentInput): EditorState {
	return { document, turns: [] }
}

/** Edição manual: não abre turno — o desfazer é da conversa, não do teclado. */
export function editDocument(state: EditorState, patch: Partial<DocumentInput>): EditorState {
	return { ...state, document: { ...state.document, ...patch } }
}

/** Começa um turno da conversa, guardando o documento de agora para o desfazer. */
export function beginTurn(state: EditorState): EditorState {
	return { ...state, rejectedPatch: undefined, turns: [...state.turns, { before: state.document, touched: [], changes: 0 }] }
}

/**
 * Aplica um remendo do modelo dentro do turno corrente.
 *
 * Remendo inválido não derruba nada: o servidor já devolveu o erro ao modelo, e aqui o
 * documento fica como estava. O contrário — aplicar pela metade — deixaria a tela
 * diferente do que o modelo acha que escreveu.
 */
export function applyChatPatch(state: EditorState, name: string, args: Record<string, unknown>): EditorState {
	try {
		// A mesma poda de `null` do servidor. O modelo manda `null` para dizer "não mexi", e o
		// despacho do servidor já a aplica; o cliente aplicava o remendo cru, e as duas metades
		// do mesmo caminho passavam a discordar sobre o que o modelo pediu.
		const patch = applyPatch(state.document, name, dropModelNulls(args))
		const turns = state.turns.length > 0 ? state.turns : [{ before: state.document, touched: [], changes: 0 }]
		const last = turns[turns.length - 1]
		return {
			document: patch.document,
			rejectedPatch: undefined,
			turns: [...turns.slice(0, -1), { ...last, touched: [...new Set([...last.touched, ...patch.touched])], changes: last.changes + 1 }],
		}
	} catch (error) {
		if (error instanceof PatchError) return { ...state, rejectedPatch: name }
		throw error
	}
}

/** Desfaz o último turno inteiro. Sem turno, devolve o estado intacto. */
export function undoTurn(state: EditorState): EditorState {
	// Turno em que o modelo só respondeu uma pergunta não alterou nada, e desfazê-lo não
	// faz nada — o usuário conclui que o desfazer está quebrado e clica de novo, desfazendo
	// o que não queria. Turnos vazios são descartados antes de reverter.
	const turns = [...state.turns]
	while (turns.length > 0 && turns[turns.length - 1].changes === 0) turns.pop()
	const last = turns[turns.length - 1]
	if (!last) return { ...state, turns: [] }
	return { document: last.before, turns: turns.slice(0, -1) }
}

/** Há algo a desfazer? Turno sem alteração não conta. */
export function canUndo(state: EditorState): boolean {
	return state.turns.some((turn) => turn.changes > 0)
}

/** Blocos alterados no último turno — o que o preview destaca. */
export function touchedBlocks(state: EditorState): string[] {
	return state.turns[state.turns.length - 1]?.touched ?? []
}

export function lastTurnChanges(state: EditorState): number {
	return state.turns[state.turns.length - 1]?.changes ?? 0
}
