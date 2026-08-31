import { createFileRoute } from "@tanstack/react-router"
import { X } from "lucide-react"
import { HubLayout } from "#/components/hub-layout"
import { ToolCard } from "#/components/tool-card"
import { Button } from "#/components/ui/button"
import { sucontTools } from "#/lib/data"
import { ALL_STAGES, useHubFilters } from "#/lib/hub-filters"
import { filterTools } from "#/lib/tool-filter"
import { TOOL_STAGES } from "#/lib/types"

export const Route = createFileRoute("/")({ component: Catalogo })

/** Questões do RAC que alguma ferramenta declara cobrir, em ordem. */
const RAC_QUESTIONS = [...new Set(sucontTools.flatMap((t) => t.racQuestions ?? []))].sort((a, b) => a - b)

function Catalogo() {
	const { query, stage, rac, isFiltered, setRac, clear } = useHubFilters()
	const filtered = filterTools(sucontTools, { query, stage, rac })

	// Sem filtro de etapa, o catálogo vem agrupado pelo ciclo: quem chega sem saber
	// o nome da ferramenta encontra pelo ponto do trabalho em que está.
	const groups = stage === ALL_STAGES ? TOOL_STAGES.map((s) => ({ ...s, tools: filtered.filter((t) => t.stage === s.id) })) : null

	return (
		<HubLayout searchable>
			<div className="mb-8 flex flex-wrap items-center gap-3">
				{/*
				 * Filtro por questão do RAC. É o escopo do trabalho — o analista persegue
				 * a Q34, não uma "ferramenta de auditoria". Só aparecem as questões que
				 * alguma ferramenta declara cobrir: oferecer as 42 daria 38 becos sem saída.
				 */}
				<span className="text-label text-muted-foreground">Questão do RAC</span>
				{RAC_QUESTIONS.map((q) => (
					<Button
						key={q}
						variant={rac === q ? "default" : "outline"}
						size="sm"
						onClick={() => setRac(rac === q ? null : q)}
						aria-pressed={rac === q}
						className="text-label rounded-full"
					>
						Q{q}
					</Button>
				))}

				<div className="ml-auto flex items-center gap-3">
					{isFiltered && (
						<Button variant="outline" size="sm" onClick={clear} className="text-label rounded-full text-muted-foreground hover:text-foreground">
							Limpar <X className="w-3 h-3" />
						</Button>
					)}
					<span className="text-hint font-mono text-muted-foreground">
						{filtered.length} de {sucontTools.length}
					</span>
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="flex flex-col items-center gap-4 py-16">
					<p className="text-body text-muted-foreground">Nenhuma ferramenta corresponde a esse recorte.</p>
					<Button variant="outline" onClick={clear} className="text-label">
						Limpar filtros
					</Button>
				</div>
			) : groups ? (
				<div className="space-y-12">
					{groups
						.filter((g) => g.tools.length > 0)
						.map((group) => (
							<section key={group.id} aria-labelledby={`etapa-${group.id}`}>
								<div className="mb-4">
									<h2 id={`etapa-${group.id}`} className="text-heading text-foreground">
										{group.label}
									</h2>
									<p className="text-caption text-muted-foreground">{group.description}</p>
								</div>
								<div className="grid grid-cols-1 gap-8 md:grid-cols-2">
									{group.tools.map((tool, i) => (
										<ToolCard key={tool.id} tool={tool} index={i} />
									))}
								</div>
							</section>
						))}
				</div>
			) : (
				<div className="grid grid-cols-1 gap-8 md:grid-cols-2">
					{filtered.map((tool, i) => (
						<ToolCard key={tool.id} tool={tool} index={i} />
					))}
				</div>
			)}
		</HubLayout>
	)
}
