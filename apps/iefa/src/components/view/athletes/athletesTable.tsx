import { Link } from "@tanstack/react-router";
import { ArrowUpDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	DIAS,
	DiasPills,
	type Status,
	StatusBadge,
	StatusIcon,
} from "./statusBits";

export type Athlete = {
	id: string;
	name: string;
	status: Status;
	ciclo: string;
	diasSemana?: string[];
};

export function AthletesTable({
	isLoading,
	athletes,
	q,
	toggleSort,
	ariaSort,
}: {
	isLoading: boolean;
	athletes: Athlete[];
	q: string;
	toggleSort: (key: "name" | "status") => void;
	ariaSort: (key: "name" | "status") => "none" | "ascending" | "descending";
}) {
	return (
		<div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 sm:block">
			<table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
				<thead className="bg-slate-50 dark:bg-slate-900/50">
					<tr>
						<th
							scope="col"
							className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-600 dark:text-slate-400"
							aria-sort={ariaSort("name")}
						>
							<Button
								variant="ghost"
								className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ring-offset-white dark:ring-offset-slate-950 dark:hover:text-slate-200"
								onClick={() => toggleSort("name")}
								aria-label="Ordenar por atleta"
							>
								Atleta
								<ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
							</Button>
						</th>

						<th
							scope="col"
							className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-600 dark:text-slate-400"
							aria-sort={ariaSort("status")}
						>
							<Button
								variant="ghost"
								className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ring-offset-white dark:ring-offset-slate-950 dark:hover:text-slate-200"
								onClick={() => toggleSort("status")}
								aria-label="Ordenar por situação"
							>
								Situação
								<ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
							</Button>
						</th>
						<th
							scope="col"
							className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-600 dark:text-slate-400"
						>
							Ciclo de treino
						</th>
						<th
							scope="col"
							className="px-4 py-3 text-left text-xs font-medium tracking-wider text-slate-600 dark:text-slate-400"
						>
							Treinos realizados
						</th>
						<th
							scope="col"
							className="px-4 py-3 text-right text-xs font-medium tracking-wider text-slate-600 dark:text-slate-400"
						>
							Ações
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-200 dark:divide-slate-800">
					{isLoading ? (
						<tr>
							<td
								colSpan={5}
								className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
							>
								Carregando atletas...
							</td>
						</tr>
					) : athletes.length === 0 ? (
						<tr>
							<td
								colSpan={5}
								className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400"
							>
								Nenhum atleta encontrado para “{q}”.
							</td>
						</tr>
					) : (
						athletes.map((a) => (
							<tr
								key={a.id}
								className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40"
							>
								<td className="px-4 py-3">
									<div className="text-sm font-medium text-slate-900 dark:text-slate-50">
										{a.name}
									</div>
									<p className="text-xs text-slate-400 dark:text-slate-500">
										{a.id}
									</p>
								</td>
								<td className="px-4 py-3">
									<div className="inline-flex items-center gap-1.5">
										<StatusBadge status={a.status} />
										<StatusIcon status={a.status} />
									</div>
								</td>
								<td className="px-4 py-3">
									<div className="text-sm text-slate-700 dark:text-slate-300">
										{a.ciclo}
									</div>
								</td>
								<td className="px-4 py-3">
									<DiasPills dias={a.diasSemana ?? [...DIAS]} />
								</td>
								<td className="px-4 py-3">
									<div className="flex justify-end">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													asChild
													size="sm"
													variant="outline"
													className="h-8"
												>
													<Link
														to={`/athletes/${a.id}/edit`}
														title="Editar atleta"
													>
														<Pencil className="h-4 w-4" />
													</Link>
												</Button>
											</TooltipTrigger>
											<TooltipContent>Editar atleta</TooltipContent>
										</Tooltip>
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
