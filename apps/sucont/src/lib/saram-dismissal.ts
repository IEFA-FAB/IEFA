/**
 * @module saram-dismissal
 * Dispensa do pedido de SARAM, guardada FORA do componente de propósito.
 *
 * O `HubLayout` — que monta o diálogo — é renderizado por CADA uma das nove rotas
 * do hub; não é um layout compartilhado do roteador. Em estado local, "Agora não"
 * morreria na primeira navegação e o diálogo reabriria sobre a tela seguinte.
 *
 * `sessionStorage` atravessa remontagem e F5 e some ao fechar a aba: no próximo
 * login o pedido volta, que é o comportamento anunciado ao usuário.
 *
 * Mora em `lib/` para que o `__root` possa esquecer a dispensa no logout sem
 * importar um componente de tela.
 */

const DISMISS_KEY = "sucont:saram-dismissed"

/**
 * Roda na inicialização do estado, que no SSR não tem `window`. Não há divergência
 * de hidratação: o diálogo só abre depois que a consulta de identidade resolve, o
 * que nunca acontece no servidor.
 */
export function readSaramDismissal(): boolean {
	if (typeof window === "undefined") return false
	try {
		return window.sessionStorage.getItem(DISMISS_KEY) === "1"
	} catch {
		// Armazenamento bloqueado (política do navegador, aba restrita): não dispensar
		// é o pior caso aceitável — pedir de novo, nunca gravar errado.
		return false
	}
}

export function rememberSaramDismissal(): void {
	try {
		window.sessionStorage.setItem(DISMISS_KEY, "1")
	} catch {
		// Ver `readSaramDismissal`: sem armazenamento o pedido volta na próxima tela.
	}
}

/**
 * Esquece a dispensa. Chamado no `SIGNED_OUT` pela mesma razão que o cache de
 * identidade é descartado ali: numa máquina compartilhada, o "agora não" de quem
 * saiu calaria o pedido para quem entra em seguida.
 */
export function forgetSaramDismissal(): void {
	try {
		window.sessionStorage.removeItem(DISMISS_KEY)
	} catch {
		// Sem armazenamento não há dispensa gravada para esquecer.
	}
}
