/**
 * @module pncp-pca-csv
 * Parser do CSV do Plano de Contratações Anual (PCA) do PNCP.
 *
 * Função pura, sem banco e sem rede — o worker chama, o teste exercita direto.
 *
 * Três decisões que este arquivo materializa:
 *
 *  1. **Resolução por NOME de cabeçalho, nunca por posição.** CSV governamental quebra em
 *     silêncio quando a origem insere uma coluna: as linhas continuam entrando, com os valores
 *     deslocados. Coluna esperada ausente aborta o arquivo inteiro, ruidosamente.
 *  2. **Formato brasileiro.** O arquivo vem com BOM, separador `;`, decimal com vírgula e
 *     data `dd/mm/aaaa`.
 *  3. **Zero não é dado.** `Quantidade Estimada` e os valores vêm `0,0000` em ~30% dos itens;
 *     tratá-los como zero real faria somas mentirem. Viram `null`, e a leitura conta quantos
 *     ficaram de fora.
 */

/** Cabeçalhos exigidos. Ausência de qualquer um aborta a ingestão do arquivo. */
export const PCA_CSV_COLUMNS = {
	nomeUnidade: "Unidade Responsável",
	uasg: "UASG",
	idItemPca: "Id do item no PCA",
	categoriaItem: "Categoria do Item",
	identificadorContratacao: "Identificador da Futura Contratação",
	nomeContratacao: "Nome da Futura Contratação",
	catalogo: "Catálogo Utilizado",
	classificacaoCatalogo: "Classificação do Catálogo",
	codigoClasse: "Código da Classificação Superior (Classe/Grupo)",
	nomeClasse: "Nome da Classificação Superior (Classe/Grupo)",
	codigoPdm: "Código do PDM do Item",
	nomePdm: "Nome do PDM do Item",
	codigoItem: "Código do Item",
	descricaoItem: "Descrição do Item",
	unidadeFornecimento: "Unidade de Fornecimento",
	quantidadeEstimada: "Quantidade Estimada",
	valorUnitarioEstimado: "Valor Unitário Estimado (R$)",
	valorTotalEstimado: "Valor Total Estimado (R$)",
	valorOrcamentario: "Valor orçamentário estimado para o exercício (R$)",
	dataDesejada: "Data Desejada",
} as const

export type PcaCsvColumn = keyof typeof PCA_CSV_COLUMNS

export interface PcaItem {
	idItemPca: string
	uasg: string
	nomeUnidade: string | null
	categoriaItem: string | null
	identificadorContratacao: string | null
	nomeContratacao: string | null
	catalogo: string | null
	classificacaoCatalogo: string | null
	codigoClasse: string | null
	nomeClasse: string | null
	codigoPdm: string | null
	nomePdm: string | null
	codigoItem: string | null
	descricaoItem: string | null
	unidadeFornecimento: string | null
	quantidadeEstimada: number | null
	valorUnitarioEstimado: number | null
	valorTotalEstimado: number | null
	valorOrcamentario: number | null
	dataDesejada: string | null
}

export class PcaCsvError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "PcaCsvError"
	}
}

/** Divide uma linha de CSV com `;`, respeitando aspas duplas e o escape `""`. */
export function splitCsvLine(line: string, sep = ";"): string[] {
	const out: string[] = []
	let field = ""
	let quoted = false

	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (quoted) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					field += '"'
					i++
				} else {
					quoted = false
				}
			} else {
				field += ch
			}
			continue
		}
		if (ch === '"') {
			quoted = true
		} else if (ch === sep) {
			out.push(field)
			field = ""
		} else {
			field += ch
		}
	}
	out.push(field)
	return out
}

/** Texto vazio, `-` ou só espaço viram `null`. */
export function parseText(raw: string | undefined): string | null {
	const v = (raw ?? "").trim()
	if (v === "" || v === "-") return null
	return v
}

/**
 * `1.350,5000` → `1350.5`. Devolve `null` para vazio e **para zero**: o CSV usa `0,0000`
 * como ausência em ~30% dos itens, e somar isso como zero real faria o total mentir.
 */
export function parseBrNumber(raw: string | undefined): number | null {
	const v = (raw ?? "").trim()
	if (v === "" || v === "-") return null
	const n = Number(v.replace(/\./g, "").replace(",", "."))
	if (!Number.isFinite(n) || n === 0) return null
	return n
}

