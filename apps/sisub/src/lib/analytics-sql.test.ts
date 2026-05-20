import { describe, expect, test } from "vitest"
import { validateSql } from "./analytics-sql"

describe("validateSql", () => {
	test("aceita SELECT em tabela permitida", () => {
		expect(validateSql("SELECT id, name FROM recipes LIMIT 50")).toEqual({ valid: true })
	})

	test("aceita CTE que consulta tabela permitida", () => {
		const sql = `
			WITH counts AS (
				SELECT kitchen_id, count(*) AS total
				FROM daily_menu
				GROUP BY kitchen_id
			)
			SELECT kitchen_id, total FROM counts LIMIT 10
		`

		expect(validateSql(sql)).toEqual({ valid: true })
	})

	test("rejeita SQL vazio", () => {
		expect(validateSql("   ")).toEqual({ valid: false, error: "SQL vazio" })
	})

	test("rejeita DML e DDL", () => {
		expect(validateSql("DELETE FROM recipes")).toEqual({ valid: false, error: "Apenas SELECT permitido" })
		expect(validateSql("SELECT * FROM recipes; DROP TABLE recipes")).toEqual({
			valid: false,
			error: "Múltiplas instruções não são permitidas",
		})
		expect(validateSql("SELECT * FROM recipes WHERE name = 'UPDATE' LIMIT 1")).toEqual({
			valid: false,
			error: "Keyword proibida: UPDATE",
		})
	})

	test("rejeita múltiplas instruções mesmo quando terminadas com SELECT", () => {
		expect(validateSql("SELECT * FROM recipes; SELECT * FROM meal_type")).toEqual({
			valid: false,
			error: "Múltiplas instruções não são permitidas",
		})
	})

	test("rejeita tabela fora da whitelist", () => {
		expect(validateSql("SELECT * FROM auth.users LIMIT 10")).toEqual({
			valid: false,
			error: "Tabela não permitida: users",
		})
	})

	test("rejeita JOIN em tabela fora da whitelist", () => {
		expect(validateSql("SELECT r.id FROM recipes r JOIN secrets s ON s.recipe_id = r.id LIMIT 10")).toEqual({
			valid: false,
			error: "Tabela não permitida: secrets",
		})
	})

	test("rejeita LIMIT acima do máximo permitido", () => {
		expect(validateSql("SELECT * FROM recipes LIMIT 501")).toEqual({
			valid: false,
			error: "LIMIT máximo permitido: 500",
		})
	})

	test("rejeita SQL acima do tamanho máximo", () => {
		const longSql = `SELECT * FROM recipes WHERE name = '${"x".repeat(4001)}' LIMIT 1`

		expect(validateSql(longSql)).toEqual({ valid: false, error: "SQL muito longa" })
	})
})
