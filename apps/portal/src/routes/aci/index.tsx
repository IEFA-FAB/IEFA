import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus, WarningTriangle } from "iconoir-react"
import { useMemo, useState } from "react"
import { AciNav } from "@/components/aci/AciNav"
import { StageBadge } from "@/components/aci/StageStepper"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { aciQueueQueryOptions, DECISION_LABEL, type QueueItem, STAGE_LABEL, STAGE_ORDER, type Stage } from "@/lib/alpha/aci"
import { SEVERITY_ORDER } from "@/lib/alpha/compliance"

export const Route = createFileRoute("/aci/")({
	loader: ({ context }) => {
		// Só no cliente: `alphaRequest` fala com outro serviço e não tem timeout —
		// no SSR uma chamada pendurada prenderia a resposta do documento.
		if (typeof document === "undefined") return

		const token = context.auth.session?.access_token
		if (!token) return

		// Dispara sem esperar: a tela usa `useQuery` e tem estado de carregamento
		// próprio. O `.catch` deixa a falha no cache, para a tela exibir o próprio erro.
		void context.queryClient.query({ ...aciQueueQueryOptions(token), staleTime: "static" }).catch(() => {})
	},
	staticData: {
		nav: {
			title: "Plataforma ACI",
			section: "Facilidades",
			subtitle: "Fila de verificação de ETP/TR e parecer de conformidade",
			keywords: ["aci", "conformidade", "etp", "tr", "parecer", "licitação", "alpha"],
			access: "authenticated",
			order: 23,
		},
	},
	component: PainelPage,
	head: () => ({ meta: [{ title: "Plataforma ACI" }] }),
})

