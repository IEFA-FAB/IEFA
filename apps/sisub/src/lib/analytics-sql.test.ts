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

	test("o arranchamento é lido pelo nome do glossário, não pelo nome antigo da tabela", () => {
		expect(validateSql("SELECT meal, count(*) FROM arranchamento WHERE will_eat GROUP BY meal")).toEqual({ valid: true })
		expect(validateSql("SELECT * FROM meal_forecasts LIMIT 10")).toEqual({
			valid: false,
			error: "Tabela não permitida: meal_forecasts",
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

	test("rejeita relação em lista com vírgula depois de JOIN ... ON (bypass da verificação)", () => {
		expect(validateSql("SELECT d.email, d.saram FROM (SELECT 1) x JOIN (SELECT 1) y ON true, core.user_data d ORDER BY d.email OFFSET 500").valid).toBe(false)
		expect(validateSql("SELECT * FROM units u JOIN kitchen k USING (id), auth.users a").valid).toBe(false)
	})

	test("rejeita TABLE e WINDOW", () => {
		expect(validateSql("SELECT * FROM (TABLE auth.users) t").valid).toBe(false)
		expect(validateSql("SELECT count(*) OVER user_data FROM units WINDOW user_data AS ()").valid).toBe(false)
	})

	test("JOIN seguido de vírgula para tabela liberada continua aceito", () => {
		expect(validateSql("SELECT * FROM units u JOIN mess_halls m ON m.unit_id = u.id, kitchen k WHERE k.unit_id = u.id LIMIT 5")).toEqual({
			valid: true,
		})
	})

	test("rejeita a primeira relação de um JOIN entre parênteses (bypass da revisão)", () => {
		expect(validateSql("SELECT u.email FROM (auth.users u CROSS JOIN units x) LIMIT 5").valid).toBe(false)
		expect(validateSql("SELECT d.email FROM (core.user_data d JOIN units x ON true)").valid).toBe(false)
		expect(validateSql("SELECT 1 FROM units WHERE EXISTS (SELECT 1 FROM ((core.user_data d JOIN units z ON true)))").valid).toBe(false)
		expect(validateSql("SELECT * FROM (units u JOIN mess_halls m ON m.unit_id = u.id) LIMIT 5")).toEqual({ valid: true })
	})

	test("aceita rótulo entre aspas com acento e as funções de data comuns", () => {
		expect(validateSql("SELECT count(*) AS \"Total de refeições\" FROM meal_presences WHERE date >= now() - interval '7 days'")).toEqual({
			valid: true,
		})
		expect(validateSql("SELECT date(created_at), position('a' in display_name) FROM units")).toEqual({ valid: true })
	})
})

/** Uma recusa por mensagem de erro, com o texto exato: o modelo lê a mensagem para corrigir a consulta. */
describe("validateSql: cada mensagem de recusa", () => {
	const refuse = (sql: string, error: string) => expect(validateSql(sql), sql).toEqual({ valid: false, error })

	test("checagens de texto, antes de tokenizar", () => {
		refuse("", "SQL vazio")
		refuse(`SELECT ${"a".repeat(4000)}`, "SQL muito longa")
		refuse("EXPLAIN SELECT 1", "Apenas SELECT permitido")
		refuse("  values (1)  ", "Apenas SELECT permitido")
		refuse("SELECT ';' FROM units", "Múltiplas instruções não são permitidas")
		refuse("SELECT 1 FROM units;;", "Múltiplas instruções não são permitidas")
	})

	test("o ; final único é aparado e o espaço em volta também", () => {
		expect(validateSql("  select 1 from units;  ")).toEqual({ valid: true })
		expect(validateSql("with x as (select 1) select * from x")).toEqual({ valid: true })
	})

	test("o tamanho conta depois de aparar espaço e o ; final", () => {
		const exact = `SELECT ${"a".repeat(4000 - "SELECT ".length)}`
		expect(validateSql(`  ${exact};  `)).toEqual({ valid: true })
	})

	test("keyword proibida, na ordem da lista e em qualquer caixa", () => {
		refuse("SELECT * FROM units WHERE x = 'insert'", "Keyword proibida: INSERT")
		refuse("SELECT 1 FROM units WHERE 'drop' = 'delete'", "Keyword proibida: DELETE")
		refuse("SELECT 'a$$b' FROM units", "Keyword proibida: $$")
		refuse("SELECT * INTO t FROM units", "Keyword proibida: INTO")
		refuse("SELECT * FROM units, LATERAL (SELECT 1) x", "Keyword proibida: LATERAL")
		refuse("SELECT * FROM units FOR UPDATE", "Keyword proibida: UPDATE")
		refuse("SELECT 1 FROM units WHERE set_x = 1 OR 1 = 1 AND 'SET' = 'x'", "Keyword proibida: SET")
		refuse("SELECT * FROM (TABLE units) t", "Keyword proibida: TABLE")
		refuse("SELECT count(*) OVER w FROM units WINDOW w AS ()", "Keyword proibida: WINDOW")
		// Palavra inteira: `updated_at` e `settings` não casam com UPDATE/SET.
		expect(validateSql("SELECT updated_at, settings FROM units")).toEqual({ valid: true })
	})

	test("tokenizador", () => {
		refuse("SELECT 1 /* x */ FROM units", "Comentários não são permitidos")
		refuse("SELECT $1 FROM units", "Caractere não permitido: $")
		refuse("SELECT \\x FROM units", "Caractere não permitido: \\")
		// Dentro de string o caractere é conteúdo, não token.
		expect(validateSql("SELECT '\\' FROM units")).toEqual({ valid: true })
		refuse("SELECT `a` FROM units", "Caractere não permitido: `")
		refuse("SELECT e'x' FROM units", "Strings com prefixo não são permitidas")
		// LACUNA (caracterização, não contrato): o `&` vira token próprio, então o prefixo
		// `u&` nunca casa e `U&'…'` passa. A role restrita do banco é que segura.
		expect(validateSql("SELECT U&'x' FROM units")).toEqual({ valid: true })
		refuse("SELECT B'1', N'x' FROM units", "Strings com prefixo não são permitidas")
		refuse("SELECT 'abc FROM units", "String não terminada")
		refuse("SELECT 'it''s FROM units", "String não terminada")
		refuse('SELECT "abc FROM units', "Identificador não terminado")
		refuse('SELECT 1 AS "" FROM units', "Identificador entre aspas vazio")
		expect(validateSql("SELECT 'it''s' AS x FROM units")).toEqual({ valid: true })
	})

	test("identificador de catálogo", () => {
		refuse("SELECT * FROM units WHERE pg_backend_pid = 1", "Identificador não permitido: pg_backend_pid")
		refuse("SELECT information_schema FROM units", "Identificador não permitido: information_schema")
		// Logo depois de FROM, a relação é conferida antes de a varredura chegar ao token.
		refuse("SELECT * FROM information_schema.tables", "Tabela não permitida: tables")
		refuse('SELECT * FROM units u WHERE u."PG_X" = 1', "Identificador não permitido: pg_x")
	})

	test("referência de relação", () => {
		refuse("SELECT 1 FROM", "Relação ausente")
		refuse("SELECT 1 FROM units JOIN", "Relação ausente")
		refuse("SELECT 1 FROM 'units'", "Relação inválida: units")
		refuse("SELECT 1 FROM 5", "Relação inválida: 5")
		refuse("SELECT * FROM generate_series(1, 3)", "Função como relação não permitida: generate_series")
		refuse("SELECT * FROM core.units(1)", "Função como relação não permitida: units")
		refuse("SELECT * FROM auth.units(1)", "Função como relação não permitida: units")
		refuse("SELECT * FROM secrets", "Tabela não permitida: secrets")
		refuse("SELECT * FROM public.units", "Tabela não permitida: units")
		refuse("SELECT * FROM core.counts", "Tabela não permitida: counts")
		// Nome de CTE vale sem schema; qualificado, não é a CTE.
		refuse("WITH counts AS (SELECT 1) SELECT * FROM core.counts", "Tabela não permitida: counts")
		refuse("SELECT * FROM (SELECT 1) x, secrets s", "Tabela não permitida: secrets")
		refuse("SELECT * FROM ((secrets))", "Tabela não permitida: secrets")
		expect(validateSql("SELECT * FROM ((VALUES (1))) v")).toEqual({ valid: true })
	})

	test("FROM de EXTRACT, SUBSTRING e TRIM não é relação", () => {
		expect(validateSql("SELECT extract(year FROM date), substring(name FROM 1 FOR 3), trim(both 'x' FROM name) FROM units")).toEqual({
			valid: true,
		})
		// O desvio é só para FROM: JOIN dentro do mesmo parêntese continua conferido.
		refuse("SELECT extract(year JOIN secrets) FROM units", "Tabela não permitida: secrets")
		// E só para essas três: FROM em outra função é relação.
		refuse("SELECT lower(name FROM secrets) FROM units", "Tabela não permitida: secrets")
	})

	test("lista de relações termina nas palavras de fechamento do nível", () => {
		expect(validateSql("SELECT * FROM units WHERE id IN (1, 2) GROUP BY a, b ORDER BY a, b LIMIT 5")).toEqual({ valid: true })
		expect(validateSql("SELECT a, b FROM units u WHERE u.id = 1")).toEqual({ valid: true })
		refuse("SELECT * FROM units u JOIN kitchen k ON (k.unit_id = u.id), secrets s", "Tabela não permitida: secrets")
		// Caracterização: `)` sem par no nível zero encerra a lista do FROM (a profundidade
		// não desce abaixo de zero). O Postgres recusa o parêntese sem par de todo jeito.
		expect(validateSql("SELECT * FROM units) , secrets")).toEqual({ valid: true })
	})

	test("chamada de função", () => {
		refuse("SELECT core.count(1) FROM units", "Função qualificada não permitida: count")
		refuse("SELECT set_config('a', 'b', true) FROM units", "Função não permitida: set_config")
		refuse("SELECT current_setting('x') FROM units", "Função não permitida: current_setting")
		expect(validateSql("SELECT x::varchar(10), CAST(y AS numeric(10, 2)) FROM units")).toEqual({ valid: true })
		expect(validateSql("SELECT 1 FROM units WHERE id IN (SELECT 1) AND exists (SELECT 1)")).toEqual({ valid: true })
	})

	test("LIMIT: confere toda ocorrência no texto, inclusive dentro de string", () => {
		refuse("SELECT * FROM (SELECT * FROM units LIMIT 900) x LIMIT 10", "LIMIT máximo permitido: 500")
		refuse("SELECT 'limit 501' FROM units", "LIMIT máximo permitido: 500")
		expect(validateSql("SELECT * FROM units LIMIT 500")).toEqual({ valid: true })
	})

	test("o primeiro erro encontrado é o que volta", () => {
		// Tabela antes do LIMIT; tokenizador antes da tabela; keyword antes do tokenizador.
		refuse("SELECT * FROM secrets LIMIT 900", "Tabela não permitida: secrets")
		refuse("SELECT * FROM secrets WHERE x = $1", "Caractere não permitido: $")
		refuse("SELECT * FROM secrets WHERE x = $1 OR 'delete' = ''", "Keyword proibida: DELETE")
		refuse("SELECT pg_sleep(1) FROM secrets", "Identificador não permitido: pg_sleep")
		refuse("SELECT foo(1) FROM secrets", "Função não permitida: foo")
	})
})
