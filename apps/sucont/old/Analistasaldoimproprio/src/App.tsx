import { type ClassValue, clsx } from "clsx"
import {
	AlertCircle,
	AlertTriangle,
	BarChart3,
	BookOpen,
	Building2,
	CheckCircle2,
	ChevronRight,
	DollarSign,
	FileText,
	Filter,
	Info,
	Lightbulb,
	MessageSquare,
	PieChart as PieChartIcon,
	Plane,
	Search,
	ShieldAlert,
	Target,
	Trash2,
	TrendingUp,
	Upload,
	Users,
} from "lucide-react"
import type React from "react"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { twMerge } from "tailwind-merge"
import * as XLSX from "xlsx"
import { ChatAssistant } from "./components/ChatAssistant"
import { ConsolidatedMessageCard } from "./components/ConsolidatedMessageCard"
import { UGCard } from "./components/UGCard"
import { getConferente } from "./lib/conferentes"
import { getOrganizacao } from "./lib/organizacao"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export type Classification = "EXCEÇÃO PREVISTA" | "COBRANÇA" | "COBRANÇA COM OBSERVAÇÃO" | "FORA DO ESCOPO PARAMETRIZADO"

export interface ProcessedRow {
	ug: string
	mes: string
	conta: string
	descricao: string
	saldo: number
	classificacao: Classification
	observacao?: string
	questaoRAC?: string
}

interface Rule {
	account: string
	description: string
	exceptions: string[]
	questaoRAC: string
	specialRule?: (ug: string, balance: number) => { classification: Classification; observation?: string } | null
}

const rules: Rule[] = [
	{ account: "115110101", description: "MERCADORIAS PARA VENDA OU REVENDA", exceptions: ["120039", "120100", "120065"], questaoRAC: "Questão 26" },
	{ account: "115210100", description: "PRODUTOS ACABADOS", exceptions: ["120065"], questaoRAC: "Questão 26" },
	{ account: "115310100", description: "PRODUTOS EM ELABORAÇÃO", exceptions: ["120065"], questaoRAC: "Questão 26" },
	{ account: "115410100", description: "MATERIAS-PRIMAS – ARMAZENS PROPRIOS", exceptions: ["120065"], questaoRAC: "Questão 26" },
	{
		account: "115410200",
		description: "MATERIAS-PRIMAS – ARMAZENS DE TERCEIROS",
		exceptions: ["120006"],
		questaoRAC: "Questão 26",
		specialRule: (ug) => {
			if (ug === "120006") {
				return { classification: "EXCEÇÃO PREVISTA", observation: "exceção vinculada ao GAP-BR em favor da COPAC" }
			}
			return null
		},
	},
	{ account: "115510100", description: "ESTOQUES MERCADORIAS PARA REVENDA EM TRÂNSITO", exceptions: ["120039", "120100", "120065"], questaoRAC: "Questão 26" },
	{ account: "115610800", description: "ALMOXARIFADO EM ELABORAÇÃO", exceptions: ["120100"], questaoRAC: "Questão 26" },
	{ account: "115611000", description: "MATERIAIS DE CONSUMO NÃO LOCALIZADOS", exceptions: [], questaoRAC: "Questão 26" },
	{ account: "115810202", description: "MAT CONS – EST ARMAZÉM TERCEIROS – PARA DISTRIB", exceptions: ["120090", "120091"], questaoRAC: "Questão 26" },
	{
		account: "123110701",
		description: "BENS MÓVEIS EM ELABORAÇÃO",
		exceptions: ["120127", "120108"],
		questaoRAC: "Questão 27",
		specialRule: (ug, _balance) => {
			if (["120006", "120195"].includes(ug)) {
				return {
					classification: "COBRANÇA COM OBSERVAÇÃO",
					observation: "120006 e 120195 podem movimentar a conta, porém devem encerrar o mês com saldo zerado.",
				}
			}
			return null
		},
	},
	{ account: "123110122", description: "EQUIP E MAT PERMANENTES VINCULADOS A CONVÊNIO", exceptions: [], questaoRAC: "Questão 27" },
	{ account: "123110805", description: "BENS MÓVEIS INSERVÍVEIS", exceptions: [], questaoRAC: "Questão 27" },
	{ account: "123119907", description: "BENS NÃO LOCALIZADOS", exceptions: [], questaoRAC: "Questão 27" },
	{ account: "123210124", description: "SALAS", exceptions: [], questaoRAC: "Questão 28" },
	{ account: "123210125", description: "ALFÂNDEGAS", exceptions: [], questaoRAC: "Questão 28" },
	{ account: "123210126", description: "AUTARQUIAS/FUNDAÇÕES", exceptions: [], questaoRAC: "Questão 28" },
	{ account: "123210127", description: "POSTOS DE FISCALIZAÇÃO", exceptions: [], questaoRAC: "Questão 28" },
	{ account: "123210128", description: "BENS DE INFRAESTRUTURA", exceptions: [], questaoRAC: "Questão 28" },
	{ account: "123210129", description: "BENS IMÓVEIS EM PODER DE TERCEIROS", exceptions: [], questaoRAC: "Questão 28" },
	{ account: "123210132", description: "ESPELHO D’ÁGUA", exceptions: [], questaoRAC: "Questão 28" },
	{ account: "123210198", description: "OUTROS BENS IMÓVEIS REGISTRADOS NO SPIUNET", exceptions: [], questaoRAC: "Questão 28" },
	{ account: "123210200", description: "BENS DE USO ESPECIAL NÃO REGISTRADOS SPIUNET", exceptions: [], questaoRAC: "Questão 28" },
	{ account: "123210606", description: "ALMOXARIFADO DE INVERSÕES FIXAS", exceptions: ["120088"], questaoRAC: "Questão 28" },
	{
		account: "123219905",
		description: "BENS IMÓVEIS A CLASSIFICAR",
		exceptions: ["120225", "120255", "120257", "120259", "120260", "120261", "120265"],
		questaoRAC: "Questão 28",
	},
	{ account: "213110100", description: "FORNECEDORES NACIONAIS", exceptions: ["120100", "120060"], questaoRAC: "Questão 31" },
	{ account: "213210400", description: "CONTAS A PAGAR - CREDORES ESTRANGEIROS", exceptions: ["120090", "120091"], questaoRAC: "Questão 31" },
	{ account: "363110200", description: "PERDAS INVOLUNTÁRIAS DE BENS IMÓVEIS", exceptions: [], questaoRAC: "Questão 32" },
	{ account: "363210100", description: "PERDAS INVOLUNTÁRIAS COM SOFTWARES", exceptions: [], questaoRAC: "Questão 32" },
	{ account: "363210200", description: "PERDAS INVOLUNTÁRIAS COM MARCAS/DIR/PATENTES", exceptions: [], questaoRAC: "Questão 32" },
	{ account: "363210300", description: "PERDAS INVOLUNTÁRIAS C/ DIREITO DE USO IMOVEL", exceptions: [], questaoRAC: "Questão 32" },
	{ account: "363910100", description: "OUTRAS PERDAS INVOLUNTÁRIAS", exceptions: [], questaoRAC: "Questão 32" },
	{ account: "115610900", description: "MATERIAIS A CLASSIFICAR", exceptions: [], questaoRAC: "Questão 36" },
	{ account: "123119908", description: "BENS MÓVEIS A CLASSIFICAR", exceptions: [], questaoRAC: "Questão 36" },
]

