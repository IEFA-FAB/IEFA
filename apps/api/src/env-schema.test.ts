import { describe, expect, test } from "bun:test"
import { envSchema } from "./env-schema.ts"

const base = { API_SUPABASE_URL: "http://127.0.0.1:54321", API_SUPABASE_SERVICE_ROLE_KEY: "k" }

describe("ADMIN_SECRET", () => {
	test("segredo curto derruba o boot, em vez de só avisar", () => {
		for (const secret of ["a", "x".repeat(31)]) {
			expect(envSchema.safeParse({ ...base, ADMIN_SECRET: secret }).success).toBe(false)
		}
	})

	test("32 caracteres ou mais passam (o de produção tem 64)", () => {
		expect(envSchema.safeParse({ ...base, ADMIN_SECRET: "x".repeat(32) }).success).toBe(true)
		expect(envSchema.safeParse({ ...base, ADMIN_SECRET: "x".repeat(64) }).success).toBe(true)
	})
})
