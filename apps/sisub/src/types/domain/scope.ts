/**
 * Contexto de escopo injetado pelos layout routes com parâmetro dinâmico.
 *
 * Cada rota de layout ($messHallId/route.tsx, $kitchenId/route.tsx, $unitId/route.tsx)
 * retorna esse objeto via `beforeLoad`, que é lido pelo AppShell através de `useMatches()`.
 *
 * Permite que o AppShell:
 *  - Exiba o nome do escopo no breadcrumb (ex: "GAP-AF")
 *  - Gere URLs dinâmicas na sidebar (ex: /messhall/3/presence)
 */
export interface ScopeContext {
	/** ID numérico do escopo (mess_hall_id, kitchen_id ou unit_id) */
	id: number
	/** Nome legível para exibição (display_name ou code) */
	name: string
}
