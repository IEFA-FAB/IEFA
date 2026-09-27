import type { ExpenseExecutionStatus, ReceiptPendingCounts } from "@iefa/sisub-domain"
import { deriveStatusFromIssues, type FlowIssue, type FlowStep, pluralize } from "./model"

/**
 * Fluxo "Executar despesa" da Gestão Unidade (change `sisub-flexible-expense-execution`, D9):
 * da contratação de origem ao SIAFI. Nada trava a unidade por falta de documento de outro
 * papel; cada etapa mostra o que ficou para trás e leva à tela que resolve. O recebimento é
 * do Estoque: a pendência diz quem resolve e não tem link (quem abre a Gestão Unidade em geral
 * não abre o Estoque).
 */

const RECEIVING_PHRASES: Array<{ kind: keyof ReceiptPendingCounts; one: string; many: string; severity: FlowIssue["severity"] }> = [
	{
		kind: "nfe_cancelled",
		one: "entrega com NF-e cancelada depois da efetivação",
		many: "entregas com NF-e cancelada depois da efetivação",
		severity: "blocking",
	},
	{ kind: "conference_without_inspector", one: "conferência sem fiscal designado", many: "conferências sem fiscal designado", severity: "warning" },
	{
		kind: "provisional_without_manager",
		one: "provisório sem gestor ou comissão para o definitivo",
		many: "provisórios sem gestor ou comissão para o definitivo",
		severity: "warning",
	},
	{ kind: "without_invoice", one: "entrega sem NF-e", many: "entregas sem NF-e", severity: "warning" },
	{ kind: "without_empenho", one: "entrega sem empenho", many: "entregas sem empenho", severity: "warning" },
	{ kind: "without_supply_order", one: "entrega sem OF", many: "entregas sem OF", severity: "warning" },
	{ kind: "lines_without_cost", one: "entrega efetivada com linha sem custo", many: "entregas efetivadas com linha sem custo", severity: "warning" },
]

