import { toolDefinition } from "@tanstack/ai"
import { z } from "zod"
import { executeSql, validateSql } from "@/lib/analytics-sql"

type ChartCellValue = string | number | boolean | null

function normalizeChartRows(rows: Record<string, unknown>[]): Record<string, ChartCellValue>[] {
	return rows.map((row) =>
		Object.fromEntries(
			Object.entries(row).map(([key, value]) => {
				if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
					return [key, value]
				}
				return [key, value == null ? null : JSON.stringify(value)]
			})
		)
	)
}

const renderChartInputSchema = z.object({
	sql: z.string().describe("SQL SELECT query para buscar os dados do gráfico"),
	type: z.enum(["bar", "line", "area", "pie", "table"]).describe("Tipo do gráfico"),
	title: z.string().describe("Título do gráfico"),
	description: z.string().optional().describe("Descrição opcional do gráfico"),
	xAxisKey: z.string().describe("Chave da coluna para o eixo X"),
	series: z
		.array(
			z.object({
				key: z.string().describe("Chave da coluna para esta série"),
				label: z.string().describe("Rótulo da série"),
				color: z.string().optional().describe("Cor em hex ou CSS"),
			})
		)
		.describe("Séries de dados a exibir no gráfico"),
})

export const renderChartTool = toolDefinition({
	name: "render_chart",
	description:
		"Gera um gráfico executando uma query SQL analítica no banco de dados do sisub. Use para visualizar dados de refeições, cardápios, estoques ou qualquer métrica disponível.",
	inputSchema: renderChartInputSchema,
}).server(async ({ sql, type, title, description, xAxisKey, series }) => {
	const validation = validateSql(sql)
	if (!validation.valid) {
		throw new Error(`SQL inválido: ${validation.error}`)
	}

	const rows = await executeSql(sql)
	const data = normalizeChartRows(rows)

	if (data.length > 0) {
		const availableKeys = Object.keys(data[0] as Record<string, unknown>)
		if (!availableKeys.includes(xAxisKey)) {
			throw new Error(`Chave do eixo X "${xAxisKey}" não existe nos resultados SQL. Colunas disponíveis: ${availableKeys.join(", ")}`)
		}
		for (const s of series) {
			if (!availableKeys.includes(s.key)) {
				throw new Error(`Chave de série "${s.key}" não existe nos resultados SQL. Colunas disponíveis: ${availableKeys.join(", ")}`)
			}
		}
	}

	return { type, title, description, xAxisKey, series, data, sql }
})
