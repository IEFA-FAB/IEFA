// Policy Rules Domain Types

export type PolicyTarget = "product" | "recipe"

export interface PolicyRule {
	id: string
	target: PolicyTarget
	title: string
	description: string
	display_order: number
	active: boolean
	created_at: string
	updated_at: string
	deleted_at: string | null
}

export interface PolicyRuleInsert {
	target: PolicyTarget
	title: string
	description: string
	display_order?: number
	active?: boolean
}

export interface PolicyRuleUpdate {
	title?: string
	description?: string
	display_order?: number
	active?: boolean
}
