import Papa from "papaparse"
import * as XLSX from "xlsx"

export interface ParsedRow {
	ug: string
	nomeUg?: string
	contaContabil: string
	nomeConta?: string
	contaCorrente: string
	saldo: number
}

const normalizeString = (str: string) => {
	return str
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
}

const findColumnKey = (keys: string[], possibleNames: string[]): string | undefined => {
	const match = keys.find((key) => possibleNames.includes(normalizeString(key)))
	if (match) return match
	return keys.find((key) => {
		const normalizedKey = normalizeString(key)
		return possibleNames.some((name) => normalizedKey.includes(name))
	})
}

const getMonthNumber = (monthStr: string) => {
	const months: Record<string, number> = {
		jan: 0,
		fev: 1,
		mar: 2,
		abr: 3,
		mai: 4,
		jun: 5,
		jul: 6,
		ago: 7,
		set: 8,
		out: 9,
		nov: 10,
		dez: 11,
	}
	return months[monthStr.toLowerCase().substring(0, 3)] ?? -1
}

const extractDateFromColumn = (colName: string) => {
	const match = colName.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/(\d{4})/i)
	if (match) {
		return new Date(parseInt(match[2], 10), getMonthNumber(match[1]), 1)
	}
	return new Date(0)
}

const findSaldoKey = (keys: string[]): string | undefined => {
	const saldoKeys = keys.filter((key) => {
		const norm = normalizeString(key)
		return norm.startsWith("saldo - r$") || norm.startsWith("saldo")
	})

	if (saldoKeys.length === 0) {
		const fallbackKeys = keys.filter((key) => normalizeString(key).includes("saldo") || normalizeString(key).includes("valor"))
		if (fallbackKeys.length > 0) return fallbackKeys[0]
		return undefined
	}

	if (saldoKeys.length === 1) return saldoKeys[0]

	saldoKeys.sort((a, b) => {
		const dateA = extractDateFromColumn(a)
		const dateB = extractDateFromColumn(b)
		return dateB.getTime() - dateA.getTime()
	})

	return saldoKeys[0]
}

export const parseFile = async (file: File): Promise<ParsedRow[]> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()

		reader.onload = async (e) => {
			try {
				const data = e.target?.result
				if (!data) throw new Error("Failed to read file")

				let rawData: Record<string, unknown>[] = []

				if (file.name.endsWith(".csv")) {
					const text = new TextDecoder("utf-8").decode(data as ArrayBuffer)
					const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
					rawData = parsed.data as Record<string, unknown>[]
				} else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
					const workbook = XLSX.read(data, { type: "array", raw: true })
					const firstSheetName = workbook.SheetNames[0]
					const worksheet = workbook.Sheets[firstSheetName]
					rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: true }) as Record<string, unknown>[]
				} else {
					throw new Error("Formato de arquivo não suportado. Use CSV ou Excel.")
				}

				if (rawData.length === 0) {
					resolve([])
					return
				}

				const keys = Object.keys(rawData[0])

				const ugKey = findColumnKey(keys, ["ug (codigo)", "ug", "unidade gestora", "unidade"])
				const nomeUgKey = findColumnKey(keys, ["ug (nome)", "nome da ug", "nome ug", "orgao"])
				const contaContabilKey = findColumnKey(keys, ["conta contabil (codigo)", "conta contabil", "conta contábil", "conta"])
				const nomeContaKey = findColumnKey(keys, ["conta contabil (nome)", "nome da conta", "nome conta", "descricao"])
				const contaCorrenteKey = findColumnKey(keys, ["conta corrente", "corrente"])
				const saldoKey = findSaldoKey(keys)

				if (!ugKey || !contaContabilKey || !contaCorrenteKey || !saldoKey) {
					throw new Error(
						"Não foi possível identificar as colunas necessárias na planilha. Verifique se as colunas UG, Conta Contábil, Conta Corrente e Saldo estão presentes."
					)
				}

				const parsedRows: ParsedRow[] = rawData
					.map((row) => {
						let ug = String(row[ugKey]).trim()
						if (ug.endsWith(".0")) ug = ug.slice(0, -2)

						const nomeUg = nomeUgKey ? String(row[nomeUgKey]).trim() : undefined

						let contaContabil = String(row[contaContabilKey]).replace(/[\s.]/g, "")
						if (contaContabil.includes("e+") || contaContabil.includes("E+")) {
							contaContabil = Number(row[contaContabilKey]).toLocaleString("fullwide", {
								useGrouping: false,
							})
						}

						const nomeConta = nomeContaKey ? String(row[nomeContaKey]).trim() : undefined

						let contaCorrente = String(row[contaCorrenteKey]).trim()
						if (contaCorrente.endsWith(".0")) contaCorrente = contaCorrente.slice(0, -2)

						let saldoStr = String(row[saldoKey])
						let saldo = 0

						if (saldoStr && saldoStr.trim() !== "") {
							saldoStr = saldoStr.replace(/[^\d.,-]/g, "")

							if (saldoStr.includes(",") && saldoStr.includes(".")) {
								const lastComma = saldoStr.lastIndexOf(",")
								const lastDot = saldoStr.lastIndexOf(".")
								if (lastComma > lastDot) {
									saldoStr = saldoStr.replace(/\./g, "").replace(",", ".")
								} else {
									saldoStr = saldoStr.replace(/,/g, "")
								}
							} else if (saldoStr.includes(",")) {
								saldoStr = saldoStr.replace(",", ".")
							}

							saldo = parseFloat(saldoStr)
						}

						return {
							ug,
							nomeUg,
							contaContabil,
							nomeConta,
							contaCorrente,
							saldo: Number.isNaN(saldo) ? 0 : saldo,
						}
					})
					.filter((row) => row.ug && row.contaContabil)

				resolve(parsedRows)
			} catch (error) {
				reject(error)
			}
		}

		reader.onerror = () => reject(new Error("Falha ao ler o arquivo"))
		reader.readAsArrayBuffer(file)
	})
}
