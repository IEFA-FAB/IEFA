import type { Connection } from "@xyflow/react"
import { describe, expect, test } from "vitest"
import type { PlacesNode, PlacesNodeData } from "@/types/domain/places"
import { inferRelationType, isValidPlacesConnection } from "./validate"

function node(id: string, entityType: PlacesNodeData["entityType"]): PlacesNode {
	return { id, type: entityType, position: { x: 0, y: 0 }, data: { entityType, label: id } } as unknown as PlacesNode
}

function conn(source: string | null, target: string | null): Connection {
	// source/target são não-nulos no tipo Connection; o cast permite exercitar os
	// caminhos de guarda (null) que a função trata em runtime.
	return { source, target, sourceHandle: null, targetHandle: null } as Connection
}

const unit = node("u1", "unit")
const kitchen = node("k1", "kitchen")
const kitchen2 = node("k2", "kitchen")
const messHall = node("m1", "mess_hall")
const nodes = [unit, kitchen, kitchen2, messHall]

describe("isValidPlacesConnection", () => {
	test("cozinha → unidade é válido (FK kitchen.unit_id)", () => {
		expect(isValidPlacesConnection(conn("k1", "u1"), nodes)).toBe(true)
	})

	test("cozinha → cozinha é válido (abastecida por)", () => {
		expect(isValidPlacesConnection(conn("k1", "k2"), nodes)).toBe(true)
	})

	test("rancho → cozinha é válido (operada por)", () => {
		expect(isValidPlacesConnection(conn("m1", "k1"), nodes)).toBe(true)
	})

	test("unidade → cozinha é inválido (direção da FK invertida)", () => {
		expect(isValidPlacesConnection(conn("u1", "k1"), nodes)).toBe(false)
	})

	test("unidade → unidade não tem regra, é inválido", () => {
		const otherUnit = node("u2", "unit")
		expect(isValidPlacesConnection(conn("u1", "u2"), [...nodes, otherUnit])).toBe(false)
	})

	test("self-loop é inválido", () => {
		expect(isValidPlacesConnection(conn("k1", "k1"), nodes)).toBe(false)
	})

	test("source ou target ausente é inválido", () => {
		expect(isValidPlacesConnection(conn(null, "u1"), nodes)).toBe(false)
		expect(isValidPlacesConnection(conn("k1", null), nodes)).toBe(false)
	})

	test("nó inexistente no grafo é inválido", () => {
		expect(isValidPlacesConnection(conn("k1", "fantasma"), nodes)).toBe(false)
	})
})

describe("inferRelationType", () => {
	test("preserva o relationType existente quando os tipos ainda batem", () => {
		// kitchen→unit tem duas regras; devemos manter a que já existia
		expect(inferRelationType(kitchen, unit, "kitchen.purchase_unit_id")).toBe("kitchen.purchase_unit_id")
	})

	test("cai na primeira regra compatível quando não há existente", () => {
		expect(inferRelationType(kitchen, unit)).toBe("kitchen.unit_id")
	})

	test("descarta relationType existente que não bate mais com os tipos", () => {
		// existente é de mess_hall→kitchen, mas os nós agora são kitchen→kitchen
		expect(inferRelationType(kitchen, kitchen2, "mess_halls.kitchen_id")).toBe("kitchen.kitchen_id")
	})

	test("par sem regra devolve null", () => {
		expect(inferRelationType(unit, kitchen)).toBeNull()
	})

	test("rancho → cozinha resolve para mess_halls.kitchen_id", () => {
		expect(inferRelationType(messHall, kitchen)).toBe("mess_halls.kitchen_id")
	})
})
