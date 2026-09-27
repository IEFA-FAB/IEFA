import type { EquipmentModelWire, EquipmentUnitWire } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"
import { buildEquipmentModelsCsv, buildKitchenEquipmentCsv, EQUIPMENT_MODELS_CSV_HEADER, KITCHEN_EQUIPMENT_CSV_HEADER } from "./equipment-csv"

const lines = (csv: string) => csv.split("\n")
const quoted = (header: readonly string[]) => header.map((h) => `"${h}"`).join(",")

const model = (overrides: Partial<EquipmentModelWire> = {}): EquipmentModelWire =>
	({
		id: "m1",
		name: "iVario Pro 2-S",
		manufacturer: "Rational",
		capacity_label: "2 × 25 L",
		simultaneous_slots: 2,
		slot_capacity_liters: 25,
		slot_capacity_gn: null,
		energy_source: "electric",
		voltage: "380V",
		power_kw: 13.5,
		requires_hood: true,
		water_inlet: false,
		drain_required: null,
		width_cm: 110,
		depth_cm: 80,
		height_cm: 110,
		weight_kg: null,
		expected_lifespan_years: 10,
		manual_url: null,
		roles: [
			{ id: "l1", role_id: "chapa", is_primary: true, role: { name: "Chapa" } },
			{ id: "l2", role_id: "fritadeira", is_primary: false, role: null },
		],
		...overrides,
	}) as unknown as EquipmentModelWire

const unit = (overrides: Partial<EquipmentUnitWire> = {}): EquipmentUnitWire =>
	({
		id: "u1",
		label: "Forno 1",
		model: model(),
		model_id: "m1",
		effective_role_ids: ["chapa", "desconhecido"],
		effective_slots: 2,
		status: "maintenance",
		condition: "down",
		open_issues: [{ id: "i1" }, { id: "i2" }],
		asset_tag: "PAT-001",
		serial_number: null,
		supplier: "Fornecedor X",
		acquired_on: null,
		installed_on: "2024-03-05",
		warranty_until: "2027-03-05",
		notes: "Cuba 2 interditada",
		...overrides,
	}) as unknown as EquipmentUnitWire

const roleNames = new Map([
	["chapa", "Chapa"],
	["fritadeira", "Fritadeira"],
])

describe("buildKitchenEquipmentCsv", () => {
	test("cabeçalho e ficha inteira da unidade", () => {
		const [header, row] = lines(buildKitchenEquipmentCsv([unit()], roleNames))
		expect(header).toBe(quoted(KITCHEN_EQUIPMENT_CSV_HEADER))
		expect(row).toBe(
			'"Forno 1","Rational","iVario Pro 2-S","2 × 25 L","Chapa; desconhecido","2","Em manutenção","Parado","2","PAT-001","","Fornecedor X","","05/03/2024","05/03/2027","Cuba 2 interditada"'
		)
	})

	test("unidade sem modelo carregado não quebra a linha", () => {
		const [, row] = lines(buildKitchenEquipmentCsv([unit({ model: null, open_issues: [] })], roleNames))
		expect(row.split(",").slice(0, 4)).toEqual(['"Forno 1"', '""', '""', '""'])
	})
})

describe("buildEquipmentModelsCsv", () => {
	test("função principal, rótulo de energia e tri-state vazio para não informado", () => {
		const [header, row] = lines(buildEquipmentModelsCsv([model()], roleNames))
		expect(header).toBe(quoted(EQUIPMENT_MODELS_CSV_HEADER))
		expect(row).toBe(
			'"iVario Pro 2-S","Rational","2 × 25 L","Chapa","Chapa; Fritadeira","2","25","","Elétrica","380V","13.5","Sim","Não","","110","80","110","","10",""'
		)
	})
})
