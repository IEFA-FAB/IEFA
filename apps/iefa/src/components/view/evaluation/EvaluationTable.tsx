import {
	ChevronDown,
	ChevronUp,
	Copy,
	ExternalLink,
	MoreVertical,
	Trash2,
	User2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RowAction } from "@/components/view/evaluation/RowAction";
import { StatusBadge } from "@/components/view/evaluation/StatusBadge";
import type { Avaliacao } from "@/hooks/useEvaluationData";
import { cn } from "@/lib/utils";

type SortKey = "usuario" | "esporte" | "data" | "profissional" | "status";

export function EvaluationsTable({
	loading,
	rows,
	toggleSort,
	getAriaSort,
	onOpen,
	onCopy,
	onDelete,
}: {
	loading: boolean;
	rows: Avaliacao[];
	toggleSort: (key: SortKey) => void;
	getAriaSort: (key: SortKey) => "none" | "ascending" | "descending";
	onOpen: (r: Avaliacao) => void;
	onCopy: (r: Avaliacao) => void;
	onDelete: (r: Avaliacao) => void;
}) {
	return (
		<div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 sm:block">
			<table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
				<thead className="bg-slate-50 dark:bg-slate-900/50">
					<tr>
						{(
							[
								{ key: "usuario", label: "Usuário" },
								{ key: "esporte", label: "Esporte" },
								{ key: "data", label: "Data" },
								{ key: "profissional", label: "Profissional" },
								{ key: "status", label: "Status" },
							] as Array<{ key: SortKey; label: string }>
						).map((col) => (
							<th
								key={col.key}
								scope="col"
								aria-sort={getAriaSort(col.key)}
								className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-600 dark:text-slate-400"
							>
								<Button
									onClick={() => toggleSort(col.key)}
									className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ring-offset-white dark:ring-offset-slate-950 dark:hover:text-slate-200"
									aria-label={`Ordenar por ${col.label}`}
								>
									{col.label}
									<span className="inline-flex flex-col leading-none text-slate-400">
										<ChevronUp className={cn("h-3 w-3 -mb-1")} />
										<ChevronDown className={cn("h-3 w-3")} />
									</span>
								</Button>
							</th>
						))}
						<th
							scope="col"
							className="px-4 py-3 text-right text-xs font-medium tracking-wider text-slate-600 dark:text-slate-400"
						>
							Ações
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-200 dark:divide-slate-800">
					{loading ? (
						<tr>
							<td
								colSpan={6}
								className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
							>
								Carregando avaliações...
							</td>
						</tr>
					) : rows.length === 0 ? (
						<tr>
							<td
								colSpan={6}
								className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
							>
								Nenhuma avaliação encontrada.
							</td>
						</tr>
					) : (
						rows.map((r) => (
							<tr
								key={r.id}
								className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
							>
								<td className="px-4 py-3">
									<div className="flex items-center gap-3">
										<div className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300">
											<User2 className="h-4 w-4" />
										</div>
										<div>
											<div className="text-sm font-medium text-slate-900 dark:text-slate-50">
												{r.usuario.nome}
											</div>
											<div className="text-xs text-slate-500 dark:text-slate-400">
												{r.usuario.email}
											</div>
										</div>
									</div>
								</td>
								<td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
									{r.esporte}
								</td>
								<td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
									{r.data}
								</td>
								<td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
									{r.profissional}
								</td>
								<td className="px-4 py-3">
									<StatusBadge status={r.status} />
								</td>
								<td className="px-4 py-3">
									<div className="flex items-center justify-end gap-1.5">
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
								</td>
							</tr>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}
