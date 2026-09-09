import { formatRacQuestions } from "#/lib/rac"
import { TOOL_STAGES, type Tool, type ToolStage } from "#/lib/types"

export interface ToolNavGroup {
	id: ToolStage
	label: string
	tools: Tool[]
}

/**
 * Ferramentas de rota interna, agrupadas por etapa do ciclo.
 *
 * Só entra quem tem `internalPath`: item que aponta para fora (NotebookLM,
 * Sigadaer, Siafi Web) tira o usuário do app, e listá-lo na barra lateral ao lado
 * das telas do hub prometeria uma navegação que não existe.
 *
 * A ordem é a de `TOOL_STAGES` — a mesma do catálogo. Duas ordens diferentes para
 * a mesma lista fariam a barra e o catálogo parecerem coisas distintas.
 */
export function buildToolNav(tools: Tool[]): ToolNavGroup[] {
	return TOOL_STAGES.map((stage) => ({
		id: stage.id,
		label: stage.label,
		tools: tools.filter((t) => t.internalPath && t.stage === stage.id),
	})).filter((group) => group.tools.length > 0)
}

/**
 * Ferramenta cuja rota interna corresponde ao caminho atual.
 *
 * Casa o caminho exato ou um filho dele (`/auditor/relatorio` ainda é o Auditor),
 * nunca por prefixo solto: `startsWith` cru faria `/conta-generica-x` casar com
 * `/conta-generica`.
 */
export function findToolByPath(tools: Tool[], pathname: string): Tool | null {
	const path = normalize(pathname)
	let match: Tool | null = null
	for (const tool of tools) {
		if (!tool.internalPath) continue
		const target = normalize(tool.internalPath)
		if (path === target || path.startsWith(`${target}/`)) {
			// Entre duas rotas que casam, vence a mais específica.
			if (!match || target.length > normalize(match.internalPath as string).length) match = tool
		}
	}
	return match
}

export interface Crumb {
	label: string
	/** Ausente no último item: a página em que já se está não é link. */
	to?: string
	search?: Record<string, string>
}

/**
 * Trilha do cabeçalho: Catálogo › Etapa › Ferramenta.
 *
 * A etapa aponta para o catálogo já filtrado por ela — voltar um nível devolve o
 * usuário ao conjunto de onde a ferramenta saiu, que é o que "subir um nível"
 * deveria significar. É o mesmo papel do breadcrumb do sisub, com o escopo do
 * sucont no lugar de cozinha/unidade.
 */
export function buildToolCrumbs(tool: Tool | null): Crumb[] {
	if (!tool) return []
	const stage = TOOL_STAGES.find((s) => s.id === tool.stage)
	const crumbs: Crumb[] = [{ label: "Catálogo", to: "/" }]
	if (stage) crumbs.push({ label: stage.label, to: "/", search: { etapa: stage.id } })
	crumbs.push({ label: tool.title })
	return crumbs
}

/** Rótulo do escopo da ferramenta — as questões do RAC que ela responde. */
export function toolScopeLabel(tool: Tool | null): string | null {
	return tool ? formatRacQuestions(tool.racQuestions) : null
}

function normalize(path: string): string {
	return path.replace(/\/+$/, "") || "/"
}
