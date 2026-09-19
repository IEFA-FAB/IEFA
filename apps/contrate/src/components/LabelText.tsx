import { Fragment } from "react"

/**
 * Texto de rótulo em caixa alta que preserva o "α" minúsculo.
 *
 * `text-transform: uppercase` troca o α pelo alfa MAIÚSCULO (Α), que é idêntico ao A latino:
 * "Projeto α" vira "PROJETO A" e o nome do projeto some. O α sai num `span` `normal-case`.
 */
export function LabelText({ text }: { text: string }) {
	const parts = text.split("α")
	return parts.map((part, i) => (
		<Fragment key={i}>
			{part}
			{i < parts.length - 1 && <span className="normal-case">α</span>}
		</Fragment>
	))
}
