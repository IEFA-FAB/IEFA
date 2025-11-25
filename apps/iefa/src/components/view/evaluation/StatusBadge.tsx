import { Badge } from "@/components/ui/badge";
// Ajuste o caminho abaixo se você mover os tipos para outro lugar
import type { Status } from "@/hooks/useEvaluationData";

export function StatusBadge({ status }: { status: Status }) {
	return status === "valido" ? (
		<Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-400/10 dark:text-emerald-300">
			Válido
		</Badge>
	) : (
		<Badge className="border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-400/10 dark:text-rose-300">
			Vencido
		</Badge>
	);
}
