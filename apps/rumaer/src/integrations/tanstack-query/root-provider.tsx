import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// On the server (SSR), a new QueryClient is created per request to avoid
// cross-request cache contamination. On the client, getRouter() is called
// once, so this effectively produces a single instance per browser session.
export function getContext() {
	return {
		queryClient: new QueryClient({
			defaultOptions: {
				queries: {
					gcTime: 1000 * 60 * 5, // 5 min — explicit, prevents unbounded cache accumulation
				},
			},
		}),
	}
}

export function Provider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
