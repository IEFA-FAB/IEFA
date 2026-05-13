import type { Tables } from "@iefa/database/sisub"

// ─── Base Table Types ─────────────────────────────────────────────────────────

export type ProcurementList = Tables<"procurement_list">
export type ProcurementListKitchen = Tables<"procurement_list_kitchen">
export type ProcurementListSelection = Tables<"procurement_list_selection">
export type ProcurementListItem = Tables<"procurement_list_item">

export type KitchenAtaDraft = Tables<"kitchen_ata_draft">
export type KitchenAtaDraftSelection = Tables<"kitchen_ata_draft_selection">

// ─── List com detalhes carregados ─────────────────────────────────────────────

export interface AtaKitchenWithDetails extends ProcurementListKitchen {
	kitchen: { id: number; display_name: string | null }
	selections: (ProcurementListSelection & {
		template: {
			name: string | null
			template_type: string
		}
	})[]
}

export interface AtaWithDetails extends ProcurementList {
	kitchens: AtaKitchenWithDetails[]
	items: ProcurementListItem[]
}

// ─── Rascunho com seleções carregadas ────────────────────────────────────────

export interface DraftWithSelections extends KitchenAtaDraft {
	selections: (KitchenAtaDraftSelection & {
		template: {
			id: string
			name: string | null
			template_type: string
		}
	})[]
}

// ─── Estado do Wizard (não persiste até salvar) ───────────────────────────────

/**
 * Seleção de um template/evento com número de repetições.
 * O headcount de cada preparação é definido individualmente em
 * menu_template_items.headcount_override — não existe padrão fixo no template.
 */
export interface TemplateSelection {
	templateId: string
	templateName: string
	repetitions: number
}

/**
 * Estado de seleção por cozinha (usado no wizard)
 */
export interface KitchenSelectionState {
	kitchenId: number
	kitchenName: string
	deliveryNotes: string
	templateSelections: TemplateSelection[] // template_type = 'weekly'
	eventSelections: TemplateSelection[] // template_type = 'event'
}

/**
 * Estado completo do wizard da ATA
 */
export interface AtaWizardState {
	title: string
	notes: string
	kitchenSelections: KitchenSelectionState[]
}
