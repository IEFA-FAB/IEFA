import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { AlertTriangle, CheckCircle2, FileText, FlameKindling, PackageSearch, Warehouse } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { DashboardSkeleton } from "@/components/features/local/dashboard/DashboardSkeleton"
import { LowBalanceTable } from "@/components/features/local/dashboard/LowBalanceTable"
import { StatCard } from "@/components/features/local/dashboard/StatCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useUnitDashboard } from "@/hooks/data/useUnitDashboard"

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/dashboard")({
	beforeLoad: ({ context }) => requirePermission(context, "unit", 1),
	component: UnitDashboardPage,
	head: () => ({
		meta: [{ title: "Painel — Gestão Unidade" }],
	}),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
	if (!iso) return "—"
	const [y, m, d] = iso.substring(0, 10).split("-")
	return `${d}/${m}/${y}`
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h2 className="text-base font-semibold tracking-tight text-foreground">{children}</h2>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function UnitDashboardPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)

	const { data, isLoading, error } = useUnitDashboard(unitId)

	const publishedAtas = data?.published_atas ?? []
	const lowBalanceItems = data?.low_balance_items ?? []
	const criticalMenuItems = lowBalanceItems.filter((i) => i.in_upcoming_menu)

	if (isLoading) {
		return (
			<div className="space-y-6">
				<PageHeader title="Painel — Gestão Unidade" />
				<DashboardSkeleton />
			</div>
		)
	}

	if (error) {
		return (
			<div className="space-y-6">
				<PageHeader title="Painel — Gestão Unidade" />
				<Card>
					<CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
						<AlertTriangle className="h-9 w-9 text-destructive" />
						<p className="font-medium">Erro ao carregar o painel</p>
						<p className="text-sm text-muted-foreground">{error.message}</p>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className="space-y-8">
			<PageHeader title="Painel — Gestão Unidade" description="Visão geral das atas, estoques e alertas de suprimentos da unidade." />

			{/* ── Resumo numérico ──────────────────────────────────────────────── */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<StatCard
					icon={FileText}
					label="Atas em vigor"
					value={publishedAtas.length}
					sub={publishedAtas.length === 1 ? "ata publicada" : "atas publicadas"}
					variant={publishedAtas.length === 0 ? "default" : "success"}
				/>
				<StatCard
					icon={AlertTriangle}
					label="Itens com saldo crítico"
					value={lowBalanceItems.length}
					sub="≥ 80% do quantitativo consumido"
					variant={lowBalanceItems.length > 0 ? "warning" : "default"}
				/>
				<StatCard
					icon={FlameKindling}
					label="Críticos no cardápio"
					value={criticalMenuItems.length}
					sub="presentes nos menus dos próx. 30 dias"
					variant={criticalMenuItems.length > 0 ? "danger" : "default"}
				/>
			</div>

			{/* ── Seção 1: Atas em vigor ────────────────────────────────────────── */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<SectionTitle>Atas em vigor</SectionTitle>
					<Button
						size="sm"
						variant="ghost"
						className="text-xs"
						nativeButton={false}
						render={
							<Link to="/unit/$unitId/procurement" params={{ unitId: unitIdStr as string }}>
								Ver todas
							</Link>
						}
					/>
				</div>

				{publishedAtas.length === 0 ? (
					<Card>
						<CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
							<PackageSearch className="h-9 w-9 text-muted-foreground" />
							<p className="font-medium text-muted-foreground">Nenhuma ata publicada</p>
							<p className="text-sm text-muted-foreground max-w-sm">Publique uma ata de registro de preços para que ela apareça aqui.</p>
							<Button
								size="sm"
								variant="outline"
								nativeButton={false}
								render={
									<Link to="/unit/$unitId/procurement" params={{ unitId: unitIdStr as string }}>
										Ir para Atas
									</Link>
								}
							/>
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{publishedAtas.map((ata) => (
							<Card key={ata.id} className="hover:border-primary/30 transition-colors">
								<CardHeader className="pb-2 pt-4">
									<CardTitle className="text-sm flex items-start gap-2">
										<FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
										<span className="line-clamp-2 leading-snug">{ata.title}</span>
									</CardTitle>
								</CardHeader>
								<Separator />
								<CardContent className="pt-3 pb-3 flex items-center justify-between gap-2">
									<p className="text-xs text-muted-foreground">Publicada em {fmtDate(ata.updated_at ?? ata.created_at)}</p>
									<Button
										size="sm"
										variant="outline"
										className="h-7 text-xs shrink-0"
										nativeButton={false}
										render={
											<Link to="/unit/$unitId/procurement/$ataId" params={{ unitId: unitIdStr as string, ataId: ata.id }}>
												Abrir
											</Link>
										}
									/>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</div>

			{/* ── Seção 2: Nível de estoque (placeholder) ───────────────────────── */}
			<div className="space-y-3">
				<SectionTitle>Nível de estoque</SectionTitle>
				<Card className="border-dashed">
					<CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
						<Warehouse className="h-9 w-9 text-muted-foreground/50" />
						<p className="font-medium text-muted-foreground">Em desenvolvimento</p>
						<p className="text-sm text-muted-foreground max-w-sm">O módulo de controle de estoque será integrado aqui em breve.</p>
					</CardContent>
				</Card>
			</div>

			{/* ── Seção 3: Itens com saldo crítico ─────────────────────────────── */}
			<div className="space-y-3">
				<div className="flex items-center gap-3">
					<SectionTitle>Itens com saldo crítico nas ARPs</SectionTitle>
					{lowBalanceItems.length > 0 && (
						<Badge variant="secondary" className="text-xs">
							{lowBalanceItems.length} {lowBalanceItems.length === 1 ? "item" : "itens"}
						</Badge>
					)}
				</div>
				<p className="text-sm text-muted-foreground -mt-1">Itens das ARPs vinculadas às atas publicadas com 80% ou mais do quantitativo já empenhado.</p>
				<LowBalanceTable items={lowBalanceItems} unitIdStr={unitIdStr as string} />
			</div>

			{/* ── Seção 4: Críticos no cardápio de produção ────────────────────── */}
			<div className="space-y-3">
				<div className="flex items-center gap-3">
					<SectionTitle>Críticos no cardápio de produção</SectionTitle>
					{criticalMenuItems.length > 0 && (
						<Badge variant="destructive" className="text-xs">
							{criticalMenuItems.length} {criticalMenuItems.length === 1 ? "alerta" : "alertas"}
						</Badge>
					)}
				</div>
				<p className="text-sm text-muted-foreground -mt-1">Itens com saldo crítico que também constam nos menus planejados para os próximos 30 dias.</p>

				{criticalMenuItems.length === 0 ? (
					<Card>
						<CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
							<CheckCircle2 className="h-9 w-9 text-green-500" />
							<p className="font-medium text-muted-foreground">Sem alertas no momento</p>
							<p className="text-sm text-muted-foreground max-w-sm">Nenhum item com saldo crítico está nos cardápios planejados das cozinhas desta unidade.</p>
						</CardContent>
					</Card>
				) : (
					<LowBalanceTable items={criticalMenuItems} unitIdStr={unitIdStr as string} />
				)}
			</div>
		</div>
	)
}
