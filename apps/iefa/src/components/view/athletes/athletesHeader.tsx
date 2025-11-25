// ~/components/view/athletes/athletesHeader.tsx

import { UserPlus } from "lucide-react";
import { ListHeader } from "@/components/ListHeader";
import { Button } from "@/components/ui/button";
import type { Status } from "./statusBits";

export function AthletesHeader({
	q,
	setQ,
	statusFilter,
	setStatusFilter,
	cycleFilter,
	setCycleFilter,
	cycles,
	clearFilters,
	hasActiveFilters,
	showInvite,
	showTeams,
	onToggleInvite,
	onToggleTeams,
}: {
	q: string;
	setQ: (v: string) => void;
	statusFilter: "todos" | Status;
	setStatusFilter: (v: "todos" | Status) => void;
	cycleFilter: string;
	setCycleFilter: (v: string) => void;
	cycles: string[];
	clearFilters: () => void;
	hasActiveFilters: boolean;
	showInvite: boolean;
	showTeams: boolean;
	onToggleInvite: () => void;
	onToggleTeams: () => void;
}) {
	return (
		<ListHeader
			search={{
				value: q,
				onChange: setQ,
				placeholder: "Buscar atleta, ciclo ou status...",
				ariaLabel: "Buscar atleta, ciclo ou status",
				widthClass: "sm:w-80",
			}}
			filters={{
				label: "Filtros",
				status: {
					value: statusFilter,
					onChange: (v) => setStatusFilter(v as "todos" | Status),
					options: [
						{ value: "todos", label: "Todos", tone: "emerald" },
						{ value: "ativo", label: "Ativo", tone: "emerald" },
						{ value: "pausado", label: "Pausado", tone: "amber" },
						{ value: "inativo", label: "Inativo", tone: "rose" },
					],
				},
				selects: [
					{
						value: cycleFilter,
						onChange: setCycleFilter,
						items: cycles.map((c) => ({
							value: c,
							label: c === "todos" ? "Todos os ciclos" : c,
						})),
						placeholder: "Ciclo",
						triggerClassName: "h-9 w-36",
						align: "start",
					},
				],
			}}
			clearFilters={{
				visible: hasActiveFilters,
				onClick: clearFilters,
				label: "Limpar",
			}}
			// Ações específicas à direita
			rightExtra={
				<>
					<Button
						size="sm"
						variant="outline"
						className="bg-emerald-600 text-white hover:bg-emerald-700"
						onClick={onToggleInvite}
						aria-expanded={showInvite}
						aria-controls="invite-form"
					>
						<UserPlus className="h-4 w-4" />
						Convidar atleta
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={onToggleTeams}
						aria-expanded={showTeams}
						aria-controls="teams-manager"
					>
						Gerenciar equipes
					</Button>
				</>
			}
		/>
	);
}
