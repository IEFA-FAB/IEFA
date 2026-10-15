// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): leitura do
// relatório do Tesouro Gerencial (cabeçalho na linha 12) e agrupamento dos
// subitens genéricos por UG. Era o corpo do `reader.onload` de `processFile`.
import * as XLSX from "xlsx"
import type { ProcessedData, UgGroup } from "#/subitens/types"

/**
 * Código genérico na conta corrente: 99 ou 999 isolados (sem dígito colado dos dois lados).
 * Igual ao upstream (sucontsubitem, src/App.tsx), que dá como exemplos "99, 999, P99, /99".
 *
 * O que a norma diz (conferido em 2026-10-14):
 * - Subitem 99 é o residual "Outros…" do elemento (339030.99 Outros Materiais de Consumo,
 *   339039.99, 449052.99). Subitem é facultativo (Port. Interministerial 163/2001, art. 3º
 *   §5º); a tabela >CONCONTA do SIAFI consolidada pela 8ª ICFEx traz os residuais:
 *   https://www.educacao.ufrj.br/wp-content/uploads/2024/02/Plano_de_Contas_SIAFI.pdf
 * - 96 não é genérico: é pagamento antecipado (transitório, com prazo de regularização),
 *   e por isso fica de fora:
 *   https://www.ufmg.br/proplan/wp-content/uploads/2023/04/Pilulas-do-Conhecimento-Suprimento-de-Fundos-Orientacoes-Gerais-e-Regularizacao-de-Inconsistencias.pdf
 * - 999 NÃO é subitem (subitem tem dois dígitos): é o favorecido genérico do tipo de conta
 *   corrente 002 "CNPJ, CPF, UG, IG OU 999", gravado como "P + Favorecido" (Macrofunção
 *   02.12.13, item 3.2.5.2):
 *   https://www.ufmg.br/proplan/wp-content/uploads/MACROFUN%C3%87%C3%83O-021213-ROTINA-PARA-EMISS%C3%83O-DE-NOTA-DE-EMPENHO.pdf
 *   É ele que a 02.03.18 item 5.1 manda evitar no encerramento:
 *   https://proad.ifes.edu.br/images/stories/020318_-_ENCERRAMENTO_DO_EXERC%C3%8DCIO.pdf
 *
 * Formato da conta corrente: em estoque (115610100) o c/c é ISF + subitem, e o SIAFI exibe
 * "P 04", "P 99" ("TOTAL COM ISF P - PERMANENTE"), conforme o balancete por conta corrente
 * do POP HC-UFTM SCONT.006 v3, figuras 25 a 27:
 * https://www.gov.br/hubrasil/pt-br/hospitais-universitarios/regiao-sudeste/hc-uftm/documentos/procedimentos-e-rotinas-operacionais-padrao/pops/POP.HCUFTM.SCONT.006ConciliacaodosSaldosdoSistemadeControledeEstoquescomoSistemadeAdministracaoFinanceiraversao3.pdf
 * Esse formato, com ou sem espaço, a regex já pega. O que NÃO dá para afirmar sem uma
 * planilha real do relatório "ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1" é quais contas
 * contábeis ele traz e, portanto, quais tipos de c/c chegam aqui. Consequências que ficam
 * em aberto, por isso a regex não mudou:
 * - c/c com o subitem colado a outros dígitos (NDD de 8 dígitos "33903099", NE + subitem)
 *   não é marcado;
 * - "999" e "P999" são marcados junto com o subitem 99, embora sejam favorecido genérico,
 *   outro problema (o texto da mensagem já cita a 02.03.18 por isso).
 *
 * O tipo 002 também grava CPF/CNPJ do favorecido. Formatado, o DV "-99" ficaria isolado e
 * seria lido como subitem; por isso `isGenericSubitem` descarta antes CPF e CNPJ com
 * pontuação completa (`FORMATTED_TAX_ID_REGEX`). Limite: CPF/CNPJ com pontuação parcial
 * (ex.: "12345678/0001-99") ainda é marcado; só dígitos (o formato do SIAFI) nunca foi.
 */
export const GENERIC_SUBITEM_REGEX = /(^|\D)(99|999)($|\D)/

/** CNPJ `00.000.000/0000-00` ou CPF `000.000.000-00`, com a pontuação completa. */
export const FORMATTED_TAX_ID_REGEX = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/g

/** Conta corrente com código genérico, ignorando CPF/CNPJ formatado do favorecido. */
export const isGenericSubitem = (contaCorrente: string): boolean => GENERIC_SUBITEM_REGEX.test(contaCorrente.replace(FORMATTED_TAX_ID_REGEX, " "))

