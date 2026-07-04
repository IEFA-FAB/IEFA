import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import { BrazilMap } from "@/components/brazil/BrazilMap"
import { PersonCard } from "@/components/PersonCard"
import { type Escolha, VacancyBoard } from "@/components/VacancyBoard"
import { useBoardRealtime } from "@/hooks/useBoardRealtime"
import { boardQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/")({
	// Telão sempre segue a edição ativa (editionId nulo → resolvido no servidor).
	loader: ({ context }) => context.queryClient.ensureQueryData(boardQueryOptions(null)),
	component: BoardPage,
})

function BoardPage() {
	const { data } = useSuspenseQuery(boardQueryOptions(null))
	useBoardRealtime(data.editionId, undefined)

	const editionName = data.editions.find((e) => e.id === data.editionId)?.name ?? "—"

	// `chosen` derivado das pessoas (confirmadas por OM), espelhando a view
	// vacancy_status — evita refetch a cada mudança em tempo real.
	const chosenByOm = useMemo(() => {
		const m = new Map<string, number>()
		for (const p of data.persons) {
			if (p.hide_card && p.localidade) m.set(p.localidade, (m.get(p.localidade) ?? 0) + 1)
		}
		return m
	}, [data.persons])

	const escolhas: Escolha[] = useMemo(
		() =>
			data.vacancies.map((v, i) => ({
				id: v.om ?? String(i),
				OM: v.om ?? "—",
				state: v.estado ?? "",
				total: v.total_vagas ?? 0,
				chosen: (v.om ? chosenByOm.get(v.om) : 0) ?? 0,
			})),
		[data.vacancies, chosenByOm]
	)

	// Rostos dos militares já confirmados, agrupados por estado escolhido.
	const markers = useMemo(() => {
		const byState = new Map<string, { id: number; classificacao: number; nome: string; om: string | null }[]>()
		for (const p of data.persons) {
			if (p.hide_card && p.estado) {
				const arr = byState.get(p.estado) ?? []
				arr.push({ id: p.id, classificacao: p.classificacao, nome: p.nome, om: p.localidade })
				byState.set(p.estado, arr)
			}
		}
		return Array.from(byState, ([estado, people]) => ({ estado, people }))
	}, [data.persons])

	// Militar em destaque (chamado, ainda não ocultado).
	const featured = useMemo(() => data.persons.find((p) => p.show_card && !p.hide_card) ?? null, [data.persons])

	// Mapa: destaca o estado da OM assim que ela é revelada.
	const highlightedState = featured?.show_om ? (featured.estado ?? undefined) : undefined

	return (
		<div className="relative h-screen w-full overflow-hidden bg-gradient-to-br from-[#0b1226] via-[#0a0f1e] to-[#05070f] text-white">
			{/* Brilho de fundo sutil */}
			<div className="pointer-events-none absolute -left-40 top-0 size-[42rem] rounded-full bg-blue-600/10 blur-[120px]" />
			<div className="pointer-events-none absolute -right-40 bottom-0 size-[42rem] rounded-full bg-indigo-700/10 blur-[120px]" />

			<div className="relative flex h-full flex-col gap-3 p-4">
				<header className="flex items-center justify-between">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300/70">CPAINT · Força Aérea Brasileira</p>
						<h1 className="mt-1 text-3xl font-black tracking-tight text-white xl:text-4xl">Escolha de Vagas</h1>
					</div>
					<div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
						<span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60" />
						<span className="text-sm font-medium text-white/80">Edição {editionName}</span>
					</div>
				</header>

				<div className="flex min-h-0 flex-1 gap-6">
					<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
						<BrazilMap
							size={1100}
							selected={highlightedState ?? null}
							markers={markers}
							mapColor="#e2e8f0"
							strokeColor="#0b1226"
							strokeWidth={0.6}
							selectColor="#3b82f6"
							className="drop-shadow-2xl"
						/>
					</div>

					<div className="min-h-0 w-[34%] max-w-[760px]">
						<VacancyBoard data={escolhas} />
					</div>
				</div>
			</div>

			{featured && <PersonCard cardData={featured} />}
		</div>
	)
}
