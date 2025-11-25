import type React from "react";
import { cn } from "@/lib/utils";

export function KpiCard({
	title,
	value,
	hint,
	Icon,
	trend,
	className,
}: {
	title: string;
	value: number;
	hint?: string;
	Icon: React.ComponentType<any>;
	trend?: { value: string; type: "up" | "down" };
	className?: string;
}) {
	return (
		<div
			className={cn(
				"rounded-2xl border p-4 shadow-sm transition hover:shadow-md bg-white/80 backdrop-blur border-slate-200 dark:bg-slate-900/60 dark:border-slate-800",
				className,
			)}
		>
			<div className="flex items-start justify-between">
				<div>
					<div className="text-sm text-slate-600 dark:text-slate-400">
						{title}
					</div>
					<div className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
						{value}
					</div>
					{hint && (
						<div className="text-xs text-slate-500 dark:text-slate-400">
							{hint}
						</div>
					)}
					{trend && (
						<div
							className={cn(
								"mt-1 text-xs font-medium",
								trend.type === "down"
									? "text-rose-600 dark:text-rose-300"
									: "text-emerald-600 dark:text-emerald-300",
							)}
						>
							{trend.value}
						</div>
					)}
				</div>
				<div className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
					<Icon className="h-5 w-5" />
				</div>
			</div>
		</div>
	);
}
