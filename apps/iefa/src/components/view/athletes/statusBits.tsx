import { CheckCircle2, PauseCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type Status = "ativo" | "pausado" | "inativo";
export const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

export function StatusBadge({ status }: { status: Status }) {
	if (status === "ativo") {
		return (
			<Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-400/10 dark:text-emerald-300">
				Ativo
			</Badge>
		);
	}
	if (status === "pausado") {
		return (
			<Badge className="border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-400/10 dark:text-amber-300">
				Pausado
			</Badge>
		);
	}
	return (
		<Badge className="border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-400/10 dark:text-rose-300">
			Inativo
		</Badge>
	);
}

export function StatusIcon({ status }: { status: Status }) {
	if (status === "ativo") {
		return (
			<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
		);
	}
	if (status === "pausado") {
		return (
			<PauseCircle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
		);
	}
	return <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-300" />;
}

export function DiasPills({ dias = DIAS }: { dias?: ReadonlyArray<string> }) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{dias.map((d, i) => (
				<span
					key={`${d}-${i}`}
					className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
					title={d}
				>
					{d}
				</span>
			))}
		</div>
	);
}
