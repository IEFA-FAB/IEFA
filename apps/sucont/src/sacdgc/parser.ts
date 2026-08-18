/**
 * @module sacdgc/parser
 * Leitura das planilhas do DGC e recorte da base por Unidade Gestora.
 *
 * Três coisas aqui existem porque a versão anterior errava nelas e o erro chegava
 * intacto ao modelo:
 *
 *  1. **Encoding.** O Tesouro Gerencial exporta em windows-1252. Lido como UTF-8,
 *     "Diárias" vira "Di�rias" e "Mês" vira "M�s" — o modelo então não
 *     casa o texto com os fatores de custo do Módulo 19 e passa a inventar rótulo.
 *     `decodeSpreadsheet` decide o encoding pelos bytes, não pela extensão.
 *  2. **Índice da coluna de UG.** Era fixo (0 nos painéis 1-3, 3 no painel 4). Uma
 *     coluna a mais no export desloca tudo e a base inteira vai para a UG errada,
 *     em silêncio. Aqui o índice vem do cabeçalho.
 *  3. **Truncagem.** Cortar o recorte no limite de caracteres sem dizer nada faz o
 *     modelo concluir "ausência de custos" sobre dados que existem. `UgDataset`
 *     carrega a marca de corte e o prompt a declara.
 */

import { type DgcBase, PANEL_IDS, type PanelId, type PanelRows, type UgDataset } from "#/sacdgc/types"
import { DIREF_UG_CODE, identifyGroup, isDirefUg, ugDisplayName } from "#/sacdgc/ugs"

/** Teto de caracteres do recorte de UMA UG enviado ao modelo. */
export const MAX_UG_CHARS = 120_000
/** Teto por UG vizinha no contexto de grupo. */
const MAX_PEER_CHARS = 1_500
/** Teto do bloco inteiro de contexto de grupo. */
export const MAX_GROUP_CONTEXT_CHARS = 12_000

// ── Encoding ─────────────────────────────────────────────────

const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true })
const UTF8_LOOSE = new TextDecoder("utf-8")
const LATIN1 = new TextDecoder("windows-1252")

/**
 * Decodifica bytes de planilha texto. UTF-8 estrito primeiro; qualquer byte
 * inválido significa export do Tesouro Gerencial, que é windows-1252.
 */
export function decodeSpreadsheet(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
	// BOM UTF-8: decisão já tomada pelo arquivo.
	if (view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) return UTF8_LOOSE.decode(view).replace(/^﻿/, "")
	try {
		return UTF8_STRICT.decode(view)
	} catch {
		return LATIN1.decode(view)
	}
}

// ── CSV ──────────────────────────────────────────────────────

/** Separador do arquivo: o candidato mais frequente FORA de aspas na primeira linha. */
export function detectSeparator(text: string): string {
	const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
	let inQuotes = false
	const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 }
	for (const char of firstLine) {
		if (char === '"') inQuotes = !inQuotes
		else if (!inQuotes && char in counts) counts[char] += 1
	}
	let best = ";"
	for (const candidate of Object.keys(counts)) {
		if (counts[candidate] > counts[best]) best = candidate
	}
	return counts[best] === 0 ? ";" : best
}

/**
 * Tokeniza o CSV inteiro (não linha a linha): campo entre aspas pode conter o
 * separador e a própria quebra de linha, e o export traz razão social com vírgula.
 */
export function parseDelimited(text: string, separator = detectSeparator(text)): string[][] {
	const rows: string[][] = []
	let row: string[] = []
	let field = ""
	let inQuotes = false

	const endField = () => {
		row.push(field.trim())
		field = ""
	}
	const endRow = () => {
		endField()
		if (row.some((cell) => cell !== "")) rows.push(row)
		row = []
	}

	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"'
					i++
				} else inQuotes = false
			} else field += char
			continue
		}
		if (char === '"') inQuotes = true
		else if (char === separator) endField()
		else if (char === "\n") endRow()
		else if (char !== "\r") field += char
	}
	if (field !== "" || row.length > 0) endRow()
	return rows
}

// ── Reconhecimento dos painéis ───────────────────────────────

const PANEL_CELL = /^painel\s*([1-4])\b/i

