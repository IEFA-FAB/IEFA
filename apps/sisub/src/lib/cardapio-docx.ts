import {
	AlignmentType,
	BorderStyle,
	Document,
	type IBorderOptions,
	Packer,
	Paragraph,
	ShadingType,
	Table,
	TableCell,
	TableRow,
	TextRun,
	VerticalAlign,
	WidthType,
} from "docx"

/**
 * Geração do Cardápio Semanal em .docx (Word), espelhando o layout imprimível
 * de {@link WeeklyMenuPrint}: cabeçalho (OM/seção/título/semana), grade
 * refeição × dia da semana, lista de preparações e blocos de assinatura.
 *
 * O componente pré-computa os dados (mesma ordenação/grupos do print) e passa
 * aqui já materializados — este módulo é puro quanto ao domínio, só monta o doc.
 */

export type CardapioDocxSignature = { name: string; role: string }

export type CardapioDocxData = {
	organization: string
	section: string
	title: string
	weekLabel: string
	signatures: CardapioDocxSignature[]
	/** 7 colunas, Segunda→Domingo; `date` já formatada (dd/MM) ou null. */
	columns: { label: string; date: string | null }[]
	/**
	 * Uma linha por tipo de refeição; `cells` e `bases` alinhados às colunas. `demand` é o efetivo
	 * fixo do item já formatado ("120 pax" — porcentagem não sai); `bases`, o efetivo da refeição
	 * no dia. `color` é a tinta do grupo (hex sem `#`), `null` com as cores desligadas.
	 */
	rows: {
		meal: string
		cells: { name: string; main?: boolean; demand: string | null; color?: string | null }[][]
		bases?: (number | null)[]
	}[]
	/** Legenda das cores por grupo; vazia com as cores desligadas. */
	groupLegend?: { label: string; color: string }[]
	/**
	 * `version` já descrita ("v3" ou "v3 — desatualizada (atual: v5)"). `ingredients` (nomes, sem
	 * quantidade) e `allergens` (linha já descrita) só vêm quando a opção de impressão pede.
	 */
	preparations: {
		name: string
		version?: string | null
		prePreparation: string | null
		method: string | null
		ingredients?: string[] | null
		allergens?: string | null
	}[]
}

const BLACK = "000000"
const thin: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: BLACK }
const cellBorders = { top: thin, bottom: thin, left: thin, right: thin }
const noBorder: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }

function line(text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
	return new Paragraph({
		alignment: opts.align ?? AlignmentType.CENTER,
		children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 18 })],
	})
}

function headerCell(text: string, width?: number) {
	return new TableCell({
		borders: cellBorders,
		shading: { fill: "EEEEEE" },
		verticalAlign: VerticalAlign.CENTER,
		width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
		children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 16 })] })],
	})
}

function bodyCell(children: Paragraph[], opts: { shaded?: boolean; header?: boolean } = {}) {
	return new TableCell({
		borders: cellBorders,
		shading: opts.shaded ? { fill: "F4F4F4" } : undefined,
		verticalAlign: opts.header ? VerticalAlign.CENTER : VerticalAlign.TOP,
		children: children.length > 0 ? children : [new Paragraph("")],
	})
}

function buildGrid(data: CardapioDocxData): Table {
	const head = new TableRow({
		tableHeader: true,
		children: [
			headerCell("REFEIÇÃO / DIA", 12),
			...data.columns.map(
				(c) =>
					new TableCell({
						borders: cellBorders,
						shading: { fill: "EEEEEE" },
						verticalAlign: VerticalAlign.CENTER,
						children: [
							new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c.label.toUpperCase(), bold: true, size: 16 })] }),
							...(c.date ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c.date, size: 16 })] })] : []),
						],
					})
			),
		],
	})

	const bodyRows = data.rows.map(
		(row) =>
			new TableRow({
				children: [
					new TableCell({
						borders: cellBorders,
						shading: { fill: "F4F4F4" },
						verticalAlign: VerticalAlign.CENTER,
						children: [new Paragraph({ children: [new TextRun({ text: row.meal, bold: true, size: 16 })] })],
					}),
					...row.cells.map((entries, colIdx) =>
						bodyCell(
							[
								...(row.bases?.[colIdx] != null && entries.length > 0
									? [new Paragraph({ children: [new TextRun({ text: `${row.bases[colIdx]} pessoas`, italics: true, size: 14 })] })]
									: []),
								...entries.map(
									(e) =>
										new Paragraph({
											shading: e.color ? { type: ShadingType.CLEAR, fill: e.color, color: "auto" } : undefined,
											children: [
												// Prato principal em negrito; os demais, peso normal. Nome como está no banco.
												new TextRun({ text: e.name, bold: e.main === true, size: 16 }),
												...(e.demand ? [new TextRun({ text: ` ${e.demand}`, bold: true, size: 16 })] : []),
											],
										})
								),
							],
							{ shaded: colIdx >= 5 }
						)
					),
				],
			})
	)

	return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...bodyRows] })
}