function classifyAccount(
	ug: string,
	accountFull: string,
	balance: number
): { classification: Classification; description: string; observation?: string; accountCode: string; questaoRAC?: string } {
	const accountCodeMatch = accountFull.match(/^(\d+)/)
	const accountCode = accountCodeMatch ? accountCodeMatch[1] : accountFull

	const rule = rules.find((r) => r.account === accountCode)

	if (!rule) {
		return { classification: "FORA DO ESCOPO PARAMETRIZADO", description: accountFull, accountCode }
	}

	if (rule.specialRule) {
		const special = rule.specialRule(ug, balance)
		if (special) {
			return {
				classification: special.classification,
				description: rule.description,
				observation: special.observation,
				accountCode,
				questaoRAC: rule.questaoRAC,
			}
		}
	}

	if (rule.exceptions.includes(ug)) {
		return { classification: "EXCEÇÃO PREVISTA", description: rule.description, accountCode, questaoRAC: rule.questaoRAC }
	}

	return { classification: "COBRANÇA", description: rule.description, accountCode, questaoRAC: rule.questaoRAC }
}

function formatCurrency(value: number) {
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

export const getRacDescription = (rac: string) => {
	const descriptions: Record<string, string> = {
		"Questão 26": "Estoques (Saldos que não devem permanecer ao final do mês)",
		"Questão 27": "Bens Móveis (Saldos que não devem permanecer ao final do mês)",
		"Questão 28": "Bens Imóveis (Saldos que não devem permanecer ao final do mês)",
		"Questão 31": "Fornecedores e Contas a Pagar (Saldos que não devem permanecer ao final do mês)",
		"Questão 32": "Perdas Involuntárias (Saldos que não devem permanecer ao final do mês)",
		"Questão 36": "Bens a Classificar (Saldos que não devem permanecer ao final do mês)",
	}
	return descriptions[rac] || "Análise de Saldos Transitórios"
}

export default function App() {
	const [data, setData] = useState<ProcessedRow[]>([])
	const [fileName, setFileName] = useState<string | null>(null)
	const [isDragging, setIsDragging] = useState(false)
	const [activeTab, setActiveTab] = useState<"ALL" | "COBRANCAS" | "EXCECOES" | "FORA_ESCOPO">("ALL")
	const [activeView, setActiveView] = useState<"operacional" | "tatico" | "estrategico" | "decisao">("operacional")
	const [activeConferenteFilter, setActiveConferenteFilter] = useState<string>("TODOS")
	const [activeRacFilter, setActiveRacFilter] = useState<string>("TODOS")

	const processFile = (file: File) => {
		setFileName(file.name)
		const reader = new FileReader()
		reader.onload = (e) => {
			const data = e.target?.result
			const workbook = XLSX.read(data, { type: "binary" })
			const firstSheetName = workbook.SheetNames[0]
			const worksheet = workbook.Sheets[firstSheetName]

			// Read as 2D array to easily skip headers
			const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: null })

			const processed: ProcessedRow[] = []

			const normalizeString = (str: any) => {
				if (typeof str !== "string") return ""
				return str
					.toLowerCase()
					.normalize("NFD")
					.replace(/[\u0300-\u036f]/g, "")
					.replace(/\s+/g, " ")
					.trim()
			}

			let colIndices = { ug: -1, mes: -1, conta: -1, saldo: -1 }
			let dataStartIndex = -1

			// 1. Try to find the header row
			for (let i = 0; i < rows.length; i++) {
				const row = rows[i]
				if (!Array.isArray(row)) continue

				const tempIndices = { ug: -1, mes: -1, conta: -1, saldo: -1 }

				row.forEach((cell, index) => {
					const norm = normalizeString(cell)
					if (!norm) return

					if (["ug", "unidade gestora", "cod ug", "codigo ug"].some((k) => norm.includes(k))) {
						tempIndices.ug = index
					} else if (["mes", "referencia", "periodo"].some((k) => norm.includes(k))) {
						tempIndices.mes = index
					} else if (["conta", "conta contabil", "cod conta"].some((k) => norm.includes(k)) && !norm.includes("bancaria")) {
						tempIndices.conta = index
					} else if (["saldo", "valor"].some((k) => norm.includes(k))) {
						tempIndices.saldo = index
					}
				})

				// Se achou as 4 colunas essenciais, consideramos como cabeçalho
				if (tempIndices.ug !== -1 && tempIndices.mes !== -1 && tempIndices.conta !== -1 && tempIndices.saldo !== -1) {
					colIndices = tempIndices
					dataStartIndex = i + 1
					break
				}
			}

			const parseSaldo = (saldoRaw: any): number => {
				if (typeof saldoRaw === "number") return saldoRaw
				if (typeof saldoRaw === "string") {
					const cleaned = saldoRaw.replace(/[R$\s]/g, "")
					if (cleaned.includes(",") && cleaned.includes(".")) {
						return parseFloat(cleaned.replace(/\./g, "").replace(",", "."))
					} else if (cleaned.includes(",")) {
						return parseFloat(cleaned.replace(",", "."))
					} else {
						return parseFloat(cleaned)
					}
				}
				return NaN
			}

			// 2. Process rows based on found headers
			if (dataStartIndex !== -1) {
				for (let i = dataStartIndex; i < rows.length; i++) {
					const row = rows[i]
					if (!Array.isArray(row)) continue

					const ugRaw = row[colIndices.ug]
					const mesRaw = row[colIndices.mes]
					const contaRaw = row[colIndices.conta]
					const saldoRaw = row[colIndices.saldo]

					// "Considere como dados válidos apenas as linhas em que as colunas UG, Mês, Conta Contábil e Saldo - R$ estejam simultaneamente preenchidas."
					if (
						ugRaw !== null &&
						ugRaw !== undefined &&
						String(ugRaw).trim() !== "" &&
						mesRaw !== null &&
						mesRaw !== undefined &&
						String(mesRaw).trim() !== "" &&
						contaRaw !== null &&
						contaRaw !== undefined &&
						String(contaRaw).trim() !== "" &&
						saldoRaw !== null &&
						saldoRaw !== undefined &&
						String(saldoRaw).trim() !== ""
					) {
						const ug = String(ugRaw).trim()
						const mes = String(mesRaw).trim()
						const conta = String(contaRaw).trim()
						const saldo = parseSaldo(saldoRaw)

						if (!Number.isNaN(saldo) && saldo !== 0) {
							const { classification, description, observation, accountCode, questaoRAC } = classifyAccount(ug, conta, saldo)
							processed.push({
								ug,
								mes,
								conta: accountCode,
								descricao: description,
								saldo,
								classificacao: classification,
								observacao: observation,
								questaoRAC,
							})
						}
					}
				}
			}

			// 3. Fallback: Se não achou cabeçalho ou não processou nada, tenta heurística linha a linha
			if (processed.length === 0) {
				for (let i = 0; i < rows.length; i++) {
					const row = rows[i]
					if (!Array.isArray(row)) continue

					let ug = "",
						mes = "",
						conta = "",
						saldo = 0
					let foundUg = false,
						foundMes = false,
						foundConta = false,
						foundSaldo = false

					row.forEach((cell) => {
						if (cell === null || cell === undefined || String(cell).trim() === "") return
						const str = String(cell).trim()

						if (!foundUg && /^\d{6}$/.test(str)) {
							ug = str
							foundUg = true
						} else if (!foundConta && /^\d{9}$/.test(str)) {
							conta = str
							foundConta = true
						} else if (
							!foundMes &&
							(/^[A-Za-z]{3,}\/?\d{0,4}$/.test(str) ||
								/^\d{2}\/\d{4}$/.test(str) ||
								/^(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)$/i.test(str))
						) {
							mes = str
							foundMes = true
						} else if (!foundSaldo) {
							const parsed = parseSaldo(cell)
							if (!Number.isNaN(parsed)) {
								saldo = parsed
								foundSaldo = true
							}
						}
					})

					// Exige os 4 preenchidos simultaneamente
					if (foundUg && foundMes && foundConta && foundSaldo && saldo !== 0) {
						const { classification, description, observation, accountCode, questaoRAC } = classifyAccount(ug, conta, saldo)
						processed.push({
							ug,
							mes,
							conta: accountCode,
							descricao: description,
							saldo,
							classificacao: classification,
							observacao: observation,
							questaoRAC,
						})
					}
				}
			}

			setData(processed)
		}
		reader.readAsBinaryString(file)
	}

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
		if (e.dataTransfer.files?.[0]) {
			processFile(e.dataTransfer.files[0])
		}
	}

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(true)
	}

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
	}

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files?.[0]) {
			processFile(e.target.files[0])
		}
	}

	const clearData = () => {
		setData([])
		setFileName(null)
	}

	const filteredDataByConferente = useMemo(() => {
		let filtered = data
		if (activeConferenteFilter !== "TODOS") {
			filtered = filtered.filter((row) => getConferente(row.ug) === activeConferenteFilter)
		}
		if (activeRacFilter !== "TODOS") {
			filtered = filtered.filter((row) => row.questaoRAC === activeRacFilter)
		}
		return filtered
	}, [data, activeConferenteFilter, activeRacFilter])

	// Group data by UG and Mês
	const groupedData = filteredDataByConferente.reduce(
		(acc, row) => {
			const key = `${row.ug}-${row.mes}`
			if (!acc[key]) {
				acc[key] = { ug: row.ug, mes: row.mes, rows: [] }
			}
			acc[key].rows.push(row)
			return acc
		},
		{} as Record<string, { ug: string; mes: string; rows: ProcessedRow[] }>
	)

	const _outOfScope = filteredDataByConferente.filter((r) => r.classificacao === "FORA DO ESCOPO PARAMETRIZADO")

	const _copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text)
	}

	const dashboardData = useMemo(() => {
		if (filteredDataByConferente.length === 0) return null

		const cobrancas = filteredDataByConferente.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const excecoes = filteredDataByConferente.filter((r) => r.classificacao === "EXCEÇÃO PREVISTA")
		const foraEscopo = filteredDataByConferente.filter((r) => r.classificacao === "FORA DO ESCOPO PARAMETRIZADO")

		const ugsComInconsistencia = new Set(cobrancas.map((r) => r.ug)).size
		const volumeFinanceiro = cobrancas.reduce((acc, r) => acc + Math.abs(r.saldo), 0)

		return {
			totalRegistros: filteredDataByConferente.length,
			totalCobrancas: cobrancas.length,
			ugsComInconsistencia,
			totalExcecoes: excecoes.length,
			totalForaEscopo: foraEscopo.length,
			volumeFinanceiro,
		}
	}, [filteredDataByConferente])

	const managerialData = useMemo(() => {
		if (filteredDataByConferente.length === 0) return null

		const cobrancas = filteredDataByConferente.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const totalRiskValue = cobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)

		const ugMap = new Map<string, { count: number; value: number }>()
		const racMap = new Map<string, number>()
		const conferenteMap = new Map<string, { count: number; ugs: Set<string> }>()

		cobrancas.forEach((item) => {
			const ugData = ugMap.get(item.ug) || { count: 0, value: 0 }
			ugData.count += 1
			ugData.value += Math.abs(item.saldo)
			ugMap.set(item.ug, ugData)

			const rac = item.questaoRAC || "Outras Inconsistências"
			racMap.set(rac, (racMap.get(rac) || 0) + 1)

			const conferente = getConferente(item.ug)
			const confData = conferenteMap.get(conferente) || { count: 0, ugs: new Set<string>() }
			confData.count += 1
			confData.ugs.add(item.ug)
			conferenteMap.set(conferente, confData)
		})

		const topUgs = Array.from(ugMap.entries())
			.map(([ug, d]) => ({ ug, ...d }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10)

		const topRacs = Array.from(racMap.entries())
			.map(([name, value]) => ({ name, value }))
			.sort((a, b) => b.value - a.value)

		const conferentes = Array.from(conferenteMap.entries())
			.map(([name, d]) => ({ name, count: d.count, ugs: Array.from(d.ugs).sort() }))
			.sort((a, b) => b.count - a.count)

		return { totalRiskValue, topUgs, topRacs, totalIssues: cobrancas.length, conferentes }
	}, [filteredDataByConferente])

	const estrategicoData = useMemo(() => {
		if (filteredDataByConferente.length === 0) return null

		const cobrancas = filteredDataByConferente.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const totalRiskValue = cobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)

		const odsMap = new Map<string, { count: number; value: number }>()
		const orgaoSuperiorMap = new Map<string, { count: number; value: number }>()
		const contaMap = new Map<string, { count: number; value: number; descricao: string }>()

		cobrancas.forEach((item) => {
			const org = getOrganizacao(item.ug)

			const odsData = odsMap.get(org.ods) || { count: 0, value: 0 }
			odsData.count += 1
			odsData.value += Math.abs(item.saldo)
			odsMap.set(org.ods, odsData)

			const orgaoSupData = orgaoSuperiorMap.get(org.orgaoSuperior) || { count: 0, value: 0 }
			orgaoSupData.count += 1
			orgaoSupData.value += Math.abs(item.saldo)
			orgaoSuperiorMap.set(org.orgaoSuperior, orgaoSupData)

			const contaData = contaMap.get(item.conta) || { count: 0, value: 0, descricao: item.descricao }
			contaData.count += 1
			contaData.value += Math.abs(item.saldo)
			contaMap.set(item.conta, contaData)
		})

		const topOds = Array.from(odsMap.entries())
			.map(([name, d]) => ({ name, ...d, percent: (d.count / cobrancas.length) * 100 }))
			.sort((a, b) => b.count - a.count)

		const topOrgaosSuperiores = Array.from(orgaoSuperiorMap.entries())
			.map(([name, d]) => ({ name, ...d, percent: (d.count / cobrancas.length) * 100 }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10)

		const topContas = Array.from(contaMap.entries())
			.map(([conta, d]) => ({ conta, ...d }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10)

		return { totalRiskValue, topOds, topOrgaosSuperiores, topContas, totalIssues: cobrancas.length }
	}, [filteredDataByConferente])

	const decisaoData = useMemo(() => {
		if (filteredDataByConferente.length === 0) return null

		const cobrancas = filteredDataByConferente.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const totalIssues = cobrancas.length

		// 1. Pareto Analysis
		const ugMap = new Map<string, number>()
		cobrancas.forEach((r) => {
			ugMap.set(r.ug, (ugMap.get(r.ug) || 0) + 1)
		})

		const sortedUgs = Array.from(ugMap.entries())
			.map(([ug, count]) => ({ ug, count }))
			.sort((a, b) => b.count - a.count)

		const totalUgs = sortedUgs.length
		const twentyPercentCount = Math.max(1, Math.round(totalUgs * 0.2))
		const topTwentyUgs = sortedUgs.slice(0, twentyPercentCount)
		const topTwentyIssuesCount = topTwentyUgs.reduce((acc, curr) => acc + curr.count, 0)
		const paretoPercent = (topTwentyIssuesCount / totalIssues) * 100

		// 2. Prioritization
		// Score based on: count (40%), value (40%), RAC recurrence (20%)
		const maxValue = Math.max(
			...sortedUgs.map((u) => {
				const val = cobrancas.filter((c) => c.ug === u.ug).reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
				return val
			})
		)
		const maxCount = sortedUgs[0]?.count || 1

		const prioritizedUgs = sortedUgs
			.map((u) => {
				const ugCobrancas = cobrancas.filter((c) => c.ug === u.ug)
				const value = ugCobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
				const org = getOrganizacao(u.ug)

				const score = (u.count / maxCount) * 0.4 + (value / (maxValue || 1)) * 0.4 + 0.2 // simplified score

				return {
					...u,
					value,
					nome: org.nome,
					ods: org.ods,
					superior: org.orgaoSuperior,
					score,
				}
			})
			.sort((a, b) => b.score - a.score)

		return {
			pareto: {
				totalUgs,
				twentyPercentCount,
				paretoPercent,
				topTwentyUgs: prioritizedUgs.slice(0, twentyPercentCount),
			},
			priorities: prioritizedUgs.slice(0, 15),
			criticalLevels: {
				ods: estrategicoData?.topOds[0]?.name,
				superior: estrategicoData?.topOrgaosSuperiores[0]?.name,
				ugCount: sortedUgs[0]?.ug,
				ugValue: prioritizedUgs.sort((a, b) => b.value - a.value)[0]?.ug,
			},
		}
	}, [filteredDataByConferente, estrategicoData])

	const excecoesData = filteredDataByConferente.filter((r) => r.classificacao === "EXCEÇÃO PREVISTA")
	const outOfScopeData = filteredDataByConferente.filter((r) => r.classificacao === "FORA DO ESCOPO PARAMETRIZADO")

	const getRacDescription = (rac: string) => {
		const descriptions: Record<string, string> = {
			"Questão 26": "Estoques (Saldos que não devem permanecer ao final do mês)",
			"Questão 27": "Bens Móveis (Saldos que não devem permanecer ao final do mês)",
			"Questão 28": "Bens Imóveis (Saldos que não devem permanecer ao final do mês)",
			"Questão 31": "Fornecedores e Contas a Pagar (Saldos que não devem permanecer ao final do mês)",
			"Questão 32": "Perdas Involuntárias (Saldos que não devem permanecer ao final do mês)",
			"Questão 36": "Bens a Classificar (Saldos que não devem permanecer ao final do mês)",
		}
		return descriptions[rac] || "Análise de Saldos Transitórios"
	}

	return (
		<div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
			<header className="bg-white text-slate-900 py-6 shadow-sm border-b border-slate-200">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
					<div className="flex items-center space-x-4">
						<div className="p-2 bg-blue-600 rounded-lg">
							<Plane className="w-8 h-8 text-white" />
						</div>
						<div>
							<h1 className="text-2xl font-bold tracking-tight">Analista SUCONT - Monitoramento de Contas de Saldo Transitório</h1>
							<p className="text-slate-500 mt-1 text-sm">Diretoria de Economia e Finanças da Aeronáutica (DIREF)</p>
						</div>
					</div>
					{fileName && (
						<button
							onClick={clearData}
							className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
						>
							<Trash2 className="w-4 h-4" />
							<span>Nova Análise</span>
						</button>
					)}
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				{!fileName ? (
					<div className="space-y-6">
						<div
							className={cn(
								"border-2 border-dashed rounded-2xl p-12 text-center transition-colors duration-200 ease-in-out cursor-pointer",
								isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50 bg-white"
							)}
							onDrop={handleDrop}
							onDragOver={handleDragOver}
							onDragLeave={handleDragLeave}
							onClick={() => document.getElementById("file-upload")?.click()}
						>
							<input id="file-upload" type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileChange} />
							<div className="mx-auto w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
								<Upload className="w-8 h-8" />
							</div>
							<h3 className="text-lg font-semibold text-slate-900 mb-1">Carregar Planilha do Tesouro Gerencial</h3>
							<p className="text-slate-500 text-sm max-w-md mx-auto">
								Arraste e solte o arquivo .xlsx aqui, ou clique para selecionar. A planilha deve conter as colunas UG, Mês, Conta Contábil e Saldo.
							</p>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
								<div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4">
									<Search className="w-6 h-6" />
								</div>
								<h3 className="text-lg font-semibold text-slate-900 mb-2">O que está sendo analisado</h3>
								<p className="text-sm text-slate-600 leading-relaxed">
									Saldos de contas contábeis transitórias e de controle do Comando da Aeronáutica (COMAER), extraídos do Tesouro Gerencial, visando identificar
									inconsistências e valores fora da conformidade.
								</p>
							</div>
							<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
								<div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
									<BookOpen className="w-6 h-6" />
								</div>
								<h3 className="text-lg font-semibold text-slate-900 mb-2">O Referencial Teórico (RAC)</h3>
								<p className="text-sm text-slate-600 leading-relaxed">
									A análise é fundamentada no Roteiro de Acompanhamento Contábil (RAC), mapeando as contas de acordo com as diretrizes e exceções previstas nas
									questões normativas.
								</p>
							</div>
							<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
								<div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
									<MessageSquare className="w-6 h-6" />
								</div>
								<h3 className="text-lg font-semibold text-slate-900 mb-2">Mensagens Automáticas</h3>
								<p className="text-sm text-slate-600 leading-relaxed">
									Geração automática de propostas de mensagens de cobrança e orientação para as Unidades Gestoras (UGs), padronizando a comunicação e agilizando
									a regularização.
								</p>
							</div>
						</div>

						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
							<h3 className="text-md font-semibold text-slate-900 mb-4 flex items-center">
								<FileText className="w-5 h-5 mr-2 text-blue-600" />
								Caminho do Relatório no Tesouro Gerencial
							</h3>
							<div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm text-slate-700 flex flex-wrap items-center gap-y-2 gap-x-1">
								<span className="font-medium">TESOURO GERENCIAL</span>
								<ChevronRight className="w-4 h-4 text-slate-400" />
								<span>Relatórios Compartilhados</span>
								<ChevronRight className="w-4 h-4 text-slate-400" />
								<span>Consultas Gerenciais</span>
								<ChevronRight className="w-4 h-4 text-slate-400" />
								<span>Relatórios de Bancada dos Órgãos Superiores</span>
								<ChevronRight className="w-4 h-4 text-slate-400" />
								<span>52000 - Ministério da Defesa</span>
								<ChevronRight className="w-4 h-4 text-slate-400" />
								<span>52111 - Comando da Aeronáutica</span>
								<ChevronRight className="w-4 h-4 text-slate-400" />
								<span>SEFA</span>
								<ChevronRight className="w-4 h-4 text-slate-400" />
								<span>DIREF</span>
								<ChevronRight className="w-4 h-4 text-slate-400" />
								<span>SUCONT-3 - ACOMPANHAMENTO</span>
								<ChevronRight className="w-4 h-4 text-slate-400" />
								<span className="font-semibold text-blue-700">ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1</span>
							</div>
						</div>

						<div className="mt-8 text-center px-4">
							<p className="text-xs text-slate-400 max-w-4xl mx-auto leading-relaxed">
								Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF), alinhado às diretrizes do Subdiretor de Contabilidade, Cel
								Int Carlos José Rodrigues, com supervisão do Cel Int Eduardo de Oliveira Silva (Chefe da SUCONT-3) e desenvolvimento técnico do 1º Ten QOAp CCO
								Jefferson Luís Reis Alves (Chefe da SUCONT-3.1).
							</p>
						</div>
					</div>
				) : (
					<div className="space-y-8">
						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
							<div className="flex items-start space-x-3">
								<div className="p-2 bg-blue-100 rounded-lg shrink-0">
									<Info className="w-5 h-5 text-blue-700" />
								</div>
								<div>
									<h3 className="text-lg font-semibold text-slate-900 mb-2">Escopo da Análise (RAC)</h3>
									<p className="text-sm text-slate-600 mb-3">
										Este sistema analisa saldos transitórios com base nas seguintes questões do Roteiro de Acompanhamento Contábil (RAC):
									</p>
									<div className="flex flex-wrap gap-2 mb-4">
										<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
											Questão 26
										</span>
										<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
											Questão 27
										</span>
										<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
											Questão 28
										</span>
										<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
											Questão 31
										</span>
										<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
											Questão 32
										</span>
										<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
											Questão 36
										</span>
									</div>
									<div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r-md">
										<p className="text-xs text-amber-800 flex items-center">
											<AlertTriangle className="w-4 h-4 mr-1.5 shrink-0" />
											<strong>Atenção:</strong> Contas presentes na planilha que não fazem parte do escopo parametrizado do RAC também são analisadas e
											destacadas em uma seção específica para revisão manual.
										</p>
									</div>
								</div>
							</div>
						</div>

						{/* Barra de Filtros Superiores */}
						<div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
							<div className="flex flex-wrap items-center gap-6">
								{/* Questão RAC */}
								<div className="flex items-center space-x-3">
									<label htmlFor="rac-filter" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center">
										<BookOpen className="w-4 h-4 mr-2 text-blue-600" />
										Questão RAC:
									</label>
									<select
										id="rac-filter"
										value={activeRacFilter}
										onChange={(e) => setActiveRacFilter(e.target.value)}
										className="text-sm border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 py-2 pl-3 pr-10 bg-slate-50 font-medium text-slate-700"
									>
										<option value="TODOS">Todas as Questões</option>
										{Array.from(new Set(data.filter((r) => r.questaoRAC).map((r) => r.questaoRAC)))
											.sort()
											.map((rac) => (
												<option key={rac} value={rac}>
													{rac}
												</option>
											))}
									</select>
								</div>

								{/* Conferente */}
								<div className="flex items-center space-x-3">
									<label htmlFor="conferente-filter" className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center">
										<Filter className="w-4 h-4 mr-2 text-blue-600" />
										Conferente:
									</label>
									<select
										id="conferente-filter"
										value={activeConferenteFilter}
										onChange={(e) => {
											setActiveConferenteFilter(e.target.value)
										}}
										className="text-sm border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 py-2 pl-3 pr-10 bg-slate-50 font-medium text-slate-700"
									>
										<option value="TODOS">Todos os Conferentes</option>
										{Array.from(new Set(data.map((r) => getConferente(r.ug))))
											.sort()
											.map((conf) => (
												<option key={conf} value={conf}>
													{conf}
												</option>
											))}
									</select>
								</div>
							</div>

							{/* Botão de Reset Geral */}
							{(activeRacFilter !== "TODOS" || activeConferenteFilter !== "TODOS") && (
								<button
									onClick={() => {
										setActiveRacFilter("TODOS")
										setActiveConferenteFilter("TODOS")
									}}
									className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
								>
									<Trash2 className="w-4 h-4" />
									LIMPAR FILTROS
								</button>
							)}
						</div>

						{/* Abas de Visão */}
						<div className="flex flex-wrap items-center border-b border-slate-200 mb-8 gap-1">
							<button
								onClick={() => setActiveView("operacional")}
								className={cn(
									"px-6 py-4 text-sm font-bold transition-all relative",
									activeView === "operacional"
										? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
										: "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
								)}
							>
								Visão Operacional
							</button>
							<button
								onClick={() => setActiveView("tatico")}
								className={cn(
									"px-6 py-4 text-sm font-bold transition-all relative",
									activeView === "tatico"
										? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
										: "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
								)}
							>
								Visão Tática
							</button>
							<button
								onClick={() => setActiveView("estrategico")}
								className={cn(
									"px-6 py-4 text-sm font-bold transition-all relative",
									activeView === "estrategico"
										? "text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50"
										: "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
								)}
							>
								Visão Estratégica
							</button>
							<button
								onClick={() => setActiveView("decisao")}
								className={cn(
									"px-6 py-4 text-sm font-bold transition-all relative",
									activeView === "decisao"
										? "text-amber-600 border-b-2 border-amber-600 bg-amber-50/50"
										: "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
								)}
							>
								Apoio à Decisão
							</button>
						</div>

						{activeView === "operacional" && activeRacFilter !== "TODOS" && (
							<div className="bg-blue-900 text-white p-6 rounded-2xl shadow-sm border border-blue-700 mb-8 flex items-center justify-between animate-in slide-in-from-top duration-500">
								<div className="flex items-center space-x-4">
									<div className="p-3 bg-blue-800 rounded-xl">
										<BookOpen className="w-6 h-6 text-blue-100" />
									</div>
									<div>
										<h2 className="text-xl font-bold">
											{activeRacFilter} — {getRacDescription(activeRacFilter)}
										</h2>
										<p className="text-blue-200 text-sm">Mostrando apenas UGs com inconsistências nesta questão do RAC</p>
									</div>
								</div>
								<button
									onClick={() => setActiveRacFilter("TODOS")}
									className="text-xs bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded-lg border border-blue-600 transition-colors"
								>
									Limpar Filtro RAC
								</button>
							</div>
						)}

						{activeView === "tatico" && managerialData && (
							<div className="space-y-8 animate-in fade-in duration-500">
								<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
									<div className="flex items-start space-x-4">
										<div className="p-3 bg-indigo-100 rounded-xl shrink-0">
											<Target className="w-6 h-6 text-indigo-700" />
										</div>
										<div>
											<h2 className="text-2xl font-bold text-slate-900 mb-2">Painel de Análise Tática (SUCONT-3)</h2>
											<p className="text-slate-600 leading-relaxed">
												Este painel traduz os achados operacionais em informações gerenciais para a Divisão SUCONT-3, alinhadas ao{" "}
												<strong>Roteiro de Acompanhamento Contábil (RAC)</strong>. O objetivo é permitir à SUCONT-3 identificar gargalos sistêmicos, direcionar
												esforços de capacitação e mitigar riscos contábeis no COMAER.
											</p>
										</div>
									</div>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<p className="text-sm font-medium text-slate-500 mb-1">Total de Inconsistências</p>
										<p className="text-3xl font-bold text-slate-900">{managerialData.totalIssues}</p>
										<p className="text-xs text-slate-500 mt-2">Registros fora da conformidade RAC</p>
									</div>
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<p className="text-sm font-medium text-slate-500 mb-1">Volume Financeiro em Risco</p>
										<p className="text-3xl font-bold text-red-600">{formatCurrency(managerialData.totalRiskValue)}</p>
										<p className="text-xs text-slate-500 mt-2">Soma absoluta dos saldos irregulares</p>
									</div>
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<p className="text-sm font-medium text-slate-500 mb-1">UG mais Crítica (Volume)</p>
										<p className="text-2xl font-bold text-slate-900 truncate">{managerialData.topUgs[0]?.ug || "-"}</p>
										<p className="text-xs text-slate-500 mt-2">Maior concentração de inconsistências</p>
									</div>
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<p className="text-sm font-medium text-slate-500 mb-1">Questão RAC mais Frequente</p>
										<p className="text-2xl font-bold text-indigo-600 truncate">{managerialData.topRacs[0]?.name || "-"}</p>
										<p className="text-xs text-slate-500 mt-2">Principal ofensor sistêmico</p>
									</div>
								</div>

								<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
											<TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
											Top 10 UGs por Volume de Inconsistências
										</h3>
										<div className="h-80">
											<ResponsiveContainer width="100%" height="100%">
												<BarChart data={managerialData.topUgs} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
													<CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
													<XAxis type="number" hide />
													<YAxis dataKey="ug" type="category" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
													<Tooltip
														cursor={{ fill: "#f1f5f9" }}
														contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
														formatter={(value: number) => [value, "Ocorrências"]}
													/>
													<Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
												</BarChart>
											</ResponsiveContainer>
										</div>
									</div>

									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
											<PieChartIcon className="w-5 h-5 mr-2 text-indigo-600" />
											Distribuição por Questão RAC
										</h3>
										<div className="h-80">
											<ResponsiveContainer width="100%" height="100%">
												<PieChart>
													<Pie data={managerialData.topRacs} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
														{managerialData.topRacs.map((_entry, index) => (
															<Cell key={`cell-${index}`} fill={["#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316"][index % 6]} />
														))}
													</Pie>
													<Tooltip
														contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
														formatter={(value: number) => [value, "Ocorrências"]}
													/>
													<Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "12px", color: "#64748b" }} />
												</PieChart>
											</ResponsiveContainer>
										</div>
									</div>
								</div>

								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
										<Users className="w-5 h-5 mr-2 text-emerald-600" />
										Distribuição de Inconsistências por Conferente
									</h3>
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
										{managerialData.conferentes.map((conf, idx) => (
											<div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
												<div className="flex justify-between items-start mb-3">
													<h4 className="font-semibold text-slate-900 text-sm">Conferente: {conf.name}</h4>
													<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
														{conf.count} Inconsistências
													</span>
												</div>
												<div className="text-xs text-slate-500 mb-2 font-medium">UGs com inconsistências:</div>
												<div className="flex flex-wrap gap-1.5">
													{conf.ugs.map((ug) => (
														<span
															key={ug}
															className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white border border-slate-200 text-slate-700"
														>
															UG {ug}
														</span>
													))}
												</div>
											</div>
										))}
									</div>
								</div>

								<div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
									<h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center">
										<Lightbulb className="w-5 h-5 mr-2 text-indigo-600" />
										Recomendações Estratégicas (Foco de Atuação)
									</h3>
									<ul className="space-y-3 text-indigo-800 text-sm">
										{managerialData.topUgs.length > 0 && (
											<li className="flex items-start">
												<span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 mr-2 shrink-0"></span>
												<span>
													A UG <strong>{managerialData.topUgs[0].ug}</strong> concentra a maior parte das inconsistências. Recomenda-se uma ação de orientação
													técnica direcionada à Setorial Contábil desta unidade para promover a regularização e mitigar o risco sistêmico.
												</span>
											</li>
										)}
										{managerialData.topRacs.length > 0 && (
											<li className="flex items-start">
												<span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 mr-2 shrink-0"></span>
												<span>
													A <strong>{managerialData.topRacs[0].name}</strong> é a principal ofensora do COMAER neste período. Sugere-se avaliar a necessidade de
													capacitação das UGs ou a emissão de um boletim de orientação específico sobre este tema do RAC.
												</span>
											</li>
										)}
										<li className="flex items-start">
											<span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 mr-2 shrink-0"></span>
											<span>
												O volume financeiro total em risco é de <strong>{formatCurrency(managerialData.totalRiskValue)}</strong>. A não regularização destes
												saldos pode comprometer a fidedignidade das demonstrações contábeis do Comando da Aeronáutica.
											</span>
										</li>
									</ul>
								</div>

								<ChatAssistant managerialData={managerialData} estrategicoData={estrategicoData} decisaoData={decisaoData} />
							</div>
						)}

						{activeView === "estrategico" && estrategicoData && (
							<div className="space-y-8 animate-in fade-in duration-500">
								<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
									<div className="flex items-start space-x-4">
										<div className="p-3 bg-emerald-100 rounded-xl shrink-0">
											<Building2 className="w-6 h-6 text-emerald-700" />
										</div>
										<div>
											<h2 className="text-2xl font-bold text-slate-900 mb-2">Painel de Risco Contábil do COMAER (Estratégico)</h2>
											<p className="text-slate-600 leading-relaxed">
												Visão consolidada para apoio à tomada de decisão da chefia da SUCONT, DIREF e altos escalões do COMAER. Apresenta a distribuição do
												risco contábil por Órgão de Direção Setorial (ODS) e Órgão Superior, permitindo identificar rapidamente os pontos de maior
												vulnerabilidade sistêmica.
											</p>
										</div>
									</div>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<p className="text-sm font-medium text-slate-500 mb-1">Total de Inconsistências</p>
										<p className="text-3xl font-bold text-slate-900">{estrategicoData.totalIssues}</p>
										<p className="text-xs text-slate-500 mt-2">Registros fora da conformidade RAC</p>
									</div>
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<p className="text-sm font-medium text-slate-500 mb-1">Volume Financeiro em Risco</p>
										<p className="text-3xl font-bold text-red-600">{formatCurrency(estrategicoData.totalRiskValue)}</p>
										<p className="text-xs text-slate-500 mt-2">Soma absoluta dos saldos irregulares</p>
									</div>
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<p className="text-sm font-medium text-slate-500 mb-1">Maior Risco por ODS</p>
										<p className="text-2xl font-bold text-emerald-600 truncate">{estrategicoData.topOds[0]?.name || "-"}</p>
										<p className="text-xs text-slate-500 mt-2">{estrategicoData.topOds[0]?.percent.toFixed(1)}% das inconsistências</p>
									</div>
								</div>

								<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
											<PieChartIcon className="w-5 h-5 mr-2 text-emerald-600" />
											Distribuição Percentual por ODS
										</h3>
										<div className="h-80">
											<ResponsiveContainer width="100%" height="100%">
												<PieChart>
													<Pie
														data={estrategicoData.topOds}
														cx="50%"
														cy="50%"
														innerRadius={60}
														outerRadius={100}
														paddingAngle={5}
														dataKey="count"
														nameKey="name"
													>
														{estrategicoData.topOds.map((_entry, index) => (
															<Cell key={`cell-${index}`} fill={["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"][index % 6]} />
														))}
													</Pie>
													<Tooltip
														contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
														formatter={(value: number, _name: string, props: any) => [`${value} (${props.payload.percent.toFixed(1)}%)`, "Inconsistências"]}
													/>
													<Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "12px", color: "#64748b" }} />
												</PieChart>
											</ResponsiveContainer>
										</div>
									</div>

									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
											<BarChart3 className="w-5 h-5 mr-2 text-emerald-600" />
											Ranking de Órgãos Superiores
										</h3>
										<div className="h-80">
											<ResponsiveContainer width="100%" height="100%">
												<BarChart data={estrategicoData.topOrgaosSuperiores} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
													<CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
													<XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
													<YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
													<Tooltip
														cursor={{ fill: "#f1f5f9" }}
														contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
														formatter={(value: number) => [value, "Inconsistências"]}
													/>
													<Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
												</BarChart>
											</ResponsiveContainer>
										</div>
									</div>
								</div>

								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
										<AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
										Contas Contábeis com Maior Risco (Top 10)
									</h3>
									<div className="overflow-x-auto">
										<table className="min-w-full divide-y divide-slate-200">
											<thead>
												<tr>
													<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Conta</th>
													<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Descrição</th>
													<th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Ocorrências</th>
													<th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Volume Financeiro</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-100">
												{estrategicoData.topContas.map((c, i) => (
													<tr key={i} className="hover:bg-slate-50">
														<td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-slate-900">{c.conta}</td>
														<td className="px-3 py-2 text-sm text-slate-600">{c.descricao}</td>
														<td className="px-3 py-2 whitespace-nowrap text-sm text-right font-medium text-slate-900">{c.count}</td>
														<td className="px-3 py-2 whitespace-nowrap text-sm text-right font-medium text-red-600">{formatCurrency(c.value)}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>

								<ChatAssistant managerialData={managerialData} estrategicoData={estrategicoData} decisaoData={decisaoData} />
							</div>
						)}

						{activeView === "decisao" && decisaoData && (
							<div className="space-y-8 animate-in fade-in duration-500">
								<div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
									<div className="flex items-start space-x-4">
										<div className="p-3 bg-amber-100 rounded-xl shrink-0">
											<Lightbulb className="w-6 h-6 text-amber-700" />
										</div>
										<div>
											<h2 className="text-2xl font-bold text-slate-900 mb-2">Apoio à Tomada de Decisão e Mapa de Risco</h2>
											<p className="text-slate-600 leading-relaxed">
												Análise estratégica para identificação de níveis de risco contábil, concentração de inconsistências e priorização de atuação no âmbito
												do COMAER.
											</p>
										</div>
									</div>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
									<div className="bg-amber-50 p-6 rounded-2xl border border-amber-200">
										<p className="text-xs font-bold text-amber-600 uppercase mb-1">ODS de Maior Risco</p>
										<p className="text-xl font-bold text-slate-900">{decisaoData.criticalLevels.ods}</p>
									</div>
									<div className="bg-amber-50 p-6 rounded-2xl border border-amber-200">
										<p className="text-xs font-bold text-amber-600 uppercase mb-1">Órgão Superior Crítico</p>
										<p className="text-xl font-bold text-slate-900">{decisaoData.criticalLevels.superior}</p>
									</div>
									<div className="bg-amber-50 p-6 rounded-2xl border border-amber-200">
										<p className="text-xs font-bold text-amber-600 uppercase mb-1">UG com mais Inconsistências</p>
										<p className="text-xl font-bold text-slate-900">{decisaoData.criticalLevels.ugCount}</p>
									</div>
									<div className="bg-amber-50 p-6 rounded-2xl border border-amber-200">
										<p className="text-xs font-bold text-amber-600 uppercase mb-1">UG com maior Saldo Irregular</p>
										<p className="text-xl font-bold text-slate-900">{decisaoData.criticalLevels.ugValue}</p>
									</div>
								</div>

								<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
											<ShieldAlert className="w-5 h-5 mr-2 text-red-600" />
											Mapa de Risco Contábil (ODS)
										</h3>
										<div className="overflow-x-auto">
											<table className="w-full text-sm text-left">
												<thead className="text-xs text-slate-500 uppercase bg-slate-50">
													<tr>
														<th className="px-4 py-3">ODS</th>
														<th className="px-4 py-3 text-center">Inconsistências</th>
														<th className="px-4 py-3 text-right">Saldo Associado</th>
														<th className="px-4 py-3 text-right">% Total</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-slate-100">
													{estrategicoData?.topOds.map((ods) => (
														<tr key={ods.name} className="hover:bg-slate-50">
															<td className="px-4 py-3 font-medium text-slate-900">{ods.name}</td>
															<td className="px-4 py-3 text-center">{ods.count}</td>
															<td className="px-4 py-3 text-right text-red-600 font-medium">{formatCurrency(ods.value)}</td>
															<td className="px-4 py-3 text-right">{ods.percent.toFixed(1)}%</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									</div>

									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
										<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
											<Target className="w-5 h-5 mr-2 text-blue-600" />
											Análise de Concentração (Pareto)
										</h3>
										<div className="flex flex-col items-center justify-center h-full pb-6">
											<div className="text-center mb-8">
												<p className="text-4xl font-black text-blue-600 mb-2">{decisaoData.pareto.paretoPercent.toFixed(1)}%</p>
												<p className="text-sm text-slate-600">
													das inconsistências estão concentradas em apenas <span className="font-bold text-slate-900">20% das UGs</span> (
													{decisaoData.pareto.twentyPercentCount} UGs).
												</p>
											</div>
											<div className="w-full space-y-3">
												<p className="text-xs font-bold text-slate-400 uppercase">UGs que compõem a concentração:</p>
												{decisaoData.pareto.topTwentyUgs.map((ug, i) => (
													<div key={ug.ug} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
														<div className="flex items-center gap-2">
															<span className="text-[10px] font-bold bg-blue-100 text-blue-700 w-5 h-5 flex items-center justify-center rounded-full">
																{i + 1}
															</span>
															<span className="text-sm font-semibold text-slate-700">
																{ug.ug} ({ug.nome})
															</span>
														</div>
														<span className="text-xs font-medium text-slate-500">{ug.count} itens</span>
													</div>
												))}
											</div>
										</div>
									</div>
								</div>

								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
										<TrendingUp className="w-5 h-5 mr-2 text-emerald-600" />
										Priorização de Atuação (Top 15 UGs Prioritárias)
									</h3>
									<div className="overflow-x-auto">
										<table className="w-full text-sm text-left">
											<thead className="text-xs text-slate-500 uppercase bg-slate-50">
												<tr>
													<th className="px-4 py-3">Prioridade</th>
													<th className="px-4 py-3">UG / Nome</th>
													<th className="px-4 py-3">Órgão Superior / ODS</th>
													<th className="px-4 py-3 text-center">Inconsistências</th>
													<th className="px-4 py-3 text-right">Impacto Financeiro</th>
													<th className="px-4 py-3 text-center">Score de Risco</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-100">
												{decisaoData.priorities.map((ug, i) => (
													<tr key={ug.ug} className="hover:bg-slate-50">
														<td className="px-4 py-3">
															<span
																className={cn(
																	"inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold",
																	i < 3 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
																)}
															>
																{i + 1}º
															</span>
														</td>
														<td className="px-4 py-3">
															<p className="font-bold text-slate-900">{ug.ug}</p>
															<p className="text-xs text-slate-500">{ug.nome}</p>
														</td>
														<td className="px-4 py-3">
															<p className="text-slate-700">{ug.superior}</p>
															<p className="text-xs text-slate-500">{ug.ods}</p>
														</td>
														<td className="px-4 py-3 text-center font-medium">{ug.count}</td>
														<td className="px-4 py-3 text-right text-red-600 font-medium">{formatCurrency(ug.value)}</td>
														<td className="px-4 py-3 text-center">
															<div className="w-full bg-slate-100 rounded-full h-1.5 max-w-[100px] mx-auto">
																<div
																	className={cn("h-1.5 rounded-full", ug.score > 0.7 ? "bg-red-500" : ug.score > 0.4 ? "bg-amber-500" : "bg-emerald-500")}
																	style={{ width: `${ug.score * 100}%` }}
																></div>
															</div>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>

								<ChatAssistant managerialData={managerialData} estrategicoData={estrategicoData} decisaoData={decisaoData} />
							</div>
						)}

						{activeView === "operacional" && dashboardData && (
							<div className="space-y-6 mb-8 animate-in fade-in duration-500">
								<h2 className="text-xl font-bold text-slate-900 flex items-center">
									<BarChart3 className="w-6 h-6 mr-2 text-blue-600" />
									VISÃO GERAL
								</h2>
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
										<div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
											<FileText className="w-6 h-6" />
										</div>
										<div>
											<p className="text-sm font-medium text-slate-500">Total de Registros Analisados</p>
											<p className="text-2xl font-bold text-slate-900">{dashboardData.totalRegistros}</p>
										</div>
									</div>
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
										<div className="p-3 bg-red-100 text-red-600 rounded-xl">
											<AlertTriangle className="w-6 h-6" />
										</div>
										<div>
											<p className="text-sm font-medium text-slate-500">Ocorrências de Cobrança</p>
											<p className="text-2xl font-bold text-slate-900">{dashboardData.totalCobrancas}</p>
										</div>
									</div>
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
										<div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
											<Building2 className="w-6 h-6" />
										</div>
										<div>
											<p className="text-sm font-medium text-slate-500">UGs com Inconsistências</p>
											<p className="text-2xl font-bold text-slate-900">{dashboardData.ugsComInconsistencia}</p>
										</div>
									</div>
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
										<div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
											<CheckCircle2 className="w-6 h-6" />
										</div>
										<div>
											<p className="text-sm font-medium text-slate-500">Exceções Identificadas</p>
											<p className="text-2xl font-bold text-slate-900">{dashboardData.totalExcecoes}</p>
										</div>
									</div>
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
										<div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
											<AlertCircle className="w-6 h-6" />
										</div>
										<div>
											<p className="text-sm font-medium text-slate-500">Ocorrências Fora do Escopo</p>
											<p className="text-2xl font-bold text-slate-900">{dashboardData.totalForaEscopo}</p>
										</div>
									</div>
									<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4">
										<div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
											<DollarSign className="w-6 h-6" />
										</div>
										<div>
											<p className="text-sm font-medium text-slate-500">Valor Total das Inconsistências</p>
											<p className="text-2xl font-bold text-slate-900">{formatCurrency(dashboardData.volumeFinanceiro)}</p>
										</div>
									</div>
								</div>
							</div>
						)}

						{activeView === "operacional" && data.length > 0 && (
							<div className="mb-8">
								<div className="flex items-center space-x-2 mb-4">
									<Filter className="w-5 h-5 text-slate-500" />
									<h3 className="text-sm font-medium text-slate-700 uppercase tracking-wider">Filtrar Visão</h3>
								</div>
								<div className="flex flex-wrap gap-2">
									<button
										onClick={() => setActiveTab("ALL")}
										className={cn(
											"px-4 py-2 rounded-lg text-sm font-medium transition-colors",
											activeTab === "ALL" ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
										)}
									>
										Todas as Ocorrências
									</button>
									<button
										onClick={() => setActiveTab("COBRANCAS")}
										className={cn(
											"px-4 py-2 rounded-lg text-sm font-medium transition-colors",
											activeTab === "COBRANCAS" ? "bg-red-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
										)}
									>
										Cobranças (RAC)
									</button>
									<button
										onClick={() => setActiveTab("EXCECOES")}
										className={cn(
											"px-4 py-2 rounded-lg text-sm font-medium transition-colors",
											activeTab === "EXCECOES" ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
										)}
									>
										Exceções (RAC)
									</button>
									<button
										onClick={() => setActiveTab("FORA_ESCOPO")}
										className={cn(
											"px-4 py-2 rounded-lg text-sm font-medium transition-colors",
											activeTab === "FORA_ESCOPO" ? "bg-amber-500 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
										)}
									>
										Fora do Escopo (Inconsistências)
									</button>
								</div>
							</div>
						)}

						{activeView === "operacional" && (activeTab === "ALL" || activeTab === "COBRANCAS") && dashboardData && dashboardData.totalCobrancas > 0 && (
							<div className="space-y-6 mb-8">
								{activeRacFilter !== "TODOS" && <ConsolidatedMessageCard rows={filteredDataByConferente} activeRacFilter={activeRacFilter} />}

								<h2 className="text-xl font-bold text-slate-900 flex items-center mt-12">
									<AlertTriangle className="w-6 h-6 mr-2 text-red-600" />
									PAINEL DE INCONSISTÊNCIAS POR UG
								</h2>

								{(Object.values(groupedData) as { ug: string; mes: string; rows: ProcessedRow[] }[]).map((group) => (
									<UGCard key={`${group.ug}-${group.mes}`} group={group} type="INCONSISTENCIA" activeRacFilter={activeRacFilter} />
								))}
							</div>
						)}

						{activeView === "operacional" && (activeTab === "ALL" || activeTab === "EXCECOES") && excecoesData.length > 0 && (
							<div className="space-y-6 mb-8">
								<h2 className="text-xl font-bold text-slate-900 flex items-center mt-12">
									<CheckCircle2 className="w-6 h-6 mr-2 text-emerald-600" />
									PAINEL DE EXCEÇÕES DO RAC
								</h2>
								<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
									<div className="p-6">
										<p className="text-sm text-slate-600 mb-4">
											As ocorrências abaixo foram detectadas, mas estão previstas nas exceções do RAC. Nenhuma cobrança será gerada.
										</p>
										<div className="overflow-x-auto">
											<table className="min-w-full divide-y divide-slate-200">
												<thead>
													<tr>
														<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">UG</th>
														<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Conta</th>
														<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Descrição</th>
														<th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Saldo</th>
														<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fundamento da exceção</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-slate-100">
													{excecoesData.map((c, i) => (
														<tr key={i} className="hover:bg-slate-50">
															<td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-slate-900">{c.ug}</td>
															<td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-slate-900">{c.conta}</td>
															<td className="px-3 py-2 text-sm text-slate-600">{c.descricao}</td>
															<td className="px-3 py-2 whitespace-nowrap text-sm text-right font-medium text-slate-900">{formatCurrency(c.saldo)}</td>
															<td className="px-3 py-2 text-sm text-slate-500 italic">{c.observacao || "Exceção expressamente prevista no RAC"}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									</div>
								</div>
							</div>
						)}

						{activeView === "operacional" && (activeTab === "ALL" || activeTab === "FORA_ESCOPO") && outOfScopeData.length > 0 && (
							<div className="space-y-6 mb-8 animate-in fade-in duration-500">
								<h2 className="text-xl font-bold text-slate-900 flex items-center mt-12">
									<AlertCircle className="w-6 h-6 mr-2 text-amber-500" />
									PAINEL DE CONTAS FORA DO ESCOPO DO RAC
								</h2>

								<div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl mb-6">
									<p className="text-sm text-amber-800">
										<span className="font-semibold">Possível inconsistência contábil – conta não parametrizada no RAC.</span>
										<br />
										As contas abaixo não foram encontradas na matriz normativa e requerem revisão manual pela equipe da SUCONT-3. Caso confirmada a
										inconsistência, a mensagem abaixo pode ser enviada.
									</p>
								</div>

								{(Object.values(groupedData) as { ug: string; mes: string; rows: ProcessedRow[] }[]).map((group) => (
									<UGCard key={`fora-${group.ug}-${group.mes}`} group={group} type="FORA_ESCOPO" activeRacFilter={activeRacFilter} />
								))}
							</div>
						)}

						{activeView === "operacional" && data.length > 0 && dashboardData?.totalCobrancas === 0 && outOfScopeData.length === 0 && (
							<div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center animate-in fade-in duration-500">
								<CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
								<h3 className="text-lg font-semibold text-emerald-900">Nenhuma cobrança necessária</h3>
								<p className="text-emerald-700 mt-1">Todas as ocorrências processadas são exceções previstas na matriz normativa.</p>
							</div>
						)}
					</div>
				)}
			</main>
		</div>
	)
}
