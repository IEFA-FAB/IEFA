import { brasiliaCivilDate, isStandardReviewOverdue } from "@iefa/sisub-domain/utils"
import { AlertTriangle, Sandwich, ShoppingBag } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { isSnackStandard, type SnackStandardColumns, snackStandardLabel } from "@/lib/occasion-menu"

/**
 * Selos de padrão de lanche na lista de apoios: classificação ("Lanche de Bordo B"), se o
 * comensal pode pedir e se a revisão trimestral venceu. Apoio comum não recebe nada.
 */
export function SnackStandardBadges({ template }: { template: SnackStandardColumns & { kitchen_id: number | null } }) {
	if (!isSnackStandard(template)) return null
	const label = snackStandardLabel(template)
	const today = brasiliaCivilDate(new Date().toISOString())
	const overdue = isStandardReviewOverdue(template.reviewed_at, today)
	return (
		<div className="flex flex-wrap items-center gap-1 mt-1">
			<Badge variant="accent" className="font-normal">
				<Sandwich />
				{label}
			</Badge>
			{template.kitchen_id !== null && template.orderable && (
				<Badge variant="success" className="font-normal">
					<ShoppingBag />
					Pedível
				</Badge>
			)}
			{overdue && (
				<Badge variant="warning" className="font-normal" title="Revisão trimestral vencida">
					<AlertTriangle />
					Revisão vencida
				</Badge>
			)}
		</div>
	)
}
