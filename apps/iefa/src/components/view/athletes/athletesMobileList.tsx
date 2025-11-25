import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function AthletesMobileList({
	isLoading,
	athletes,
	q,
}: {
	isLoading: boolean;
	athletes: Athlete[];
	q: string;
}) {
	if (isLoading) {
		return (
			<Card className="border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
				Carregando atletas...
			</Card>
		);
	}

	if (athletes.length === 0) {
		return (
			<Card className="border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
				Nenhum atleta encontrado para “{q}”.
			</Card>
		);
	}

	return (
		<>
			{athletes.map((a) => (
				<Card
					key={a.id}
					className="border-slate-200 bg-white/80 backdrop-blur transition-colors hover:bg-white/90 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900/70"
				>
					<CardContent className="p-4">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
									{a.name}
								</div>
								<div className="mt-1 flex items-center gap-2">
									<StatusBadge status={a.status} />
									<StatusIcon status={a.status} />
								</div>
								<div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
									Ciclo:{" "}
									<span className="font-medium text-slate-700 dark:text-slate-300">
										{a.ciclo}
									</span>
								</div>
								<div className="mt-2">
									<DiasPills dias={a.diasSemana ?? [...DIAS]} />
								</div>
							</div>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										asChild
										size="sm"
										variant="outline"
										className="h-8"
										aria-label="Editar atleta"
									>
										<Link to={`/athletes/${a.id}/edit`}>
											<Pencil className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent>Editar atleta</TooltipContent>
							</Tooltip>
						</div>
					</CardContent>
				</Card>
			))}
		</>
	);
}
