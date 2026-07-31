import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Download, Refresh, WarningTriangle } from "iconoir-react"
import { useState } from "react"
import { ConsoleNav } from "@/components/alpha/ConsoleNav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { type NormativeSource, sourceDocumentsQueryOptions, sourcesQueryOptions, useRefreshSource } from "@/lib/alpha/hooks"

export const Route = createFileRoute("/alpha/fontes")({
	component: FontesPage,
})

function formatDate(value: string | null) {
	if (!value) return "nunca"
	return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

function SourceRow({ source, token }: { source: NormativeSource; token: string | undefined }) {
	const [expanded, setExpanded] = useState(false)
	const refresh = useRefreshSource()
	const documents = useQuery({ ...sourceDocumentsQueryOptions(token, source.id), enabled: expanded })

	const result = refresh.data

	return (
		<div className="border border-border border-b-0 last:border-b">
			<div className="flex flex-wrap items-start justify-between gap-4 p-4">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<button type="button" onClick={() => setExpanded((value) => !value)} className="text-left font-medium text-sm hover:underline">
							{source.id}
						</button>
						<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
							{source.authority}
						</Badge>
						<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
							{source.kind}
						</Badge>
						{!source.enabled ? <span className="text-muted-foreground text-xs">desabilitada</span> : null}
						{!source.has_adapter ? <span className="text-muted-foreground text-xs">sem adapter</span> : null}
					</div>
					<p className="mt-1 truncate text-muted-foreground text-xs">{source.base_url}</p>
					<p className="mt-1 text-muted-foreground text-xs">última verificação: {formatDate(source.last_checked_at)}</p>
				</div>

				<div className="flex shrink-0 gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={!source.has_adapter || refresh.isPending}
						onClick={() => refresh.mutate(source.id)}
						title="Coleta sem gravar — mostra o que aconteceria"
					>
						<Refresh className="size-4" />
						{refresh.isPending ? "coletando…" : "coletar (simulação)"}
					</Button>
				</div>
			</div>

			{source.last_error ? (
				<div className="border-border border-t bg-destructive/5 px-4 py-3">
					<p className="flex items-start gap-2 text-xs">
						<WarningTriangle className="mt-0.5 size-3.5 shrink-0" />
						<span className="font-mono">{source.last_error}</span>
					</p>
				</div>
			) : null}

			{result ? (
				<div className="border-border border-t bg-muted/40 px-4 py-3 text-xs">
					<p>
						{result.discovered} item(ns) descoberto(s) · {result.items.filter((item) => item.outcome === "created").length} novo(s) ·{" "}
						{result.items.filter((item) => item.outcome === "superseded").length} atualizado(s) ·{" "}
						{result.items.filter((item) => item.outcome === "unchanged").length} sem mudança · {result.items.filter((item) => item.outcome === "failed").length}{" "}
						com erro
					</p>
					<p className="mt-1 text-muted-foreground">Simulação — nada foi gravado.</p>
				</div>
			) : null}

			{refresh.isError ? <div className="border-border border-t bg-destructive/5 px-4 py-3 text-xs">{(refresh.error as Error).message}</div> : null}

			{expanded ? (
				<div className="border-border border-t px-4 py-3">
					{documents.isLoading ? <p className="text-muted-foreground text-xs">carregando documentos…</p> : null}
					{documents.isError ? <p className="text-xs">{(documents.error as Error).message}</p> : null}
					{documents.data?.length === 0 ? <p className="text-muted-foreground text-xs">nenhum documento ingerido ainda</p> : null}

					<ul className="divide-y divide-border">
						{documents.data?.map((document) => (
							<li key={document.id} className="flex items-center justify-between gap-4 py-2">
								<Link to="/alpha/modelos/$id" params={{ id: document.id }} className="min-w-0 text-sm hover:underline">
									<span className="block truncate">{document.title}</span>
									<span className="text-muted-foreground text-xs">
										{document.version_label ?? "sem versão"}
										{document.effective_from ? ` · vigente desde ${document.effective_from}` : ""}
										{document.source ? ` · ${document.source}` : ""}
									</span>
								</Link>
								<Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-[0.1em]">
									{document.document_type}
								</Badge>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	)
}

function FontesPage() {
	const { session } = useAuth()
	const token = session?.access_token
	const sources = useQuery(sourcesQueryOptions(token))

	return (
		<div>
			<ConsoleNav
				title="Fontes normativas"
				subtitle="Modelos da AGU e legislação federal ingeridos pelo α. Cada coleta compara o conteúdo publicado com a versão vigente; versão nova nunca sobrescreve a anterior."
			/>

			{sources.isLoading ? <p className="text-muted-foreground text-sm">carregando fontes…</p> : null}

			{sources.isError ? (
				<div className="border border-border p-6">
					<p className="flex items-center gap-2 font-medium text-sm">
						<WarningTriangle className="size-4" />
						Não foi possível falar com o α
					</p>
					<p className="mt-2 text-muted-foreground text-sm">{(sources.error as Error).message}</p>
				</div>
			) : null}

			{sources.data?.length === 0 ? (
				<div className="border border-border p-8 text-center">
					<Download className="mx-auto size-6 text-muted-foreground" />
					<p className="mt-3 font-medium text-sm">Nenhuma fonte registrada</p>
					<p className="mt-1 text-muted-foreground text-sm">A migration do schema `alpha` popula o registry inicial.</p>
				</div>
			) : null}

			{sources.data ? (
				<div>
					{sources.data.map((source) => (
						<SourceRow key={source.id} source={source} token={token} />
					))}
				</div>
			) : null}
		</div>
	)
}
