/**
 * Aviso de disputa de equipamento dentro de UMA refeição.
 *
 * A tela da preparação responde "esta cozinha tem o equipamento?", uma ficha por vez. A pergunta
 * que sobra é a do dia: cinco preparações no almoço, três pedindo forno combinado, uma cozinha
 * com um forno. Cada ficha, isolada, atende; o almoço não.
 *
 * NÃO bloqueia. Cardápio às vezes vem imposto e a cozinha se vira escalonando — o número de
 * rodadas por preparação está na ficha. Bloquear aqui trocaria um aviso útil por um impedimento
 * que o usuário contornaria apagando a exigência do catálogo.
 */

import { AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { useMenuEquipmentFitness } from "@/hooks/data/useEquipment"

export function MenuEquipmentAlert({ dailyMenuId }: { dailyMenuId: string | undefined }) {
	const { data } = useMenuEquipmentFitness(dailyMenuId)

	// Silêncio quando atende: aviso que aparece sempre vira ruído e deixa de ser lido.
	if (!data || data.satisfied || data.targets.length === 0) return null
	// Silêncio também quando a cozinha não cadastrou parque: aí a falta é de cadastro, não de
	// equipamento, e um alerta vermelho em cada refeição do dia em que o recurso nasce só
	// ensina o usuário a ignorar o alerta.
	if (data.units_registered === 0) return null

	return (
		<Alert>
			<AlertTriangle className="size-4" />
			<AlertTitle>Equipamento disputado nesta refeição</AlertTitle>
			<AlertDescription className="space-y-2">
				<ul className="space-y-1">
					{data.targets
						.filter((target) => target.missing > 0)
						.map((target) => (
							<li key={target.target_key} className="flex flex-wrap items-center gap-2">
								<Badge variant="destructive">
									{target.satisfied}/{target.required}
								</Badge>
								<span>{target.target_label}</span>
								<span className="text-muted-foreground">· {target.competing_items.map((item) => item.recipe_name).join(", ")}</span>
							</li>
						))}
				</ul>
				<p className="text-caption text-muted-foreground">
					Pior caso, tudo ao mesmo tempo. Escalonar dentro da refeição pode resolver — cada preparação mostra em quantas rodadas ela cabe.
					{data.delegated ? " Parque avaliado: o da cozinha que produz para esta." : ""}
				</p>
			</AlertDescription>
		</Alert>
	)
}
