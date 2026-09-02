import { describe, expect, it } from "bun:test"
import { newDocument } from "./draft"
import { missingProfileFields, seedFromProfile } from "./writer-profile"

const profile = {
	om_name: "Instituto de Economia e Finanças da Aeronáutica",
	om_acronym: "IEFA",
	om_sector: "Gabinete",
	om_address: "Av. Marechal Câmara, 233",
	om_phone: "(21) 2101-0000",
	om_email: "gabinete@fab.mil.br",
	signer_name: "Fulano de Tal",
	signer_rank: "Cel",
	signer_quadro: "Int",
	signer_position: "Diretor",
	city: "Rio de Janeiro",
	nup_prefix: "68000",
}

describe("dados fixos do redator", () => {
	it("preenche o documento novo com OM, signatário e localidade", () => {
		const document = seedFromProfile(newDocument(), profile)
		expect(document.om.name).toBe("Instituto de Economia e Finanças da Aeronáutica")
		expect(document.signer.rank).toBe("Cel")
		expect(document.city).toBe("Rio de Janeiro")
		expect(document.signer.om).toBe("IEFA")
	})

	it("não sugere sequencial do setor", () => {
		// Contador vivo da seção: número sugerido errado só aparece depois do despacho.
		const document = seedFromProfile(newDocument(), profile)
		expect(document.numbering.sequence).toBeNull()
	})

	it("o prefixo do NUP entra como começo do campo, não como NUP pronto", () => {
		expect(seedFromProfile(newDocument(), profile).nup).toBe("68000")
	})

	it("sem perfil, devolve o documento intacto", () => {
		const document = newDocument()
		expect(seedFromProfile(document, null)).toEqual(document)
	})

	it("lista o que falta no perfil, para a tela convidar em vez de acusar", () => {
		expect(missingProfileFields(null)).toEqual(["OM", "signatário", "localidade"])
		expect(missingProfileFields({ ...profile, city: "  " })).toEqual(["localidade"])
		expect(missingProfileFields(profile)).toEqual([])
	})
})
