import type { AppModule } from "@/types/domain/permissions"

/**
 * sisub gere só os próprios módulos; rumaer e sucont são geridos nos próprios apps.
 *
 * A família do sucont sai por PADRÃO (`sucont-${string}`), e não por uma lista de
 * nomes: quando ela deixou de ser o módulo `sucont` único e virou quatro
 * (`sucont-1`, `sucont-3`, `sucont-4`, `sucont-admin`), um `Exclude` que citava só
 * o nome antigo deixou os quatro vazarem para dentro do `Record<SisubModule, …>`
 * abaixo — e o typecheck do sisub quebrou por uma mudança feita no sucont. Com o
 * padrão, um quinto módulo do sucont não chega aqui.
 */
export type SisubModule = Exclude<AppModule, "rumaer" | `sucont-${string}`>

export const MODULE_LABELS: Record<SisubModule, string> = {
	diner: "Comensal",
	messhall: "Fiscal de Rancho",
	unit: "Gestão Unidade",
	kitchen: "Gestão Cozinha",
	"kitchen-production": "Produção Cozinha",
	global: "Catálogo Global",
	admin: "Administração do Sistema",
	analytics: "Análises — Visão Global",
	"local-analytics": "Análises — Unidade",
	storage: "Estoque",
}

export const LEVEL_CONFIG: Record<number, { label: string; variant: "destructive" | "secondary" | "default" }> = {
	0: { label: "Negado", variant: "destructive" },
	1: { label: "Leitura", variant: "secondary" },
	2: { label: "Escrita", variant: "default" },
	3: { label: "Administração", variant: "default" },
}

export type ScopeType = "global" | "unit" | "kitchen" | "mess_hall"

/** Tipos de escopo válidos por módulo — o resto é sempre sem escopo. */
export const MODULE_SCOPES: Partial<Record<AppModule, ScopeType[]>> = {
	messhall: ["global", "mess_hall"],
	unit: ["global", "unit"],
	kitchen: ["global", "kitchen"],
	"kitchen-production": ["global", "kitchen"],
	"local-analytics": ["global", "unit"],
}

export const ALL_SCOPE_OPTIONS: { value: ScopeType; label: string }[] = [
	{ value: "global", label: "Global (todas as unidades)" },
	{ value: "unit", label: "Por Unidade (OM)" },
	{ value: "kitchen", label: "Por Cozinha" },
	{ value: "mess_hall", label: "Por Refeitório" },
]

export function getScopeOptions(module: AppModule) {
	const allowed = MODULE_SCOPES[module] ?? ["global"]
	return ALL_SCOPE_OPTIONS.filter((o) => allowed.includes(o.value))
}

type ScopedRow = { unit_id: number | null; kitchen_id: number | null; mess_hall_id: number | null }

export function scopeTypeOf(row: ScopedRow): ScopeType {
	if (row.unit_id) return "unit"
	if (row.kitchen_id) return "kitchen"
	if (row.mess_hall_id) return "mess_hall"
	return "global"
}

export type ScopeMaps = {
	unitMap: Record<number, string>
	kitchenMap: Record<number, string>
	messHallMap: Record<number, string>
}

/** Rótulo legível do escopo de uma linha. */
export function scopeLabel(row: ScopedRow, maps: ScopeMaps): string {
	if (row.unit_id) return `Unidade: ${maps.unitMap[row.unit_id] ?? row.unit_id}`
	if (row.kitchen_id) return `Cozinha: ${maps.kitchenMap[row.kitchen_id] ?? row.kitchen_id}`
	if (row.mess_hall_id) return `Refeitório: ${maps.messHallMap[row.mess_hall_id] ?? row.mess_hall_id}`
	return "Global"
}
