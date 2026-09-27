/**
 * CSV dos equipamentos: o parque de uma cozinha e o catálogo global de modelos.
 *
 * Funções puras, para ter teste — o download fica em `downloadCsv`. A tabela da tela mostra
 * um resumo; o CSV leva a ficha inteira (patrimônio, série, garantia, ficha técnica do
 * modelo), que é o que se procura quando o parque vai para uma planilha de inventário ou de
 * manutenção.
 */

import type { EquipmentModelWire, EquipmentUnitWire } from "@iefa/sisub-domain"
import { type CsvValue, csvDocument } from "@/lib/csv"
import { formatIsoDate } from "@/lib/expense-execution"
import { CONDITION_LABEL, ENERGY_LABEL, UNIT_STATUS_LABEL } from "./equipment-labels"

/** Coluna `date` → "14/09/2026"; vazio (e não "—") quando não informada. */
const formatDate = (isoDate: string | null | undefined): string => (isoDate ? formatIsoDate(isoDate) : "")

/** Resposta tri-state da ficha técnica: vazio é "não informado", não "não". */
function formatYesNo(value: boolean | null | undefined): string {
	if (value == null) return ""
	return value ? "Sim" : "Não"
}

/** Várias funções numa célula só; `;` não colide com o delimitador `,` do arquivo. */
function joinNames(names: readonly string[]): string {
	return names.join("; ")
}

export const KITCHEN_EQUIPMENT_CSV_HEADER = [
	"Equipamento",
	"Fabricante",
	"Modelo",
	"Capacidade",
	"Funções",
	"Zonas",
	"Situação",
	"Condição",
	"Panes abertas",
	"Patrimônio",
	"Nº de série",
	"Fornecedor",
	"Aquisição",
	"Instalação",
	"Garantia até",
	"Observações",
] as const

/** Uma linha por unidade física, na ordem em que a tela lista. */
export function buildKitchenEquipmentCsv(units: readonly EquipmentUnitWire[], roleNameById: ReadonlyMap<string, string>): string {
	const rows: CsvValue[][] = units.map((unit) => [
		unit.label,
		unit.model?.manufacturer,
		unit.model?.name,
		unit.model?.capacity_label,
		joinNames(unit.effective_role_ids.map((roleId) => roleNameById.get(roleId) ?? roleId)),
		unit.effective_slots,
		UNIT_STATUS_LABEL[unit.status] ?? unit.status,
		CONDITION_LABEL[unit.condition] ?? unit.condition,
		unit.open_issues.length,
		unit.asset_tag,
		unit.serial_number,
		unit.supplier,
		formatDate(unit.acquired_on),
		formatDate(unit.installed_on),
		formatDate(unit.warranty_until),
		unit.notes,
	])
	return csvDocument(KITCHEN_EQUIPMENT_CSV_HEADER, rows)
}

export const EQUIPMENT_MODELS_CSV_HEADER = [
	"Modelo",
	"Fabricante",
	"Capacidade",
	"Função principal",
	"Funções",
	"Zonas",
	"Capacidade por zona (L)",
	"Capacidade por zona (GN)",
	"Energia",
	"Tensão",
	"Potência (kW)",
	"Exige coifa",
	"Entrada de água",
	"Exige ralo",
	"Largura (cm)",
	"Profundidade (cm)",
	"Altura (cm)",
	"Peso (kg)",
	"Vida útil (anos)",
	"Manual",
] as const

/** Uma linha por modelo do catálogo. */
export function buildEquipmentModelsCsv(models: readonly EquipmentModelWire[], roleNameById: ReadonlyMap<string, string>): string {
	const roleName = (link: EquipmentModelWire["roles"][number]) => link.role?.name ?? roleNameById.get(link.role_id) ?? link.role_id
	const rows: CsvValue[][] = models.map((model) => [
		model.name,
		model.manufacturer,
		model.capacity_label,
		joinNames(model.roles.filter((link) => link.is_primary).map(roleName)),
		joinNames(model.roles.map(roleName)),
		model.simultaneous_slots,
		model.slot_capacity_liters,
		model.slot_capacity_gn,
		model.energy_source ? (ENERGY_LABEL[model.energy_source] ?? model.energy_source) : "",
		model.voltage,
		model.power_kw,
		formatYesNo(model.requires_hood),
		formatYesNo(model.water_inlet),
		formatYesNo(model.drain_required),
		model.width_cm,
		model.depth_cm,
		model.height_cm,
		model.weight_kg,
		model.expected_lifespan_years,
		model.manual_url,
	])
	return csvDocument(EQUIPMENT_MODELS_CSV_HEADER, rows)
}
