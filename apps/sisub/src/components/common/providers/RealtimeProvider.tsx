import { useRealtimeSubscription } from "@/hooks/data/useRealtime"

/**
 * Provider para subscrições Realtime globais
 *
 * Escuta mudanças em tabelas críticas e invalida queries relevantes
 * Deve envolver a aplicação no __root.tsx
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
	// Escutar mudanças em daily_menu (planejamento de cardápio)
	useRealtimeSubscription({
		table: "daily_menu",
		event: "*",
		queryKeyPrefix: ["planning"],
		message: "Cardápio atualizado por outro usuário",
	})

	// Escutar mudanças em recipes (catálogo de receitas)
	useRealtimeSubscription({
		table: "recipes",
		event: "*",
		queryKeyPrefix: ["recipes"],
		message: "Receita atualizada por outro usuário",
	})

	// Escutar mudanças em menu_items (itens do cardápio)
	useRealtimeSubscription({
		table: "menu_items",
		event: "*",
		queryKeyPrefix: ["planning", "procurement"],
		message: "Item do cardápio atualizado",
	})

	return <>{children}</>
}
