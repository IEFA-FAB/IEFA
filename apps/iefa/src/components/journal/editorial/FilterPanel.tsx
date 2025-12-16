import { Button, Input, Label } from "@iefa/ui";
import { Search, X } from "lucide-react";
import { useState } from "react";

interface FilterPanelProps {
	onFilterChange: (filters: DashboardFilters) => void;
	currentFilters: DashboardFilters;
}

export interface DashboardFilters {
	search: string;
	status: string[];
	articleType: string[];
	dateFrom: string;
	dateTo: string;
}

const statusOptions = [
	{ value: "submitted", label: "Submetido" },
	{ value: "under_review", label: "Em Revisão" },
	{ value: "revision_requested", label: "Revisão Solicitada" },
	{ value: "accepted", label: "Aceito" },
	{ value: "published", label: "Publicado" },
	{ value: "rejected", label: "Rejeitado" },
];

const articleTypeOptions = [
	{ value: "research", label: "Pesquisa" },
	{ value: "review", label: "Revisão" },
	{ value: "short_communication", label: "Comunicação Curta" },
	{ value: "editorial", label: "Editorial" },
];

export function FilterPanel({
	onFilterChange,
	currentFilters,
}: FilterPanelProps) {
	const [localFilters, setLocalFilters] = useState(currentFilters);

	const handleSearchChange = (value: string) => {
		const newFilters = { ...localFilters, search: value };
		setLocalFilters(newFilters);
		// Debounce will be handled by parent
		onFilterChange(newFilters);
	};

	const toggleStatus = (status: string) => {
		const newStatuses = localFilters.status.includes(status)
			? localFilters.status.filter((s) => s !== status)
			: [...localFilters.status, status];
		const newFilters = { ...localFilters, status: newStatuses };
		setLocalFilters(newFilters);
		onFilterChange(newFilters);
	};

	const toggleArticleType = (type: string) => {
		const newTypes = localFilters.articleType.includes(type)
			? localFilters.articleType.filter((t) => t !== type)
			: [...localFilters.articleType, type];
		const newFilters = { ...localFilters, articleType: newTypes };
		setLocalFilters(newFilters);
		onFilterChange(newFilters);
	};

	const handleDateChange = (field: "dateFrom" | "dateTo", value: string) => {
		const newFilters = { ...localFilters, [field]: value };
		setLocalFilters(newFilters);
		onFilterChange(newFilters);
	};

	const clearAllFilters = () => {
		const emptyFilters: DashboardFilters = {
			search: "",
			status: [],
			articleType: [],
			dateFrom: "",
			dateTo: "",
		};
		setLocalFilters(emptyFilters);
		onFilterChange(emptyFilters);
	};

	const hasActiveFilters =
		localFilters.search ||
		localFilters.status.length > 0 ||
		localFilters.articleType.length > 0 ||
		localFilters.dateFrom ||
		localFilters.dateTo;

	return (
		<div className="space-y-6 p-6 border rounded-lg bg-card">
			<div className="flex items-center justify-between">
				<h3 className="font-semibold text-lg">Filtros</h3>
				{hasActiveFilters && (
					<Button
						variant="ghost"
						size="sm"
						onClick={clearAllFilters}
						className="text-muted-foreground hover:text-foreground"
					>
						<X className="size-4 mr-1" />
						Limpar
					</Button>
				)}
			</div>

			{/* Search */}
			<div className="space-y-2">
				<Label htmlFor="search">Buscar</Label>
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						id="search"
						placeholder="Título ou ID..."
						value={localFilters.search}
						onChange={(e) => handleSearchChange(e.target.value)}
						className="pl-9"
					/>
				</div>
			</div>

			{/* Status Filter */}
			<div className="space-y-2">
				<Label>Status</Label>
				<div className="space-y-2">
					{statusOptions.map((option) => (
						<label
							key={option.value}
							className="flex items-center gap-2 cursor-pointer"
						>
							<input
								type="checkbox"
								checked={localFilters.status.includes(option.value)}
								onChange={() => toggleStatus(option.value)}
								className="size-4 rounded border-gray-300"
							/>
							<span className="text-sm">{option.label}</span>
						</label>
					))}
				</div>
			</div>

			{/* Article Type Filter */}
			<div className="space-y-2">
				<Label>Tipo de Artigo</Label>
				<div className="space-y-2">
					{articleTypeOptions.map((option) => (
						<label
							key={option.value}
							className="flex items-center gap-2 cursor-pointer"
						>
							<input
								type="checkbox"
								checked={localFilters.articleType.includes(option.value)}
								onChange={() => toggleArticleType(option.value)}
								className="size-4 rounded border-gray-300"
							/>
							<span className="text-sm">{option.label}</span>
						</label>
					))}
				</div>
			</div>

			{/* Date Range */}
			<div className="space-y-2">
				<Label>Data de Submissão</Label>
				<div className="space-y-2">
					<div>
						<Label htmlFor="dateFrom" className="text-xs text-muted-foreground">
							De
						</Label>
						<Input
							id="dateFrom"
							type="date"
							value={localFilters.dateFrom}
							onChange={(e) => handleDateChange("dateFrom", e.target.value)}
						/>
					</div>
					<div>
						<Label htmlFor="dateTo" className="text-xs text-muted-foreground">
							Até
						</Label>
						<Input
							id="dateTo"
							type="date"
							value={localFilters.dateTo}
							onChange={(e) => handleDateChange("dateTo", e.target.value)}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
