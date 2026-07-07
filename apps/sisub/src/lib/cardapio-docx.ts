import {
	AlignmentType,
	BorderStyle,
	Document,
	type IBorderOptions,
	Packer,
	Paragraph,
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
	/** Uma linha por tipo de refeição; `cells` alinhado às colunas. */
	rows: { meal: string; cells: { name: string; proportion: number | null }[][] }[]
	preparations: { name: string; method: string }[]
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
						children: [new Paragraph({ children: [new TextRun({ text: row.meal.toUpperCase(), bold: true, size: 16 })] })],
					}),
					...row.cells.map((entries, colIdx) =>
						bodyCell(
							entries.map(
								(e) =>
									new Paragraph({
										children: [
											new TextRun({ text: e.name.toUpperCase(), size: 16 }),
											...(e.proportion != null ? [new TextRun({ text: ` ${e.proportion}%`, bold: true, size: 16 })] : []),
										],
									})
							),
							{ shaded: colIdx >= 5 }
						)
					),
				],
			})
	)

	return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...bodyRows] })
}

function buildPreparations(data: CardapioDocxData): Paragraph[] {
	if (data.preparations.length === 0) return []
	return [
		new Paragraph({
			spacing: { before: 240 },
			alignment: AlignmentType.CENTER,
			children: [new TextRun({ text: "LISTA DE PREPARAÇÕES", bold: true, size: 18 })],
		}),
		...data.preparations.map(
			(p) =>
				new Paragraph({
					spacing: { after: 40 },
					children: [new TextRun({ text: `${p.name.toUpperCase()} — `, bold: true, size: 16 }), new TextRun({ text: p.method, size: 16 })],
				})
		),
	]
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

function buildSignatures(data: CardapioDocxData): Table {
	const s = data.signatures
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
					...buildPreparations(data),
					new Paragraph({ spacing: { after: 160 }, children: [] }),
					buildSignatures(data),
				],
			},
		],
	})
}

/** Monta o documento e dispara o download no navegador. */
export async function downloadCardapioDocx(data: CardapioDocxData, filename: string): Promise<void> {
	const doc = buildCardapioDocument(data)
	const blob = await Packer.toBlob(doc)
	const safe = filename.replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim() || "cardapio-semanal"
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = `${safe}.docx`
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	URL.revokeObjectURL(url)
}
