import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Database, Package } from "lucide-react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { type SyncPanelConfig, SyncRunnerPanel } from "@/components/features/global/sync/SyncRunnerPanel"
import { PageHeader } from "@/components/layout/PageHeader"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getLatestSyncFn, getSyncStatusFn, stopSyncFn, triggerSyncFn } from "@/server/compras-sync.fn"
import { getLatestNutritionSyncFn, getNutritionSyncStatusFn, stopNutritionSyncFn, triggerNutritionSyncFn } from "@/server/nutrition-sync.fn"

const SYNC_TABS = ["compras", "nutrition"] as const
type SyncTab = (typeof SYNC_TABS)[number]

const searchSchema = z.object({
	tab: z.enum(SYNC_TABS).catch("compras").optional(),
})

export const Route = createFileRoute("/_protected/_modules/global/sync-routines")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	loader: async () => {
		const [compras, nutrition] = await Promise.all([getLatestSyncFn(), getLatestNutritionSyncFn()])
		return { compras, nutrition }
	},
	component: SyncRoutinesPage,
	head: () => ({
		meta: [{ title: "Rotinas de Sincronização — SISUB" }],
	}),
})

const NUTRITION_SOURCE_LABELS: Record<string, string> = {
	taco: "TACO",
	ibge_pof_2008_2009: "IBGE POF 2008-2009",
	usda_fdc: "USDA FoodData Central",
	tbca: "TBCA",
	tucunduva: "Tucunduva",
}

function SyncRoutinesPage() {
	const { compras, nutrition } = Route.useLoaderData()
	const { tab } = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const activeTab: SyncTab = tab ?? "compras"

	const comprasConfig: SyncPanelConfig = {
		domainKey: "compras",
		initial: compras,
		progressUnit: "steps concluídos",
		stepColumnHeader: "Step",
		showPageColumn: true,
		stepLabel: (name) => ({ primary: name }),
		stopDescription: "Será aplicada ao fim do step atual",
		metrics: (s) => [
			["Inseridos/Atualizados", s.total_upserted],
			["Desativados", s.total_deactivated],
			["Steps OK", s.successful_steps],
			["Steps Falhos", s.failed_steps],
		],
		fns: { trigger: triggerSyncFn, status: getSyncStatusFn, stop: stopSyncFn, latest: getLatestSyncFn },
	}

	const nutritionConfig: SyncPanelConfig = {
		domainKey: "nutrition",
		initial: nutrition,
		progressUnit: "fontes verificadas",
		stepColumnHeader: "Fonte",
		showPageColumn: false,
		stepLabel: (name) => {
			const source = name.replace(/^source\./, "")
			return { primary: NUTRITION_SOURCE_LABELS[source] ?? name, secondary: name }
		},
		metrics: (s) => [
			["Releases verificados", s.total_upserted],
			["Desativados", s.total_deactivated],
			["Fontes OK", s.successful_steps],
			["Fontes com erro", s.failed_steps],
		],
		infoBanner: (
			<Card>
				<CardContent className="flex items-start gap-3 py-4 text-sm text-muted-foreground">
					<Database className="mt-0.5 size-4 shrink-0 text-foreground" />
					<p>
						Verifica releases das bases TACO, IBGE e USDA. TBCA e Tucunduva ficam bloqueadas até haver arquivo autorizado. O worker roda na API toda terça-feira
						às 03:00 BRT.
					</p>
				</CardContent>
			</Card>
		),
		fns: { trigger: triggerNutritionSyncFn, status: getNutritionSyncStatusFn, stop: stopNutritionSyncFn, latest: getLatestNutritionSyncFn },
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Rotinas de Sincronização" />

			<Tabs value={activeTab} onValueChange={(value) => navigate({ search: { tab: value as SyncTab }, replace: true })}>
				<TabsList>
					<TabsTrigger value="compras" className="gap-2">
						<Package className="size-4" />
						Catálogo Compras.gov
					</TabsTrigger>
					<TabsTrigger value="nutrition" className="gap-2">
						<Database className="size-4" />
						Tabelas Nutricionais
					</TabsTrigger>
				</TabsList>

				<TabsContent value="compras" className="mt-4">
					<SyncRunnerPanel config={comprasConfig} />
				</TabsContent>
				<TabsContent value="nutrition" className="mt-4">
					<SyncRunnerPanel config={nutritionConfig} />
				</TabsContent>
			</Tabs>
		</div>
	)
}
