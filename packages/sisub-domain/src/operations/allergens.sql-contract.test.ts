/**
 * Contrato entre o vocabulário de alergênicos em TS e o CHECK de `kitchen.ingredient.allergens`.
 *
 * Divergir faz o formulário oferecer um grupo que o banco recusa — o save falha com uma
 * violação de CHECK que não diz qual valor sobrou.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ALLERGEN_DESCRIPTIONS, ALLERGEN_LABELS, ALLERGENS, normalizeAllergens } from "./allergens.ts"

const SQL = readFileSync(
	join(import.meta.dir, "..", "..", "..", "database", "supabase", "migrations", "20260922120000_ingredient_allergens.sql"),
	"utf8"
).replace(/--[^\n]*/g, "")

describe("alergênicos", () => {
	test("CHECK do insumo aceita exatamente o vocabulário do domínio", () => {
		const match = /allergens\s*<@\s*array\[([^\]]*)\]/i.exec(SQL)
		const values = [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].map((v) => v[1]).sort()
		expect(values).toEqual([...ALLERGENS].sort())
	})

	test("todo grupo tem rótulo e descrição", () => {
		for (const a of ALLERGENS) {
			expect(ALLERGEN_LABELS[a]).toBeTruthy()
			expect(ALLERGEN_DESCRIPTIONS[a]).toBeTruthy()
		}
	})

	test("normalizeAllergens deduplica, descarta desconhecido e segue a ordem canônica", () => {
		expect(normalizeAllergens(["ovos", "gluten", "ovos", "sulfito", null])).toEqual(["gluten", "ovos"])
		expect(normalizeAllergens(null)).toEqual([])
	})
})
