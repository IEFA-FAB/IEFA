import type { Tables } from "@/types/supabase.types"

// ─── Base Table Types ─────────────────────────────────────────────────────────

export type ProcurementAta = Tables<"procurement_ata">
export type ProcurementAtaKitchen = Tables<"procurement_ata_kitchen">
export type ProcurementAtaSelection = Tables<"procurement_ata_selection">
export type ProcurementAtaItem = Tables<"procurement_ata_item">

export type KitchenAtaDraft = Tables<"kitchen_ata_draft">
export type KitchenAtaDraftSelection = Tables<"kitchen_ata_draft_selection">

// ─── ATA com detalhes carregados ─────────────────────────────────────────────

export interface AtaKitchenWithDetails extends ProcurementAtaKitchen {
	kitchen: { id: number; display_name: string | null }
	selections: (ProcurementAtaSelection & {
		template: {
			name: string | null
			default_headcount: number
			template_type: string
		}
	})[]
}

export interface AtaWithDetails extends ProcurementAta {
	kitchens: AtaKitchenWithDetails[]
	items: ProcurementAtaItem[]
}

// ─── Rascunho com seleções carregadas ────────────────────────────────────────

export interface DraftWithSelections extends KitchenAtaDraft {
	selections: (KitchenAtaDraftSelection & {
		template: {
			id: string
			name: string | null
			default_headcount: number
			template_type: string
		}
	})[]
}

// ─── Estado do Wizard (não persiste até salvar) ───────────────────────────────

/**
 * Seleção de um template/evento com número de repetições
 */
export interface TemplateSelection {
	templateId: string
	templateName: string
	defaultHeadcount: number
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