function formatDate(value: string | null | undefined) {
	if (!value) return "—"
	return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

/** Data da última coisa que aconteceu no processo — o que ordena a atenção. */
function lastActivity(item: QueueItem): string {
	return item.latest_review?.created_at ?? item.latest_run?.started_at ?? item.latest_extraction?.created_at ?? item.submission.created_at
}

const SEVERITY_SHORT: Record<(typeof SEVERITY_ORDER)[number], string> = { BLOQUEANTE: "B", GRAVE: "G", MEDIA: "M", INFORMATIVA: "I" }

function SeverityCounts({ item }: { item: QueueItem }) {
	if (!item.latest_run) return <span className="text-muted-foreground text-xs">—</span>

	return (
		<span className="flex gap-1 font-mono text-[11px]">
			{SEVERITY_ORDER.map((severity) => {
				const count = item.severity_counts[severity]
				return (
					<span
						key={severity}
						title={severity}
						className={`inline-flex min-w-7 items-center justify-center gap-0.5 border px-1 py-0.5 ${
							count > 0 && (severity === "BLOQUEANTE" || severity === "GRAVE") ? "border-foreground" : "border-border text-muted-foreground"
						}`}
					>
						<span>{SEVERITY_SHORT[severity]}</span>
						<span className="tabular-nums">{count}</span>
					</span>
				)
			})}
		</span>
	)
}

function QueueRow({ item }: { item: QueueItem }) {
	return (
		<tr className="border-border border-b last:border-b-0 hover:bg-muted/40">
			<td className="px-3 py-3 align-top">
				<Link to="/aci/processos/$submissionId" params={{ submissionId: item.submission.id }} className="block min-w-0 hover:underline">
					<span className="block truncate font-medium text-sm">{item.submission.filename}</span>
					<span className="block text-muted-foreground text-xs">
						{item.submission.doc_kind}
						{item.submission.objeto ? ` · ${item.submission.objeto}` : ""} · enviado {formatDate(item.submission.created_at)}
					</span>
				</Link>
			</td>
			<td className="px-3 py-3 align-top">
				<StageBadge stage={item.stage} />
			</td>
			<td className="px-3 py-3 align-top">
				<SeverityCounts item={item} />
				{item.latest_run && item.untriaged > 0 && item.stage !== "parecer" ? (
					<span className="mt-1 block text-muted-foreground text-xs">{item.untriaged} sem triagem</span>
				) : null}
			</td>
			<td className="px-3 py-3 align-top text-sm">
				{item.latest_review ? DECISION_LABEL[item.latest_review.decision] : <span className="text-muted-foreground">—</span>}
			</td>
			<td className="px-3 py-3 align-top text-muted-foreground text-xs tabular-nums">{formatDate(lastActivity(item))}</td>
		</tr>
	)
}

function PainelPage() {
	const { session } = useAuth()
	const queue = useQuery(aciQueueQueryOptions(session?.access_token))
	const [stageFilter, setStageFilter] = useState<Stage | "todas">("todas")

	const items = useMemo(() => {
		const all = queue.data?.items ?? []
		const filtered = stageFilter === "todas" ? all : all.filter((item) => item.stage === stageFilter)
		// Quem pede atenção primeiro: crítico aberto, depois atividade mais recente.
		return [...filtered].sort((left, right) => {
			const byCritical = (right.stage === "parecer" ? 0 : right.open_critical) - (left.stage === "parecer" ? 0 : left.open_critical)
			if (byCritical !== 0) return byCritical
			return lastActivity(right).localeCompare(lastActivity(left))
		})
	}, [queue.data, stageFilter])

	const totals = queue.data?.totals
	const pareceres = totals ? totals.pareceres.aprovado + totals.pareceres.aprovado_com_ressalvas + totals.pareceres.reprovado : 0

	return (
		<div>
			<AciNav
				title="Painel do analista"
				subtitle="Todos os processos submetidos ao α, em que etapa estão e o que pede decisão. A máquina aponta; o parecer é seu."
				actions={
					<Button render={<Link to="/aci/nova" />} nativeButton={false} size="sm">
						<Plus className="size-4" />
						nova análise
					</Button>
				}
			/>

			{queue.isLoading ? <p className="text-muted-foreground text-sm">carregando a fila…</p> : null}

			{queue.isError ? (
				<div className="border border-border p-6">
					<p className="flex items-center gap-2 font-medium text-sm">
						<WarningTriangle className="size-4" />
						Não foi possível falar com o α
					</p>
					<p className="mt-2 text-muted-foreground text-sm">{(queue.error as Error).message}</p>
				</div>
			) : null}

			{totals ? (
				<dl className="mb-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
					{[
						["processos", totals.processos],
						["aguardando parecer", totals.aguardando_parecer],
						["críticos abertos", totals.criticos_abertos],
						["pareceres emitidos", pareceres],
					].map(([label, value]) => (
						<div key={label as string} className="bg-background p-4">
							<dt className="text-muted-foreground text-xs uppercase tracking-[0.1em]">{label}</dt>
							<dd className="mt-1 font-semibold text-2xl tabular-nums">{value}</dd>
						</div>
					))}
				</dl>
			) : null}

			{queue.data ? (
				<>
					<div className="mb-4 flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => setStageFilter("todas")}
							className={`border px-3 py-1.5 text-sm ${stageFilter === "todas" ? "border-foreground bg-foreground text-background" : "border-border"}`}
						>
							Todas
						</button>
						{STAGE_ORDER.map((stage) => (
							<button
								key={stage}
								type="button"
								onClick={() => setStageFilter(stage)}
								className={`border px-3 py-1.5 text-sm ${stageFilter === stage ? "border-foreground bg-foreground text-background" : "border-border"}`}
							>
								{STAGE_LABEL[stage]}
								<Badge variant="outline" className="ml-2 h-4 px-1 font-mono text-[10px] tabular-nums">
									{totals?.por_etapa[stage] ?? 0}
								</Badge>
							</button>
						))}
					</div>

					{queue.data.items.length === 0 ? (
						<div className="border border-border p-8 text-center">
							<p className="font-medium text-sm">Nenhum processo submetido ainda</p>
							<p className="mt-1 text-muted-foreground text-sm">Envie um ETP ou TR para começar a fila.</p>
							<Button render={<Link to="/aci/nova" />} nativeButton={false} size="sm" variant="outline" className="mt-4">
								<Plus className="size-4" />
								nova análise
							</Button>
						</div>
					) : items.length === 0 ? (
						<p className="border border-border p-8 text-center text-muted-foreground text-sm">Nenhum processo nesta etapa.</p>
					) : (
						<div className="overflow-x-auto border border-border">
							<table className="w-full min-w-[720px] text-left">
								<thead>
									<tr className="border-border border-b bg-muted/40 text-muted-foreground text-xs uppercase tracking-[0.1em]">
										<th className="px-3 py-2 font-medium">Documento</th>
										<th className="px-3 py-2 font-medium">Etapa</th>
										<th className="px-3 py-2 font-medium">Achados</th>
										<th className="px-3 py-2 font-medium">Parecer</th>
										<th className="px-3 py-2 font-medium">Atividade</th>
									</tr>
								</thead>
								<tbody>
									{items.map((item) => (
										<QueueRow key={item.submission.id} item={item} />
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			) : null}
		</div>
	)
}
