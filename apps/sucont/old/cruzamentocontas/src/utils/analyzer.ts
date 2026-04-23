import * as XLSX from "xlsx"
import { getConferente } from "./conferentes"
import { UG_DATA } from "./ugData"

export interface RawRecord {
	UG: string
	ContaContabil: string
	ContaCorrente: string
	Saldo: number
}

export interface AnalysisResult {
	contaCorrente: string
	status: "REGULAR" | "AUSÊNCIA NA 897110300" | "AUSÊNCIA NA 897210300" | "DIVERGÊNCIA DE SALDO" | "UG INDEVIDA NA 897210300"
	ug8972: string
	saldo8972: number | null
	ug8971: string
	saldo8971: number | null
	diferenca: number
}

export interface UGAnalysis {
	ug: string
	ugName?: string
	orgaoSuperior?: string
	ods?: string
	conferente: string
	status: "REGULAR" | "ATENÇÃO" | "CRÍTICA"
	inconsistenciesCount: number
	financialImpact: number
	details: AnalysisResult[]
	diagnosis: string[]
}

export interface DashboardStats {
	totalUgs: number
	ugsRegulares: number
	ugsAtencao: number
	ugsCriticas: number
	synthesis: string
}

export interface ReportData {
	stats: DashboardStats
	ugAnalysis: UGAnalysis[]
	ranking: UGAnalysis[]
}

export function parseFile(file: File): Promise<RawRecord[]> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = (e) => {
			try {
				const data = new Uint8Array(e.target?.result as ArrayBuffer)
				const workbook = XLSX.read(data, { type: "array" })
				const firstSheetName = workbook.SheetNames[0]
				const worksheet = workbook.Sheets[firstSheetName]
				// Convert to array of arrays to find the header row
				const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

				let headerRowIndex = -1
				for (let i = 0; i < rows.length; i++) {
					const row = rows[i]
					if (!row) continue
					const rowStr = row.join(" ").toLowerCase()
					if (rowStr.includes("ug") && rowStr.includes("conta") && rowStr.includes("corrente")) {
						headerRowIndex = i
						break
					}
				}

				if (headerRowIndex === -1) {
					throw new Error("Cabeçalho da tabela não encontrado. A planilha deve conter as colunas UG, Conta Contábil, Conta Corrente e Saldo.")
				}

				// Now parse from the header row
				const json = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex, raw: false })

				const records: RawRecord[] = json
					.map((row: any) => {
						// Normalize keys to handle case and spacing variations
						const getVal = (searchKeys: string[]) => {
							const key = Object.keys(row).find((k) =>
								searchKeys.some((searchKey) => k.toLowerCase().replace(/\s+/g, "").includes(searchKey.toLowerCase().replace(/\s+/g, "")))
							)
							return key ? row[key] : ""
						}

						const ug = getVal(["UG", "UnidadeGestora"])
						const contaContabil = getVal(["ContaContábil", "ContaContabil"])
						const contaCorrente = getVal(["ContaCorrente"])
						const saldoStr = getVal(["Saldo", "Valor"])

						let saldo = 0
						if (typeof saldoStr === "string") {
							// Remove R$ and spaces
							let cleaned = saldoStr.replace(/[R$\s]/g, "")

							const lastDot = cleaned.lastIndexOf(".")
							const lastComma = cleaned.lastIndexOf(",")

							if (lastComma > lastDot) {
								// Formato BR: 2.903,97
								cleaned = cleaned.replace(/\./g, "").replace(",", ".")
							} else if (lastDot > lastComma) {
								// Formato US: 2,903.97
								cleaned = cleaned.replace(/,/g, "")
							}

							saldo = parseFloat(cleaned) || 0
						} else if (typeof saldoStr === "number") {
							saldo = saldoStr
						}

						return {
							UG: String(ug).trim(),
							ContaContabil: String(contaContabil).trim(),
							ContaCorrente: String(contaCorrente).trim(),
							Saldo: saldo,
						}
					})
					.filter((r: RawRecord) => r.UG && r.ContaContabil && r.ContaCorrente)

				resolve(records)
			} catch (err) {
				reject(err)
			}
		}
		reader.onerror = reject
		reader.readAsArrayBuffer(file)
	})
}

