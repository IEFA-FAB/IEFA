import { describe, expect, test } from "bun:test"
import { getNutritionReferenceSyncTotalSteps, NUTRITION_REFERENCE_SYNC_TOTAL_STEPS } from "./index.ts"

describe("nutrition reference sync options", () => {
	test("manual and cron runs process all steps by default", () => {
		expect(getNutritionReferenceSyncTotalSteps({ triggeredBy: "manual" })).toBe(NUTRITION_REFERENCE_SYNC_TOTAL_STEPS)
		expect(getNutritionReferenceSyncTotalSteps({ triggeredBy: "cron" })).toBe(NUTRITION_REFERENCE_SYNC_TOTAL_STEPS)
	})

	test("test runs are limited by default", () => {
		expect(getNutritionReferenceSyncTotalSteps({ triggeredBy: "test" })).toBe(1)
	})

	test("maxSteps clamps to the available step range", () => {
		expect(getNutritionReferenceSyncTotalSteps({ triggeredBy: "test", maxSteps: 2 })).toBe(2)
		expect(getNutritionReferenceSyncTotalSteps({ triggeredBy: "test", maxSteps: 999 })).toBe(NUTRITION_REFERENCE_SYNC_TOTAL_STEPS)
		expect(getNutritionReferenceSyncTotalSteps({ triggeredBy: "test", maxSteps: 0 })).toBe(1)
	})
})
