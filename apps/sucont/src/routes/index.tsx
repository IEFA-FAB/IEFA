import { createFileRoute } from "@tanstack/react-router"
import { Activity, BookOpen, LayoutGrid, type LucideIcon, Send, ShieldCheck, X } from "lucide-react"
import { HubLayout } from "#/components/hub-layout"
import { ToolCard } from "#/components/tool-card"
import { Button } from "#/components/ui/button"
import { Combobox, type ComboboxOption } from "#/components/ui/combobox"
import { sucontTools } from "#/lib/data"
import { ALL_STAGES, type StageFilter, useHubFilters } from "#/lib/hub-filters"
import { formatRac } from "#/lib/rac"
import { filterTools } from "#/lib/tool-filter"
import { TOOL_STAGES, type ToolStage } from "#/lib/types"

export const Route = createFileRoute("/")({ component: Catalogo })

const STAGE_ICON: Record<ToolStage, LucideIcon> = {
	analisar: ShieldCheck,
	comunicar: Send,
	acompanhar: Activity,
	consultar: BookOpen,
}

// Declarado depois de `STAGE_ICON` de propósito: este `.map` roda na avaliação do
// módulo, e ler uma `const` declarada abaixo lança `ReferenceError` antes de
// qualquer render — o typecheck não acusa.
const STAGE_TABS: Array<{ id: StageFilter; label: string; icon: LucideIcon }> = [
	{ id: ALL_STAGES, label: "Tudo", icon: LayoutGrid },
	...TOOL_STAGES.map((stage) => ({ id: stage.id as StageFilter, label: stage.label, icon: STAGE_ICON[stage.id] })),
]

/** Sentinela do seletor de questão: nenhum recorte por questão do RAC. */
const RAC_ANY = "todas"

/**
 * Questões do RAC que alguma ferramenta declara cobrir, em ordem.
 *
 * São 27 hoje — só o Analista de Saldo Alongado responde 21 delas (Q05–Q25).
 * Como fileira de pílulas isso virava um paredão de 27 botões "Q05", "Q06"… que
 * ocupava mais tela que o catálogo que deveria filtrar, e ainda escondia o
 * seletor de etapa embaixo. Uma lista com busca resolve o mesmo em uma linha, e
 * o analista que persegue a Q34 digita "34" em vez de procurar o botão.
 */
const RAC_OPTIONS: ComboboxOption[] = [
	{ value: RAC_ANY, label: "Todas as questões" },
	...[...new Set(sucontTools.flatMap((t) => t.racQuestions ?? []))].sort((a, b) => a - b).map((q) => ({ value: String(q), label: formatRac(q) })),
]

function Catalogo() {
	const { query, stage, rac, isFiltered, setStage, setRac, clear } = useHubFilters()
	const filtered = filterTools(sucontTools, { query, stage, rac })

	// `?rac=` aceita 1–99, e nem toda questão tem ferramenta. Sem esta opção
	// extra o seletor exibia "Todas as questões" enquanto a lista vinha vazia —
	// a tela afirmava não haver filtro e mostrava o resultado de um.
	const racOptions =
		rac != null && !RAC_OPTIONS.some((o) => o.value === String(rac)) ? [...RAC_OPTIONS, { value: String(rac), label: formatRac(rac) }] : RAC_OPTIONS

	// Sem filtro de etapa, o catálogo vem agrupado pelo ciclo: quem chega sem saber
	// o nome da ferramenta encontra pelo ponto do trabalho em que está.
	const groups = stage === ALL_STAGES ? TOOL_STAGES.map((s) => ({ ...s, tools: filtered.filter((t) => t.stage === s.id) })) : null

	return (
		<HubLayout title="Catálogo" description="As ferramentas da seção, agrupadas pelo ponto do trabalho em que você está." searchable>
			<div className="mb-10 flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3">
					{/* Etapa do ciclo. Mora aqui, e não na barra lateral, porque é filtro
					    desta tela — na lateral parecia navegação e disputava com ela. */}
					{/* `group`, e não `nav`: estes botões filtram a lista abaixo, não levam a
					    outra tela. Anunciá-los como navegação repetiria, em landmark, a
					    confusão que motivou tirá-los da barra lateral. */}
					<div
						role="group"
						aria-label="Etapa do ciclo de conformidade"
						className="flex flex-wrap items-center gap-1 rounded-xl bg-card p-1 border border-border"
					>
						{STAGE_TABS.map((tab) => {
							const Icon = tab.icon
							const isActive = stage === tab.id
							return (
								<Button
									key={tab.id}
									type="button"
									onClick={() => setStage(tab.id)}
									aria-pressed={isActive}
									variant="ghost"
									size="sm"
									className={`gap-2 rounded-lg text-label font-bold ${
										isActive ? "bg-tech-blue text-white hover:bg-tech-blue hover:text-white" : "text-muted-foreground hover:text-foreground"
									}`}
								>
									<Icon className="w-3.5 h-3.5" />
									{tab.label}
								</Button>
							)
						})}
					</div>

					<div className="flex items-center gap-2">
						<span className="text-label text-muted-foreground">Questão do RAC</span>
						<Combobox
							value={rac == null ? RAC_ANY : String(rac)}
							onValueChange={(next) => setRac(next === RAC_ANY ? null : Number(next))}
							items={racOptions}
							placeholder="Todas as questões"
							emptyLabel="Nenhuma questão com ferramenta"
							aria-label="Filtrar por questão do RAC"
							className="w-52"
						/>
					</div>

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