export function analyzeData(records: RawRecord[]): ReportData {
	const map = new Map<
		string,
		{
			ug8972: Set<string>
			saldo8972: number
			has8972: boolean
			ug8971: Set<string>
			saldo8971: number
			has8971: boolean
		}
	>()

	for (const record of records) {
		// Only process relevant accounts
		if (record.ContaContabil !== "897210300" && record.ContaContabil !== "897110300") {
			continue
		}

		if (!map.has(record.ContaCorrente)) {
			map.set(record.ContaCorrente, {
				ug8972: new Set(),
				saldo8972: 0,
				has8972: false,
				ug8971: new Set(),
				saldo8971: 0,
				has8971: false,
			})
		}

		const entry = map.get(record.ContaCorrente)!

		if (record.ContaContabil === "897210300") {
			entry.ug8972.add(record.UG)
			entry.saldo8972 += record.Saldo
			entry.has8972 = true
		} else if (record.ContaContabil === "897110300") {
			entry.ug8971.add(record.UG)
			entry.saldo8971 += record.Saldo
			entry.has8971 = true
		}
	}

	// 2. Group results by UG (from 897110300)
	const ugMap = new Map<string, UGAnalysis>()

	const getOrCreateUG = (ug: string) => {
		if (!ugMap.has(ug)) {
			const info = UG_DATA[ug]
			ugMap.set(ug, {
				ug,
				ugName: info?.nome || "Desconhecida",
				orgaoSuperior: info?.orgaoSuperior || "-",
				ods: info?.ods || "-",
				conferente: getConferente(ug),
				status: "REGULAR",
				inconsistenciesCount: 0,
				financialImpact: 0,
				details: [],
				diagnosis: [],
			})
		}
		return ugMap.get(ug)!
	}

	for (const [contaCorrente, data] of map.entries()) {
		// Skip if it doesn't exist in either (shouldn't happen due to filter, but safe)
		if (!data.has8971 && !data.has8972) continue

		let status: AnalysisResult["status"]
		let diferenca = 0

		const saldo8972 = data.has8972 ? Number(data.saldo8972.toFixed(2)) : null
		const saldo8971 = data.has8971 ? Number(data.saldo8971.toFixed(2)) : null

		// Determine target UG for this conta corrente
		// We assign the inconsistency to a SINGLE UG to avoid duplicates.
		const ugs8972 = Array.from(data.ug8972)
		const hasInvalidUG8972 = ugs8972.some((ug) => ug !== "120052")

		let targetUG = "NÃO IDENTIFICADA"
		const invalidUGs8972 = ugs8972.filter((ug) => ug !== "120052")

		if (invalidUGs8972.length > 0) {
			targetUG = invalidUGs8972[0]
		} else if (data.ug8971.size > 0) {
			targetUG = Array.from(data.ug8971)[0]
		} else if (data.ug8972.size > 0) {
			targetUG = Array.from(data.ug8972)[0]
		}

		const targetUGs = [targetUG]

		diferenca = Number(Math.abs((saldo8972 || 0) - (saldo8971 || 0)).toFixed(2))

		const val8972 = saldo8972 || 0
		const val8971 = saldo8971 || 0

		if (val8972 === 0 && val8971 === 0) {
			status = "REGULAR"
		} else if (hasInvalidUG8972 && val8972 !== 0) {
			status = "UG INDEVIDA NA 897210300"
		} else if (diferenca === 0) {
			status = "REGULAR"
		} else if (data.has8972 && !data.has8971) {
			status = "AUSÊNCIA NA 897110300"
		} else if (!data.has8972 && data.has8971) {
			status = "AUSÊNCIA NA 897210300"
		} else {
			status = "DIVERGÊNCIA DE SALDO"
		}

		const result: AnalysisResult = {
			contaCorrente,
			status,
			ug8972: Array.from(data.ug8972).join(", ") || "-",
			saldo8972,
			ug8971: Array.from(data.ug8971).join(", ") || "-",
			saldo8971,
			diferenca,
		}

		for (const ug of targetUGs) {
			const ugAnalysis = getOrCreateUG(ug)

			if (status !== "REGULAR") {
				ugAnalysis.details.push(result)
				ugAnalysis.inconsistenciesCount++
				ugAnalysis.financialImpact += diferenca

				if (status.includes("AUSÊNCIA") || status === "UG INDEVIDA NA 897210300") {
					ugAnalysis.status = "CRÍTICA"
				} else if (status === "DIVERGÊNCIA DE SALDO" && ugAnalysis.status !== "CRÍTICA") {
					ugAnalysis.status = "ATENÇÃO"
				}
			}
		}
	}

	// Calculate diagnosis for each UG
	for (const ugAnalysis of ugMap.values()) {
		const causes = new Set<string>()
		for (const detail of ugAnalysis.details) {
			if (detail.status === "AUSÊNCIA NA 897110300") {
				causes.add("Falta de apropriação da responsabilidade de terceiros (A Receber)")
				causes.add("Baixa indevida na conta 897110300")
			} else if (detail.status === "AUSÊNCIA NA 897210300") {
				causes.add("Falta de apropriação da responsabilidade da UG")
				causes.add("Baixa indevida na conta 897210300")
			} else if (detail.status === "DIVERGÊNCIA DE SALDO") {
				causes.add("Divergência entre o direito a receber (8971) e a responsabilidade registrada (8972)")
				causes.add("Estorno parcial ou baixa não refletida em ambas as contas")
			} else if (detail.status === "UG INDEVIDA NA 897210300") {
				causes.add("Registro indevido na conta 897210300 por UG diferente de 120052")
			}
		}
		ugAnalysis.diagnosis = Array.from(causes)
	}

	const ugList = Array.from(ugMap.values())

	const ranking = [...ugList].sort((a, b) => {
		if (b.financialImpact !== a.financialImpact) {
			return b.financialImpact - a.financialImpact
		}
		return b.inconsistenciesCount - a.inconsistenciesCount
	})

	const stats: DashboardStats = {
		totalUgs: ugList.length,
		ugsRegulares: ugList.filter((u) => u.status === "REGULAR").length,
		ugsAtencao: ugList.filter((u) => u.status === "ATENÇÃO").length,
		ugsCriticas: ugList.filter((u) => u.status === "CRÍTICA").length,
		synthesis: "",
	}

	const criticalUgs = ranking.filter((u) => u.status === "CRÍTICA").map((u) => u.ug)
	const topUg = ranking.length > 0 && ranking[0].financialImpact > 0 ? ranking[0].ug : null

	if (criticalUgs.length > 0 && topUg) {
		stats.synthesis = `Verifica-se concentração de inconsistências nas UGs ${criticalUgs.join(", ")}, com maior impacto financeiro na UG ${topUg}, demandando atuação prioritária.`
	} else if (topUg) {
		stats.synthesis = `Verifica-se inconsistências com maior impacto financeiro na UG ${topUg}, demandando atuação prioritária.`
	} else {
		stats.synthesis = `Não foram encontradas inconsistências significativas nas UGs analisadas.`
	}

	return {
		stats,
		ugAnalysis: ugList,
		ranking,
	}
}
