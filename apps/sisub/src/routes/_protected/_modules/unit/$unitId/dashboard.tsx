import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { AlertTriangle, CheckCircle2, ChefHat, FileText, FlameKindling, PackageSearch, Warehouse } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { useUnitDashboard } from "@/hooks/data/useUnitDashboard"
import type { DashboardArpItem } from "@/server/unit-dashboard.fn"

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/dashboard")({
	beforeLoad: ({ context }) => requirePermission(context, "unit", 1),
	component: UnitDashboardPage,
	head: () => ({
		meta: [{ title: "Painel — Gestão Unidade" }],
	}),
})

// ─── Formatadores ─────────────────────────────────────────────────────────────

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })

function fmtDate(iso: string | null | undefined): string {
	if (!iso) return "—"
	const [y, m, d] = iso.substring(0, 10).split("-")
	return `${d}/${m}/${y}`
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatCard({
	icon: Icon,
	label,
	value,
	sub,
	variant = "default",
}: {
	icon: React.ElementType
	label: string
	value: number | string
	sub?: string
	variant?: "default" | "warning" | "danger" | "success"
}) {
	const iconColors = {
		default: "text-muted-foreground",
		warning: "text-amber-500",
		danger: "text-destructive",
		success: "text-green-600",
	}
	const valueColors = {
		default: "text-foreground",
		warning: "text-amber-600",
		danger: "text-destructive",
		success: "text-green-700",
	}

	return (
		<Card>
			<CardContent className="flex items-center gap-4 py-5">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
					<Icon className={`h-5 w-5 ${iconColors[variant]}`} />
				</div>
				<div className="min-w-0">
					<p className="text-xs text-muted-foreground truncate">{label}</p>
					<p className={`text-2xl font-bold tabular-nums leading-none mt-0.5 ${valueColors[variant]}`}>{value}</p>
					{sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
				</div>
			</CardContent>
		</Card>
	)
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h2 className="text-base font-semibold tracking-tight text-foreground">{children}</h2>
}

// ─── Tabela de itens com saldo crítico ────────────────────────────────────────

function ConsumptionBar({ pct }: { pct: number }) {
	const color = pct >= 100 ? "bg-destructive" : pct >= 90 ? "bg-destructive/80" : pct >= 80 ? "bg-amber-500" : "bg-primary"
	return (
		<div className="flex items-center gap-2 min-w-[120px]">
			<Progress value={pct} className="flex-1">
				<ProgressTrack className="h-1.5">
					<ProgressIndicator className={color} />
				</ProgressTrack>
			</Progress>
			<span className={`text-xs tabular-nums font-medium w-9 text-right ${pct >= 90 ? "text-destructive" : pct >= 80 ? "text-amber-600" : "text-foreground"}`}>
				{pct}%
			</span>
		</div>
	)
}

function LowBalanceTable({ items, unitIdStr }: { items: DashboardArpItem[]; unitIdStr: string }) {
	if (items.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
					<CheckCircle2 className="h-9 w-9 text-green-500" />
					<p className="font-medium text-muted-foreground">Nenhum item com saldo crítico</p>
					<p className="text-sm text-muted-foreground max-w-sm">Todos os itens das ARPs vinculadas às atas publicadas estão com saldo confortável.</p>
				</CardContent>
			</Card>
		)
	}

	return (
		<Card className="overflow-hidden">
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
							<th className="py-2.5 px-3 text-left font-medium">Descrição / CATMAT</th>
							<th className="py-2.5 px-3 text-left font-medium hidden md:table-cell">ARP / ATA</th>
							<th className="py-2.5 px-3 text-right font-medium w-28 hidden sm:table-cell">Qtd Reg.</th>
							<th className="py-2.5 px-3 text-right font-medium w-28 hidden sm:table-cell">Saldo</th>
							<th className="py-2.5 px-3 text-left font-medium w-40">Consumido</th>
							<th className="py-2.5 px-3 text-center font-medium w-28">Cardápio</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border/60">
						{items.map((item) => (
							<tr key={item.id} className={`hover:bg-muted/30 transition-colors ${item.in_upcoming_menu ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
								<td className="py-2.5 px-3">
									<p className="font-medium text-sm line-clamp-1">{item.product_name ?? item.descricao_item ?? "—"}</p>
									<p className="text-xs text-muted-foreground font-mono mt-0.5">
										{item.catmat_item_codigo ? `CATMAT ${item.catmat_item_codigo}` : "Sem CATMAT"}
										{item.nome_fornecedor && ` · ${item.nome_fornecedor}`}
									</p>
								</td>
								<td className="py-2.5 px-3 hidden md:table-cell">
									<p className="text-xs font-mono text-foreground">
										{item.arp_numero_ata}/{item.arp_ano_ata ?? "—"}
									</p>
									<Link
										to="/unit/$unitId/procurement/$ataId"
										params={{ unitId: unitIdStr, ataId: item.ata_id }}
										className="text-xs text-muted-foreground hover:text-primary transition-colors line-clamp-1"
									>
										{item.ata_title}
									</Link>
								</td>
								<td className="py-2.5 px-3 text-right text-xs tabular-nums hidden sm:table-cell">
									{item.quantidade_homologada != null ? NUM.format(item.quantidade_homologada) : "—"}
									{item.medida_catmat && <span className="ml-1 text-muted-foreground">{item.medida_catmat}</span>}
								</td>
								<td className="py-2.5 px-3 text-right text-xs tabular-nums hidden sm:table-cell">
									<span
										className={
											(item.saldo_empenho != null ? Number(item.saldo_empenho) : 0) <= 0
												? "text-destructive font-semibold"
												: item.consumption_pct >= 90
													? "text-amber-600 font-semibold"
													: ""
										}
									>
										{item.saldo_empenho != null ? NUM.format(Number(item.saldo_empenho)) : "—"}
									</span>
									{item.medida_catmat && <span className="ml-1 text-muted-foreground">{item.medida_catmat}</span>}
								</td>
								<td className="py-2.5 px-3">
									<ConsumptionBar pct={item.consumption_pct} />
								</td>
								<td className="py-2.5 px-3 text-center">
									{item.in_upcoming_menu ? (
										<Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-700 dark:text-amber-400">
											<ChefHat className="h-2.5 w-2.5" />
											No cardápio
										</Badge>
									) : (
										<span className="text-xs text-muted-foreground/50">—</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	)
}

// ─── Skeleton de carregamento ─────────────────────────────────────────────────

function DashboardSkeleton() {
	return (
		<div className="space-y-8 animate-pulse">
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-20 rounded-lg border bg-muted" />
				))}
			</div>
			<div className="space-y-3">
				<div className="h-5 w-40 rounded bg-muted" />
				<div className="h-28 rounded-lg border bg-muted" />
			</div>
			<div className="space-y-3">
				<div className="h-5 w-48 rounded bg-muted" />
				<div className="h-52 rounded-lg border bg-muted" />
			</div>
		</div>
	)
}

// ─── Página principal ─────────────────────────────────────────────────────────

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
