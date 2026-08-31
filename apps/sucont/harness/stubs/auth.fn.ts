/**
 * Stub do `#/server/auth.fn` para o harness.
 *
 * O módulo real declara server functions do TanStack Start, que exigem o
 * pipeline do Start (`#tanstack-router-entry`) — o harness roda em Vite puro, de
 * propósito, para não depender do servidor do app. Aqui a sessão vem semeada no
 * cache do react-query, então esta função não chega a ser chamada; existe para
 * que o grafo de imports resolva.
 */
export async function getServerSessionFn(): Promise<{ user: null }> {
	return { user: null }
}
