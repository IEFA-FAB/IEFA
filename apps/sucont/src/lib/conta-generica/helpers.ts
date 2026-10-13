// Extraído de routes/conta-generica.tsx (port do analistacontagenerica): mapas e
// formatadores usados pela análise, pelas mensagens e pela tela.
import { getUg } from "#/lib/ug/registry"

// ── Data Maps ────────────────────────────────────────────────────────────────

export interface GroupedData {
	[ug: string]: {
		[conta: string]: {
			mes: string
			saldo: number
		}[]
	}
}

export const RAC_QUESTIONS = [
	{
		id: "29",
		title: "Questão RAC 29",
		description: "Utilização de conta genérica",
		classes: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
	},
]

// ── Helpers ──────────────────────────────────────────────────────────────────

export const getConferente = (ug: string) => getUg(ug)?.conferente || "NÃO MAPEADO"

export const getRacInfo = (conta: string) => {
	const firstDigit = conta.charAt(0)
	return (
		RAC_QUESTIONS.find((q) => q.classes.includes(firstDigit)) || {
			id: "XX",
			title: "Questão RAC XX",
			description: "Utilização de conta genérica",
		}
	)
}

export const getOds = (ug: string) => getUg(ug)?.ods || "OUTROS"
export const getOs = (ug: string) => getUg(ug)?.orgaoSuperior || "OUTROS"
export const getUgName = (ug: string) => getUg(ug)?.sigla || "NÃO IDENTIFICADA"

export const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

export const formatMilitaryDate = (dateStr: string) => {
	if (!dateStr) return "XXXMÊSANO"
	const date = new Date(`${dateStr}T12:00:00`)
	const day = String(date.getDate()).padStart(2, "0")
	const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
	return `${day}${months[date.getMonth()]}${date.getFullYear()}`
}
