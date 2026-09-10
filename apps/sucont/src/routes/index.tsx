import { createFileRoute } from "@tanstack/react-router"
import { Activity, BookOpen, LayoutGrid, Lock, type LucideIcon, Send, ShieldCheck, X } from "lucide-react"
import { requireAnyDivision } from "#/auth/pbac"
import { HubLayout } from "#/components/hub-layout"
import { ToolCard } from "#/components/tool-card"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import { Combobox, type ComboboxOption } from "#/components/ui/combobox"
import { sucontTools } from "#/lib/data"
import { useHubFilters } from "#/lib/hub-filters"
import { toolsForDivision } from "#/lib/modules"
import { formatRac } from "#/lib/rac"
import { filterTools } from "#/lib/tool-filter"
import { ALL_STAGES, type StageFilter, TOOL_STAGES, type Tool, type ToolStage } from "#/lib/types"

export const Route = createFileRoute("/")({
	// Tela da seção: basta uma divisão qualquer.
	beforeLoad: requireAnyDivision,
	component: Catalogo,
})

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
 * São 27 hoje — só o Analista de Saldo Alongado responde 20 delas.
 * Como fileira de pílulas isso virava um paredão de 27 botões "Q07", "Q08"… que
 * ocupava mais tela que o catálogo que deveria filtrar, e ainda escondia o
 * seletor de etapa embaixo. Uma lista com busca resolve o mesmo em uma linha, e
 * o analista que persegue a Q34 digita "34" em vez de procurar o botão.
 */
/**
 * As questões da DIVISÃO, não do catálogo inteiro: oferecer as 32 questões de
 * todas as divisões dentro da SUCONT-1 daria 31 opções que só devolvem lista
 * vazia — o seletor prometeria um recorte que a divisão não tem.
 */
function racOptionsFor(tools: Tool[]): ComboboxOption[] {
	return [
		{ value: RAC_ANY, label: "Todas as questões" },
		...[...new Set(tools.flatMap((t) => t.racQuestions ?? []))].sort((a, b) => a - b).map((q) => ({ value: String(q), label: formatRac(q) })),
	]
}

/**
 * Rótulo de um módulo negado, para o aviso do redirecionamento.
 *
 * O guard manda os módulos crus na URL (`?denied=sucont-4`, ou `a+b` quando a
 * ferramenta serve a duas). Sem esta tradução o usuário leria o nome interno do
 * grant, que não é o nome de nada que ele conheça.
 */
const DENIED_LABELS: Record<string, string> = {
	"sucont-1": "SUCONT-1",
	"sucont-3": "SUCONT-3",
	"sucont-4": "SUCONT-4",
	"sucont-admin": "Administração de acessos",
}

function describeDenied(denied: string): string {
	const labels = denied
		.split("+")
		.map((m) => DENIED_LABELS[m])
		.filter(Boolean)
	if (labels.length === 0) return "essa parte do SUCONT"
	if (labels.length === 1) return labels[0]
	return `${labels.slice(0, -1).join(", ")} ou ${labels[labels.length - 1]}`
}

/**
 * Aviso do redirecionamento por falta de acesso.
 *
 * Existe para o guard não devolver o usuário em silêncio: sem ele, clicar num link
 * de uma divisão que não se tem apenas recarrega o catálogo, e a leitura natural é
 * que o app quebrou — não que falta um acesso. Mesmo papel do `?denied=` do `/hub`
 * do sisub.
 */
function DeniedNotice({ denied }: { denied: string }) {
	return (
		<Alert variant="warning" className="mb-6">
			<Lock />
			<AlertTitle>Acesso não concedido</AlertTitle>
			<AlertDescription>
				Essa tela é da {describeDenied(denied)}, e o seu acesso não a inclui. Peça a um administrador do SUCONT o acesso a essa divisão.
			</AlertDescription>
		</Alert>
	)
}

function Catalogo() {
	const { denied } = Route.useSearch()
	const { query, stage, rac, division, isFiltered, setStage, setRac, clear } = useHubFilters()
	// A divisão recorta ANTES dos filtros: o catálogo é o da divisão em que se está,
	// e a contagem "X de Y" precisa dizer X de quantas a divisão tem — não de 27.
	const divisionTools = toolsForDivision(sucontTools, division)
	const filtered = filterTools(divisionTools, { query, stage, rac })

	// `?rac=` aceita 1–99, e nem toda questão tem ferramenta. Sem esta opção
	// extra o seletor exibia "Todas as questões" enquanto a lista vinha vazia —
	// a tela afirmava não haver filtro e mostrava o resultado de um.
	const baseRacOptions = racOptionsFor(divisionTools)
	const racOptions =
		rac != null && !baseRacOptions.some((o) => o.value === String(rac)) ? [...baseRacOptions, { value: String(rac), label: formatRac(rac) }] : baseRacOptions

	// Sem filtro de etapa, o catálogo vem agrupado pelo ciclo: quem chega sem saber
	// o nome da ferramenta encontra pelo ponto do trabalho em que está.
	const groups = stage === ALL_STAGES ? TOOL_STAGES.map((s) => ({ ...s, tools: filtered.filter((t) => t.stage === s.id) })) : null

	return (
		<HubLayout title="Catálogo" description="As ferramentas da seção, agrupadas pelo ponto do trabalho em que você está." searchable>
			{denied && <DeniedNotice denied={denied} />}
			<div className="mb-10 flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3">
					{/* Etapa do ciclo. Mora aqui, e não na barra lateral, porque é filtro
					    desta tela — na lateral parecia navegação e disputava com ela. */}
					{/* `fieldset`, e não `nav`: estes botões filtram a lista abaixo, não levam
					    a outra tela. Anunciá-los como navegação repetiria, em landmark, a
					    confusão que motivou tirá-los da barra lateral. A legenda fica só
					    para o leitor de tela — na tela, os rótulos já se explicam. */}
					<fieldset className="flex flex-wrap items-center gap-1 rounded-xl bg-card p-1 border border-border">
						<legend className="sr-only">Etapa do ciclo de conformidade</legend>
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
									className={`gap-2 rounded-lg text-label ${isActive ? "bg-tech-blue text-white hover:bg-tech-blue hover:text-white" : "text-muted-foreground hover:text-foreground"}`}
								>
									<Icon className="w-3.5 h-3.5" />
									{tab.label}
								</Button>
							)
						})}
					</fieldset>

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
							{filtered.length} de {divisionTools.length}
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
