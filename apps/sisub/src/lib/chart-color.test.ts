import { beforeEach, describe, expect, test, vi } from "vitest"
import { CHART_PALETTE, safeChartColor, seriesColor } from "./chart-color"

const sqlMocks = vi.hoisted(() => ({
	validateSql: vi.fn(() => ({ valid: true })),
	executeSql: vi.fn(async () => [{ mes: "2026-09", total: 10, outro: 3 }]),
}))
vi.mock("@/lib/analytics-sql", () => sqlMocks)

describe("safeChartColor", () => {
	test("aceita #hex de 3, 6 e 8 dígitos e var(--chart-N)", () => {
		for (const color of ["#abc", "#A1B2C3", "#a1b2c3d4", "var(--chart-1)", "var(--chart-5)", " #fff "]) {
			expect(safeChartColor(color)).toBe(color.trim())
		}
	})

	test("recusa o resto: url(), nome, rgb(), outra var, hex de tamanho errado, não-texto", () => {
		for (const color of [
			"url(https://evil.example/?d=1)",
			"url(#clip)",
			"red",
			"rgb(0,0,0)",
			"var(--governance)",
			"var(--chart-1) url(x)",
			"var(--chart-10)",
			"#abcd",
			"#12345",
			"#ggg",
			"",
			42,
			null,
			undefined,
		]) {
			expect(safeChartColor(color)).toBeUndefined()
		}
	})
})

describe("seriesColor", () => {
	test("cor aceita passa; recusada ou ausente cai na paleta pela posição", () => {
		expect(seriesColor("#123456", 0)).toBe("#123456")
		expect(seriesColor("url(https://evil.example/)", 1)).toBe(CHART_PALETTE[1])
		expect(seriesColor(undefined, CHART_PALETTE.length)).toBe(CHART_PALETTE[0])
	})
})

describe("render_chart filtra a cor antes de devolver (tela e histórico)", () => {
	beforeEach(() => vi.clearAllMocks())

	test("cor injetada some da série; cor válida fica", async () => {
		const { renderChartTool } = await import("./render-chart-tool")
		const result = (await renderChartTool.execute?.({
			sql: "select mes, total, outro from x",
			type: "bar",
			title: "t",
			xAxisKey: "mes",
			series: [
				{ key: "total", label: "Total", color: "url(https://evil.example/?d=segredo)" },
				{ key: "outro", label: "Outro", color: "#0a0" },
			],
		})) as { series?: unknown } | undefined

		expect(result?.series).toEqual([
			{ key: "total", label: "Total" },
			{ key: "outro", label: "Outro", color: "#0a0" },
		])
	})
})
