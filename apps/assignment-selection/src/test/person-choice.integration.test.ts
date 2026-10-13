import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createServiceClient, describeIntegration, getTestEnv } from "./supabase"

// `assignment_selection.apply_person_choice` contra o banco compartilhado. Cobre a regra da
// migration 20261011120000: a escolha não tem teto (confirmar numa OM que já completou
// passa) e continua recusando OM fora do quadro da edição; e a de 20261011130000: com
// `p_expected`, `apply_person_choice` e `call_person` recusam (40001) quando a linha não
// está como a tela viu, e `call_person` deixa um card só aceso na edição. Tudo nasce numa edição inativa
// com o prefixo `zzz-test-audit-` (fora do telão) e sai no afterAll.

const TEST_PREFIX = "zzz-test-audit-"
const env = getTestEnv()

describeIntegration("assignment_selection · apply_person_choice (prod DB, com cleanup)", () => {
	if (!env) {
		it("env de integração ausente — pulando", () => {
			expect(env).toBeNull()
		})
		return
	}

	const service = createServiceClient(env)
	const om = `${TEST_PREFIX}OM`
	let editionId = ""
	const personIds: number[] = []

	beforeAll(async () => {
		const { data: edition, error } = await service
			.from("edition")
			.insert({ name: `${TEST_PREFIX}choice-${Date.now()}`, active: false })
			.select("id")
			.single()
		if (error) throw error
		editionId = edition.id

		const { error: vacancyError } = await service.from("vacancy").insert({ edition_id: editionId, om, estado: "DF", total_vagas: 1 })
		if (vacancyError) throw vacancyError

		const { data: persons, error: personError } = await service
			.from("person")
			.insert([
				{ edition_id: editionId, classificacao: 1, nome: `${TEST_PREFIX}A` },
				{ edition_id: editionId, classificacao: 2, nome: `${TEST_PREFIX}B` },
			])
			.select("id")
			.order("classificacao")
		if (personError) throw personError
		personIds.push(...persons.map((p) => p.id))
	})

	afterAll(async () => {
		if (!editionId) return
		await service.from("person").delete().eq("edition_id", editionId)
		await service.from("vacancy").delete().eq("edition_id", editionId)
		await service.from("edition").delete().eq("id", editionId)
	})

	it("confirma acima de total_vagas: a OM com 1 vaga recebe o segundo militar", async () => {
		for (const id of personIds) {
			const { data, error } = await service.rpc("apply_person_choice", { p_person_id: id, p_changes: { localidade: om, estado: "DF", hide_card: true } })
			expect(error).toBeNull()
			expect(data?.hide_card).toBe(true)
			expect(data?.localidade).toBe(om)
		}
	})

	it("recusa OM fora do quadro da edição", async () => {
		const { error } = await service.rpc("apply_person_choice", {
			p_person_id: personIds[0],
			p_changes: { localidade: `${TEST_PREFIX}fora-do-quadro` },
		})
		expect(error?.code).toBe("23514")
	})

	it("recusa com 40001 quando a linha não está como a tela viu (p_expected)", async () => {
		// `p_expected` ainda não está nos tipos gerados; o cast some depois do `db:types`.
		const rpc = service.rpc.bind(service) as unknown as (
			fn: "apply_person_choice",
			args: { p_person_id: number; p_changes: Record<string, unknown>; p_expected: Record<string, unknown> | null }
		) => PromiseLike<{ data: { hide_card: boolean } | null; error: { code?: string } | null }>

		// O primeiro teste confirmou os dois; uma tela velha que ainda o via aberto tenta reabrir.
		const stale = await rpc("apply_person_choice", { p_person_id: personIds[0], p_changes: { hide_card: false }, p_expected: { hide_card: false } })
		expect(stale.error?.code).toBe("40001")

		const fresh = await rpc("apply_person_choice", {
			p_person_id: personIds[0],
			p_changes: { hide_card: false },
			p_expected: { hide_card: true, localidade: om },
		})
		expect(fresh.error).toBeNull()
		expect(fresh.data?.hide_card).toBe(false)
	})

	describe("call_person", () => {
		// `call_person` ainda não está nos tipos gerados; o cast some depois do `db:types`.
		const callPerson = (args: { p_edition_id: string; p_person_id: number; p_expected: Record<string, unknown> | null }) =>
			(
				service.rpc.bind(service) as unknown as (
					fn: "call_person",
					a: typeof args
				) => PromiseLike<{ data: { id: number; show_card: boolean } | null; error: { code?: string } | null }>
			)("call_person", args)

		const shownIds = async () => {
			const { data, error } = await service.from("person").select("id").eq("edition_id", editionId).eq("show_card", true)
			if (error) throw error
			return (data ?? []).map((p) => p.id)
		}

		it("acende só o card do chamado na edição", async () => {
			const first = await callPerson({ p_edition_id: editionId, p_person_id: personIds[1], p_expected: null })
			expect(first.error).toBeNull()
			expect(await shownIds()).toEqual([personIds[1]])

			const second = await callPerson({ p_edition_id: editionId, p_person_id: personIds[0], p_expected: null })
			expect(second.error).toBeNull()
			expect(second.data?.show_card).toBe(true)
			expect(await shownIds()).toEqual([personIds[0]])
		})

		it("recusa com 40001 quando o chamado não está como a tela viu", async () => {
			// O 1º está no telão (teste anterior); uma tela velha o via fora dele.
			const { error } = await callPerson({ p_edition_id: editionId, p_person_id: personIds[0], p_expected: { show_card: false } })
			expect(error?.code).toBe("40001")
			expect(await shownIds()).toEqual([personIds[0]])
		})

		it("recusa militar de outra edição", async () => {
			const { error } = await callPerson({ p_edition_id: crypto.randomUUID(), p_person_id: personIds[0], p_expected: null })
			expect(error?.code).toBe("P0002")
		})
	})
})
