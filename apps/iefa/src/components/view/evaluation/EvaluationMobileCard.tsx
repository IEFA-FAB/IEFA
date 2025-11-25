import {
	Calendar as CalendarIcon,
	Copy,
	ExternalLink,
	MoreVertical,
	Trash2,
	User2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RowAction } from "@/components/view/evaluation/RowAction";
import { StatusBadge } from "@/components/view/evaluation/StatusBadge";
import type { Avaliacao } from "@/hooks/useEvaluationData";

export function EvaluationsMobileCards({
	loading,
	rows,
	onOpen,
	onCopy,
	onDelete,
}: {
	loading: boolean;
	rows: Avaliacao[];
	onOpen: (r: Avaliacao) => void;
	onCopy: (r: Avaliacao) => void;
	onDelete: (r: Avaliacao) => void;
}) {
	if (loading) {
		return (
			<Card className="border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
				Carregando avaliações...
			</Card>
		);
	}

	if (rows.length === 0) {
		return (
			<Card className="border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
				Nenhuma avaliação encontrada.
			</Card>
		);
	}

	return (
		<>
			{rows.map((r) => (
				<Card
					key={r.id}
					className="border-slate-200 bg-white/80 backdrop-blur transition-colors hover:bg-white/90 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900/70"
				>
					<CardContent className="p-4">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex items-center gap-3">
									<div className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300">
										<User2 className="h-4 w-4" />
									</div>
									<div className="min-w-0">
										<div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
											{r.usuario.nome}
										</div>
										<div className="truncate text-xs text-slate-500 dark:text-slate-400">
											{r.usuario.email}
										</div>
									</div>
								</div>
								<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
									<span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
										{r.esporte}
									</span>
									<span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
										<CalendarIcon className="h-3.5 w-3.5" />
										{r.data}
									</span>
									<span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
										{r.profissional}
									</span>
									<StatusBadge status={r.status} />
								</div>
							</div>
							<div className="flex items-center gap-1.5">
								<RowAction title="Abrir" onClick={() => onOpen(r)}>
									<ExternalLink className="h-4 w-4" />
								</RowAction>
								<RowAction title="Copiar link" onClick={() => onCopy(r)}>
									<Copy className="h-4 w-4" />
								</RowAction>
								<RowAction title="Excluir" onClick={() => onDelete(r)}>
									<Trash2 className="h-4 w-4" />
								</RowAction>
								<RowAction title="Mais">
									<MoreVertical className="h-4 w-4" />
								</RowAction>
							</div>
						</div>
					</CardContent>
				</Card>
			))}
		</>
	);
}
