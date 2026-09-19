import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CloudUpload, WarningTriangle } from "iconoir-react"
import { useMemo } from "react"
import { RequesterNav } from "@/components/requisitante/RequesterNav"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { formatDateTime } from "@/lib/alpha/format"
import { submissionsQueryOptions } from "@/lib/alpha/submissions"
import { unitsQueryOptions } from "@/lib/alpha/units"

/** O α devolve as 50 submissões mais recentes — a tela avisa quando a lista encosta no teto. */
const LIST_LIMIT = 50

export const Route = createFileRoute("/requisitante/$unitId/")({
	// Só no cliente (a rota-mãe é `ssr: false`): `alphaRequest` fala com outro serviço.
	loader: ({ context }) => {
		const token = context.auth.session?.access_token
		if (!token) return

		void context.queryClient.query({ ...submissionsQueryOptions(token, context.scopeContext), staleTime: "static" }).catch(() => {})
	},
	component: ProcessosPage,
	head: () => ({ meta: [{ title: "Processos · Requisitante" }] }),
})

const SUBTITLE = {
	unit: (label: string) => `Todos os documentos enviados para ${label} — os seus e os dos colegas —, para o trabalho seguir quando quem enviou não está.`,
	all: () => "Os documentos enviados para qualquer OM.",
	personal: () => "Os documentos que você enviou. Os de colegas da sua OM aparecem aqui quando a administração lhe conceder o papel de requisitante.",
} as const

function ProcessosPage() {
	const { session } = useAuth()
	const token = session?.access_token
	const { unitId } = Route.useParams()
	const { scopeContext } = Route.useRouteContext()
	const submissions = useQuery(submissionsQueryOptions(token, scopeContext))
	const units = useQuery(unitsQueryOptions(token))
	const unitCodes = useMemo(() => new Map((units.data ?? []).map((unit) => [unit.id, unit.code])), [units.data])
	// Numa OM só, a coluna repetiria a mesma sigla em todas as linhas.
	const showUnit = scopeContext.kind !== "unit"

	return (
		<div>
			<RequesterNav
				scope={scopeContext.label}
				title="Processos"
				subtitle={SUBTITLE[scopeContext.kind](scopeContext.label)}
				actions={
					<Button render={<Link to="/requisitante/$unitId/nova" params={{ unitId }} />} nativeButton={false} size="sm">
						<CloudUpload className="size-4" />
						enviar documento
					</Button>
				}
			/>

			{submissions.isLoading ? <p className="text-muted-foreground text-sm">carregando os processos…</p> : null}

			{submissions.isError ? (
				<div className="border border-border p-6">
					<p className="flex items-center gap-2 font-medium text-sm">
						<WarningTriangle className="size-4" />
						Não foi possível falar com o α
					</p>
					<p className="mt-2 text-muted-foreground text-sm">{(submissions.error as Error).message}</p>
				</div>
			) : null}

			{submissions.data?.length === 0 ? (
				<div className="border border-border p-8 text-center">
					<p className="font-medium text-sm">Nenhum documento enviado ainda</p>
					<p className="mt-1 text-muted-foreground text-sm">Envie um ETP, TR ou edital para começar.</p>
				</div>
			) : null}

			{submissions.data && submissions.data.length > 0 ? (
				<>
					<div className="overflow-x-auto border border-border">
						<table className="w-full min-w-[640px] text-left">
							<thead>
								<tr className="border-border border-b bg-muted/40 text-muted-foreground text-xs uppercase tracking-[0.1em]">
									<th className="px-3 py-2 font-medium">Documento</th>
									<th className="px-3 py-2 font-medium">Tipo</th>
									{showUnit ? <th className="px-3 py-2 font-medium">OM</th> : null}
									<th className="px-3 py-2 font-medium">Enviado</th>
								</tr>
							</thead>
							<tbody>
								{submissions.data.map((submission) => (
									<tr key={submission.id} className="border-border border-b last:border-b-0 hover:bg-muted/40">
										<td className="px-3 py-3 align-top">
											<Link
												to="/requisitante/$unitId/processos/$submissionId"
												params={{ unitId, submissionId: submission.id }}
												className="block min-w-0 hover:underline"
											>
												<span className="block truncate font-medium text-sm">{submission.filename}</span>
												{submission.objeto || submission.modalidade ? (
													<span className="block text-muted-foreground text-xs">{[submission.objeto, submission.modalidade].filter(Boolean).join(" · ")}</span>
												) : null}
											</Link>
										</td>
										<td className="px-3 py-3 align-top font-mono text-xs">{submission.doc_kind}</td>
										{showUnit ? (
											<td className="px-3 py-3 align-top text-sm">
												{submission.unit_id === null ? (
													<span className="text-muted-foreground">sem OM</span>
												) : (
													(unitCodes.get(submission.unit_id) ?? `OM ${submission.unit_id}`)
												)}
											</td>
										) : null}
										<td className="px-3 py-3 align-top text-muted-foreground text-xs tabular-nums">{formatDateTime(submission.created_at)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{submissions.data.length >= LIST_LIMIT ? <p className="mt-3 text-muted-foreground text-xs">Mostrando os {LIST_LIMIT} envios mais recentes.</p> : null}
				</>
			) : null}
		</div>
	)
}
