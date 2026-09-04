import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchPcaItemsFn, fetchPcaUasgsFn } from "@/server/pncp-pca.fn"

export const Route = createFileRoute("/_protected/_modules/analytics/procurement-plan")({
	beforeLoad: (opts) => requirePermission(opts, "analytics", 2),
	component: ProcurementPlanPage,
	head: () => ({
		meta: [
			{ title: "Plano de Contratações — Gênero" },
			{ name: "description", content: "Plano de Contratações Anual de gênero alimentício da FAB, por UASG e classe, vindo do PNCP" },
		],
	}),
})

const nf = new Intl.NumberFormat("pt-BR")
const cf = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function ProcurementPlanPage() {
	const currentYear = new Date().getFullYear()
	const [ano, setAno] = useState(currentYear)

	const { data, isLoading } = useQuery({
		queryKey: ["sisub", "pncp-pca", "items", ano],
		queryFn: () => fetchPcaItemsFn({ data: { ano, apenasAlimentos: true, limit: 200 } }),
	})
	const { data: uasgData } = useQuery({
		queryKey: ["sisub", "pncp-pca", "uasgs", ano],
		queryFn: () => fetchPcaUasgsFn({ data: { ano } }),
	})

	const cov = data?.coverage

	return (
		<div className="space-y-6">
			<PageHeader
				title="Plano de Contratações — Gênero"
				description="O que a FAB planejou comprar de gênero alimentício no exercício, por UASG e classe. Fonte: PNCP."
			>
				<div className="flex gap-2">
					{[currentYear - 1, currentYear, currentYear + 1].map((y) => (
						<button
							key={y}
							type="button"
							onClick={() => setAno(y)}
							className={`rounded-lg border px-3 py-1.5 text-sm ${y === ano ? "border-primary bg-primary/10 font-medium" : "border-border"}`}
						>
							{y}
						</button>
					))}
				</div>
			</PageHeader>

			{/* Valor de plano NÃO é preço praticado — o aviso é requisito, não decoração. */}
			<p className="text-muted-foreground text-sm">
				Todos os valores são <strong>estimados em plano</strong> para {ano}. Não são preço praticado e não alimentam pesquisa de preço.
				{data?.snapshot.appliedAt ? ` Coletado em ${new Date(data.snapshot.appliedAt).toLocaleString("pt-BR")}.` : ""}
			</p>

			{isLoading ? (
				<Skeleton className="h-64 w-full" />
			) : !data || data.total === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Sem plano coletado para {ano}</EmptyTitle>
						<EmptyDescription>
							{data?.snapshot.appliedAt
								? "A coleta rodou e não encontrou item de gênero neste exercício."
								: "O plano deste exercício ainda não foi sincronizado do PNCP."}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<>
					{cov ? (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<CoverageCard title="Itens de gênero no exercício" value={nf.format(cov.total)} hint={`${nf.format(data.items.length)} exibidos abaixo`} />
							<CoverageCard
								title="Com código CATMAT"
								value={`${nf.format(cov.comCatmat)}`}
								hint={cov.semCatmat > 0 ? `${nf.format(cov.semCatmat)} sem código` : "todos com código"}
							/>
							<CoverageCard
								title="Já no catálogo do sisub"
								value={`${nf.format(cov.catmatsNoCatalogo)} / ${nf.format(cov.catmatsDistintos)}`}
								hint="CATMATs distintos com insumo cadastrado"
							/>
							<CoverageCard
								title="Quantidade somada"
								value={nf.format(cov.quantidadeSomada)}
								hint={cov.itensForaDaSoma > 0 ? `${nf.format(cov.itensForaDaSoma)} item(ns) sem quantidade ficaram de fora` : "todos os itens têm quantidade"}
							/>
						</div>
					) : null}

					<Card>
						<CardHeader>
							<CardTitle>Itens planejados</CardTitle>
						</CardHeader>
						<CardContent className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead className="border-border border-b text-left text-muted-foreground">
									<tr>
										<th className="py-2 pr-3 font-medium">UASG</th>
										<th className="py-2 pr-3 font-medium">Classe</th>
										<th className="py-2 pr-3 font-medium">CATMAT</th>
										<th className="py-2 pr-3 font-medium">Descrição</th>
										<th className="py-2 pr-3 text-right font-medium">Qtd.</th>
										<th className="py-2 pr-3 font-medium">Un.</th>
										<th className="py-2 pr-3 text-right font-medium">Vlr. unit. estimado</th>
										<th className="py-2 font-medium">Catálogo</th>
									</tr>
								</thead>
								<tbody>
									{data.items.map((it) => (
										<tr key={`${it.uasg}-${it.idItemPca}`} className="border-border/60 border-b last:border-0">
											<td className="py-2 pr-3 font-mono text-xs">{it.uasg}</td>
											<td className="py-2 pr-3 text-xs">{it.nomeClasse ?? "—"}</td>
											<td className="py-2 pr-3 font-mono text-xs">{it.codigoItem ?? <span className="text-muted-foreground">sem código</span>}</td>
											<td className="max-w-md py-2 pr-3 text-xs">{it.descricaoItem ?? "—"}</td>
											<td className="py-2 pr-3 text-right tabular-nums">
												{it.quantidadeEstimada === null ? <span className="text-muted-foreground">—</span> : nf.format(it.quantidadeEstimada)}
											</td>
											<td className="py-2 pr-3 text-xs">{it.unidadeFornecimento ?? "—"}</td>
											<td className="py-2 pr-3 text-right tabular-nums">
												{it.valorUnitarioEstimado === null ? <span className="text-muted-foreground">—</span> : cf.format(it.valorUnitarioEstimado)}
											</td>
											<td className="py-2">
												{it.cobertoPeloCatalogo ? (
													<Badge variant="secondary" title={it.insumo ?? undefined}>
														coberto
													</Badge>
												) : (
													<span className="text-muted-foreground text-xs">não cadastrado</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
							{data.total > data.items.length ? (
								<p className="mt-3 text-muted-foreground text-xs">
									Exibindo {nf.format(data.items.length)} de {nf.format(data.total)} itens.
								</p>
							) : null}
						</CardContent>
					</Card>

					{uasgData && uasgData.uasgs.length > 0 ? (
						<Card>
							<CardHeader>
								<CardTitle>UASGs que planejam gênero ({uasgData.total})</CardTitle>
							</CardHeader>
							<CardContent className="overflow-x-auto">
								<p className="mb-3 text-muted-foreground text-sm">
									Insumo para o cadastro de UASG das unidades. As marcadas como não cadastradas ainda não têm <code>uasg</code> preenchida no sisub.
								</p>
								<table className="w-full text-sm">
									<thead className="border-border border-b text-left text-muted-foreground">
										<tr>
											<th className="py-2 pr-3 font-medium">UASG</th>
											<th className="py-2 pr-3 font-medium">Unidade responsável</th>
											<th className="py-2 pr-3 text-right font-medium">Itens</th>
											<th className="py-2 font-medium">No sisub</th>
										</tr>
									</thead>
									<tbody>
										{uasgData.uasgs.map((u) => (
											<tr key={u.uasg} className="border-border/60 border-b last:border-0">
												<td className="py-2 pr-3 font-mono text-xs">{u.uasg}</td>
												<td className="py-2 pr-3 text-xs">{u.nomeUnidade ?? "—"}</td>
												<td className="py-2 pr-3 text-right tabular-nums">{nf.format(u.itens)}</td>
												<td className="py-2">
													{u.jaCadastrada ? (
														<Badge variant="secondary">cadastrada</Badge>
													) : (
														<span className="text-muted-foreground text-xs">não cadastrada</span>
													)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</CardContent>
						</Card>
					) : null}
				</>
			)}
		</div>
	)
}

function CoverageCard({ title, value, hint }: { title: string; value: string; hint: string }) {
	return (
		<Card>
			<CardContent className="pt-6">
				<p className="text-muted-foreground text-sm">{title}</p>
				<p className="mt-1 font-semibold text-2xl tabular-nums">{value}</p>
				<p className="mt-1 text-muted-foreground text-xs">{hint}</p>
			</CardContent>
		</Card>
	)
}