/** Painel declarado numa linha de cabeçalho ("Painel 3  - UG Beneficiada"), se houver. */
export function panelFromHeaderRow(cells: string[]): PanelId | null {
	for (const cell of cells) {
		const match = cell.match(PANEL_CELL)
		if (match) return Number(match[1]) as PanelId
	}
	return null
}

/** Painel deduzido do nome do arquivo — usado quando o export vem sem o prefixo nas colunas. */
export function panelFromFileName(name: string): PanelId | null {
	const match = name.match(/painel[\s_-]*([1-4])/i)
	return match ? (Number(match[1]) as PanelId) : null
}

/**
 * Índice da coluna que identifica a UG dona da linha.
 * Painéis 1-3: "UG Beneficiada" / "UG Beneficiada ACC". Painel 4: "UG Beneficiada
 * Código" — que NÃO é a primeira coluna (a primeira é a UG emitente, quem pagou).
 * Atribuir pelo emitente jogaria o custo do GAP inteiro numa UG só.
 */
export function ugColumnIndex(header: string[]): number {
	const beneficiada = header.findIndex((cell) => /ug\s+beneficiada/i.test(cell) && !/nome/i.test(cell))
	if (beneficiada >= 0) return beneficiada
	const anyUg = header.findIndex((cell) => /\bug\b/i.test(cell) && !/nome/i.test(cell))
	return anyUg >= 0 ? anyUg : 0
}

function columnIndex(header: string[], pattern: RegExp): number {
	return header.findIndex((cell) => pattern.test(cell))
}

const UG_CODE = /^(\d{6})$/

// ── Base ─────────────────────────────────────────────────────

export interface PanelSource {
	/** Nome do arquivo — só serve para deduzir o painel quando o cabeçalho não o declara. */
	name: string
	text: string
}

interface PanelBucket {
	header: string[]
	rows: Map<string, string[]>
}

/**
 * Os painéis 1-3 trazem mês e ano em colunas separadas ("JULHO" + "2026"); o painel
 * 4 traz "JUL/2026" numa só. Sem normalizar a abreviação, a mesma competência
 * apareceria duas vezes na tela ("JUL/2026, JULHO/2026").
 */
const MONTH_NAMES: Record<string, string> = {
	JAN: "JANEIRO",
	FEV: "FEVEREIRO",
	MAR: "MARÇO",
	ABR: "ABRIL",
	MAI: "MAIO",
	JUN: "JUNHO",
	JUL: "JULHO",
	AGO: "AGOSTO",
	SET: "SETEMBRO",
	OUT: "OUTUBRO",
	NOV: "NOVEMBRO",
	DEZ: "DEZEMBRO",
}

export function formatCompetence(month: string, year: string): string {
	const raw = month.trim().toUpperCase()
	if (!raw) return ""

	const [monthPart, yearPart] = raw.includes("/") ? raw.split("/", 2) : [raw, year.trim()]
	const name = MONTH_NAMES[monthPart.trim()] ?? monthPart.trim()
	return yearPart?.trim() ? `${name}/${yearPart.trim()}` : name
}

/**
 * Lê as planilhas enviadas e devolve um recorte por UG.
 *
 * Aceita os quatro painéis em arquivos separados (o export normal) ou empilhados
 * num arquivo só — o painel corrente vem do cabeçalho encontrado, não da ordem.
 */
