/**
 * Medida da agregação da lista de pessoas no volume do auge: ~1000 pessoas, 1 a 4 papéis
 * cada, em algumas OMs com hierarquia de apoio, com globais, bloqueios e prazos. É a parte da
 * `listAlphaPeopleFn` que roda no servidor depois das leituras — e a que cresce com o número
 * de linhas. Dados sintéticos e determinísticos (PRNG com semente fixa).
 *
 * Os tetos são folgados de propósito (10× o medido numa máquina de desenvolvimento): o teste
 * pega a regressão de complexidade (um O(n²) acidental), não a variação de CPU do CI. Os
 * números medidos saem no console (`bun test src/lib/alpha/people.perf.test.ts`).
 */

import { describe, expect, test } from "bun:test"
import type { UnitSupportEdge } from "@iefa/pbac"
import { ALPHA_ADMIN_MODULES, ALPHA_ROLE_GRANTS, annotateDenyImpact } from "./admin-access"
import { type AlphaGrant, aggregatePeople, type PeopleQuery, type PersonIdentity, queryPeople } from "./people"

const NOW = Date.parse("2026-09-19T12:00:00Z")
const DAY = 86_400_000

/** mulberry32 — determinístico, para o número medido ser do mesmo conjunto a cada execução. */
function prng(seed: number) {
	let a = seed
	return () => {
		a |= 0
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

// Dois apoios (GAP-SJ e GAP-RJ) com três apoiadas cada, e duas OMs soltas.
const GRAPH: UnitSupportEdge[] = [
	{ id: 26, supporting_unit_id: null },
	{ id: 100, supporting_unit_id: 26 },
	{ id: 101, supporting_unit_id: 26 },
	{ id: 102, supporting_unit_id: 26 },
	{ id: 10, supporting_unit_id: null },
	{ id: 110, supporting_unit_id: 10 },
	{ id: 111, supporting_unit_id: 10 },
	{ id: 112, supporting_unit_id: 10 },
	{ id: 200, supporting_unit_id: null },
	{ id: 201, supporting_unit_id: null },
]
const UNIT_IDS = GRAPH.map((edge) => edge.id)

function synthesize(peopleCount: number) {
	const random = prng(20260919)
	const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)] as T
	const grants: Array<Omit<AlphaGrant, "denyImpact">> = []
	const identities = new Map<string, PersonIdentity>()
	const lastChanges = new Map<string, string>()

	for (let i = 0; i < peopleCount; i++) {
		const userId = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
		identities.set(userId, {
			email: `pessoa${i}@fab.mil.br`,
			name: `${pick(["1T", "2T", "Cap", "Maj", "SO", "1S"])} Pessoa ${i}`,
			nrOrdem: String(1_000_000 + i),
		})
		if (random() < 0.8) lastChanges.set(userId, new Date(NOW - Math.floor(random() * 200) * DAY).toISOString())

		const roleCount = 1 + Math.floor(random() * 4)
		const modules = [...ALPHA_ADMIN_MODULES].sort(() => random() - 0.5).slice(0, roleCount)
		const home = random() < 0.05 ? null : pick(UNIT_IDS)
		for (const module of modules) {
			// O papel na OM "de casa" e, em 40% dos casos, também numa segunda OM.
			const units = new Set(random() < 0.4 ? [home, pick(UNIT_IDS)] : [home])
			for (const unitId of units) {
				const level = module === ALPHA_ROLE_GRANTS.admin.module ? 3 : 1
				const expiresAt = random() < 0.1 ? new Date(NOW + (Math.floor(random() * 120) - 20) * DAY).toISOString() : null
				grants.push({
					userId,
					module,
					unitId,
					unitCode: unitId === null ? null : `OM-${unitId}`,
					level,
					effect: "allow",
					expiresAt,
					source: "inline",
					inherited: false,
				})
			}
		}
		// 3%: bloqueio — metade global (no copiloto), metade numa OM.
		if (random() < 0.03) {
			const unitId = random() < 0.5 ? null : pick(UNIT_IDS)
			for (const module of unitId === null ? ALPHA_ADMIN_MODULES : [pick(modules)]) {
				grants.push({
					userId,
					module,
					unitId,
					unitCode: unitId === null ? null : `OM-${unitId}`,
					level: 0,
					effect: "deny",
					expiresAt: null,
					source: "inline",
					inherited: false,
				})
			}
		}
	}
	return { grants, identities, lastChanges }
}

function time<T>(fn: () => T, runs = 5): { ms: number; value: T } {
	let value = fn()
	const started = performance.now()
	for (let i = 0; i < runs; i++) value = fn()
	return { ms: (performance.now() - started) / runs, value }
}

describe("agregação da lista de pessoas no auge (1000 pessoas)", () => {
	const { grants, identities, lastChanges } = synthesize(1000)
	const base: PeopleQuery = { sort: "name", dir: "asc", page: 1, size: 50 }

	test("anotar, agregar e recortar cabem folgado numa requisição", () => {
		const annotate = time(() => annotateDenyImpact(grants, GRAPH, NOW))
		const aggregate = time(() => aggregatePeople(annotate.value, identities, lastChanges, NOW))
		const people = aggregate.value

		const scenarios: Array<[string, PeopleQuery]> = [
			["nome A-Z, página 1 de 50", base],
			["alteração recente, página 1 de 100", { ...base, sort: "recent", dir: "desc", size: 100 }],
			["busca 'pessoa 12'", { ...base, q: "pessoa 12" }],
			["papel ACI + OM 26", { ...base, role: "aci", unit: 26 }],
			["situação: anulado por bloqueio", { ...base, status: "anulado" }],
			["situação: expira em breve", { ...base, status: "expira" }],
			["última página (25 por página)", { ...base, page: 40, size: 25 }],
		]
		const measured = scenarios.map(([label, query]) => {
			const run = time(() => queryPeople(people, query, NOW))
			return { label, ms: run.ms, total: run.value.total, rows: run.value.rows.length, bytes: JSON.stringify(run.value.rows).length }
		})

		const allBytes = JSON.stringify(annotate.value).length
		console.log(
			[
				`linhas de grant: ${grants.length} · pessoas: ${people.length}`,
				`annotateDenyImpact: ${annotate.ms.toFixed(2)} ms · aggregatePeople: ${aggregate.ms.toFixed(2)} ms`,
				`todas as linhas em JSON (o que a tela antiga recebia): ${(allBytes / 1024).toFixed(0)} KiB`,
				...measured.map((m) => `  ${m.label}: ${m.ms.toFixed(2)} ms · total ${m.total} · ${m.rows} linhas · ${(m.bytes / 1024).toFixed(1)} KiB`),
			].join("\n")
		)

		expect(people).toHaveLength(1000)
		expect(grants.length).toBeGreaterThan(3000)
		expect(annotate.ms).toBeLessThan(500)
		expect(aggregate.ms).toBeLessThan(500)
		for (const m of measured) {
			expect(m.ms).toBeLessThan(300)
			// A página nunca carrega mais do que o tamanho pedido.
			expect(m.rows).toBeLessThanOrEqual(100)
		}
		// Página de 50 pessoas: uma fração pequena do que ia inteiro para o navegador.
		const firstPage = measured[0]
		expect(firstPage?.rows).toBe(50)
		expect(firstPage?.bytes ?? Number.POSITIVE_INFINITY).toBeLessThan(allBytes / 5)
	})
})
