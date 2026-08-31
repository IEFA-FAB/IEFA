import { ALL_STAGES, type StageFilter } from "#/lib/hub-filters"
import { TOOL_STAGES, type Tool } from "#/lib/types"

const STAGE_LABEL = new Map(TOOL_STAGES.map((s) => [s.id, s.label.toLowerCase()]))

/**
 * Filtro do catálogo. Os três eixos combinam por E: etapa do ciclo, questão do
 * RAC e busca textual.
 *
 * Etapa casa por IGUALDADE — o casamento frouxo da categoria antiga (`includes`
 * nos dois sentidos) fazia um nome contido em outro casar sozinho, sem ninguém
 * ter pedido.
 *
 * A questão do RAC filtra apenas quem declara cobri-la. Ferramenta sem
 * `racQuestions` não é "cobre todas": é "não se organiza por questão", e some do
 * recorte — senão o filtro por Q34 devolveria o catálogo inteiro e não
 * responderia nada.
 */
export function filterTools(tools: Tool[], { query, stage, rac }: { query: string; stage: StageFilter; rac?: number | null }): Tool[] {
	const term = query.trim().toLowerCase()
	return tools
		.filter((tool) => stage === ALL_STAGES || tool.stage === stage)
		.filter((tool) => rac == null || (tool.racQuestions?.includes(rac) ?? false))
		.filter((tool) => {
			if (term === "") return true
			const stageLabel = STAGE_LABEL.get(tool.stage) ?? ""
			// "q34" e "34" acham a ferramenta da questão: é assim que o analista a chama.
			const racText = tool.racQuestions?.flatMap((q) => [`q${q}`, String(q)]).join(" ") ?? ""
			return tool.title.toLowerCase().includes(term) || tool.description.toLowerCase().includes(term) || stageLabel.includes(term) || racText.includes(term)
		})
}