interface ReportColumns {
	ugCol: string
	contaCol: string
	ccCol: string
	saldoCol: string
}

/** Primeiro cabeçalho igual a um dos nomes ou que contenha um deles (sem caixa nem espaços nas pontas). */
const findColumn = (firstRow: Record<string, unknown>, possibleNames: string[]) => {
	const keys = Object.keys(firstRow)
	return keys.find(
		(k) =>
			possibleNames.some((p) => k.toLowerCase().trim() === p.toLowerCase().trim()) ||
			possibleNames.some((p) => k.toLowerCase().trim().includes(p.toLowerCase().trim()))
	)
}

/** Colunas do relatório pelo cabeçalho da primeira linha de dados; lança listando as que faltam. */
function resolveColumns(firstRow: Record<string, unknown>): ReportColumns {
	const ugCol = findColumn(firstRow, ["UG", "UG Executora"])
	const contaCol = findColumn(firstRow, ["Conta Contábil", "Conta"])
	const ccCol = findColumn(firstRow, ["Conta Corrente", "CC", "Corrente"])
	const saldoCol = findColumn(firstRow, ["Saldo - R$", "Saldo", "Valor"])

	if (!ugCol || !contaCol || !ccCol || !saldoCol) {
		const missing = (
			[
				[ugCol, "UG Executora"],
				[contaCol, "Conta Contábil"],
				[ccCol, "Conta Corrente"],
				[saldoCol, "Saldo"],
			] as const
		)
			.filter(([col]) => !col)
			.map(([, label]) => label)
		throw new Error(`Não foi possível identificar as colunas: ${missing.join(", ")}. Verifique o cabeçalho da planilha.`)
	}
	return { ugCol, contaCol, ccCol, saldoCol }
}

/** Saldo numérico da célula; texto no formato "R$ 1.234,56" é convertido, e o que não for número vira 0. */
function parseSaldo(saldoRaw: unknown): number {
	let saldo = 0
	if (typeof saldoRaw === "number") {
		saldo = saldoRaw
	} else {
		const cleaned = String(saldoRaw)
			.replace(/[R$\s]/g, "")
			.replace(/\./g, "")
			.replace(",", ".")
		saldo = parseFloat(cleaned)
	}
	return Number.isNaN(saldo) ? 0 : saldo
}

const toProcessedRow = (row: Record<string, unknown>, { ugCol, contaCol, ccCol, saldoCol }: ReportColumns): ProcessedData => {
	const cc = String(row[ccCol] ?? "")
	return {
		ug: String(row[ugCol]).trim(),
		contaContabil: String(row[contaCol]).trim(),
		contaCorrente: cc.trim(),
		saldo: parseSaldo(row[saldoCol]),
		racId: "RAC 28",
	}
}

/** Agrupa por UG somando o saldo de linhas repetidas (mesma conta contábil e conta corrente). */
function groupByUg(filtered: ProcessedData[]): UgGroup[] {
	const groups: Record<string, UgGroup> = {}
	for (const row of filtered) {
		if (!groups[row.ug]) groups[row.ug] = { ug: row.ug, occurrences: [], totalSaldo: 0 }
		const existing = groups[row.ug].occurrences.find((o) => o.contaContabil === row.contaContabil && o.contaCorrente === row.contaCorrente)
		if (existing) {
			existing.saldo += row.saldo
		} else {
			groups[row.ug].occurrences.push({ ...row })
		}
		groups[row.ug].totalSaldo += row.saldo
	}

	return Object.values(groups).sort((a, b) => a.ug.localeCompare(b.ug))
}

/**
 * Lê a planilha e devolve as UGs com subitens genéricos, em ordem de UG. Lança com a
 * mensagem que a tela mostra quando a planilha está vazia ou falta coluna; lista vazia
 * (nenhum subitem genérico) fica para quem chama decidir.
 */
export function parseWorkbook(bstr: string | ArrayBuffer | null | undefined): UgGroup[] {
	const workbook = XLSX.read(bstr, { type: "array" })
	const sheetName = workbook.SheetNames[0]
	const worksheet = workbook.Sheets[sheetName]

	const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", range: 11 })

	if (jsonData.length === 0) throw new Error("O arquivo está vazio ou não contém dados válidos.")

	const columns = resolveColumns(jsonData[0])

	const filtered: ProcessedData[] = jsonData
		.map((row: Record<string, unknown>) => toProcessedRow(row, columns))
		.filter((row: ProcessedData) => isGenericSubitem(row.contaCorrente))

	return groupByUg(filtered)
}
