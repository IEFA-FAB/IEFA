import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { MonitorPlay, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConductPanel } from "@/components/ConductPanel"
import { ControllerTable, type PersonChanges } from "@/components/ControllerTable"
import { EditionSelect } from "@/components/EditionSelect"
import { Button } from "@/components/ui/button"
import { useBoardRealtime } from "@/hooks/useBoardRealtime"
import { localidadesFab } from "@/lib/localidades"
import { boardQueryOptions } from "@/lib/queries"
import { callPersonFn, resetEditionFn, setActiveEditionFn, updatePersonFn } from "@/server/assignment.fn"

type ControllerSearch = { edition?: string }

export const Route = createFileRoute("/controller")({
	validateSearch: (search: Record<string, unknown>): ControllerSearch => ({
		edition: typeof search.edition === "string" ? search.edition : undefined,
	}),
	loaderDeps: ({ search }) => ({ edition: search.edition }),
	loader: ({ context, deps }) => context.queryClient.ensureQueryData(boardQueryOptions(deps.edition)),
	component: ControllerPage,
})

function ControllerPage() {
	const { edition } = Route.useSearch()
	const navigate = Route.useNavigate()
	const queryClient = useQueryClient()
	const { data } = useSuspenseQuery(boardQueryOptions(edition))

	useBoardRealtime(data.editionId, edition)

	const activeEdition = data.editions.find((e) => e.active)
	const isActiveOnBoard = !!data.editionId && activeEdition?.id === data.editionId

	// Executa qualquer ação de escrita e revalida o quadro ao terminar.
	const mutation = useMutation({
		mutationFn: (action: () => Promise<unknown>) => action(),
		onError: (err) => toast.error(err instanceof Error ? err.message : "Erro ao atualizar"),
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["board", edition ?? "default"] }),
	})
	const run = (action: () => Promise<unknown>) => mutation.mutate(action)
	const editionId = data.editionId

	const handleManualUpdate = (id: number, changes: PersonChanges) => run(() => updatePersonFn({ data: { id, changes } }))

	return (
		<div className="min-h-screen w-full bg-slate-950 p-4 md:p-8">
			<div className="mx-auto max-w-6xl">
				<div className="overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl">
					<header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
						<div>
							<h1 className="text-2xl font-bold text-slate-800">Painel de Controle</h1>
							<p className="text-sm text-slate-500">
								{data.persons.length} militares · edição {data.editions.find((e) => e.id === editionId)?.name ?? "—"}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<EditionSelect editions={data.editions} value={editionId} onChange={(id) => navigate({ search: { edition: id } })} />
							<Button
								variant={isActiveOnBoard ? "secondary" : "default"}
								onClick={() => editionId && run(() => setActiveEditionFn({ data: { editionId } }))}
								disabled={mutation.isPending || !editionId || isActiveOnBoard}
							>
								<MonitorPlay /> {isActiveOnBoard ? "No telão" : "Ativar no telão"}
							</Button>
						</div>
					</header>

					<div className="space-y-6 p-6">
						{editionId && (
							<ConductPanel
								persons={data.persons}
								busy={mutation.isPending}
								onCall={(personId) => run(() => callPersonFn({ data: { editionId, personId } }))}
								onArmOm={(personId, om) =>
									run(() => updatePersonFn({ data: { id: personId, changes: { localidade: om, estado: localidadesFab[om] ?? "N/A" } } }))
								}
								onReveal={(personId) => run(() => updatePersonFn({ data: { id: personId, changes: { show_om: true } } }))}
								onConfirm={(personId) => run(() => updatePersonFn({ data: { id: personId, changes: { hide_card: true } } }))}
							/>
						)}

						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								onClick={() => editionId && run(() => resetEditionFn({ data: { editionId, clearChoices: false } }))}
								disabled={mutation.isPending || !editionId}
							>
								<RotateCcw /> Resetar telão
							</Button>
							<Button
								variant="destructive"
								onClick={() => {
									if (editionId && window.confirm("Apagar TODAS as escolhas desta edição (OMs e cards) e reiniciar do zero?")) {
										run(() => resetEditionFn({ data: { editionId, clearChoices: true } }))
									}
								}}
								disabled={mutation.isPending || !editionId}
							>
								<Trash2 /> Resetar escolhas
							</Button>
						</div>

						<details className="group rounded-xl border border-slate-200">
							<summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Edição manual da tabela</summary>
							<div className="max-h-[60vh] overflow-auto p-3">
								<ControllerTable persons={data.persons} onUpdate={handleManualUpdate} updatingId={null} />
							</div>
						</details>
					</div>
				</div>
			</div>
		</div>
	)
}
