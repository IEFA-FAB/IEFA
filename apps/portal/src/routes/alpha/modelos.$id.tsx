import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { NavArrowLeft, WarningTriangle } from "iconoir-react"
import { useMemo, useState } from "react"
import { ConsoleNav } from "@/components/alpha/ConsoleNav"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/useAuth"
import { documentStructureQueryOptions, type StructureNode } from "@/lib/alpha/hooks"

export const Route = createFileRoute("/alpha/modelos/$id")({
	component: ModeloPage,
})

const INDENT = ["pl-0", "pl-6", "pl-12", "pl-16", "pl-20"] as const

function NodeRow({ node, selected, onSelect }: { node: StructureNode; selected: boolean; onSelect: () => void }) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={`flex w-full items-baseline gap-3 border-border border-b px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${
				selected ? "bg-muted" : ""
			} ${INDENT[Math.min(node.level - 1, INDENT.length - 1)]}`}
		>
			<span className="shrink-0 font-mono text-muted-foreground text-xs">{node.path}</span>
			<span className="min-w-0 flex-1 truncate">{node.title}</span>
			{!node.is_required ? <span className="shrink-0 text-muted-foreground text-xs">opcional</span> : null}
			{node.explanatory_note.length > 0 ? <span className="shrink-0 text-muted-foreground text-xs">{node.explanatory_note.length} nota(s)</span> : null}
		</button>
	)
}

function ModeloPage() {
	const { id } = Route.useParams()
	const { session } = useAuth()
	const structure = useQuery(documentStructureQueryOptions(session?.access_token, id))
	const [selectedPath, setSelectedPath] = useState<string | null>(null)

	const selected = useMemo(() => structure.data?.nodes.find((node) => node.path === selectedPath) ?? null, [structure.data, selectedPath])

	const counts = useMemo(() => {
		const nodes = structure.data?.nodes ?? []
		return {
			nodes: nodes.length,
			optional: nodes.filter((node) => !node.is_required).length,
			notes: nodes.reduce((total, node) => total + node.explanatory_note.length, 0),
			placeholders: nodes.reduce((total, node) => total + node.placeholder.length, 0),
		}
	}, [structure.data])

	return (
		<div>
			<ConsoleNav
				title={structure.data?.document.title ?? "Modelo"}
				subtitle="Árvore de seções extraída do modelo oficial, com as notas explicativas e os dispositivos que elas citam."
			/>

			<Link to="/alpha/fontes" className="mb-6 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground">
				<NavArrowLeft className="size-4" />
				Fontes
			</Link>

			{structure.isLoading ? <p className="text-muted-foreground text-sm">carregando estrutura…</p> : null}

			{structure.isError ? (
				<div className="border border-border p-6">
					<p className="flex items-center gap-2 font-medium text-sm">
						<WarningTriangle className="size-4" />
						Não foi possível carregar a estrutura
					</p>
					<p className="mt-2 text-muted-foreground text-sm">{(structure.error as Error).message}</p>
				</div>
			) : null}

			{structure.data ? (
				<>
					<dl className="mb-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
						{[
							["seções", counts.nodes],
							["opcionais", counts.optional],
							["notas", counts.notes],
							["placeholders", counts.placeholders],
						].map(([label, value]) => (
							<div key={label as string} className="bg-background p-4">
								<dt className="text-muted-foreground text-xs uppercase tracking-[0.1em]">{label}</dt>
								<dd className="mt-1 font-semibold text-2xl tabular-nums">{value}</dd>
							</div>
						))}
					</dl>

					<div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
						<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
							{structure.data.document.document_type}
						</Badge>
						<span className="text-muted-foreground">versão {structure.data.document.version_label ?? "—"}</span>
						{structure.data.document.effective_from ? (
							<span className="text-muted-foreground">· vigente desde {structure.data.document.effective_from}</span>
						) : null}
						{structure.data.document.superseded_at ? <span className="text-muted-foreground">· substituída</span> : null}
					</div>

					{/* `min-w-0` no item de grid: sem isso o título longo de uma seção
					    expande a coluna e empurra o painel lateral para fora da tela. */}
					<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
						<div className="min-w-0 border border-border">
							{structure.data.nodes.map((node) => (
								<NodeRow key={node.id} node={node} selected={node.path === selectedPath} onSelect={() => setSelectedPath(node.path)} />
							))}
						</div>

						<aside className="border border-border p-4 lg:sticky lg:top-6 lg:h-fit">
							{!selected ? (
								<p className="text-muted-foreground text-sm">Selecione uma seção para ver notas, dispositivos citados e campos de preenchimento.</p>
							) : (
								<div className="space-y-5">
									<div>
										<p className="font-mono text-muted-foreground text-xs">{selected.path}</p>
										<h2 className="mt-1 font-medium text-sm">{selected.title}</h2>
										<p className="mt-1 text-muted-foreground text-xs">{selected.is_required ? "obrigatória no modelo" : "opcional no modelo"}</p>
									</div>

									{selected.explanatory_note.length > 0 ? (
										<div>
											<h3 className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.1em]">Notas explicativas</h3>
											<ul className="space-y-3">
												{selected.explanatory_note.map((note) => (
													<li key={note.id} className="bg-muted/50 p-3 text-xs leading-relaxed">
														{note.content}
														{note.cited_refs.length > 0 ? (
															<ul className="mt-2 space-y-1">
																{note.cited_refs.map((ref) => (
																	<li key={`${ref.norma}-${ref.dispositivo}`} className="font-mono text-[11px] text-muted-foreground">
																		{ref.dispositivo} — {ref.norma}
																	</li>
																))}
															</ul>
														) : null}
													</li>
												))}
											</ul>
										</div>
									) : null}

									{selected.placeholder.length > 0 ? (
										<div>
											<h3 className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.1em]">Campos de preenchimento</h3>
											<ul className="space-y-1">
												{selected.placeholder.map((placeholder) => (
													<li key={placeholder.id} className="font-mono text-xs">
														{placeholder.token}
													</li>
												))}
											</ul>
										</div>
									) : null}

									{selected.body ? (
										<div>
											<h3 className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.1em]">Texto do modelo</h3>
											<p className="whitespace-pre-wrap text-xs leading-relaxed">{selected.body}</p>
										</div>
									) : null}
								</div>
							)}
						</aside>
					</div>
				</>
			) : null}
		</div>
	)
}
