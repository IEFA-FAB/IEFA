import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Create QueryClient once at module scope
// This ensures only one instance exists throughout the application lifecycle
const queryClient = new QueryClient();

export function getContext() {
	return {
		queryClient,
	};
}

export function Provider({
	children,
	queryClient,
}: {
	children: React.ReactNode;
	queryClient: QueryClient;
}) {
	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}