/** Legenda das cores: amostra sombreada + rótulo do grupo, numa linha só. */
function buildLegend(data: CardapioDocxData): Paragraph[] {
	const legend = data.groupLegend ?? []
	if (legend.length === 0) return []
	return [
		new Paragraph({
			spacing: { before: 80 },
			children: legend.flatMap((g, i) => [
				...(i > 0 ? [new TextRun({ text: "   ", size: 16 })] : []),
				new TextRun({ text: "\u2003\u2003", size: 16, shading: { type: ShadingType.CLEAR, fill: g.color, color: "auto" } }),
				new TextRun({ text: ` ${g.label}`, size: 16 }),
			]),
		}),
	]
}

function buildPreparations(preparations: CardapioDocxData["preparations"]): Paragraph[] {
	if (preparations.length === 0) return []
	return [
		new Paragraph({
			spacing: { before: 240 },
			alignment: AlignmentType.CENTER,
			children: [new TextRun({ text: "LISTA DE PREPARAÇÕES", bold: true, size: 18 })],
		}),
		...preparations.flatMap((p) => [
			new Paragraph({
				spacing: { after: p.ingredients || p.allergens ? 0 : 40 },
				children: [
					new TextRun({ text: `${p.name}${p.version ? ` (${p.version})` : ""}${p.prePreparation || p.method ? " — " : ""}`, bold: true, size: 16 }),
					// Pré-preparo rotulado: sem o rótulo, dessalgue e cocção viram um texto só
					// e a cozinha executa a ordem errada.
					...(p.prePreparation ? [new TextRun({ text: `Pré-preparo: ${p.prePreparation}${p.method ? " " : ""}`, italics: true, size: 16 })] : []),
					...(p.method ? [new TextRun({ text: p.method, size: 16 })] : []),
				],
			}),
			...(p.ingredients ? [detailLine("Ingredientes", p.ingredients.join(", "), !p.allergens)] : []),
			...(p.allergens ? [detailLine("Alergênicos", p.allergens, true)] : []),
		]),
	]
}

/** Linha complementar da preparação (ingredientes, alergênicos): rótulo em itálico. */
function detailLine(label: string, text: string, last: boolean): Paragraph {
	return new Paragraph({
		spacing: { after: last ? 40 : 0 },
		children: [new TextRun({ text: `${label}: `, italics: true, size: 16 }), new TextRun({ text, size: 16 })],
	})
}

function signatureCell(sig: CardapioDocxSignature | undefined): TableCell {
	return new TableCell({
		borders: noBorders,
		width: { size: 50, type: WidthType.PERCENTAGE },
		children: [
			new Paragraph({
				spacing: { before: 360 },
				alignment: AlignmentType.CENTER,
				children: [new TextRun({ text: "_______________________________", size: 16 })],
			}),
			new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sig?.name || "", bold: true, size: 16 })] }),
			new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sig?.role || "", size: 16 })] }),
		],
	})
}

function buildSignatures(s: CardapioDocxSignature[]): Table {
	const pairs: [CardapioDocxSignature | undefined, CardapioDocxSignature | undefined][] = [
		[s[0], s[1]],
		[s[2], s[3]],
	]
	return new Table({
		width: { size: 100, type: WidthType.PERCENTAGE },
		borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
		rows: pairs.map((pair) => new TableRow({ children: [signatureCell(pair[0]), signatureCell(pair[1])] })),
	})
}

export function buildCardapioDocument(data: CardapioDocxData): Document {
	return new Document({
		sections: [
			{
				properties: { page: { size: { orientation: "landscape" }, margin: { top: 400, bottom: 400, left: 400, right: 400 } } },
				children: [
					line(data.organization.toUpperCase(), { bold: true, size: 22 }),
					line(data.section, { size: 18 }),
					line(data.title, { bold: true, size: 24 }),
					...(data.weekLabel ? [line(data.weekLabel, { bold: true, size: 16 })] : []),
					new Paragraph({ spacing: { after: 160 }, children: [] }),
					buildGrid(data),
					...buildLegend(data),
					...buildPreparations(data.preparations),
					new Paragraph({ spacing: { after: 160 }, children: [] }),
					buildSignatures(data.signatures),
				],
			},
		],
	})
}

/** Monta o documento e dispara o download no navegador. */
export async function downloadCardapioDocx(data: CardapioDocxData, filename: string): Promise<void> {
	await downloadDocument(buildCardapioDocument(data), filename, "cardapio-semanal")
}

