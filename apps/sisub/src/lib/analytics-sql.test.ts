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

	test("rejeita relação fora da whitelist escondida em lista com vírgula (bypass da auditoria)", () => {
		expect(validateSql("SELECT a.email, a.encrypted_password FROM units u, auth.users a LIMIT 50").valid).toBe(false)
		expect(validateSql('SELECT * FROM units, "auth"."mfa_factors"').valid).toBe(false)
		expect(validateSql("SELECT * FROM units u, secrets s").valid).toBe(false)
	})

	test("rejeita comentário no lugar de espaço", () => {
		expect(validateSql("SELECT * FROM/**/auth.users")).toEqual({ valid: false, error: "Comentários não são permitidos" })
		expect(validateSql("SELECT 1 FROM units -- x")).toEqual({ valid: false, error: "Comentários não são permitidos" })
	})

	test("rejeita chamada de função fora da allow-list e função qualificada", () => {
		expect(validateSql("SELECT access_control.change_module_permission('00000000-0000-0000-0000-000000000000','sisub','grant') FROM units").valid).toBe(false)
		expect(validateSql("SELECT pg_sleep(600) FROM units").valid).toBe(false)
		expect(validateSql("SELECT set_config('role','postgres',true) FROM units").valid).toBe(false)
		expect(validateSql("SELECT * FROM units WHERE id = current_setting('x')::int").valid).toBe(false)
	})

	test("rejeita schema não liberado mesmo com nome de tabela permitido", () => {
		expect(validateSql("SELECT * FROM auth.units").valid).toBe(false)
		expect(validateSql("SELECT * FROM kitchen.recipes LIMIT 5").valid).toBe(true)
	})

	test("rejeita CTE que só mascara tabela proibida", () => {
		expect(validateSql("WITH users AS (SELECT * FROM auth.users) SELECT * FROM users").valid).toBe(false)
	})

	test("rejeita string com escape e dollar-quoting", () => {
		expect(validateSql("SELECT E'\\x' FROM units").valid).toBe(false)
		expect(validateSql("SELECT $x$a$x$ FROM units").valid).toBe(false)
	})

	test("aceita as consultas analíticas usuais", () => {
		const ok = [
			"SELECT date_trunc('week', date) AS semana, count(*) AS n FROM meal_presences WHERE date >= CURRENT_DATE - interval '30 days' GROUP BY 1 ORDER BY 1",
			"SELECT extract(month FROM service_date) AS mes, sum(forecasted_headcount)::numeric(10,2) AS total FROM daily_menu GROUP BY 1",
			"SELECT u.display_name, count(mp.id) FROM units u JOIN mess_halls mh ON mh.unit_id = u.id LEFT JOIN meal_presences mp ON mp.mess_hall_id = mh.id GROUP BY u.display_name ORDER BY 2 DESC LIMIT 10",
			"SELECT k.display_name, count(*) FILTER (WHERE d.status = 'PUBLISHED') FROM kitchen k, daily_menu d WHERE d.kitchen_id = k.id GROUP BY 1",
			"SELECT kitchen_id, row_number() OVER (PARTITION BY kitchen_id ORDER BY service_date) FROM daily_menu WHERE kitchen_id IN (SELECT id FROM kitchen) LIMIT 20",
			"SELECT CAST(net_quantity AS numeric) FROM recipe_ingredients WHERE recipe_id IN (1, 2)",
		]
		for (const sql of ok) expect(validateSql(sql), sql).toEqual({ valid: true })
	})
})
