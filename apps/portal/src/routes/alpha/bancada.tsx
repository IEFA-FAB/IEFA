import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CheckCircle, WarningTriangle } from "iconoir-react"
import { useState } from "react"
import { ConsoleNav } from "@/components/alpha/ConsoleNav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { type Rule, rulesQueryOptions, useEvaluateRule, useSetRuleStatus } from "@/lib/alpha/compliance"

export const Route = createFileRoute("/alpha/bancada")({
	component: BancadaPage,
})

const STATUS_FILTERS: Array<{ value: Rule["status"] | "todas"; label: string }> = [
	{ value: "draft", label: "Rascunho" },
	{ value: "active", label: "Ativas" },
	{ value: "needs_review", label: "Em revisão" },
	{ value: "retired", label: "Aposentadas" },
	{ value: "todas", label: "Todas" },
]

function BancadaPage() {
	const { session } = useAuth()
	const token = session?.access_token

	const [statusFilter, setStatusFilter] = useState<Rule["status"] | "todas">("draft")
	const [selected, setSelected] = useState<Rule | null>(null)
	const [sample, setSample] = useState("")

	const rules = useQuery(rulesQueryOptions(token, statusFilter === "todas" ? undefined : statusFilter))
	const evaluate = useEvaluateRule()
	const setStatus = useSetRuleStatus()

	return (
		<div>
			<ConsoleNav
				title="Bancada de regras"
				subtitle="Regras semeadas das notas explicativas da AGU nascem em rascunho. Aqui elas são testadas contra um trecho real antes de virarem ativas — nenhuma entra em produção sem essa passagem."
			/>

			<div className="mb-6 flex flex-wrap gap-2">
				{STATUS_FILTERS.map((filter) => (
					<button
						key={filter.value}
						type="button"
						onClick={() => setStatusFilter(filter.value)}
						className={`border px-3 py-1.5 text-sm ${statusFilter === filter.value ? "border-foreground bg-foreground text-background" : "border-border"}`}
					>
						{filter.label}
					</button>
				))}
			</div>

			{rules.isLoading ? <p className="text-muted-foreground text-sm">carregando regras…</p> : null}
			{rules.isError ? (
				<p className="flex items-center gap-2 text-sm">
					<WarningTriangle className="size-4" />
					{(rules.error as Error).message}
				</p>
			) : null}

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
				<div className="border border-border">
					{rules.data?.length === 0 ? <p className="p-6 text-center text-muted-foreground text-sm">Nenhuma regra com este status.</p> : null}

					{rules.data?.map((rule) => (
						<button
							key={rule.id}
							type="button"
							onClick={() => setSelected(rule)}
							className={`block w-full border-border border-b px-4 py-3 text-left hover:bg-muted/60 ${selected?.id === rule.id ? "bg-muted" : ""}`}
						>
							<div className="mb-1 flex flex-wrap items-center gap-2">
								<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
									{rule.severity}
								</Badge>
								<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
									{rule.status}
								</Badge>
								<span className="font-mono text-muted-foreground text-[11px]">{rule.origin}</span>
							</div>
							<p className="line-clamp-3 text-sm">{rule.statement}</p>
							{rule.legal_ref.length > 0 ? (
								<p className="mt-1 font-mono text-[11px] text-muted-foreground">
									{rule.legal_ref.map((ref) => `${ref.dispositivo} — ${ref.norma}`).join(" · ")}
								</p>
							) : null}
						</button>
					))}
				</div>

				<aside className="border border-border p-4 lg:sticky lg:top-6 lg:h-fit">
					{!selected ? (
						<p className="text-muted-foreground text-sm">Selecione uma regra para testá-la contra um trecho.</p>
					) : (
						<div className="space-y-4">
							<div>
								<p className="font-mono text-muted-foreground text-[11px]">{selected.code}</p>
								<p className="mt-1 text-sm">{selected.statement}</p>
							</div>

							<div>
								<label htmlFor="bancada-sample" className="mb-1 block text-muted-foreground text-xs uppercase tracking-[0.1em]">
									Trecho para testar
								</label>
								<textarea
									id="bancada-sample"
									value={sample}
									onChange={(event) => setSample(event.target.value)}
									rows={6}
									className="w-full border border-border bg-background p-2 text-sm"
									placeholder="Cole aqui um trecho do ETP/TR…"
								/>
							</div>

							<div className="flex flex-wrap gap-2">
								<Button
									size="sm"
									disabled={sample.trim().length < 20 || evaluate.isPending}
									onClick={() => evaluate.mutate({ ruleId: selected.id, text: sample })}
								>
									{evaluate.isPending ? "avaliando…" : "avaliar"}
								</Button>

								{selected.status !== "active" ? (
									<Button
										size="sm"
										variant="outline"
										disabled={setStatus.isPending}
										onClick={() => setStatus.mutate({ ruleId: selected.id, status: "active" })}
									>
										<CheckCircle className="size-4" />
										promover para ativa
									</Button>
								) : (
									<Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ ruleId: selected.id, status: "draft" })}>
										devolver para rascunho
									</Button>
								)}
							</div>

							{evaluate.isError ? <p className="text-sm">{(evaluate.error as Error).message}</p> : null}

							{evaluate.data ? (
								<div className="space-y-3 border border-border p-3">
									<div className="flex flex-wrap items-center gap-2">
										<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
											{evaluate.data.verdict.status}
										</Badge>
										<span className="text-muted-foreground text-xs">confiança {evaluate.data.verdict.confidence.toFixed(2)}</span>
									</div>

									<p className="text-sm">{evaluate.data.verdict.message}</p>

									{evaluate.data.verdict.evidence ? <p className="bg-muted/60 p-2 text-xs italic">“{evaluate.data.verdict.evidence}”</p> : null}

									<div className="text-xs">
										<p className="text-muted-foreground uppercase tracking-[0.1em]">Guard de citação</p>
										<p className="mt-1">
											{evaluate.data.guard.kept
												? `manteria o achado (${evaluate.data.guard.resolved_refs.map((ref) => ref.dispositivo).join(", ") || "sem dispositivo"})`
												: `descartaria — ${evaluate.data.guard.reason}`}
										</p>
									</div>
								</div>
							) : null}
						</div>
					)}
				</aside>
			</div>
		</div>
	)
}