// ─── Evento / cardápio de apoio ────────────────────────────────────────────

/**
 * Evento ou apoio em .docx, espelhando {@link OccasionMenuPrint}: cabeçalho, um bloco por
 * refeição (nome, horário e efetivo; grupos em linhas), assinaturas e lista de preparações. Em
 * retrato: sem a grade de sete dias, a folha não precisa da largura.
 */
export type OccasionDocxData = {
	organization: string
	section: string
	title: string
	/** Nome do cardápio (e classificação do padrão de lanche). */
	subtitle: string
	/** Data por extenso, ou vazia. */
	dateLabel: string
	signatures: CardapioDocxSignature[]
	/** `label: null` no grupo = kit simples, lista sem coluna de grupo. */
	meals: {
		name: string
		slotName: string | null
		base: string | null
		groups: { label: string | null; entries: { name: string; main: boolean; demand: string | null }[] }[]
	}[]
	preparations: CardapioDocxData["preparations"]
}

function entryParagraph(e: { name: string; main: boolean; demand: string | null }) {
	return new Paragraph({
		children: [new TextRun({ text: e.name, bold: e.main, size: 18 }), ...(e.demand ? [new TextRun({ text: ` ${e.demand}`, bold: true, size: 18 })] : [])],
	})
}

function buildOccasionMeal(meal: OccasionDocxData["meals"][number]): (Table | Paragraph)[] {
	const heading = [meal.name, meal.slotName ? `(${meal.slotName})` : null, meal.base ? `· ${meal.base}` : null].filter(Boolean).join(" ")
	const head = new TableRow({
		tableHeader: true,
		children: [
			new TableCell({
				borders: cellBorders,
				columnSpan: 2,
				shading: { fill: "EEEEEE" },
				// Nome da refeição como está no banco, igual à folha impressa.
				children: [new Paragraph({ children: [new TextRun({ text: heading, bold: true, size: 18 })] })],
			}),
		],
	})
	const rows =
		meal.groups.length === 0
			? [new TableRow({ children: [new TableCell({ borders: cellBorders, columnSpan: 2, children: [line("Sem preparações", { size: 18 })] })] })]
			: meal.groups.map((g) =>
					g.label == null
						? new TableRow({ children: [new TableCell({ borders: cellBorders, columnSpan: 2, children: g.entries.map(entryParagraph) })] })
						: new TableRow({
								children: [
									new TableCell({
										borders: cellBorders,
										width: { size: 25, type: WidthType.PERCENTAGE },
										shading: { fill: "F4F4F4" },
										verticalAlign: VerticalAlign.CENTER,
										children: [new Paragraph({ children: [new TextRun({ text: g.label, bold: true, size: 18 })] })],
									}),
									bodyCell(g.entries.map(entryParagraph)),
								],
							})
				)
	// Larguras em twips (A4 retrato menos as margens): sem elas o Word/LibreOffice divide meio a meio.
	return [
		new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [2600, 8100], rows: [head, ...rows] }),
		new Paragraph({ spacing: { after: 120 }, children: [] }),
	]
}

export function buildOccasionDocument(data: OccasionDocxData): Document {
	const [s0, s1, s2, s3] = data.signatures
	return new Document({
		sections: [
			{
				properties: { page: { margin: { top: 500, bottom: 500, left: 600, right: 600 } } },
				children: [
					line(data.organization.toUpperCase(), { bold: true, size: 22 }),
					line(data.section, { size: 18 }),
					line(data.title, { bold: true, size: 24 }),
					...(data.subtitle ? [line(data.subtitle, { bold: true, size: 18 })] : []),
					...(data.dateLabel ? [line(data.dateLabel, { size: 18 })] : []),
					new Paragraph({ spacing: { after: 160 }, children: [] }),
					...(data.meals.length === 0 ? [line("Nenhuma refeição cadastrada.", { size: 18 })] : data.meals.flatMap(buildOccasionMeal)),
					new Paragraph({ spacing: { after: 160 }, children: [] }),
					buildSignatures([s0, s1, s2, s3].filter((sig): sig is CardapioDocxSignature => sig != null)),
					...buildPreparations(data.preparations),
				],
			},
		],
	})
}

export async function downloadOccasionDocx(data: OccasionDocxData, filename: string): Promise<void> {
	await downloadDocument(buildOccasionDocument(data), filename, "cardapio")
}

async function downloadDocument(doc: Document, filename: string, fallback: string): Promise<void> {
	const blob = await Packer.toBlob(doc)
	const safe = filename.replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim() || fallback
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = `${safe}.docx`
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	URL.revokeObjectURL(url)
}
