import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { addDaysToCivilDate, civilDateSearchParam, QUEUE_TAB_KEYS, type QueueTab, todayBrasilia } from "@/components/features/local/snack-requests/format"
import { KitchenSnackQueue, type KitchenSnackQueueSearch } from "@/components/features/local/snack-requests/KitchenSnackQueue"

const queueSearchSchema = z.object({
	tab: z
		.enum(QUEUE_TAB_KEYS as [QueueTab, ...QueueTab[]])
		.optional()
		.catch(undefined),
	from: civilDateSearchParam,
	to: civilDateSearchParam,
})

/**
 * KITCHEN — Lanches de Bordo/Apoio: fila das requisições da cozinha.
 * URL: /kitchen/:kitchenId/snack-requests?tab=&from=&to=
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/snack-requests/")({
	validateSearch: queueSearchSchema,
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: KitchenSnackRequestsPage,
	head: () => ({
		meta: [{ name: "description", content: "Fila de requisições de Lanche de Bordo e de Apoio da cozinha" }],
	}),
})

function KitchenSnackRequestsPage() {
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const search = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })

	const today = todayBrasilia()
	const defaultRange = { from: today, to: addDaysToCivilDate(today, 7) }
	const resolved: KitchenSnackQueueSearch = {
		tab: search.tab ?? "decide",
		from: search.from ?? defaultRange.from,
		to: search.to ?? defaultRange.to,
	}

	const handleSearchChange = (next: Partial<KitchenSnackQueueSearch>) => {
		const merged = { ...resolved, ...next }
		void navigate({
			search: {
				tab: merged.tab === "decide" ? undefined : merged.tab,
				from: merged.from === defaultRange.from ? undefined : merged.from,
				to: merged.to === defaultRange.to ? undefined : merged.to,
			},
			replace: true,
		})
	}

	return (
		<KitchenSnackQueue
			kitchenId={Number(kitchenIdStr)}
			kitchenIdStr={kitchenIdStr as string}
			search={resolved}
			defaultRange={defaultRange}
			today={today}
			onSearchChange={handleSearchChange}
		/>
	)
}
