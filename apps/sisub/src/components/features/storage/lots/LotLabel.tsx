import { useMemo } from "react"
import { encodeCode39 } from "@/lib/code39"

/**
 * Etiqueta interna de lote — impressa no navegador, em rolo térmico (58 ou
 * 80 mm) ou em folha A4.
 *
 * É a peça que faz a leitura valer para o estoque inteiro: embalagem de varejo
 * tem só EAN-13 (sem lote), hortifrúti não tem código nenhum, e sem etiqueta a
 * leitura na saída e na contagem nunca identifica O LOTE — cai sempre no FEFO
 * por item. Também é exigência sanitária para produto fracionado ou
 * descongelado (RDC ANVISA 216/2004, item 4.8.6): designação, data de
 * manipulação e validade na embalagem.
 *
 * O código de barras é desenhado como SVG (Code 39, sem dependência, em
 * `@/lib/code39`): a etiqueta precisa sair numa impressora de cozinha sem
 * instalar fonte nem driver. O leitor lê `*CODE*`, e `interpretBarcode`
 * reconhece o padrão `LOT` + 8 como etiqueta interna.
 */

export interface LotLabelData {
	shortCode: string
	description: string
	lotCode: string | null
	expiryDate: string | null
	location: string | null
	receivedAt?: string | null
	derivation?: "opened" | "portioned" | "thawed" | null
	quantity?: number | null
	measureUnit?: string | null
}

const DERIVATION_LABEL: Record<string, string> = {
	opened: "ABERTO",
	portioned: "FRACIONADO",
	thawed: "DESCONGELADO",
}

function Barcode39({ value, height = 44 }: { value: string; height?: number }) {
	const bars = useMemo(() => encodeCode39(value), [value])
	if (!bars) return null
	return (
		<svg viewBox={`0 0 ${bars.total} ${height}`} height={height} width="100%" role="img" aria-label={`Código de barras ${value}`} preserveAspectRatio="none">
			{bars.rects.map((rect) => (
				// oxlint-disable-next-line shadcn/no-raw-colors -- código de barras impresso: preto em qualquer tema, senão o leitor não lê
				<rect key={`${rect.x}-${rect.width}`} x={rect.x} y={0} width={rect.width} height={height} fill="black" />
			))}
		</svg>
	)
}

export function LotLabel({ lot }: { lot: LotLabelData }) {
	return (
		<div className="lot-label break-inside-avoid border border-black bg-white p-2 font-mono text-3xs leading-tight text-black">
			<div className="truncate text-2xs font-bold uppercase">{lot.description}</div>
			{lot.derivation && <div className="text-3xs font-bold">{DERIVATION_LABEL[lot.derivation]}</div>}
			<Barcode39 value={lot.shortCode} />
			<div className="text-center text-2xs font-bold tracking-wider">{lot.shortCode}</div>
			<dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-1">
				{lot.lotCode && (
					<>
						<dt>Lote</dt>
						<dd className="truncate">{lot.lotCode}</dd>
					</>
				)}
				<dt>Validade</dt>
				<dd className="font-bold">{lot.expiryDate ?? "—"}</dd>
				{lot.quantity != null && (
					<>
						<dt>Qtd</dt>
						<dd>
							{lot.quantity} {lot.measureUnit ?? ""}
						</dd>
					</>
				)}
				{lot.location && (
					<>
						<dt>Local</dt>
						<dd className="truncate">{lot.location}</dd>
					</>
				)}
				{lot.derivation && (
					<>
						<dt>Manipulado</dt>
						<dd>{new Date().toLocaleDateString("pt-BR")}</dd>
					</>
				)}
				{lot.receivedAt && (
					<>
						<dt>Entrada</dt>
						<dd>{new Date(lot.receivedAt).toLocaleDateString("pt-BR")}</dd>
					</>
				)}
			</dl>
		</div>
	)
}

/**
 * Folha de etiquetas + botão de imprimir. A largura da etiqueta acompanha o
 * rolo escolhido; em A4 saem várias por página.
 */
export function LotLabelSheet({ lots, width }: { lots: readonly LotLabelData[]; width: "58mm" | "80mm" | "a4" }) {
	const style = width === "a4" ? { width: "48mm" } : { width }
	return (
		// `data-print-region`: a impressão sai SÓ com as etiquetas. Sem isso,
		// `window.print()` manda a tela inteira para a térmica de 58 mm.
		<div data-print-region className={width === "a4" ? "grid grid-cols-2 gap-2 print:grid-cols-4" : "space-y-2"}>
			{lots.map((lot) => (
				<div key={lot.shortCode} style={style}>
					<LotLabel lot={lot} />
				</div>
			))}
		</div>
	)
}
