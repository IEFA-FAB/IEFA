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

export interface AtaSnapshotSelection {
	template_name: string | null
	template_type: string | null
	kitchen_id: number | null
	kitchen_name: string | null
	repetitions: number
	snapshot_source: string
}

export interface AtaSnapshotComponent {
	ingredient_name: string
	folder_description: string | null
	measure_unit: string | null
	total_quantity: string
	purchase_item_description: string | null
	purchase_measure_unit: string | null
	purchase_quantity: string | null
	catmat_item_codigo: number | null
	unit_price: string | null
	snapshot_source: string
}

/** Metadados de integridade computados por request (não persistidos). */
export interface AtaMeta {
	/** Rascunho com quantitativos desatualizados vs. edição do cardápio. */
	is_stale: boolean
	price_research: {
		oldest_research_at: string | null
		validity_days: number
		is_expired: boolean
	}
	/** Composição congelada (só existe após publicação). */
	snapshot: {
		selections: AtaSnapshotSelection[]
		components: AtaSnapshotComponent[]
	} | null
}

export interface AtaWithDetails extends ProcurementList {
	kitchens: AtaKitchenWithDetails[]
	items: ProcurementListItem[]
	meta: AtaMeta
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
