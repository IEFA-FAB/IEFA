import { describe, expect, it } from "vitest"
import { rebaseDraftValues } from "@/lib/drafts/rebase-draft"
import {
	isStockSettingsConflict,
	parseLeadTimeInput,
	parseStockSettingsRow,
	STOCK_SETTINGS_COLUMNS,
	STOCK_SETTINGS_CONFLICT_MESSAGE,
	STOCK_SETTINGS_VERSION_PATTERN,
	type StockSettingsRow,
	stockSettingsDraftKey,
	stockSettingsFromDraft,
	toStockSettingsDraft,
} from "@/lib/kitchen-stock-settings"

const row = (overrides: Partial<StockSettingsRow> = {}): StockSettingsRow => ({
	segregation: "dual",
	adjustment_approval_value: "500.00",
	issue_tolerance_pct: "10.00",
	issue_tolerance_floor_value: "20.00",
	count_tolerance_pct: "5.00",
	count_tolerance_value: "50.00",
	default_lead_time_days: null,
	updated_at: "2026-10-14 12:00:00.123456+00",
	has_row: true,
	...overrides,
})

describe("parseStockSettingsRow", () => {
	it("numéricos em texto viram número e a versão é o updated_at como veio", () => {
		expect(
			parseStockSettingsRow(row({ segregation: "strict", adjustment_approval_value: "750.00", issue_tolerance_pct: "12.50", default_lead_time_days: "4" }))
		).toEqual({
			segregation: "strict",
			adjustmentApprovalValue: 750,
			issueTolerancePct: 12.5,
			issueToleranceFloorValue: 20,
			countTolerancePct: 5,
			countToleranceValue: 50,
			defaultLeadTimeDays: 4,
			version: "2026-10-14 12:00:00.123456+00",
		})
	})

	it("cozinha sem linha (defaults de inventory.kitchen_settings): sem versão, prazo não configurado", () => {
		const settings = parseStockSettingsRow(row({ has_row: false }))
		expect(settings.version).toBeNull()
		expect(settings.defaultLeadTimeDays).toBeNull()
	})

	it("coluna obrigatória ausente é erro, não um default inventado", () => {
		expect(() => parseStockSettingsRow(row({ count_tolerance_value: null }))).toThrow()
	})

	it("toda coluna da lista única tem campo na linha", () => {
		const parsed = row()
		for (const column of Object.values(STOCK_SETTINGS_COLUMNS)) expect(parsed).toHaveProperty(column)
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

	it("o que o navegador rejeitaria num campo numérico é inválido, não vazio", () => {
		for (const text of ["0", "2.5", "2,5", "-3", "-", "1e", "1e2", "366", "abc"]) expect(parseLeadTimeInput(text)).toEqual({ value: null, invalid: true })
	})
})

describe("rascunho", () => {
	const saved = parseStockSettingsRow(row({ default_lead_time_days: "5" }))

	it("o prazo vai como texto e volta como número", () => {
		const draft = toStockSettingsDraft(saved)
		expect(draft.defaultLeadTimeText).toBe("5")
		expect(draft).not.toHaveProperty("version")
		expect(stockSettingsFromDraft(draft)).toMatchObject({ defaultLeadTimeDays: 5 })
		expect(stockSettingsFromDraft({ ...draft, defaultLeadTimeText: "" })).toMatchObject({ defaultLeadTimeDays: null })
	})

	it("texto inválido não grava", () => {
		expect(stockSettingsFromDraft({ ...toStockSettingsDraft(saved), defaultLeadTimeText: "0" })).toBeNull()
	})

	it("levar à versão atual com o prazo inválido preserva o texto digitado, sem apagar o prazo da outra pessoa", () => {
		const opened = toStockSettingsDraft({ ...saved, defaultLeadTimeDays: null })
		const edited = { ...opened, defaultLeadTimeText: "0", countTolerancePct: 7 }
		const head = toStockSettingsDraft({ ...saved, defaultLeadTimeDays: 5, issueTolerancePct: 15 })
		const { values, overlapping } = rebaseDraftValues(opened, edited, head)
		// continua inválido e visível: o Salvar segue bloqueado até o usuário decidir
		expect(values.defaultLeadTimeText).toBe("0")
		expect(stockSettingsFromDraft(values)).toBeNull()
		// o que só a outra pessoa mudou vem da atual; o que só o usuário mudou, dele
		expect(values.issueTolerancePct).toBe(15)
		expect(values.countTolerancePct).toBe(7)
		expect(overlapping).toEqual(["defaultLeadTimeText"])
	})

	it("chave por cozinha, na família sisub:", () => {
		expect(stockSettingsDraftKey(12)).toBe("sisub:stock-settings:12")
	})
})

describe("versão", () => {
	it("aceita o formato do updated_at::text e recusa lixo", () => {
		expect(STOCK_SETTINGS_VERSION_PATTERN.test("2026-10-14 12:00:00.123456+00")).toBe(true)
		expect(STOCK_SETTINGS_VERSION_PATTERN.test("2026-10-14 12:00:00-03:00")).toBe(true)
		expect(STOCK_SETTINGS_VERSION_PATTERN.test("x")).toBe(false)
	})

	it("a recusa por versão é reconhecida pela tela", () => {
		expect(isStockSettingsConflict(STOCK_SETTINGS_CONFLICT_MESSAGE)).toBe(true)
		expect(isStockSettingsConflict("Erro ao salvar")).toBe(false)
	})
})
