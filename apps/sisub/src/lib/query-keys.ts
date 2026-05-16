import type { MealKey } from "@/types/domain/meal"
import type { ChatModule } from "@/types/domain/module-chat"
import type { PolicyTarget } from "@/types/domain/policy"

export const queryKeys = {
	auth: {
		user: () => ["auth", "user"] as const,
	},

	user: {
		data: (userId: string | null | undefined) => ["user_data", userId] as const,
		military: (nrOrdem: string | null | undefined) => ["military", nrOrdem] as const,
		nrOrdem: (userId: string | null | undefined) => ["user", userId, "nrOrdem"] as const,
		kitchens: () => ["user", "kitchens"] as const,
	},

	evaluation: {
		user: (userId: string | null | undefined) => ["evaluation", userId] as const,
		config: () => ["super-admin", "evaluation-config"] as const,
	},

	sisub: {
		units: () => ["sisub", "units"] as const,
		messHalls: () => ["sisub", "mess_halls"] as const,
		kitchenSettings: (kitchenId: number) => ["sisub", "kitchen-settings", kitchenId] as const,
		unitSettings: (unitId: number) => ["sisub", "unit-settings", unitId] as const,
		mcpKeys: () => ["sisub", "mcp-keys"] as const,
		policyRules: (target: PolicyTarget) => ["sisub", "policy-rules", target] as const,
		policyPrompt: (target: PolicyTarget) => ["sisub", "policy-prompt", target] as const,
		analyticsSessions: () => ["sisub", "analytics-chat-sessions"] as const,
		analyticsMessages: (sessionId: string) => ["sisub", "analytics-chat-messages", sessionId] as const,
		moduleSessions: (module: ChatModule, scopeId?: number) => ["sisub", "module-chat-sessions", module, scopeId ?? "global"] as const,
		moduleMessages: (sessionId: string) => ["sisub", "module-chat-messages", sessionId] as const,
	},

	planning: {
		all: () => ["planning"] as const,
		menus: () => ["planning", "menus"] as const,
		menu: (kitchenId: number | null, startDate: string, endDate: string) => ["planning", "menus", kitchenId, startDate, endDate] as const,
		day: () => ["planning", "day"] as const,
		dayDetail: (kitchenId: number | null, date: string) => ["planning", "day", kitchenId, date] as const,
		templates: (kitchenId: number | null) => ["planning", "templates", kitchenId] as const,
		trash: (kitchenId: number | null) => ["planning", "trash", kitchenId] as const,
	},

	templates: {
		all: () => ["menu_templates"] as const,
		list: (kitchenId: number | null) => ["menu_templates", kitchenId] as const,
		items: (templateId: string | null) => ["template_items", templateId] as const,
		detail: (templateId: string | null) => ["template", templateId] as const,
		deleted: (kitchenId: number | null) => ["deleted_templates", kitchenId] as const,
	},

	mealTypes: {
		all: () => ["meal_types"] as const,
		byKitchen: (kitchenId: number | null) => ["meal_types", kitchenId] as const,
	},

	dailyMenus: {
		all: () => ["daily_menus"] as const,
		content: (kitchenIds: number[], startDate: string, endDate: string) => ["dailyMenuContent", kitchenIds, startDate, endDate] as const,
	},

	recipes: {
		all: () => ["recipes"] as const,
		list: (kitchenId?: number | null) => ["recipes", { kitchen_id: kitchenId ?? null }] as const,
		detail: (id: string | undefined) => ["recipe", id] as const,
		versions: (recipeId: string | undefined) => ["recipe_versions", recipeId] as const,
	},

	presences: {
		all: () => ["presences"] as const,
		list: (date: string, meal: MealKey, messHallId: number) => ["presences", date, meal, messHallId] as const,
		confirm: (date: string, meal: MealKey, messHallId: number) => ["confirmPresence", date, meal, messHallId] as const,
		remove: (date: string, meal: MealKey, messHallId: number) => ["removePresence", date, meal, messHallId] as const,
		othersCountAll: () => ["othersCount"] as const,
		othersCount: (date: string, meal: string, messHallId: number) => ["othersCount", date, meal, messHallId] as const,
	},

	production: {
		all: () => ["production"] as const,
		board: (kitchenId: number, date: string) => ["production", "board", kitchenId, date] as const,
	},

	places: {
		graph: () => ["places_graph"] as const,
	},

	kitchenDraft: {
		all: () => ["kitchen_ata_draft"] as const,
		listAll: () => ["kitchen_ata_draft", "list"] as const,
		list: (kitchenId: number | null) => ["kitchen_ata_draft", "list", kitchenId] as const,
		pending: (kitchenId: number | null) => ["kitchen_ata_draft", "pending", kitchenId] as const,
	},

	ata: {
		all: () => ["procurement_list"] as const,
		listAll: () => ["procurement_list", "list"] as const,
		list: (unitId: number | null) => ["procurement_list", "list", unitId] as const,
		details: (ataId: string | null) => ["procurement_list", "details", ataId] as const,
		needs: (params: { startDate: string; endDate: string; kitchenId?: number; unitId?: number }) => ["procurement", "needs", params] as const,
		arp: (ataId: string | null) => ["procurement_arp", "ata", ataId] as const,
		empenhos: (arpItemId: string | null) => ["empenho", "item", arpItemId] as const,
	},

	compras: {
		uasg: (codigoUasg: string | null | undefined) => ["compras", "uasg", codigoUasg] as const,
	},

	unitDashboard: (unitId: number | null) => ["unit_dashboard", unitId] as const,

	mealForecasts: {
		list: (userId: string | undefined, startDate: string, endDate: string) => ["mealForecasts", userId, startDate, endDate] as const,
		userData: (userId: string | undefined) => ["userData", userId] as const,
	},

	dashboard: {
		forecasts: (params: { mess_hall_id?: number; startDate?: string; endDate?: string }) => ["dashboard", "forecasts", params] as const,
		presences: (params: { mess_hall_id?: number; startDate?: string; endDate?: string }) => ["dashboard", "presences", params] as const,
		messHalls: (unitId?: number) => ["mess-halls", unitId] as const,
		units: () => ["units"] as const,
		userData: (ids?: string[]) => ["user-data", ids] as const,
		userMilitaryData: (nrOrdemList?: string[]) => ["user-military-data", nrOrdemList] as const,
	},
}
