/**
 * Condição de uma unidade de equipamento: operacional, degradada, parada ou baixada.
 *
 * Função PURA — nenhum acesso a banco, para poder ser testada por exemplo e por mutação.
 *
 * A condição NÃO é uma coluna. Ela é derivada de `equipment_unit.status` (o fato
 * administrativo, que só a Gestão Cozinha altera) e das panes ABERTAS relatadas por quem opera.
 * Uma coluna `condition` ao lado de `status` seria uma segunda fonte de verdade para o mesmo
 * fato: o gestor marcaria "em manutenção" e a praça continuaria vendo "ok", ou o inverso. A
 * divergência não seria um bug a corrigir — seria o estado normal do sistema.
 *
 * A precedência é deliberada e não é a ordem "natural" de gravidade:
 *
 *   retired > down > degraded > operational
 *
 * `retired` vem primeiro porque a baixa é uma decisão sobre o equipamento inteiro: um forno
 * baixado com pane aberta não é um forno quebrado, é um forno que não está mais na cozinha, e
 * mostrá-lo como "parado" sugeriria que consertá-lo o traria de volta ao planejamento.
 *
 * `down` cobre DOIS caminhos que chegam ao mesmo lugar: a pane inoperante relatada pela praça e
 * o `status = 'maintenance'` marcado pela gestão. Ter os dois convergindo aqui é o ponto — é o
 * que impede que o parque tenha dois vocabulários para "não dá para usar".
 */

import type { EquipmentIssueSeverity, EquipmentIssueStatus, EquipmentUnitStatus } from "../schemas/equipment.ts"

/**
 * Situações em que a pane ainda pesa: relatada e não encerrada.
 *
 * `dismissed` está FORA de propósito — é a saída da gestão quando o relato não procede, e
 * descartar tem de devolver a unidade ao planejamento no mesmo instante. `resolved` também sai:
 * o conserto acabou. Nos dois casos a linha permanece no histórico; o que muda é o peso.
 */
export const OPEN_ISSUE_STATUSES = ["open", "in_repair"] as const satisfies readonly EquipmentIssueStatus[]

export const EQUIPMENT_CONDITIONS = ["operational", "degraded", "down", "retired"] as const
export type EquipmentCondition = (typeof EQUIPMENT_CONDITIONS)[number]

/** O mínimo que a condição precisa saber de uma pane. */
export interface ConditionIssue {
	severity: EquipmentIssueSeverity
	status: EquipmentIssueStatus
	/** Soft delete da pane. Ausente ou `null` = a linha vale. */
	deletedAt?: Date | string | null
}

/**
 * A pane ainda pesa na condição da unidade?
 *
 * Pane APAGADA não pesa. O contrato aqui é "passe o histórico inteiro, sem filtrar" — e o
 * histórico inteiro inclui as linhas com `deleted_at`. Sem esta guarda, um relato de
 * `inoperative` retratado por soft delete prenderia a unidade em `down` para sempre, e ela
 * sumiria do planejamento sem aparecer em nenhuma lista de panes (todas filtram
 * `deleted_at is null`) — um forno fora da conta sem nada na tela que explique por quê.
 */
export function isIssueOpen(issue: ConditionIssue): boolean {
	if (issue.deletedAt != null) return false
	return issue.status === "open" || issue.status === "in_repair"
}

/**
 * Condição efetiva da unidade.
 *
 * `issues` pode conter panes já encerradas OU apagadas (soft delete) — as duas são ignoradas
 * aqui, para que o chamador possa passar o histórico inteiro sem filtrar antes e sem arriscar
 * dois filtros divergentes.
 */
export function deriveEquipmentCondition(status: EquipmentUnitStatus, issues: readonly ConditionIssue[] = []): EquipmentCondition {
	if (status === "decommissioned") return "retired"

	const open = issues.filter(isIssueOpen)
	if (open.some((i) => i.severity === "inoperative")) return "down"
	if (status === "maintenance") return "down"
	if (open.length > 0) return "degraded"
	return "operational"
}

/**
 * A unidade entra no cálculo de atendimento das preparações?
 *
 * Derivada da condição, e NÃO de um segundo predicado sobre `status` e panes — é o que garante
 * que o que a tela mostra como "parado" seja exatamente o que o planejamento deixa de contar.
 * Sem isso, a próxima severidade ou o próximo status entraria em um dos dois lugares e o parque
 * exibido diria uma coisa enquanto o cardápio calcularia outra.
 *
 * `degraded` CONTA: "dá para usar com limitação" continua sendo dá para usar. Só a pane
 * inoperante — e a decisão administrativa de manutenção/baixa — tira a unidade da conta.
 */
export function unitCountsForFitness(condition: EquipmentCondition): boolean {
	return condition === "operational" || condition === "degraded"
}

/**
 * Atalho para o filtro do parque: a unidade está fora do cálculo?
 *
 * Existe para que a query de `loadKitchenUnits` e a tela usem a mesma frase.
 */
export function isUnitUnavailable(status: EquipmentUnitStatus, issues: readonly ConditionIssue[] = []): boolean {
	return !unitCountsForFitness(deriveEquipmentCondition(status, issues))
}
