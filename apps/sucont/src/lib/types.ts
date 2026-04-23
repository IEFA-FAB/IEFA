export interface Tool {
	id: string
	title: string
	description: string
	url?: string
	icon: string
	category: string
	iconColor?: string
	/** Rota interna do TanStack Router. Quando presente, o card navega internamente em vez de abrir URL externa. */
	internalPath?: string
}

export interface ChecklistItem {
	id: string
	task: string
	deadline: string
	description: string
	responsible: string
	path?: string
}

export interface Notice {
	id: string
	content: string
	date: string
	type: "info" | "alert"
}

export interface UnitResponsibility {
	code: string
	name: string
	operator: string
}
