import { GENERIC_DB_ERROR_MESSAGE } from "@iefa/sisub-domain/types"
import { describe, expect, test } from "vitest"
import { DB_DIAGNOSTIC_REPLACEMENT, redactDbDiagnostics } from "./db-diagnostics"

describe("redactDbDiagnostics", () => {
	test("corta o diagnóstico do banco e mantém o contexto da server fn", () => {
		expect(redactDbDiagnostics("Erro ao listar empenhos: column empenho.valor_x does not exist")).toBe(`Erro ao listar empenhos: ${DB_DIAGNOSTIC_REPLACEMENT}`)
	})

	test("valor da linha que a constraint cita não passa", () => {
		const out = redactDbDiagnostics(
			'Erro ao gravar os lançamentos: duplicate key value violates unique constraint "count_line_pkey" Key (id)=(42) already exists.'
		)
		expect(out).toBe(`Erro ao gravar os lançamentos: ${DB_DIAGNOSTIC_REPLACEMENT}`)
		expect(out).not.toContain("count_line_pkey")
	})

	test("diagnóstico entre parênteses: o contexto antes dele fica", () => {
		expect(redactDbDiagnostics('Lote não aplicado (relation "finance.x" does not exist) e não marcado como falho')).toBe(
			`Lote não aplicado: ${DB_DIAGNOSTIC_REPLACEMENT}`
		)
	})

	test("PostgREST (cache de schema, código PGRST)", () => {
		expect(redactDbDiagnostics("Erro ao carregar a contagem: Could not find the table 'inventory.count' in the schema cache")).toBe(
			`Erro ao carregar a contagem: ${DB_DIAGNOSTIC_REPLACEMENT}`
		)
		expect(redactDbDiagnostics("PGRST116")).toBe(GENERIC_DB_ERROR_MESSAGE)
	})

	test("sem contexto antes, a mensagem genérica", () => {
		expect(redactDbDiagnostics('new row for relation "lot" violates check constraint "lot_quantity_check"')).toBe(GENERIC_DB_ERROR_MESSAGE)
	})

	test("RAISE de função SQL (regra de negócio em português) passa como veio", () => {
		expect(redactDbDiagnostics("Erro ao lançar o ajuste: Quantidade deve ser positiva")).toBeNull()
		expect(redactDbDiagnostics("Lote não encontrado. Liquide só o que foi recebido (Lei 4.320, art. 63).")).toBeNull()
		expect(redactDbDiagnostics("O empenho 2026NE000123 já está no sistema: abra-o em Empenhos para completar")).toBeNull()
	})
})
