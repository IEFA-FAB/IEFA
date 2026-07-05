import { z } from "zod"
import { KitchenIdSchema, UuidSchema } from "./common.ts"

export const FetchProcurementNeedsSchema = z.object({
	startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
	endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
	kitchenId: KitchenIdSchema.optional(),
	unitId: KitchenIdSchema.optional(),
})
export type FetchProcurementNeeds = z.infer<typeof FetchProcurementNeedsSchema>

// ─── Purchase item (CRUD + junction) ─────────────────────────────────────────

export const PurchaseItemWriteSchema = z.object({
	description: z.string().min(1, "Descrição obrigatória"),
	detailed_description: z.string().nullable().optional(),
	delivery_conditioning: z.string().nullable().optional(),
	purchase_measure_unit: z.string().nullable().optional(),
	catmat_item_codigo: z.number().int().positive().nullable().optional(),
	catmat_item_descricao: z.string().nullable().optional(),
	catmat_match_status: z.enum(["pending", "matched", "review", "no_match", "skip"]).nullable().optional(),
	catmat_match_score: z.number().min(0).max(1).nullable().optional(),
	gpc_segment_code: z.string().nullable().optional(),
	gpc_family_code: z.string().nullable().optional(),
	gpc_class_code: z.string().nullable().optional(),
	gpc_brick_code: z.string().nullable().optional(),
	unit_price: z.number().positive().nullable().optional(),
})
export type PurchaseItemWrite = z.infer<typeof PurchaseItemWriteSchema>

export const PurchaseItemIngredientWriteSchema = z.object({
	purchase_item_id: UuidSchema,
	ingredient_id: UuidSchema,
	conversion_factor: z.number().positive().default(1.0),
	conversion_notes: z.string().nullable().optional(),
	is_default: z.boolean().default(false),
})
export type PurchaseItemIngredientWrite = z.infer<typeof PurchaseItemIngredientWriteSchema>

export const FetchPurchaseItemsSchema = z.object({ search: z.string().optional() })
export type FetchPurchaseItems = z.infer<typeof FetchPurchaseItemsSchema>

export const FetchIngredientPurchaseItemsSchema = z.object({ ingredientId: UuidSchema })
export type FetchIngredientPurchaseItems = z.infer<typeof FetchIngredientPurchaseItemsSchema>

export const FetchPurchaseItemSchema = z.object({ id: UuidSchema })
export type FetchPurchaseItem = z.infer<typeof FetchPurchaseItemSchema>

export const CreatePurchaseItemSchema = z.object({ payload: PurchaseItemWriteSchema })
export type CreatePurchaseItem = z.infer<typeof CreatePurchaseItemSchema>

export const UpdatePurchaseItemSchema = z.object({ id: UuidSchema, payload: PurchaseItemWriteSchema })
export type UpdatePurchaseItem = z.infer<typeof UpdatePurchaseItemSchema>

export const DeletePurchaseItemSchema = z.object({ id: UuidSchema })
export type DeletePurchaseItem = z.infer<typeof DeletePurchaseItemSchema>

export const FetchPurchaseItemIngredientsSchema = z.object({ purchaseItemId: UuidSchema })
export type FetchPurchaseItemIngredients = z.infer<typeof FetchPurchaseItemIngredientsSchema>

export const UpsertPurchaseItemIngredientSchema = z.object({ payload: PurchaseItemIngredientWriteSchema })
export type UpsertPurchaseItemIngredient = z.infer<typeof UpsertPurchaseItemIngredientSchema>

export const DeletePurchaseItemIngredientSchema = z.object({ id: UuidSchema })
export type DeletePurchaseItemIngredient = z.infer<typeof DeletePurchaseItemIngredientSchema>

export const SetDefaultPurchaseItemIngredientSchema = z.object({ id: UuidSchema, purchaseItemId: UuidSchema })
export type SetDefaultPurchaseItemIngredient = z.infer<typeof SetDefaultPurchaseItemIngredientSchema>

// ─── Kitchen ATA draft (pending → sent lifecycle) ────────────────────────────

export const TemplateSelectionSchema = z.object({
	templateId: z.string(),
	templateName: z.string(),
	repetitions: z.number().min(1),
})
export type TemplateSelectionInput = z.infer<typeof TemplateSelectionSchema>

export const FetchKitchenDraftsSchema = z.object({ kitchenId: z.number() })
export type FetchKitchenDrafts = z.infer<typeof FetchKitchenDraftsSchema>

export const FetchPendingDraftSchema = z.object({ kitchenId: z.number() })
export type FetchPendingDraft = z.infer<typeof FetchPendingDraftSchema>

export const CreateKitchenDraftSchema = z.object({
	kitchenId: z.number(),
	title: z.string().min(1),
	notes: z.string().optional(),
	selections: z.array(TemplateSelectionSchema),
})
export type CreateKitchenDraft = z.infer<typeof CreateKitchenDraftSchema>

export const UpdateKitchenDraftSchema = z.object({
	draftId: z.string(),
	updates: z.object({
		title: z.string().min(1).optional(),
		notes: z.string().optional().nullable(),
	}),
	selections: z.array(TemplateSelectionSchema).optional(),
})
export type UpdateKitchenDraft = z.infer<typeof UpdateKitchenDraftSchema>

export const SendKitchenDraftSchema = z.object({ draftId: z.string() })
export type SendKitchenDraft = z.infer<typeof SendKitchenDraftSchema>

export const DeleteKitchenDraftSchema = z.object({ draftId: z.string() })
export type DeleteKitchenDraft = z.infer<typeof DeleteKitchenDraftSchema>

// ─── Unit procurement dashboard ──────────────────────────────────────────────

