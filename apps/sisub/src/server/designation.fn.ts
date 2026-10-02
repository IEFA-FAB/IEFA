/**
 * @module designation.fn
 * Designação de gestor, fiscal e comissão (change `sisub-flexible-expense-execution`, D6).
 *
 * A Gestão Unidade (`unit:2`) registra o ato que designou — boletim ou portaria — e a
 * vigência; o recebimento confere a designação vigente de quem assina o provisório e o
 * definitivo (Lei 14.133/2021, art. 140, II). Criar e encerrar são auditados: é a
 * competência que sustenta o termo e, por ele, a liquidação.
 * @domain core
 */

import {
	createDesignation,
	DESIGNATION_ROLES,
	DESIGNATION_SOURCES,
	endDesignation,
	listDesignationCandidates,
	listDesignationScopes,
	listDesignations,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"
import { z } from "zod"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const listDesignationsFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(requireAuthThenRun(listDesignations))

export const listDesignationCandidatesFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(requireAuthThenRun(listDesignationCandidates))

export const listDesignationScopesFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(requireAuthThenRun(listDesignationScopes))

export const createDesignationFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			personId: z.uuid(),
			role: z.enum(DESIGNATION_ROLES),
			source: z.enum(DESIGNATION_SOURCES),
			sourceReference: z.string().trim().max(200).nullable(),
			validFrom: IsoDate,
			validTo: IsoDate.nullable(),
			isSubstitute: z.boolean().default(false),
			empenhoId: z.uuid().nullable().default(null),
			arpId: z.uuid().nullable().default(null),
			acquisitionId: z.uuid().nullable().default(null),
		})
	)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withSensitiveAudit(
			"createDesignationFn",
			ctx,
			() => createDesignation(getDb(), ctx, data),
			(result) => ({ designationId: result.id, unitId: data.unitId, personId: data.personId, role: data.role, sourceReference: data.sourceReference })
		).catch(handleDomainError)
	})

export const endDesignationFn = createServerFn({ method: "POST" })
	.validator(z.object({ designationId: z.uuid() }))
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return withSensitiveAudit(
			"endDesignationFn",
			ctx,
			() => endDesignation(getDb(), ctx, data),
			(result) => ({ designationId: data.designationId, unitId: result.unitId, ended: result.ended })
		).catch(handleDomainError)
	})
