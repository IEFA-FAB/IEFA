import { useState } from "react"

/** Brasão do IEFA; se o arquivo faltar, cai no símbolo do app. */
const CREST_SRC = "/dom/IEFA.png"
const CREST_FALLBACK = "/favicon.svg"

/**
 * Brasão do IEFA, usado na tela de espera do telão e na entrada do controle.
 * `alt=""` quando o texto ao lado já nomeia a instituição (decorativo).
 */
export function Crest({ className, alt = "Brasão do IEFA" }: { className?: string; alt?: string }) {
	const [src, setSrc] = useState(CREST_SRC)
	return <img src={src} alt={alt} className={className} onError={() => setSrc((current) => (current === CREST_SRC ? CREST_FALLBACK : current))} />
}
