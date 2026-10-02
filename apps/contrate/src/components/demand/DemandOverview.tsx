/**
 * A demanda de origem, vista de dentro do processo na ACI: o problema, os objetivos, as
 * alternativas e as pendências que a própria estrutura acusa.
 *
 * A ACI confere o documento contra a norma; aqui ela confere o documento contra o raciocínio
 * que o originou. Um ETP bem escrito sobre uma alternativa que não atende o objetivo
 * fundamental aparece aqui, e não nos achados.
 */

import { checkDemand, DEMAND_STEP_LABEL, formatBRL, frameProcurement, summarizePrices } from "@iefa/alpha-client/demand"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { WarningTriangle } from "iconoir-react"
import { useMemo } from "react"
import { demandQueryOptions } from "@/lib/alpha/demands"
import { alphaAccessQueryOptions } from "@/lib/alpha/role"
import { getModule, moduleScopeOptions } from "@/lib/modules"
import { PERSONAL_SCOPE, pickScopeForUnit } from "@/lib/scope"
import { CheckList } from "./fields"
import { RATING_LABEL } from "./steps-structure"

export function DemandOverview({ demandId }: { demandId: string }) {
	const detail = useQuery(demandQueryOptions(demandId))
	const access = useQuery(alphaAccessQueryOptions())
	// O editor mora no módulo Requisitante: abre no escopo da OM da demanda, se a pessoa a
	// alcança lá; senão em `minhas`, onde a leitura vale pela regra da demanda.
	const scopeId =
		access.data && detail.data
			? (pickScopeForUnit(moduleScopeOptions(getModule("requisitante"), access.data), detail.data.unit_id)?.id ?? PERSONAL_SCOPE)
			: PERSONAL_SCOPE
	const demand = detail.data?.payload
	const derived = useMemo(() => {
		if (!demand) return null
		const prices = summarizePrices(demand)
		return { prices, framing: frameProcurement(demand, prices.total), checks: checkDemand(demand).filter((check) => check.severity !== "dica") }
	}, [demand])

	if (detail.isLoading) return <p className="text-muted-foreground text-sm">carregando a demanda…</p>
	if (detail.isError)
		return (
			<p className="flex items-center gap-2 text-sm">
				<WarningTriangle className="size-4" aria-hidden="true" />
				{(detail.error as Error).message}
			</p>
		)
	if (!demand || !derived || !detail.data) return null

	const fundamentals = demand.objectives.filter((objective) => objective.kind === "fundamental" && objective.text.trim())
	const means = demand.objectives.filter((objective) => objective.kind === "means" && objective.text.trim())
	const alternatives = demand.alternatives.filter((alternative) => alternative.name.trim())

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-baseline justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					Este documento foi gerado da demanda <strong className="text-foreground">{detail.data.title}</strong>, estruturada pelo requisitante no contrate.
				</p>
				<Link
					to="/requisitante/$unitId/demandas/$demandId"
					params={{ unitId: scopeId, demandId }}
					search={{ passo: "documentos" }}
					className="text-sm underline underline-offset-4"
				>
					abrir a demanda
				</Link>
			</div>

			<section className="grid gap-px border border-border bg-border sm:grid-cols-3">
				<div className="bg-background p-4">
					<p className="text-label text-muted-foreground">Enquadramento indicado</p>
					<p className="mt-1 font-medium text-sm">{derived.framing.label}</p>
				</div>
				<div className="bg-background p-4">
					<p className="text-label text-muted-foreground">Valor estimado</p>
					<p className="mt-1 font-medium text-sm tabular-nums">{derived.prices.total === null ? "pendente" : formatBRL(derived.prices.total)}</p>
				</div>
				<div className="bg-background p-4">
					<p className="text-label text-muted-foreground">Cotações · riscos</p>
					<p className="mt-1 font-medium text-sm tabular-nums">
						{demand.quotes.length} · {demand.risks.filter((risk) => risk.risk.trim()).length}
					</p>
				</div>
			</section>

			<section className="space-y-2">
				<h3 className="font-semibold text-lg tracking-tight">Problema</h3>
				<p className="whitespace-pre-wrap text-sm leading-relaxed">{demand.context.problem || "(não descrito)"}</p>
				{demand.context.consequence ? (
					<p className="whitespace-pre-wrap text-muted-foreground text-sm">Se nada for feito: {demand.context.consequence}</p>
				) : null}
			</section>

			<section className="space-y-3">
				<h3 className="font-semibold text-lg tracking-tight">Objetivos</h3>
				{fundamentals.length === 0 ? <p className="text-muted-foreground text-sm">Nenhum objetivo fundamental registrado.</p> : null}
				<ul className="space-y-3">
					{fundamentals.map((objective) => (
						<li key={objective.id} className="border border-border p-3 text-sm">
							<p className="font-medium">{objective.text}</p>
							{objective.attribute.name ? (
								<p className="mt-1 text-muted-foreground text-xs">
									{objective.attribute.name}
									{objective.attribute.baseline ? `: hoje ${objective.attribute.baseline}` : ""}
									{objective.attribute.target ? `, meta ${objective.attribute.target}` : ""}
								</p>
							) : null}
							{means.some((child) => child.supports.includes(objective.id)) ? (
								<ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
									{means
										.filter((child) => child.supports.includes(objective.id))
										.map((child) => (
											<li key={child.id}>{child.text}</li>
										))}
								</ul>
							) : null}
						</li>
					))}
				</ul>
			</section>

			{alternatives.length > 0 ? (
				<section className="space-y-3">
					<h3 className="font-semibold text-lg tracking-tight">Alternativas</h3>
					<div className="overflow-x-auto border border-border">
						<table className="w-full text-left text-sm">
							<thead>
								<tr className="border-border border-b bg-muted/40">
									<th className="text-label px-3 py-2 font-medium text-muted-foreground">Alternativa</th>
									{fundamentals.map((objective) => (
										<th key={objective.id} className="text-label px-3 py-2 font-medium text-muted-foreground">
											{objective.text}
										</th>
									))}
									<th className="text-label px-3 py-2 font-medium text-muted-foreground">Observação</th>
								</tr>
							</thead>
							<tbody>
								{alternatives.map((alternative) => (
									<tr
										key={alternative.id}
										className={`border-border border-b last:border-b-0 ${alternative.id === demand.chosenAlternativeId ? "font-medium" : ""}`}
									>
										<td className="px-3 py-2">
											{alternative.name}
											{alternative.id === demand.chosenAlternativeId ? " (escolhida)" : ""}
										</td>
										{fundamentals.map((objective) => {
											const rating = alternative.ratings[objective.id]
											return (
												<td key={objective.id} className="px-3 py-2 text-muted-foreground">
													{rating ? RATING_LABEL[rating] : "—"}
												</td>
											)
										})}
										<td className="px-3 py-2 text-muted-foreground">{alternative.notes}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{demand.choiceRationale ? <p className="whitespace-pre-wrap text-sm">Por que a escolhida: {demand.choiceRationale}</p> : null}
				</section>
			) : null}

			<section className="space-y-3">
				<h3 className="font-semibold text-lg tracking-tight">Pendências da estrutura</h3>
				<CheckList
					checks={derived.checks.map((check) => ({ ...check, message: `${DEMAND_STEP_LABEL[check.step]}: ${check.message}` }))}
					empty="A estrutura não acusa pendência."
				/>
			</section>
		</div>
	)
}
