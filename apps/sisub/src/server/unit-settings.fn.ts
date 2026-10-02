/**
 * @module unit-settings.fn
 * Unit settings CRUD — UASG code and address fields.
 * Thin wrappers over @iefa/sisub-domain (operations/units).
 * @domain core
 * @migration done
 */

import { FetchUnitSettingsSchema, fetchUnitSettings, type UnitSettingsInput, UpdateUnitSettingsSchema, updateUnitSettings } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export type { UnitSettingsInput }

export const fetchUnitSettingsFn = createServerFn({ method: "GET" }).validator(FetchUnitSettingsSchema).handler(requireAuthThenRun(fetchUnitSettings))

export const updateUnitSettingsFn = createServerFn({ method: "POST" }).validator(UpdateUnitSettingsSchema).handler(requireAuthThenRun(updateUnitSettings))
