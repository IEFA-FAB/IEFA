/**
 * @module unit-settings.fn
 * Unit settings CRUD — UASG code and address fields.
 * Thin wrappers over @iefa/sisub-domain (operations/units).
 * @domain core
 * @migration done
 */

import { FetchUnitSettingsSchema, fetchUnitSettings, type UnitSettingsInput, UpdateUnitSettingsSchema, updateUnitSettings } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export type { UnitSettingsInput }

export const fetchUnitSettingsFn = createServerFn({ method: "GET" })
	.inputValidator(FetchUnitSettingsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchUnitSettings(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateUnitSettingsFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateUnitSettingsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateUnitSettings(getDb(), ctx, data).catch(handleDomainError)
	})
