import { useQuery } from "@tanstack/react-query"
import { CalendarClock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fetchExpiringInPeriodFn } from "@/server/expiry.fn"

/**
 * O que vence dentro do período planejado, para quem está montando o cardápio.
 *
 * A pergunta da nutricionista não é "quais lotes vencem" — é "o que eu preciso
 * gastar nesta semana". Por isso a lista é por INSUMO, com a quantidade somada:
 * cardápio se planeja por ingrediente, não por lote.
 *
 * Fica calado quando não há nada vencendo. Bloco vazio permanente no topo da
 * tela é ruído que ensina a nutricionista a não olhar para aquele canto — e aí
 * ela também não olha no dia em que há 12 KG de iogurte vencendo na quarta.
 */
export function ExpiringInPeriod({ kitchenId, until }: { kitchenId: number; until: string }) {
	const { data } = useQuery({
		queryKey: ["expiring-in-period", kitchenId, until],
		queryFn: () => fetchExpiringInPeriodFn({ data: { kitchenId, until } }),
		enabled: Number.isInteger(kitchenId) && kitchenId > 0,
	})

	if (!data || data.items.length === 0) return null

	const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 })
	const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2 text-subheading">
					<CalendarClock className="size-4" />
					Vence no período planejado
				</CardTitle>
				<p className="text-xs text-muted-foreground">
					Aproveite no cardápio antes de virar perda. {data.total > data.items.length && `Mostrando ${data.items.length} de ${data.total} itens.`}
				</p>
			</CardHeader>
			<CardContent>
				<ul className="grid gap-1 text-sm sm:grid-cols-2">
					{data.items.map((item) => (
						<li key={item.ingredientId ?? item.frozenPreparationId} className="flex flex-wrap items-baseline gap-x-2">
							<strong>{item.description}</strong>
							<span>
								{NUM.format(item.quantity)} {item.measureUnit ?? ""}
							</span>
							{/*
							 * A validade vem do banco como data civil (YYYY-MM-DD). `new Date`
							 * a lê como meia-noite UTC, que em Brasília é o dia ANTERIOR: sem
							 * o `T12:00` o iogurte que vence na quarta aparece como terça.
							 */}
							<span className="text-muted-foreground">vence {WEEKDAY.format(new Date(`${item.firstExpiry}T12:00:00Z`))}</span>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	)
}
