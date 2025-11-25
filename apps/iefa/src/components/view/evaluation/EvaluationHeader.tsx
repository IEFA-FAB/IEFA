import { ListHeader } from "@/components/ListHeader";
import type { Status } from "@/hooks/useEvaluationData";

export function EvaluationsHeader({
	q,
	setQ,
	filtroStatus,
	setFiltroStatus,
	pageSize,
	setPageSize,
	filtrosAtivos,
	onClearFilters,
	loading,
	onRefetch,
	canExport,
	onExportCSV,
	onExportXLSX,
}: {
	q: string;
	setQ: (v: string) => void;
	filtroStatus: "" | Status;
	setFiltroStatus: (v: "" | Status) => void;
	pageSize: number;
	setPageSize: (n: number) => void;
	filtrosAtivos: boolean;
	onClearFilters: () => void;
	loading: boolean;
	onRefetch: () => void;
	canExport: boolean;
	onExportCSV: () => void;
	onExportXLSX: () => void;
}) {
	return (
		<ListHeader
			search={{
				value: q,
				onChange: setQ,
				placeholder: "Buscar nome, email, esporte, profissional...",
				ariaLabel: "Buscar",
				widthClass: "sm:w-80",
			}}
			filters={{
				label: "Filtros",
				status: {
					// mantém a semântica de "todos" => "" no estado original
					value: (filtroStatus || "todos") as string,
					onChange: (v) => setFiltroStatus(v === "todos" ? "" : (v as any)),
					options: [
						{ value: "todos", label: "Todos", tone: "slate" },
						{ value: "valido", label: "Válido", tone: "emerald" },
						{ value: "vencido", label: "Vencido", tone: "rose" },
					],
				},
				selects: [
					{
						value: String(pageSize),
						onChange: (v) => setPageSize(Number(v)),
						items: [7, 15, 30].map((n) => ({
							value: String(n),
							label: `${n} por página`,
						})),
						placeholder: "Itens/pág.",
						triggerClassName: "h-9 w-28",
						align: "start",
					},
				],
			}}
			clearFilters={{
				visible: filtrosAtivos,
				onClick: onClearFilters,
				label: "Limpar",
			}}
			refreshButton={{
				onClick: onRefetch,
				loading,
				label: "Atualizar",
			}}
			exportMenu={{
				canExport,
				onCSV: onExportCSV,
				onXLSX: onExportXLSX,
				label: "Exportar",
			}}
		/>
	);
}
