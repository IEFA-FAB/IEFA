/**
 * Pedido de Lanche de Bordo/Apoio (Módulo 7 do Manual SISUB) — entrada das operations.
 *
 * Valor de domínio fica em português (`bordo`, `apoio`, `aerea`, `economia_om`): é o
 * vocabulário da norma e vira dado gravado.
 */

import { z } from "zod"
import { DateSchema, KitchenIdSchema, UuidSchema } from "./common.ts"

export const SnackFamilySchema = z.enum(["bordo", "apoio"])
export const SnackClassSchema = z.enum(["A", "B", "C"])
export const SnackVariantSchema = z.enum(["lanche", "refeicao"])
export const SnackAudienceSchema = z.enum(["crew", "pax"])
export const MissionKindSchema = z.enum(["aerea", "terrestre"])
export const FundingSourceSchema = z.enum(["economia_om", "recurso_missao"])
export const SnackMaterialItemSchema = z.enum(["garrafa_termica", "caixa_termica", "hotbox", "cooler", "outro"])
export const SnackRequestStatusSchema = z.enum(["submitted", "accepted", "rejected", "in_production", "ready", "delivered", "closed", "cancelled"])

const IsoDateTimeSchema = z.iso.datetime({ offset: true })
const MinutesSchema = z
	.number()
	.int()
	.positive()
	.max(14 * 24 * 60)
const CountSchema = z.number().int().nonnegative().max(9999)
const TextSchema = (max: number) => z.string().trim().min(1).max(max)
const OptionalTextSchema = (max: number) => z.string().trim().max(max).optional()

// ── Padrão de lanche ──────────────────────────────────────────────────────

export const SnackClassificationSchema = z
	.object({
		family: SnackFamilySchema,
		snackClass: SnackClassSchema,
		variant: SnackVariantSchema,
		requiresGalley: z.boolean(),
		requiresOven: z.boolean(),
		reviewedAt: DateSchema.nullable(),
		shelfLifeHours: z.number().int().min(1).max(720).nullable(),
		orderable: z.boolean(),
	})
	.refine((c) => c.family === "bordo" || c.snackClass !== "C", { message: "Lanche de Apoio só tem as classes A e B", path: ["snackClass"] })
export type SnackClassification = z.infer<typeof SnackClassificationSchema>

export const SetSnackClassificationSchema = z.object({
	templateId: UuidSchema,
	/** `null` desfaz a classificação: a exceção volta a ser só molde de custeio. */
	classification: SnackClassificationSchema.nullable(),
})
export type SetSnackClassification = z.infer<typeof SetSnackClassificationSchema>

export const ListOrderableStandardsSchema = z.object({ kitchenId: KitchenIdSchema })
export type ListOrderableStandards = z.infer<typeof ListOrderableStandardsSchema>

export const GetSnackStandardEnergySchema = z.object({ templateId: UuidSchema })
export type GetSnackStandardEnergy = z.infer<typeof GetSnackStandardEnergySchema>

// ── Missão (entrada da calculadora) ───────────────────────────────────────

export const SnackMissionSchema = z.object({
	missionKind: MissionKindSchema,
	departureAt: IsoDateTimeSchema,
	totalMinutes: MinutesSchema,
	longestLegMinutes: MinutesSchema.nullable(),
	stopsWithoutMess: z.boolean(),
	groundMinutes: z
		.number()
		.int()
		.nonnegative()
		.max(24 * 60),
	isOperational: z.boolean(),
	hasGalley: z.boolean(),
	hasOven: z.boolean(),
	crewCount: CountSchema,
	paxCount: CountSchema,
})
export type SnackMission = z.infer<typeof SnackMissionSchema>

// ── Pedido (Comensal) ─────────────────────────────────────────────────────

export const SnackRequestLineInputSchema = z.object({
	standardId: UuidSchema,
	audience: SnackAudienceSchema,
	quantity: z.number().int().positive().max(9999),
})