export function parseDgcBase(sources: PanelSource[]): DgcBase {
	const buckets = new Map<PanelId, PanelBucket>()
	const competences = new Set<string>()
	let skippedRows = 0

	for (const source of sources) {
		const rows = parseDelimited(source.text)
		if (rows.length === 0) continue

		let panel = panelFromFileName(source.name)
		let ugCol = 0
		let monthCol = -1
		let yearCol = -1
		let hasHeader = false

		for (const cells of rows) {
			const declared = panelFromHeaderRow(cells)
			if (declared !== null) {
				panel = declared
				ugCol = ugColumnIndex(cells)
				monthCol = columnIndex(cells, /m[eê]s/i)
				yearCol = columnIndex(cells, /ano/i)
				hasHeader = true
				const bucket = buckets.get(panel)
				if (bucket) bucket.header = cells
				else buckets.set(panel, { header: cells, rows: new Map() })
				continue
			}

			if (panel === null) {
				skippedRows += 1
				continue
			}
			// Arquivo sem cabeçalho reconhecível (só o nome identificou o painel): o
			// índice da UG passa a ser a primeira coluna com um código de 6 dígitos.
			if (!hasHeader) {
				const guess = cells.findIndex((cell) => UG_CODE.test(cell))
				ugCol = guess >= 0 ? guess : 0
			}

			const raw = cells[ugCol] ?? ""
			const code = raw.match(/^(\d{6})/)?.[1]
			if (!code) {
				skippedRows += 1
				continue
			}

			const bucket = buckets.get(panel) ?? { header: [], rows: new Map() }
			if (!buckets.has(panel)) buckets.set(panel, bucket)

			const key = isDirefUg(code) ? DIREF_UG_CODE : code
			const list = bucket.rows.get(key)
			const line = cells.join(";")
			if (list) list.push(line)
			else bucket.rows.set(key, [line])

			if (monthCol >= 0) {
				const competence = formatCompetence(cells[monthCol] ?? "", yearCol >= 0 ? (cells[yearCol] ?? "") : "")
				if (competence) competences.add(competence)
			}
		}
	}

	const panelsFound = PANEL_IDS.filter((id) => buckets.has(id))
	const ugCodes = new Set<string>()
	for (const bucket of buckets.values()) {
		for (const code of bucket.rows.keys()) ugCodes.add(code)
	}

	const datasets = [...ugCodes]
		.sort((a, b) => a.localeCompare(b))
		.map((ugCode) => {
			const rows = { 1: [], 2: [], 3: [], 4: [] } as PanelRows
			for (const id of PANEL_IDS) rows[id] = buckets.get(id)?.rows.get(ugCode) ?? []
			return buildDataset(ugCode, rows, (id) => buckets.get(id)?.header ?? [])
		})

	return {
		competence: [...competences].sort().join(", "),
		filenames: [...new Set(sources.map((source) => source.name))],
		datasets,
		panelsFound,
		skippedRows,
	}
}

/** Monta o texto consolidado de uma UG, respeitando `MAX_UG_CHARS`. */
export function buildDataset(ugCode: string, rows: PanelRows, headerOf: (panel: PanelId) => string[]): UgDataset {
	const blocks: string[] = []
	const rowCount = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<PanelId, number>

	for (const id of PANEL_IDS) {
		const lines = rows[id]
		rowCount[id] = lines.length
		if (lines.length === 0) continue
		const header = headerOf(id)
		blocks.push([header.length > 0 ? header.join(";") : `Painel ${id}`, ...lines].join("\n"))
	}

	const full = blocks.join("\n\n")
	const truncated = full.length > MAX_UG_CHARS
	const consolidated = truncated ? `${full.slice(0, MAX_UG_CHARS)}\n[CORTE: o recorte desta UG excedeu ${MAX_UG_CHARS} caracteres]` : full

	return {
		ugCode,
		ugName: ugDisplayName(ugCode),
		group: identifyGroup(ugCode),
		rowCount,
		consolidated,
		truncated,
	}
}

/**
 * Contexto comparativo: as demais UGs do mesmo grupo, em ordem de código e com
 * teto por UG e no total. Ordem determinística porque o mesmo recorte tem de
 * produzir o mesmo prompt — senão duas análises da mesma UG divergem sem motivo.
 */
export function buildGroupContext(target: UgDataset, all: UgDataset[]): string {
	const peers = all.filter((d) => d.group === target.group && d.ugCode !== target.ugCode).sort((a, b) => a.ugCode.localeCompare(b.ugCode))

	const parts: string[] = []
	let used = 0
	for (const peer of peers) {
		const block = `[DADOS DA UG: ${peer.ugName}]\n${peer.consolidated.slice(0, MAX_PEER_CHARS)}`
		if (used + block.length > MAX_GROUP_CONTEXT_CHARS) break
		parts.push(block)
		used += block.length + 9
	}
	return parts.join("\n\n=====\n\n")
}
