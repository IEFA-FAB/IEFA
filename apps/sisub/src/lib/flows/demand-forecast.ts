import type { DemandForecastStatus } from "@iefa/sisub-domain"
import { type FlowIssue, type FlowStep, monthYear, plural, shortDate, statusFromIssues } from "./model"

/**
 * Fluxo "Prever demanda para compra" da Gestão Cozinha: a nutricionista deixa a unidade em
 * condição de calcular o quantitativo de compra. Pendência que só a unidade ou o catálogo
 * resolvem aparece dizendo quem resolve, sem link.
 */
export function demandForecastSteps(status: DemandForecastStatus): FlowStep[] {
	const kitchen = `/kitchen/${status.kitchenId}`

	const menuIssues: FlowIssue[] = []
	if (status.weeklyWithItems === 0) {
		menuIssues.push({
			severity: "blocking",
			message: "Nenhum cardápio semanal com preparações: sem ele a unidade não tem o que multiplicar.",
			action: { label: "Cardápios semanais", href: `${kitchen}/weekly-menus` },
		})
	}
	if (status.weeklyEmpty > 0) {
		menuIssues.push({
			severity: "warning",
			message: `${plural(status.weeklyEmpty, "cardápio semanal sem preparações", "cardápios semanais sem preparações")}.`,
			action: { label: "Completar", href: `${kitchen}/weekly-menus` },
		})
	}

	const occasionIssues: FlowIssue[] = []
	if (status.exceptionsWithoutOccurrences > 0) {
		occasionIssues.push({
			severity: "warning",
			message: `${plural(status.exceptionsWithoutOccurrences, "apoio sem ocorrências mensais", "apoios sem ocorrências mensais")}: a unidade multiplica o apoio pelas ocorrências, e zero não compra nada.`,
			action: { label: "Apoios", href: `${kitchen}/exceptions` },
		})
	}

	const catalogIssues: FlowIssue[] = []
	if (status.ingredientsWithoutPurchaseItem > 0) {
		catalogIssues.push({
			severity: "warning",
			message: `${plural(status.ingredientsWithoutPurchaseItem, "insumo dos cardápios está", "insumos dos cardápios estão")} sem item de compra: a unidade não consegue comprá-${status.ingredientsWithoutPurchaseItem === 1 ? "lo" : "los"}. Quem vincula é o catálogo global.`,
		})
	}

	const sendIssues: FlowIssue[] = []
	const forecast = status.forecast
	if (!forecast) {
		if (status.pendingForecasts > 0) {
			sendIssues.push({
				severity: "warning",
				message: `${plural(status.pendingForecasts, "previsão em elaboração ainda não enviada", "previsões em elaboração ainda não enviadas")}.`,
				action: { label: "Revisar e enviar", href: `${kitchen}/suprimentos` },
			})
		}
	}
	// Contratação da OM na janela do calendário: a previsão precisa chegar antes.
	for (const entry of status.unitCalendar) {
		if (!entry.cycle?.active || entry.cycle.closed) continue
		const coveredByForecast = forecast?.updatedAt != null && forecast.updatedAt.slice(0, 10) >= entry.cycle.windowStart
		sendIssues.push({
			severity: coveredByForecast ? "info" : "warning",
			message: coveredByForecast
				? `A unidade planeja "${entry.name}" para ${monthYear(entry.cycle.due)}; a previsão enviada já está com ela.`
				: `A unidade planeja "${entry.name}" para ${monthYear(entry.cycle.due)}: envie a previsão de demanda atualizada.`,
		})
	}

	let sendSummary = "Nenhuma previsão enviada"
	if (forecast?.status === "sent")
		sendSummary = `"${forecast.title}" enviada${forecast.updatedAt ? ` em ${shortDate(forecast.updatedAt)}` : ""}, aguardando a unidade`
	if (forecast?.status === "reviewed") {
		sendSummary = `"${forecast.title}" recebida pela unidade${forecast.reviewedAt ? ` em ${shortDate(forecast.reviewedAt)}` : ""}`
		if (forecast.imports.length > 0)
			sendSummary += ` · no${forecast.imports.length === 1 ? "" : "s"} anexo${forecast.imports.length === 1 ? "" : "s"} ${forecast.imports.map((i) => `"${i.title}"`).join(", ")}`
	}

	return [
		{
			id: "weekly",
			title: "Cardápios semanais",
			objective: "O que a cozinha produz numa semana normal, com as preparações e os comensais.",
			status: statusFromIssues(menuIssues),
			summary: plural(status.weeklyWithItems, "cardápio semanal com preparações", "cardápios semanais com preparações"),
			issues: menuIssues,
			action: { label: "Cardápios semanais", href: `${kitchen}/weekly-menus` },
		},
		{
			id: "occasions",
			title: "Eventos e apoios previstos",
			objective: "O que acontece fora da rotina: eventos (quantas vezes na vigência) e apoios (quantas vezes por mês).",
			status: statusFromIssues(occasionIssues),
			summary: `${plural(status.events, "evento", "eventos")} · ${plural(status.exceptions, "apoio", "apoios")}`,
			issues: occasionIssues,
			action: { label: "Eventos", href: `${kitchen}/events` },
		},
		{
			id: "catalog",
			title: "Insumos compráveis",
			objective: "Todo insumo dos cardápios tem item de compra, senão ele não chega ao anexo.",
			status: statusFromIssues(catalogIssues),
			issues: catalogIssues,
		},
		{
			id: "send",
			title: "Enviar a previsão à unidade",
			objective: "A unidade usa a previsão no anexo quantitativo; você vê aqui quando ela for recebida.",
			status: forecast ? statusFromIssues(sendIssues) : statusFromIssues(sendIssues, "todo"),
			summary: sendSummary,
			issues: sendIssues,
			action: forecast ? { label: "Previsões enviadas", href: `${kitchen}/suprimentos` } : { label: "Nova previsão", href: `${kitchen}/suprimentos/new` },
		},
	]
}
