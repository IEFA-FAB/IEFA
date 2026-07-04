/**
 * Contrato de segurança das server functions de escrita do rumaer.
 *
 * Garante que TODA operação que muta o regulamento (ou emite URL de upload)
 * passa por um gate PBAC — em vez de só `requireAuth` (qualquer logado) como antes.
 * É um teste estático de fonte (não exercita a rede): barato e à prova de regressão
 * quando alguém adiciona uma nova server function e esquece o gate.
 *
 * Rode com: `bun test src/server/admin.security.test.ts` (dentro de apps/rumaer).
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/** Extrai os blocos `export const XxxFn = createServerFn(...)...` de um arquivo. */
function serverFnSegments(file: string): { name: string; body: string }[] {
	const src = readFileSync(join(import.meta.dir, file), "utf8")
	const parts = src.split(/export const /g).slice(1)
	return parts
		.map((p) => {
			const name = p.slice(0, p.indexOf(" "))
			return { name, body: p }
		})
		.filter((s) => s.body.includes("createServerFn"))
}

describe("admin.fn.ts — toda server function exige requireUniformEditor (rumaer L2)", () => {
	const segments = serverFnSegments("admin.fn.ts")

	test("há server functions para verificar", () => {
		expect(segments.length).toBeGreaterThan(10)
	})

	for (const { name, body } of segments) {
		test(`${name} chama requireUniformEditor`, () => {
			expect(body).toContain("requireUniformEditor()")
		})
	}
})

describe("storage.fn.ts — upload exige gate; downloads permanecem públicos", () => {
	const segments = serverFnSegments("storage.fn.ts")
	const upload = segments.find((s) => s.name === "getSignedUploadUrlFn")
	const publicDownloads = segments.filter((s) => s.name === "getSignedImageUrlFn" || s.name === "getUniformPreviewImagesFn")

	test("getSignedUploadUrlFn chama requireUniformEditor", () => {
		expect(upload?.body).toContain("requireUniformEditor()")
	})

	for (const s of publicDownloads) {
		test(`${s.name} permanece público (sem gate)`, () => {
			expect(s.body).not.toContain("requireUniformEditor")
			expect(s.body).not.toContain("requireRumaerAdmin")
		})
	}
})

describe("permissions.fn.ts — administração exige requireRumaerAdmin (rumaer L3)", () => {
	const segments = serverFnSegments("permissions.fn.ts")
	const adminFns = ["searchUsersByEmailFn", "fetchUserRumaerPermissionsFn", "grantRumaerPermissionFn", "revokeRumaerPermissionFn"]

	for (const name of adminFns) {
		test(`${name} chama requireRumaerAdmin`, () => {
			const seg = segments.find((s) => s.name === name)
			expect(seg?.body).toContain("requireRumaerAdmin()")
		})
	}

	test("fetchMyRumaerPermissionsFn resolve pela sessão (requireUserId), não confia no cliente", () => {
		const seg = segments.find((s) => s.name === "fetchMyRumaerPermissionsFn")
		expect(seg?.body).toContain("requireUserId()")
	})
})
