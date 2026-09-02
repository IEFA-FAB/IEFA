import type React from "react"
import type { AssembledDocument, Line } from "@/lib/comaer/types"

/**
 * A folha, com as medidas do art. 20 da NSCA 5-3/2026: margens 2 cm (superior, inferior e
 * direita) e 3 cm (esquerda), fonte Calibri/Carlito em 12 pt, texto justificado.
 *
 * Ela renderiza os MESMOS blocos que o serializador copia para o SIGADAER — a tela é uma
 * apresentação da estrutura, não uma segunda versão dela.
 */
export function A4Sheet({ doc }: { doc: AssembledDocument }) {
	return (
		<div
			data-sheet
			className="bg-white text-black w-[210mm] min-h-[297mm] border border-border shadow-none pt-[2cm] pr-[2cm] pb-[2cm] pl-[3cm] print:border-0 print:w-auto print:min-h-0 print:p-0"
			style={{ fontFamily: "Calibri, Carlito, Segoe UI, sans-serif", fontSize: "12pt", lineHeight: 1.35 }}
		>
			{doc.blocks.map((bloco) => (
				<section key={bloco.id} data-bloco={bloco.id} className={blockSpacing(bloco.id)} aria-label={bloco.label}>
					{bloco.lines.map((linha, i) => (
						<SheetLine key={`${bloco.id}-${i}`} linha={linha} />
					))}
				</section>
			))}
		</div>
	)
}

/** Espaço vertical entre blocos — o art. 20 mede em pontos; aqui em múltiplos de 0,21 cm. */
function blockSpacing(id: string): string {
	switch (id) {
		case "timbre":
			return "mb-[0.42cm]"
		case "epigrafe":
			return "mb-[0.84cm]"
		case "texto":
			return "mt-[0.42cm] mb-[1.41cm]"
		case "signatario":
			// Art. 40 § 3º: quarenta pontos (1,41 cm) abaixo do final do texto.
			return "mt-[1.41cm]"
		case "rodape-om":
			return "mt-[1.41cm] text-[10pt]"
		default:
			return "mb-[0.21cm]"
	}
}

/**
 * Art. 20, II, a c/c art. 39: o número do parágrafo fica NA margem esquerda e o texto
 * começa a 2,5 cm dela — recuo pendente, não recuo de primeira linha. Sem o `textIndent`
 * negativo, o "1." andaria junto com o texto e a coluna de números sumiria.
 */
function indent(linha: Line): React.CSSProperties | undefined {
	if (!linha.indentCm) return undefined
	return { paddingLeft: `${linha.indentCm}cm`, textIndent: linha.indentCm === 2.5 ? "-2.5cm" : undefined }
}

function SheetLine({ linha }: { linha: Line }) {
	const alignment =
		linha.alignment === "centro"
			? "text-center"
			: linha.alignment === "direita"
				? "text-right"
				: linha.alignment === "justificado"
					? "text-justify"
					: "text-left"
	const conteudo = linha.bold ? <strong>{linha.text}</strong> : linha.text

	// Numeração à esquerda e localidade/data à direita dividem a linha (art. 35, III).
	if (linha.rightOnSameLine) {
		return (
			<div className="flex items-baseline justify-between gap-4">
				<span>{conteudo}</span>
				<span>{linha.rightOnSameLine}</span>
			</div>
		)
	}

	return (
		<p className={alignment} style={indent(linha)}>
			{conteudo}
		</p>
	)
}