export function buildExpenseExecutionSteps(status: ExpenseExecutionStatus): FlowStep[] {
	const unit = `/unit/${status.unitId}`
	const year = status.today.slice(0, 4)

	// 1. Contratação de origem ─────────────────────────────────────────────────
	const originIssues: FlowIssue[] = []
	const acquisitionsAction = { label: "Abrir contratações de origem", href: `${unit}/acquisitions` }
	const orphan = status.empenhosWithoutOrigin
	if (orphan.count > 0) {
		const sample = orphan.sample
			.slice(0, 3)
			.map((e) => e.number)
			.join(", ")
		originIssues.push({
			severity: "warning",
			message: `${pluralize(orphan.count, "NE sem contratação de origem", "NEs sem contratação de origem")} (${sample}${orphan.count > 3 ? "…" : ""}): vincule a dispensa, a ARP ou o contrato que a sustenta.`,
			action: { label: "Vincular contratação de origem", href: `${unit}/acquisitions` },
		})
	}
	for (const acquisition of status.incomplete.sample.slice(0, 5)) {
		originIssues.push({ severity: "warning", message: `${acquisition.summary}: complete a contratação de origem.`, action: acquisitionsAction })
	}
	const moreIncomplete = status.incomplete.count - Math.min(5, status.incomplete.sample.length)
	if (moreIncomplete > 0)
		originIssues.push({
			severity: "warning",
			message: `E mais ${pluralize(moreIncomplete, "contratação de origem incompleta", "contratações de origem incompletas")}.`,
		})
	if (status.dispensasWithoutValue) {
		originIssues.push({
			severity: "warning",
			message: `${pluralize(status.dispensasWithoutValue, "dispensa sem valor", "dispensas sem valor")}: o somatório do exercício (Lei 14.133/2021, art. 75, § 1º) fica incompleto, e o total mostrado é um piso.`,
			action: acquisitionsAction,
		})
	}
	if (status.dispensasOverLimitWithoutJustification) {
		originIssues.push({
			severity: "warning",
			message: `${pluralize(status.dispensasOverLimitWithoutJustification, "dispensa acima do limite sem justificativa", "dispensas acima do limite sem justificativa")} (Lei 14.133/2021, art. 75, § 1º): registre a justificativa na contratação.`,
			action: acquisitionsAction,
		})
	}
	if (status.dispensaLimitMissing) {
		originIssues.push({
			severity: "info",
			message: `Sem limite de dispensa cadastrado para ${year}: o cálculo usa o último conhecido. Cadastre o limite vigente.`,
		})
	}

	// 2. Designação ────────────────────────────────────────────────────────────
	const designationIssues: FlowIssue[] = []
	const designationAction = { label: "Abrir designações", href: `${unit}/designations` }
	if (status.designations.provisional === 0) {
		designationIssues.push({
			severity: "warning",
			message: "Nenhum fiscal designado: a entrega é conferida, mas o provisório não se confirma (Lei 14.133/2021, art. 140, II, a).",
			action: designationAction,
		})
	}
	if (status.designations.definitive === 0) {
		designationIssues.push({
			severity: "warning",
			message: "Nenhum gestor ou comissão designada: o recebimento definitivo não se efetiva (Lei 14.133/2021, art. 140, II, b).",
			action: designationAction,
		})
	}

	// 3. Ordens de fornecimento ────────────────────────────────────────────────
	const orderIssues: FlowIssue[] = status.supplyOrdersWithoutEmpenho.map((order) => ({
		severity: "blocking",
		message: `${order.number ? `OF ${order.number}` : "OF sem número"} (${order.kitchenName}) enviada sem empenho: registre ou vincule a NE (Lei 4.320/1964, art. 60). O almoxarifado vincula na própria OF.`,
		action: { label: "Registrar NE", href: `${unit}/empenhos` },
	}))

	// 4. Recebimento (Estoque) ─────────────────────────────────────────────────
	const receivingIssues: FlowIssue[] = []
	for (const kitchen of status.kitchens) {
		const parts = RECEIVING_PHRASES.filter((phrase) => kitchen.counts[phrase.kind] > 0)
		if (parts.length === 0) continue
		const worst = parts.some((p) => p.severity === "blocking") ? "blocking" : "warning"
		receivingIssues.push({
			severity: worst,
			message: `${kitchen.name}: ${parts.map((p) => pluralize(kitchen.counts[p.kind], p.one, p.many)).join(", ")}. Quem vincula é o almoxarifado, no recebimento (Estoque → A caminho).`,
		})
	}
	const receivingTotal = status.kitchens.reduce((sum, kitchen) => sum + RECEIVING_PHRASES.reduce((inner, phrase) => inner + kitchen.counts[phrase.kind], 0), 0)

	// 5. Liquidação ────────────────────────────────────────────────────────────
	const liquidacaoIssues: FlowIssue[] = []
	if (status.unliquidated.count > 0) {
		liquidacaoIssues.push({
			severity: "warning",
			message: `${pluralize(status.unliquidated.count, "recebimento atestado sem liquidação", "recebimentos atestados sem liquidação")}${status.unliquidated.oldestDays != null ? ` (o mais antigo há ${pluralize(status.unliquidated.oldestDays, "dia", "dias")})` : ""}.`,
			action: { label: "Liquidar", href: `${unit}/liquidacoes` },
		})
	}
	if (status.unliquidated.divergent > 0) {
		liquidacaoIssues.push({
			severity: "warning",
			message: `${pluralize(status.unliquidated.divergent, "recebimento com valor liquidado diferente do recebido", "recebimentos com valor liquidado diferente do recebido")}.`,
			action: { label: "Conciliar", href: `${unit}/reconciliation` },
		})
	}
	const deferred = status.kitchens.reduce((sum, kitchen) => sum + kitchen.counts.invoice_check_pending, 0)
	if (deferred > 0) {
		liquidacaoIssues.push({
			severity: "info",
			message: `${pluralize(deferred, "recebimento efetivado", "recebimentos efetivados")} com a SEFAZ fora do ar: a liquidação exige a consulta recente da NF-e, que o almoxarifado registra.`,
		})
	}

	// 6. SIAFI ────────────────────────────────────────────────────────────────
	const siafiIssues: FlowIssue[] = status.siafiWaiting.map((group) => {
		const parent = group.reportType === "ns" ? "NE" : "NS"
		const which = group.parents.length > 0 ? ` ${group.parents.slice(0, 3).join(", ")}${group.parents.length > 3 ? "…" : ""}` : ""
		return {
			severity: "warning",
			message: `${pluralize(group.count, `${group.reportType.toUpperCase()} aguardando a ${parent}`, `${group.reportType.toUpperCase()}s aguardando a ${parent}`)}${which}: importe ou registre a ${parent}, e ela se religa sozinha.`,
			action: { label: "Abrir SIAFI", href: `${unit}/siafi` },
		}
	})

	return [
		{
			id: "origin",
			title: "Contratação de origem",
			objective: "Cada NE aponta a contratação de origem que a sustenta — ARP, contrato, dispensa, inexigibilidade.",
			status: deriveStatusFromIssues(originIssues),
			summary: orphan.count === 0 ? "Todas as NEs com contratação de origem" : undefined,
			issues: originIssues,
			action: { label: "Contratações de origem", href: `${unit}/acquisitions` },
		},
		{
			id: "designations",
			title: "Designação de fiscal e gestor",
			objective: "Quem recebe provisória e definitivamente está designado, com o ato registrado.",
			status: deriveStatusFromIssues(designationIssues),
			summary: `${pluralize(status.designations.provisional, "designação vigente para o provisório", "designações vigentes para o provisório")} · ${pluralize(status.designations.definitive, "para o definitivo", "para o definitivo")}`,
			issues: designationIssues,
			action: designationAction,
		},
		{
			id: "supply-orders",
			title: "Ordens de fornecimento",
			objective: "A OF enviada em emergência sem empenho é regularizada com a NE.",
			status: deriveStatusFromIssues(orderIssues),
			summary: orderIssues.length === 0 ? "Nenhuma OF enviada sem empenho" : undefined,
			issues: orderIssues,
		},
		{
			id: "receiving",
			title: "Recebimento",
			objective: "A entrega registrada sem documento ganha a NF-e, a OF e o empenho depois, sem refazer nada.",
			status: deriveStatusFromIssues(receivingIssues),
			summary: receivingTotal === 0 ? "Nenhuma pendência de recebimento nas cozinhas" : undefined,
			issues: receivingIssues,
		},
		{
			id: "liquidacao",
			title: "Liquidação",
			objective: "Toda entrega atestada vira NS, pelo valor recebido e com a NF-e consultada.",
			status: deriveStatusFromIssues(liquidacaoIssues),
			summary: status.unliquidated.count === 0 ? "Nenhum recebimento atestado sem liquidação" : undefined,
			issues: liquidacaoIssues,
			action: { label: "Liquidações", href: `${unit}/liquidacoes` },
		},
		{
			id: "siafi",
			title: "SIAFI",
			objective: "NE, NS e OB do SIAFI entram sem perda; o que chegou antes do pai espera e se religa.",
			status: deriveStatusFromIssues(siafiIssues),
			issues: siafiIssues,
			action: { label: "SIAFI", href: `${unit}/siafi` },
		},
	]
}
