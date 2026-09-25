import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/useAuth"
import { chunkQueryOptions } from "@/lib/alpha/chat"
import { type Citation, chunkLabel, chunkText } from "@/lib/alpha/chat-model"

const KIND_LABEL: Record<Citation["kind"], string> = { norma: "norma", achado: "achado", documento: "documento" }

/**
 * As fontes de uma resposta. Cada uma abre no lugar: norma é lida do α ao abrir (o mesmo
 * `/chunks/:id` do ChatRADA), achado e trecho do documento já vêm na própria citação.
 */
export function CitationList({ citations, open, onToggle }: { citations: readonly Citation[]; open: string | null; onToggle: (label: string) => void }) {
	if (citations.length === 0) return null
	return (
		<div className="mt-3 border-border border-t pt-2">
			<p className="text-label mb-1 text-muted-foreground">Fontes</p>
			<ul>
				{citations.map((citation) => (
					<li key={citation.label} className="border-border border-b last:border-b-0">
						<button
							type="button"
							onClick={() => onToggle(citation.label)}
							className="flex w-full items-baseline gap-2 py-1.5 text-left text-xs"
							aria-expanded={open === citation.label}
						>
							<span className="font-mono text-[10px]">{citation.label}</span>
							<span className="text-muted-foreground uppercase tracking-(--tracking-label) text-[10px]">{KIND_LABEL[citation.kind]}</span>
							<span className="truncate">{summary(citation)}</span>
						</button>
						{open === citation.label ? <CitationDetail citation={citation} /> : null}
					</li>
				))}
			</ul>
		</div>
	)
}

function summary(citation: Citation): string {
	if (citation.kind === "norma") return citation.source ?? "trecho do corpus normativo"
	if (citation.kind === "achado") return `${citation.severity} · ${citation.message}`
	return `${citation.document}${citation.path ? ` · seção ${citation.path}${citation.section_title ? ` ${citation.section_title}` : ""}` : ""}`
}

function CitationDetail({ citation }: { citation: Citation }) {
	if (citation.kind === "norma") return <NormaDetail chunkId={citation.ref} />
	if (citation.kind === "achado") {
		return (
			<div className="mb-2 bg-muted/60 p-2 text-xs">
				<Badge variant="outline" className="mb-1 text-[10px] uppercase tracking-[0.1em]">
					{citation.severity}
				</Badge>
				<p>{citation.message}</p>
			</div>
		)
	}
	if (citation.quote === undefined) return <p className="mb-2 bg-muted/60 p-2 text-muted-foreground text-xs">Referência à seção, sem transcrição literal.</p>
	return (
		<div className="mb-2 bg-muted/60 p-2 text-xs">
			{citation.located === false ? (
				<p className="mb-1 font-medium text-destructive">Trecho não localizado no documento — confira antes de confiar nesta citação.</p>
			) : (
				<p className="mb-1 text-muted-foreground">Trecho localizado no documento.</p>
			)}
			<p className="font-serif italic">“{citation.quote}”</p>
		</div>
	)
}

function NormaDetail({ chunkId }: { chunkId: string }) {
	const { session } = useAuth()
	const chunk = useQuery(chunkQueryOptions(session?.access_token, chunkId))

	if (chunk.isLoading) return <p className="mb-2 p-2 text-muted-foreground text-xs">carregando o trecho…</p>
	if (chunk.isError || !chunk.data) return <p className="mb-2 p-2 text-xs">Não foi possível carregar o trecho.</p>
	return (
		<div className="mb-2 bg-muted/60 p-2 text-xs">
			<p className="mb-1 font-medium">{chunkLabel(chunk.data)}</p>
			<p className="max-h-64 overflow-y-auto whitespace-pre-wrap font-serif leading-relaxed">{chunkText(chunk.data)}</p>
		</div>
	)
}
