import { PRICE_RESEARCH_VALIDITY_DAYS, type ProcurementPlanningStatus } from "@iefa/sisub-domain"
import { deriveStatusFromIssues, type FlowIssue, type FlowStep, formatMonthYear, formatShortDate, pluralize } from "./model"

/**
 * Fluxo "Planejar contratação" da Gestão Unidade: do cardápio das cozinhas aos documentos do
 * processo. A ordem das etapas é a ordem em que o trabalho depende do anterior.
 */
export function buildProcurementPlanningSteps(status: ProcurementPlanningStatus): FlowStep[] {
	const unit = `/unit/${status.unitId}`

	// 1. Cardápios das cozinhas ─────────────────────────────────────────────────
	const withMenus = status.kitchens.filter((k) => k.weeklyWithItems > 0)
	const menuIssues: FlowIssue[] = []
	if (status.kitchens.length === 0) {
		menuIssues.push({ severity: "blocking", message: "A OM não tem cozinha vinculada. Quem vincula é a administração do sisub." })
	} else if (withMenus.length === 0) {
		menuIssues.push({
			severity: "blocking",
			message: "Nenhuma cozinha da OM tem cardápio semanal com preparações. Quem cadastra é a nutricionista, na Gestão Cozinha.",
		})
	} else {
		for (const k of status.kitchens.filter((k) => k.weeklyWithItems === 0)) {
			menuIssues.push({ severity: "warning", message: `${k.name} sem cardápio semanal com preparações (quem cadastra é a nutricionista da cozinha).` })
		}
	}

	// 2. Previsão de demanda ─────────────────────────────────────────────────────
	const forecastIssues: FlowIssue[] = []
	for (const k of status.kitchens) {
		if (!k.forecast) {
			forecastIssues.push({
				severity: "warning",
				message: `${k.name} não enviou a previsão de demanda. Quem envia é a nutricionista, no fluxo "Prever demanda para compra" da Gestão Cozinha.`,
			})
		} else if (k.forecast.status === "sent") {
			forecastIssues.push({
				severity: "info",
				message: `${k.name} enviou "${k.forecast.title}"${k.forecast.updatedAt ? ` em ${formatShortDate(k.forecast.updatedAt)}` : ""}: importe no primeiro passo do anexo.`,
			})
		}
	}
	const received = status.kitchens.filter((k) => k.forecast).length

	// 3. Segmentação ─────────────────────────────────────────────────────────────
	const seg = status.segmentation
	const segIssues: FlowIssue[] = []
	if (seg.conflictCount > 0) {
		segIssues.push({
			severity: "blocking",
			message: `${pluralize(seg.conflictCount, "item está", "itens estão")} em duas contratações planejadas. A lei veda duas atas de registro de preços com o mesmo objeto (Lei 14.133/2021, art. 82, VIII).`,
			action: { label: "Resolver conflitos", href: `${unit}/segments` },
		})
	}
	if (seg.segmentCount > 0 && seg.unassignedCount > 0) {
		segIssues.push({
			severity: "warning",
			message: `${pluralize(seg.unassignedCount, "item dos cardápios não entra", "itens dos cardápios não entram")} em nenhuma contratação planejada. Pode ser compra fora do rancho; se não for, inclua a pasta.`,
			action: { label: "Ver itens sem contratação planejada", href: `${unit}/segments` },
		})
	}
	if (seg.segmentCount === 0) {
		segIssues.push({
			severity: "info",
			message:
				"Sem contratações planejadas: o anexo leva todos os itens num processo só. Se a OM compra em processos separados (carnes, estocáveis, bebidas), monte a segmentação.",
		})
	}

	// 4. Calendário ──────────────────────────────────────────────────────────────
	const calendarIssues: FlowIssue[] = []
	for (const entry of status.calendar) {
		if (!entry.cycle) {
			calendarIssues.push({
				severity: "info",
				message: `${entry.name} sem mês previsto no calendário de contratação.`,
				action: { label: "Definir mês", href: `${unit}/segments` },
			})
			continue
		}
		if (entry.cycle.active && !entry.cycle.closed) {
			calendarIssues.push({
				severity: "warning",
				message: `${entry.name}: prevista para ${formatMonthYear(entry.cycle.due)} e sem anexo concluído neste ciclo.`,
				action:
					entry.lastAnnex?.status === "draft"
						? {
								label: `Continuar "${entry.lastAnnex.title}"`,
								href:
									entry.lastAnnex.wizardStep != null
										? `${unit}/quantity-estimates/new?step=${entry.lastAnnex.wizardStep}&draft=${entry.lastAnnex.id}`
										: `${unit}/quantity-estimates/${entry.lastAnnex.id}`,
							}
						: { label: "Novo anexo", href: `${unit}/quantity-estimates/new` },
			})
		}
	}
	const openCycles = status.calendar.filter((e) => e.cycle?.active && !e.cycle.closed).length

	// 5. Anexo quantitativo ──────────────────────────────────────────────────────
	const annexIssues: FlowIssue[] = status.drafts.map((d) => ({
		severity: "info" as const,
		message: `"${d.title}"${d.segmentName ? ` (${d.segmentName})` : ""} em andamento${d.wizardStep ? `, passo ${d.wizardStep} de 5` : ""}.`,
		action: {
			label: "Continuar",
			href: d.wizardStep != null ? `${unit}/quantity-estimates/new?step=${d.wizardStep}&draft=${d.id}` : `${unit}/quantity-estimates/${d.id}`,
		},
	}))
	const concluded = status.pricing.filter((p) => p.status === "completed")

	// 6. Pesquisa de preços ──────────────────────────────────────────────────────
	const priceIssues: FlowIssue[] = []
	for (const p of status.pricing) {
		const href = `${unit}/quantity-estimates/${p.quantityEstimateId}`
		if (p.withoutResearch > 0) {
			priceIssues.push({
				severity: "blocking",
				message: `"${p.title}": ${pluralize(p.withoutResearch, "item com preço sem pesquisa registrada", "itens com preço sem pesquisa registrada")} (IN SEGES/ME 65/2021, art. 3º).`,
				action: { label: "Pesquisar preços", href },
			})
		}
		if (p.withoutPrice > 0) {
			priceIssues.push({
				severity: "warning",
				message: `"${p.title}": ${pluralize(p.withoutPrice, "item sem preço", "itens sem preço")}.`,
				action: { label: "Pesquisar preços", href },
			})
		}
		if (p.oldResearch > 0) {
			priceIssues.push({
				severity: "warning",
				message: `"${p.title}": ${pluralize(p.oldResearch, `item com pesquisa de mais de ${PRICE_RESEARCH_VALIDITY_DAYS} dias`, `itens com pesquisa de mais de ${PRICE_RESEARCH_VALIDITY_DAYS} dias`)}; refaça antes de divulgar o edital.`,
				action: { label: "Refazer pesquisa", href },
			})
		}
	}

	return [
		{
			id: "menus",
			title: "Cardápios das cozinhas",
			objective: "As cozinhas da OM têm cadastrado o que vão produzir: é a base de toda quantidade.",
			status: deriveStatusFromIssues(menuIssues),
			summary: `${pluralize(withMenus.length, "cozinha", "cozinhas")} de ${status.kitchens.length} com cardápio semanal`,
			issues: menuIssues,
		},
		{
			id: "forecasts",
			title: "Previsão de demanda das cozinhas",
			objective: "Cada nutricionista diz quais cardápios semanais, eventos e cardápios de apoio vai produzir e quantas vezes.",
			status: status.kitchens.length === 0 ? "todo" : deriveStatusFromIssues(forecastIssues),
			summary: `${received} de ${status.kitchens.length} enviada${received === 1 ? "" : "s"}`,
			issues: forecastIssues,
		},
		{
			id: "segments",
			title: "Segmentação das contratações",
			objective: "Diga o que a OM compra em cada processo (carnes, estocáveis, bebidas…).",
			status: deriveStatusFromIssues(segIssues, seg.segmentCount === 0 ? "todo" : "done"),
			summary:
				seg.segmentCount === 0
					? "Nenhuma contratação planejada"
					: `${pluralize(seg.segmentCount, "contratação planejada", "contratações planejadas")} · ${seg.lineCount - seg.unassignedCount - seg.conflictCount} de ${seg.lineCount} itens com contratação planejada`,
			issues: segIssues,
			action: { label: "Abrir segmentação", href: `${unit}/segments` },
		},
		{
			id: "calendar",
			title: "Calendário de contratação",
			objective: "Comece cada contratação planejada com antecedência, para a ata de registro de preços não vencer sem substituta.",
			status: status.calendar.length === 0 ? "todo" : deriveStatusFromIssues(calendarIssues),
			summary:
				status.calendar.length === 0
					? "Sem contratações planejadas no calendário"
					: `${pluralize(openCycles, "contratação planejada na janela", "contratações planejadas na janela")}`,
			issues: calendarIssues,
		},
		{
			id: "annex",
			title: "Anexo quantitativo",
			objective: "Calcule a quantidade de cada item a partir das produções previstas.",
			status: status.drafts.length > 0 ? "attention" : concluded.length > 0 ? "done" : "todo",
			summary: `${pluralize(status.drafts.length, "em andamento", "em andamento")} · ${pluralize(concluded.length, "concluído", "concluídos")} recente${concluded.length === 1 ? "" : "s"}`,
			issues: annexIssues,
			action: { label: "Novo anexo", href: `${unit}/quantity-estimates/new` },
		},
		{
			id: "prices",
			title: "Pesquisa de preços",
			objective: "Cada preço do anexo vem de uma pesquisa registrada, conferível na fonte.",
			status: status.pricing.length === 0 ? "todo" : deriveStatusFromIssues(priceIssues),
			issues: priceIssues,
		},
		{
			id: "documents",
			title: "Documentos do processo",
			objective: "Tabela para colar no TR, memória de cálculo das quantidades e relatório da pesquisa de preços.",
			status: concluded.length > 0 ? "done" : "todo",
			issues: concluded.map((p) => ({
				severity: "info" as const,
				message: `"${p.title}" concluído: gere os documentos no anexo.`,
				action: { label: "Abrir anexo", href: `${unit}/quantity-estimates/${p.quantityEstimateId}` },
			})),
			action: { label: "Anexos quantitativos", href: `${unit}/quantity-estimates` },
		},
	]
}
