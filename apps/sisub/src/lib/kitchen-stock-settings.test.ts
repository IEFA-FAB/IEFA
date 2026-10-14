import { describe, expect, it } from "vitest"
import {
	isStockSettingsConflict,
	parseLeadTimeInput,
	parseStockSettingsRow,
	STOCK_SETTINGS_CONFLICT_MESSAGE,
	STOCK_SETTINGS_DEFAULTS,
	stockSettingsValues,
} from "@/lib/kitchen-stock-settings"

describe("parseStockSettingsRow", () => {
	it("cozinha sem linha: defaults, prazo de entrega não configurado e sem versão", () => {
		expect(parseStockSettingsRow(undefined)).toEqual({ ...STOCK_SETTINGS_DEFAULTS, defaultLeadTimeDays: null, version: null })
	})

	it("linha do banco: numéricos em texto viram número e a versão é o updated_at como veio", () => {
		const settings = parseStockSettingsRow({
			segregation: "strict",
			adjustment_approval_value: "750.00",
			issue_tolerance_pct: "12.50",
			issue_tolerance_floor_value: "20.00",
			count_tolerance_pct: "5.00",
			count_tolerance_value: "50.00",
			default_lead_time_days: 4,
			updated_at: "2026-10-14 12:00:00.123456+00",
		})
		expect(settings).toEqual({
			segregation: "strict",
			adjustmentApprovalValue: 750,
			issueTolerancePct: 12.5,
			issueToleranceFloorValue: 20,
			countTolerancePct: 5,
			countToleranceValue: 50,
			defaultLeadTimeDays: 4,
			version: "2026-10-14 12:00:00.123456+00",
		})
		expect(stockSettingsValues(settings)).not.toHaveProperty("version")
	})

	it("prazo nulo continua nulo: não se presume valor", () => {
		const settings = parseStockSettingsRow({
			segregation: "dual",
			adjustment_approval_value: "500",
			issue_tolerance_pct: "10",
			issue_tolerance_floor_value: "20",
			count_tolerance_pct: "5",
			count_tolerance_value: "50",
			default_lead_time_days: null,
			updated_at: "2026-10-14 12:00:00+00",
		})
		expect(settings.defaultLeadTimeDays).toBeNull()
	})
})

describe("parseLeadTimeInput", () => {
	it("vazio é 'não configurado', válido", () => {
		expect(parseLeadTimeInput("  ")).toEqual({ value: null, invalid: false })
	})

	it("inteiro de 1 a 365", () => {
		expect(parseLeadTimeInput("5")).toEqual({ value: 5, invalid: false })
		expect(parseLeadTimeInput("365")).toEqual({ value: 365, invalid: false })
	})

	it("zero, fração, negativo e acima do teto são inválidos", () => {
		for (const text of ["0", "2.5", "-3", "366", "abc"]) expect(parseLeadTimeInput(text).invalid).toBe(true)
	})
})

it("a recusa por versão é reconhecida pela tela", () => {
	expect(isStockSettingsConflict(STOCK_SETTINGS_CONFLICT_MESSAGE)).toBe(true)
	expect(isStockSettingsConflict("Erro ao salvar")).toBe(false)
})
