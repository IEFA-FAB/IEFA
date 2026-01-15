import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PlanningBoard } from "@/components/features/admin/planning/PlanningBoard";

export const Route = createFileRoute("/_protected/admin/planning")({
	component: AdminPlanningPage,
});

function AdminPlanningPage() {
	return (
		<div className="p-6">
			<div className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight text-foreground">
					Planejamento
				</h1>
				<p className="text-muted-foreground">
					Gerencie o cardápio mensal e diário da unidade.
				</p>
			</div>

			<PlanningBoard />
		</div>
	);
}
