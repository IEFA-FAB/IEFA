import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Criar o QueryClient uma única vez no escopo do módulo
// Isso garante que apenas uma instância existe durante toda a aplicação
const queryClient = new QueryClient()

export function getContext() {
	return {
		queryClient,
	}
}

export function Provider({
	children,
	queryClient,
}: {
	children: React.ReactNode
	queryClient: QueryClient
}) {
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
