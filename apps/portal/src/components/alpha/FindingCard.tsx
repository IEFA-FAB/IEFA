import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import type { Finding, Severity } from "@/lib/alpha/compliance"

/**
 * Tonalidade de fundo por severidade.
 *
 * Sem faixa lateral colorida — proibida no monorepo — e sem raio, conforme o
 * contrato de estilo do portal. A distinção é etiqueta + fundo.
 */
export const SEVERITY_TINT: Record<Severity, string> = {
	BLOQUEANTE: "bg-destructive/10",
	GRAVE: "bg-destructive/5",
	MEDIA: "bg-muted",
	INFORMATIVA: "bg-transparent",
}

/**
 * Um achado, como o console e a Plataforma ACI o mostram.
 *
 * Uma implementação só: as duas telas exibem o mesmo dado (severidade,
 * categoria, seção, fundamento, evidência, sugestão) e o que muda é o que vem
 * embaixo — na plataforma, os controles de triagem. Daí o `footer`.
 */
export function FindingCard({ finding, footer }: { finding: Finding; footer?: ReactNode }) {
	return (
		<article className={`border border-border border-b-0 p-4 last:border-b ${SEVERITY_TINT[finding.severity]}`}>
			<div className="mb-2 flex flex-wrap items-center gap-2">
				<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
					{finding.severity}
				</Badge>
				<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
					{finding.category}
				</Badge>
				{finding.section_path ? <span className="font-mono text-muted-foreground text-xs">{finding.section_path}</span> : null}
				{finding.confidence !== null ? <span className="text-muted-foreground text-xs">confiança {finding.confidence.toFixed(2)}</span> : null}
			</div>

			<p className="text-sm">{finding.message}</p>

			{finding.legal_ref.length > 0 ? (
				<ul className="mt-2 space-y-0.5">
					{finding.legal_ref.map((ref) => (
						<li key={`${ref.norma}-${ref.dispositivo}`} className="font-mono text-[11px] text-muted-foreground">
							{ref.dispositivo} — {ref.norma}
						</li>
					))}
				</ul>
			) : null}

			{finding.evidence_span?.text ? <p className="mt-3 bg-background/60 p-2 text-muted-foreground text-xs italic">“{finding.evidence_span.text}”</p> : null}

			{finding.suggestion ? (
				<p className="mt-3 text-sm">
					<span className="text-muted-foreground text-xs uppercase tracking-[0.1em]">Sugestão · </span>
					{finding.suggestion}
				</p>
			) : null}

			{footer}
		</article>
	)
}
