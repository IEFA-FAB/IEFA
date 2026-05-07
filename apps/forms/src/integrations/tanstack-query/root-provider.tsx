import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

export function getContext() {
	return {
		queryClient: new QueryClient({
			defaultOptions: {
				queries: {
					gcTime: 1000 * 60 * 5,
				},
			},
		}),
	}
}

export function Provider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
