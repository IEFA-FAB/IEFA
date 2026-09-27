import type { Tables } from "@iefa/database/sisub"

// ─── Base Table Types ─────────────────────────────────────────────────────────

export type QuantityEstimate = Tables<"quantity_estimate">
export type QuantityEstimateKitchen = Tables<"quantity_estimate_kitchen">
export type QuantityEstimateSelection = Tables<"quantity_estimate_selection">
export type QuantityEstimateItem = Tables<"quantity_estimate_item">
/** Item como o detalhe do anexo devolve: com o padrão do insumo e a conservação, que decidem o ciclo não gravado. */
export type QuantityEstimateItemWithConservation = QuantityEstimateItem & { conservation_class?: string | null; ingredient_delivery_cycle?: string | null }

// ─── List com detalhes carregados ─────────────────────────────────────────────

export interface QuantityEstimateKitchenWithDetails extends QuantityEstimateKitchen {
	kitchen: { id: number; display_name: string | null }
	selections: (QuantityEstimateSelection & {
		template: {
			name: string | null
			template_type: string
		}
	})[]
}

export interface QuantityEstimateSnapshotSelection {
	template_name: string | null
	template_type: string | null
	kitchen_id: number | null
	kitchen_name: string | null
	repetitions: number
	snapshot_source: string
}

export interface QuantityEstimateSnapshotComponent {
	ingredient_id: string | null
	ingredient_name: string
	folder_description: string | null
	measure_unit: string | null
	estimated_quantity: number
	purchase_item_description: string | null
	purchase_measure_unit: string | null
	purchase_quantity: number | null
	catmat_item_codigo: number | null
	unit_price: number | null
	snapshot_source: string
	/** Limites resolvidos na conclusão; nulos em anexos concluídos antes de os limites existirem. */
	max_increase_percent: number | null
	max_quantity: number | null
	delivery_cycle: string | null
	min_order_quantity: number | null
	/** Quantidade mínima a ser cotada (art. 82, II), congelada na conclusão; nula em anexos anteriores. */
	min_quote_quantity?: number | null
}

/** Metadados de integridade computados por request (não persistidos). */
export interface QuantityEstimateMeta {
	/** Rascunho com quantitativos desatualizados vs. edição do cardápio. */
	is_stale: boolean
	price_research: {
		oldest_research_at: string | null
		validity_days: number
		is_expired: boolean
	}
	/** Composição congelada (só existe após conclusão). */
	snapshot: {
		selections: QuantityEstimateSnapshotSelection[]
		components: QuantityEstimateSnapshotComponent[]
	} | null
}

export interface QuantityEstimateWithDetails extends QuantityEstimate {
	kitchens: QuantityEstimateKitchenWithDetails[]
	items: QuantityEstimateItemWithConservation[]
	meta: QuantityEstimateMeta
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
	/** Vezes que o cardápio é produzido dentro da vigência do anexo (mesma unidade nos três regimes). */
	repetitions: number
	/**
	 * Só para exceções: ocorrências mensais esperadas do template. `repetitions` é
	 * derivado daqui × meses de vigência, e é recalculado quando a vigência muda.
	 */
	monthlyOccurrences?: number
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
	exceptionSelections: TemplateSelection[] // template_type = 'exception'
}

/** Chaves dos buckets de seleção — uma por regime de produção. */
export type SelectionBucket = "templateSelections" | "eventSelections" | "exceptionSelections"

/**
 * Estado completo do wizard do anexo
 */
export interface QuantityEstimateWizardState {
	title: string
	notes: string
	/** Vigência em meses; multiplica as ocorrências mensais das exceções. */
	validityMonths: number
	kitchenSelections: KitchenSelectionState[]
	/** Contratação (segmento) do anexo; null = todos os itens. */
	segmentId?: string | null
}
