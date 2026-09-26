/**
 * Bloco somente-leitura dos lanches do dia no painel de planejamento.
 *
 * A produção de lanche do dia existe no calendário (o contador do mês a conta), mas ela NÃO é
 * planejamento do rancho: nasce do aceite de um pedido e some quando o pedido é cancelado.
 * Sem este bloco o painel do dia calava sobre ela — o mês dizia "Lan 2" e o dia não mostrava
 * nada, que é a tela que mente descrita no CLAUDE.md.
 */

import { Link } from "@tanstack/react-router"
import { PlaneTakeoff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { DailyMenuWithItems } from "@/types/domain/planning"

export function SnackDayPanel({ kitchenId, date, menu }: { kitchenId: number; date: string; menu: DailyMenuWithItems }) {
	const items = menu.menu_items ?? []
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-subheading">
					<PlaneTakeoff className="size-4" aria-hidden="true" />
					Lanches de Bordo/Apoio
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<p className="text-caption text-muted-foreground">
					Produção vinda de pedidos de lanche aceitos. Não se edita aqui: as quantidades mudam pelo pedido, na tela de Pedidos de Lanche.
				</p>
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhuma preparação de lanche neste dia.</p>
				) : (
					<ul className="divide-y divide-border rounded-md border">
						{items.map((item) => (
							<li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
								<span className="text-foreground">{item.recipe_origin?.name ?? "Preparação"}</span>
								<span className="font-mono tabular-nums text-muted-foreground">{item.planned_portion_quantity ?? 0} porções</span>
							</li>
						))}
					</ul>
				)}
				<Button
					size="sm"
					variant="outline"
					nativeButton={false}
					render={
						<Link to="/kitchen/$kitchenId/snack-requests/production" params={{ kitchenId: String(kitchenId) }} search={{ date }}>
							Abrir produção do dia
						</Link>
					}
				/>
			</CardContent>
		</Card>
	)
}
