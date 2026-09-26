import { describeSnapshotGaps, type ExecutionReviewStatus } from "@iefa/sisub-domain"
import { deriveStatusFromIssues, type FlowIssue, type FlowStep, formatShortDate, pluralize } from "./model"

/** Quantas pendências por etapa viram linha; o resto vira "e mais N". */
const MAX_LISTED = 8

/** "2026-09-26" → "26/09". */
function dayMonth(isoDate: string): string {
	const [, month, day] = isoDate.split("-")
	return `${day}/${month}`
}

function capped(issues: FlowIssue[], total: number, noun: [string, string]): FlowIssue[] {
	if (total <= MAX_LISTED) return issues
	return [...issues.slice(0, MAX_LISTED), { severity: "info", message: `E mais ${pluralize(total - MAX_LISTED, noun[0], noun[1])}.` }]
}

/**
 * Fluxo "Revisar a execução" da Gestão Cozinha: o que o turno resolveu no dia sem esperar o
 * planejamento, e o que ficou para a nutricionista corrigir. Nada aqui bloqueia o dia — por isso
 * nenhuma pendência é `blocking`. Pendência que só o Estoque ou a SDAB resolvem aparece dizendo
 * quem resolve, sem link.
 */
export function buildExecutionReviewSteps(status: ExecutionReviewStatus): FlowStep[] {
	const kitchen = `/kitchen/${status.kitchenId}`

	const addedIssues: FlowIssue[] = status.addedItems.length
		? [
				{
					severity: "warning",
					message: `${pluralize(status.addedItems.length, "preparação incluída pelo turno aguarda", "preparações incluídas pelo turno aguardam")} revisão. Confira na lista abaixo e marque como revisada.`,
				},
			]
		: []

	const provisionalIssues = capped(
		status.provisionalRecipes.map((recipe) => ({
			severity: "warning" as const,
			message: `"${recipe.name}" é provisória desde ${formatShortDate(recipe.since)}${recipe.uses > 1 ? `, já usada ${recipe.uses} vezes` : ""}: funciona no dia, mas não entra em cardápio-modelo nem na compra sem a ficha técnica.`,
			action: { label: "Completar ficha", href: `${kitchen}/recipes/${recipe.id}` },
		})),
		status.provisionalRecipes.length,
		["preparação provisória", "preparações provisórias"]
	)

	const incompleteIssues = capped(
		status.incompleteItems.map((item) => ({
			severity: "warning" as const,
			message: `${item.recipeName} (${dayMonth(item.serviceDate)}): ${describeSnapshotGaps(item.gaps) ?? ""}`,
		})),
		status.incompleteItems.length,
		["item com ficha incompleta", "itens com ficha incompleta"]
	)

	const stockIssues: FlowIssue[] = capped(
		status.unexplainedIssueDays.map((day) => ({
			severity: "info" as const,
			message: `A saída de estoque de ${dayMonth(day.issueDate)} fechou sozinha com desvio sem motivo. Quem justifica é o Estoque.`,
		})),
		status.unexplainedIssueDays.length,
		["dia sem justificativa", "dias sem justificativa"]
	)
	for (const frozen of status.provisionalFrozenPreparations) {
		stockIssues.push({
			severity: "info",
			message: `A sobra foi guardada em "${frozen.description}", congelada provisória criada em ${formatShortDate(frozen.since)}. Quem revisa é a SDAB (catálogo global).`,
		})
	}

	return [
		{
			id: "added",
			title: "Preparações incluídas pelo turno",
			objective: "O que entrou no dia fora do planejamento, com quem incluiu e por quê.",
			status: deriveStatusFromIssues(addedIssues),
			summary: status.addedItems.length ? undefined : "Nenhuma inclusão do turno esperando revisão",
			issues: addedIssues,
		},
		{
			id: "provisional",
			title: "Fichas provisórias",
			objective: "Preparação criada no turno só com o nome. A ficha completa é a próxima versão; salvar a edição resolve.",
			status: deriveStatusFromIssues(provisionalIssues),
			summary: status.provisionalRecipes.length ? undefined : "Nenhuma preparação provisória pendente",
			issues: provisionalIssues,
		},
		{
			id: "incomplete",
			title: "Fichas incompletas no calendário",
			objective: "Itens de até duas semanas atrás e da próxima semana cuja ficha gravada não dá a sugestão de saída.",
			status: deriveStatusFromIssues(incompleteIssues),
			summary: status.incompleteItems.length ? undefined : "Todas as fichas do período dão sugestão de saída",
			issues: incompleteIssues,
			action: status.incompleteItems.length ? { label: "Agendamento", href: `${kitchen}/planning` } : undefined,
		},
		{
			id: "others",
			title: "Pendências de outros módulos",
			objective: "O que a execução deixou e outro módulo resolve: justificativa de saída (Estoque) e congelada provisória (SDAB).",
			status: deriveStatusFromIssues(stockIssues),
			summary: stockIssues.length ? undefined : "Nada pendente em outros módulos",
			issues: stockIssues,
		},
	]
}