export const CreateSnackRequestSchema = SnackMissionSchema.extend({
	kitchenId: KitchenIdSchema,
	requesterUnitLabel: TextSchema(120),
	vehicleType: OptionalTextSchema(80),
	vehicleRegistration: OptionalTextSchema(40),
	vehicleOm: OptionalTextSchema(80),
	missionDescription: TextSchema(500),
	origin: OptionalTextSchema(120),
	destination: OptionalTextSchema(120),
	stops: OptionalTextSchema(240),
	missionOrderNumber: OptionalTextSchema(60),
	waterQuantity: CountSchema,
	cupQuantity: CountSchema,
	iceQuantity: CountSchema,
	coffeeQuantity: CountSchema,
	includesNonMilitary: z.boolean(),
	nonMilitaryReason: OptionalTextSchema(500),
	preference: SnackVariantSchema,
	pickupAt: IsoDateTimeSchema,
	pickupResponsible: TextSchema(160),
	fundingSource: FundingSourceSchema,
	lateReason: OptionalTextSchema(500),
	divergenceReason: OptionalTextSchema(500),
	lines: z.array(SnackRequestLineInputSchema).min(1).max(40),
})
export type CreateSnackRequest = z.infer<typeof CreateSnackRequestSchema>

export const SnackRequestIdSchema = z.object({ requestId: UuidSchema })
export type SnackRequestId = z.infer<typeof SnackRequestIdSchema>

export const CancelMySnackRequestSchema = z.object({
	requestId: UuidSchema,
	reason: OptionalTextSchema(500),
})
export type CancelMySnackRequest = z.infer<typeof CancelMySnackRequestSchema>

// ── Cozinha ───────────────────────────────────────────────────────────────

export const ListKitchenSnackRequestsSchema = z.object({
	kitchenId: KitchenIdSchema,
	/** Retirada a partir desta data (Brasília). */
	from: DateSchema.optional(),
	/** Retirada até esta data, inclusive (Brasília). */
	to: DateSchema.optional(),
	statuses: z.array(SnackRequestStatusSchema).max(8).optional(),
})
export type ListKitchenSnackRequests = z.infer<typeof ListKitchenSnackRequestsSchema>

export const DecideSnackRequestSchema = z.discriminatedUnion("decision", [
	z.object({
		requestId: UuidSchema,
		decision: z.literal("accept"),
		unitValue: z.number().nonnegative().max(1_000_000),
		note: OptionalTextSchema(500),
		/** Redução de quantidade por linha (ex.: passageiros opcionais da Classe C). Ausente = aprova como pedido. */
		adjustments: z
			.array(z.object({ lineId: UuidSchema, approvedQuantity: z.number().int().nonnegative().max(9999) }))
			.max(40)
			.optional(),
	}),
	z.object({
		requestId: UuidSchema,
		decision: z.literal("reject"),
		reason: TextSchema(500),
	}),
])
export type DecideSnackRequest = z.infer<typeof DecideSnackRequestSchema>

export const AdvanceSnackRequestSchema = z.discriminatedUnion("to", [
	z.object({ requestId: UuidSchema, to: z.literal("in_production") }),
	z.object({
		requestId: UuidSchema,
		to: z.literal("ready"),
		/** Amostra de 72 h (7.4.6) — obrigatória para liberar a retirada. */
		sampleCollectedAt: IsoDateTimeSchema,
		sampleNotes: OptionalTextSchema(500),
	}),
])
export type AdvanceSnackRequest = z.infer<typeof AdvanceSnackRequestSchema>

export const RegisterSnackPickupSchema = z.object({
	requestId: UuidSchema,
	pickedUpByName: TextSchema(160),
	materials: z
		.array(
			z.object({
				item: SnackMaterialItemSchema,
				description: OptionalTextSchema(160),
				quantity: z.number().int().positive().max(999),
			})
		)
		.max(20),
})
export type RegisterSnackPickup = z.infer<typeof RegisterSnackPickupSchema>

export const RegisterSnackMaterialReturnSchema = z.object({
	requestId: UuidSchema,
	returns: z
		.array(z.object({ materialId: UuidSchema, returnedQuantity: z.number().int().nonnegative().max(999) }))
		.min(1)
		.max(20),
})
export type RegisterSnackMaterialReturn = z.infer<typeof RegisterSnackMaterialReturnSchema>

export const KitchenCancelSnackRequestSchema = z.object({
	requestId: UuidSchema,
	reason: TextSchema(500),
})
export type KitchenCancelSnackRequest = z.infer<typeof KitchenCancelSnackRequestSchema>

export const SnackProductionSummarySchema = z.object({
	kitchenId: KitchenIdSchema,
	date: DateSchema,
})
export type SnackProductionSummaryInput = z.infer<typeof SnackProductionSummarySchema>
