import { afterAll, beforeAll, expect, it } from "vitest"
import { createServiceClient, describeIntegration, getTestEnv } from "./supabase"

// `assignment_selection.apply_person_choice` contra o banco compartilhado. Cobre a regra da
// migration 20261011120000: a escolha não tem teto (confirmar numa OM que já completou
// passa) e continua recusando OM fora do quadro da edição. Tudo nasce numa edição inativa
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
})