/** `04/08/2026` → `2026-08-04`. Qualquer outra forma vira `null`. */
export function parseBrDate(raw: string | undefined): string | null {
	const v = (raw ?? "").trim()
	const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
	if (!m) return null
	return `${m[3]}-${m[2]}-${m[1]}`
}

export interface ParsePcaCsvResult {
	items: PcaItem[]
	/** Linhas ignoradas por não terem `Id do item no PCA` nem `UASG`. */
	skipped: number
}

/**
 * Parseia o CSV inteiro. Lança `PcaCsvError` se faltar coluna esperada — nenhuma linha é
 * aproveitada de arquivo com cabeçalho estranho.
 */
export function parsePcaCsv(content: string): ParsePcaCsvResult {
	const text = content.replace(/^﻿/, "")
	const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "")

	if (lines.length === 0) throw new PcaCsvError("CSV do PCA vazio")

	const header = splitCsvLine(lines[0]).map((h) => h.replace(/^﻿/, "").trim())
	const index: Partial<Record<PcaCsvColumn, number>> = {}
	const missing: string[] = []

	for (const [key, label] of Object.entries(PCA_CSV_COLUMNS) as Array<[PcaCsvColumn, string]>) {
		const at = header.indexOf(label)
		if (at === -1) missing.push(label)
		else index[key] = at
	}

	if (missing.length > 0) {
		throw new PcaCsvError(`CSV do PCA sem a(s) coluna(s) esperada(s): ${missing.join(" | ")}`)
	}

	const at = (cols: string[], key: PcaCsvColumn) => cols[index[key] as number]

	const items: PcaItem[] = []
	let skipped = 0

	for (const line of lines.slice(1)) {
		const cols = splitCsvLine(line)
		const idItemPca = parseText(at(cols, "idItemPca"))
		const uasg = parseText(at(cols, "uasg"))

		if (!idItemPca || !uasg) {
			skipped++
			continue
		}

		items.push({
			idItemPca,
			uasg,
			nomeUnidade: parseText(at(cols, "nomeUnidade")),
			categoriaItem: parseText(at(cols, "categoriaItem")),
			identificadorContratacao: parseText(at(cols, "identificadorContratacao")),
			nomeContratacao: parseText(at(cols, "nomeContratacao")),
			catalogo: parseText(at(cols, "catalogo")),
			classificacaoCatalogo: parseText(at(cols, "classificacaoCatalogo")),
			codigoClasse: parseText(at(cols, "codigoClasse")),
			nomeClasse: parseText(at(cols, "nomeClasse")),
			codigoPdm: parseText(at(cols, "codigoPdm")),
			nomePdm: parseText(at(cols, "nomePdm")),
			codigoItem: parseText(at(cols, "codigoItem")),
			descricaoItem: parseText(at(cols, "descricaoItem")),
			unidadeFornecimento: parseText(at(cols, "unidadeFornecimento")),
			quantidadeEstimada: parseBrNumber(at(cols, "quantidadeEstimada")),
			valorUnitarioEstimado: parseBrNumber(at(cols, "valorUnitarioEstimado")),
			valorTotalEstimado: parseBrNumber(at(cols, "valorTotalEstimado")),
			valorOrcamentario: parseBrNumber(at(cols, "valorOrcamentario")),
			dataDesejada: parseBrDate(at(cols, "dataDesejada")),
		})
	}

	return { items, skipped }
}

/**
 * Classes CATMAT de gênero alimentício e de apoio direto ao rancho, medidas no PCA da FAB.
 * É filtro de leitura, não de ingestão: o acervo guarda o plano inteiro.
 */
export const PCA_FOOD_CLASS_CODES = [
	"8905", // CARNES, AVES E PEIXES
	"8910", // OVOS E LATICÍNIOS
	"8915", // FRUTAS, VERDURAS E LEGUMES
	"8920", // PRODUTOS DE PANIFICAÇÃO E CEREAIS
	"8940", // ALIMENTOS ESPECIAIS DIETÉTICOS E PREPARADOS ALIMENTÍCIOS
	"8960", // BEBIDAS NÃO ALCOÓLICAS
] as const

export function isFoodClass(codigoClasse: string | null): boolean {
	if (!codigoClasse) return false
	return (PCA_FOOD_CLASS_CODES as readonly string[]).includes(codigoClasse.trim())
}
