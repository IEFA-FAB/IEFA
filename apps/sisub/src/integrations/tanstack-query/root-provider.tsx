import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * Mutation nunca repete sozinha. É o default do TanStack Query 5 (`retry: 0`), escrito aqui
 * para não mudar calado: a server fn responde 503 em queda de conexão e prazo do banco
 * (`handleDomainError`), e o statement pode ter sido aplicado antes de a conexão cair, então
 * repetir um insert ou uma baixa de estoque duplicaria a escrita. Quem repete é a pessoa, pelo
 * botão da tela; escrita que precisa aguentar repetição carrega o próprio identificador
 * (ex.: `LateIssueCard`). Query segue o default (3 tentativas no navegador): leitura repete
 * sem efeito.
 */
export const QUERY_CLIENT_DEFAULTS = { mutations: { retry: 0 } } as const

// On the server (SSR), a new QueryClient is created per request to avoid
// cross-request cache contamination. On the client, getRouter() is called
// once, so this effectively produces a single instance per browser session.
export function getContext() {
	return {
		queryClient: new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULTS }),
	}
}

export function Provider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