export const FetchUnitDashboardSchema = z.object({ unitId: z.number() })
export type FetchUnitDashboard = z.infer<typeof FetchUnitDashboardSchema>

// ─── ATA lifecycle (procurement_list) ────────────────────────────────────────

export const KitchenSelectionSchema = z.object({
	kitchenId: z.number(),
	kitchenName: z.string(),
	deliveryNotes: z.string(),
	templateSelections: z.array(TemplateSelectionSchema),
	eventSelections: z.array(TemplateSelectionSchema),
})
export type KitchenSelectionInput = z.infer<typeof KitchenSelectionSchema>

export const CalculateAtaNeedsSchema = z.object({
	kitchenSelections: z.array(KitchenSelectionSchema),
})
export type CalculateAtaNeeds = z.infer<typeof CalculateAtaNeedsSchema>

export const CreateAtaDraftSchema = z.object({ unitId: z.number() })
export type CreateAtaDraft = z.infer<typeof CreateAtaDraftSchema>

export const UpdateAtaDraftSchema = z.object({
	draftId: UuidSchema,
	title: z.string().optional(),
	notes: z.string().optional(),
	wizardStep: z.number().min(1).max(4).optional(),
	kitchenSelections: z.array(KitchenSelectionSchema).optional(),
})
export type UpdateAtaDraft = z.infer<typeof UpdateAtaDraftSchema>

export const DraftItemSchema = z.object({
	ata_item_id: UuidSchema.optional().nullable(), // presente em itens já persistidos
	ingredient_id: z.string().optional().nullable(),
	ingredient_name: z.string(),
	folder_id: z.string().optional().nullable(),
	folder_description: z.string().optional().nullable(),
	measure_unit: z.string().optional().nullable(),
	total_quantity: z.number(),
	purchase_item_id: z.string().optional().nullable(),
	purchase_item_description: z.string().optional().nullable(),
	purchase_measure_unit: z.string().optional().nullable(),
	purchase_quantity: z.number().optional().nullable(),
	conversion_factor: z.number().optional().nullable(),
	catmat_item_codigo: z.number().optional().nullable(),
	catmat_item_descricao: z.string().optional().nullable(),
	unit_price: z.number().optional().nullable(),
	item_description: z.string().optional().nullable(),
})
export type DraftItem = z.infer<typeof DraftItemSchema>

const ResearchLinkSchema = z.object({
	ingredientId: z.string(),
	researchId: UuidSchema,
	researchItemId: UuidSchema,
})

export const SaveAtaDraftItemsSchema = z.object({
	draftId: UuidSchema,
	items: z.array(DraftItemSchema),
	researchLinks: z.array(ResearchLinkSchema).optional(),
})
export type SaveAtaDraftItems = z.infer<typeof SaveAtaDraftItemsSchema>

export const FinalizeAtaDraftSchema = z.object({
	draftId: UuidSchema,
	title: z.string().min(1),
	notes: z.string().optional(),
	items: z.array(DraftItemSchema),
	researchLinks: z.array(ResearchLinkSchema).optional(),
})
export type FinalizeAtaDraft = z.infer<typeof FinalizeAtaDraftSchema>

export const CreateAtaSchema = z.object({
	unitId: z.number(),
	title: z.string().min(1),
	notes: z.string().optional(),
	kitchenSelections: z.array(KitchenSelectionSchema),
	items: z.array(
		z.object({
			ingredient_id: z.string().optional().nullable(),
			ingredient_name: z.string(),
			folder_id: z.string().optional().nullable(),
			folder_description: z.string().optional().nullable(),
			measure_unit: z.string().optional().nullable(),
			total_quantity: z.number(),
			// Purchase domain
			purchase_item_id: z.string().optional().nullable(),
			purchase_item_description: z.string().optional().nullable(),
			purchase_measure_unit: z.string().optional().nullable(),
			purchase_quantity: z.number().optional().nullable(),
			conversion_factor: z.number().optional().nullable(),
			catmat_item_codigo: z.number().optional().nullable(),
			catmat_item_descricao: z.string().optional().nullable(),
			unit_price: z.number().optional().nullable(),
			item_description: z.string().optional().nullable(),
		})
	),
	researchLinks: z.array(ResearchLinkSchema).optional(),
})
export type CreateAta = z.infer<typeof CreateAtaSchema>

export const FetchAtaListSchema = z.object({ unitId: z.number() })
export type FetchAtaList = z.infer<typeof FetchAtaListSchema>

export const FetchAtaDetailsSchema = z.object({ ataId: z.string() })
export type FetchAtaDetails = z.infer<typeof FetchAtaDetailsSchema>

export const UpdateAtaStatusSchema = z.object({
	ataId: z.string(),
	status: z.enum(["draft", "published", "archived"]),
})
export type UpdateAtaStatus = z.infer<typeof UpdateAtaStatusSchema>

export const UpdateAtaItemPricesSchema = z.object({
	ataId: UuidSchema,
	updates: z.array(
		z.object({
			ataItemId: UuidSchema,
			price: z.number().positive(),
		})
	),
	researchLinks: z
		.array(
			z.object({
				ataItemId: UuidSchema,
				researchId: UuidSchema,
				researchItemId: UuidSchema,
			})
		)
		.optional(),
})
export type UpdateAtaItemPrices = z.infer<typeof UpdateAtaItemPricesSchema>

export const UpdateAtaItemDescriptionSchema = z.object({
	ataItemId: UuidSchema,
	description: z.string().nullable(),
})
export type UpdateAtaItemDescription = z.infer<typeof UpdateAtaItemDescriptionSchema>

export const DeleteAtaSchema = z.object({ ataId: z.string() })
export type DeleteAta = z.infer<typeof DeleteAtaSchema>
