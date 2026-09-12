/**
 * @module elevation-controller
 * Fila de pedidos de elevação, fora do React.
 *
 * Existe separada do provider por duas razões. A primeira é testável: a semântica que
 * importa — um modal só, ninguém fica esperando para sempre, cancelar resolve `false` — é
 * lógica pura e não precisa de DOM para ser provada. A segunda é de correção: o `requestElevation`
 * devolvido ao chamador precisa ser uma promessa que sobrevive a re-renderizações, e estado
 * de React não serve de canal para isso.
 *
 * @domain app
 */

import type { AssurancePrompt } from "./assurance-error.ts"

type Resolver = (elevated: boolean) => void

export class ElevationController {
	#prompt: AssurancePrompt | null = null
	#resolvers: Resolver[] = []
	#listeners = new Set<() => void>()

	/**
	 * Pede a elevação e devolve o desfecho: `true` verificado, `false` cancelado.
	 *
	 * Pedido que chega com um modal já aberto NÃO enfileira um segundo: ele espera o mesmo
	 * desfecho. Duas mutações barradas pela mesma sessão precisam exatamente da mesma prova —
	 * mostrar dois modais em sequência cobraria dois códigos por um único problema. O motivo
	 * exibido continua sendo o do primeiro pedido, que é o que o usuário tinha em mente.
	 */
	request(prompt: AssurancePrompt): Promise<boolean> {
		return new Promise<boolean>((resolve) => {
			this.#resolvers.push(resolve)
			if (this.#prompt === null) {
				this.#prompt = prompt
				this.#emit()
			}
		})
	}

	/**
	 * Snapshot para `useSyncExternalStore`.
	 *
	 * Devolve a MESMA referência enquanto o pedido estiver aberto — um objeto novo a cada
	 * leitura faria o React re-renderizar em laço.
	 */
	getPrompt = (): AssurancePrompt | null => this.#prompt

	/** Fecha o pedido em aberto e acorda todos os chamadores. */
	settle(elevated: boolean): void {
		if (this.#prompt === null && this.#resolvers.length === 0) return
		const resolvers = this.#resolvers
		this.#resolvers = []
		this.#prompt = null
		this.#emit()
		for (const resolve of resolvers) resolve(elevated)
	}

	subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener)
		return () => {
			this.#listeners.delete(listener)
		}
	}

	#emit(): void {
		for (const listener of this.#listeners) listener()
	}
}
