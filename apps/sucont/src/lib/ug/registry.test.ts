import { describe, expect, it } from "bun:test"
import { getUgHierarchy, UG_HIERARCHY } from "#/analistasaldoalongado/utils/hierarchy"
import { UG_MAPPING } from "#/auditor/ugMapping"
import { getOrganizacao } from "#/lib/analista/organizacao"
import { UG_DATA } from "#/lib/cruzamento/ugData"
import {
	CONFERENTES,
	extractCodigoUg,
	getConferente,
	getUg,
	getUgFromText,
	UG_INATIVAS_SIAFI,
	UG_SIGLA_A_CONFIRMAR,
	UNIDADES_GESTORAS,
} from "#/lib/ug/registry"
import { UG_NAMES } from "#/sacdgc/ugs"
import { CONFERENTES_MAPPING, UG_INFO } from "#/subitens/constants"

const CODIGOS = Object.keys(UNIDADES_GESTORAS)

describe("registro de UG", () => {
	it("tem código de 6 dígitos, sigla, ODS, órgão superior e título do SIAFI em toda entrada", () => {
		for (const [codigo, ug] of Object.entries(UNIDADES_GESTORAS)) {
			expect(codigo, `código ${codigo}`).toMatch(/^\d{6}$/)
			expect(ug.sigla.trim(), `sigla de ${codigo}`).not.toBe("")
			expect(ug.ods.trim(), `ODS de ${codigo}`).not.toBe("")
			expect(ug.orgaoSuperior.trim(), `órgão superior de ${codigo}`).not.toBe("")
			expect(ug.tituloSiafi.trim(), `título SIAFI de ${codigo}`).not.toBe("")
		}
	})

	it("não repete sigla entre UGs — a sigla é o que aparece na mensagem enviada", () => {
		const porSigla = new Map<string, string[]>()
		for (const [codigo, ug] of Object.entries(UNIDADES_GESTORAS)) {
			porSigla.set(ug.sigla, [...(porSigla.get(ug.sigla) ?? []), codigo])
		}
		const duplicadas = [...porSigla].filter(([, codigos]) => codigos.length > 1)
		expect(duplicadas).toEqual([])
	})

	it("mantém rastreável a lista de siglas pendentes de confirmação", () => {
		// Se a sigla for corrigida, o código sai desta lista — mas enquanto estiver
		// aqui, ele precisa existir no registro, senão a pendência some sem ser vista.
		for (const codigo of UG_SIGLA_A_CONFIRMAR) {
			expect(UNIDADES_GESTORAS[codigo], `UG ${codigo} pendente de confirmação sumiu do registro`).toBeDefined()
		}
	})

	it("deriva as UGs inativas do próprio registro", () => {
		for (const codigo of UG_INATIVAS_SIAFI) {
			expect(UNIDADES_GESTORAS[codigo].ativoSiafi).toBe(false)
		}
		const inativasNoRegistro = CODIGOS.filter((c) => UNIDADES_GESTORAS[c].ativoSiafi === false)
		expect([...UG_INATIVAS_SIAFI].sort()).toEqual(inativasNoRegistro.sort())
	})
})

describe("consultas", () => {
	it("resolve por código exato", () => {
		expect(getUg("120062")?.sigla).toBe("BASP")
		expect(getUg(" 120062 ")?.sigla).toBe("BASP")
		expect(getUg("999999")).toBeUndefined()
	})

	it("extrai o código de UG das formas que o Tesouro Gerencial usa", () => {
		expect(getUgFromText("120062")?.sigla).toBe("BASP")
		expect(getUgFromText("120062 - BASE AEREA DE SAO PAULO")?.sigla).toBe("BASP")
		expect(getUgFromText("UG 120062")?.sigla).toBe("BASP")
		expect(getUgFromText("sem código")).toBeUndefined()
		expect(extractCodigoUg("120062 - BASP")).toBe("120062")
		expect(extractCodigoUg("nada")).toBe("nada")
	})

	it("devolve conferente atribuído ou o marcador, nunca undefined", () => {
		expect(getConferente("120062")).toBe("1T ÉRIKA VICENTE")
		expect(getConferente("120062 - BASP")).toBe("1T ÉRIKA VICENTE")
		expect(getConferente("999999")).toBe("NÃO ATRIBUÍDO")
	})

	it("lista conferentes distintos e ordenados", () => {
		expect(CONFERENTES.length).toBeGreaterThan(0)
		expect([...CONFERENTES]).toEqual([...CONFERENTES].sort())
		expect(new Set(CONFERENTES).size).toBe(CONFERENTES.length)
	})
})

describe("tabelas derivadas", () => {
	// Estas sete tabelas eram literais independentes e já haviam divergido. Agora
	// todas saem do registro; o teste existe para que a próxima cópia não passe.
	it("cobrem exatamente as mesmas UGs do registro", () => {
		expect(Object.keys(UG_INFO).sort()).toEqual(CODIGOS.sort())
		expect(Object.keys(UG_MAPPING).sort()).toEqual(CODIGOS.sort())
		expect(Object.keys(UG_DATA).sort()).toEqual(CODIGOS.sort())
		expect(Object.keys(UG_HIERARCHY).sort()).toEqual(CODIGOS.sort())
	})

	it("concordam no ODS, no órgão superior e no nome de cada UG", () => {
		for (const codigo of CODIGOS) {
			const ug = UNIDADES_GESTORAS[codigo]
			expect(UG_INFO[codigo]).toEqual({ sigla: ug.sigla, ods: ug.ods, orgaoSuperior: ug.orgaoSuperior })
			expect(UG_MAPPING[codigo]).toEqual({ ods: ug.ods, orgaoSuperior: ug.orgaoSuperior })
			expect(UG_DATA[codigo]).toEqual({ codigo, nome: ug.sigla, ods: ug.ods, orgaoSuperior: ug.orgaoSuperior })
			expect(getUgHierarchy(codigo)).toEqual({ ug: codigo, nome: ug.sigla, ods: ug.ods, orgaoSuperior: ug.orgaoSuperior })
			expect(getOrganizacao(codigo)).toMatchObject({ nome: ug.sigla, ods: ug.ods, orgaoSuperior: ug.orgaoSuperior })
		}
	})

	it("mapeia conferente para as mesmas UGs em toda parte", () => {
		const comConferente = CODIGOS.filter((c) => UNIDADES_GESTORAS[c].conferente)
		expect(Object.keys(CONFERENTES_MAPPING).sort()).toEqual(comConferente.sort())
	})

	it("marca DIREF, SUCONT e SUCONV como setoriais e a 120999 como STN", () => {
		expect(getOrganizacao("120002").isSetorial).toBe(true)
		expect(getOrganizacao("120701").isSetorial).toBe(true)
		expect(getOrganizacao("120702").isSetorial).toBe(true)
		expect(getOrganizacao("120062").isSetorial).toBe(false)
		expect(getOrganizacao("120999").isSTN).toBe(true)
	})

	it("degrada para OUTROS quando a UG não é conhecida, em vez de quebrar", () => {
		expect(getOrganizacao("999999")).toEqual({ nome: "UG 999999", ods: "OUTROS", orgaoSuperior: "OUTROS", isSetorial: false, isSTN: false })
		expect(getUgHierarchy("999999").nome).toBe("Desconhecida")
	})
})

describe("consistência com o cadastro do SAC-DGC", () => {
	// `sacdgc/ugs.ts` mantém a própria relação de UGs porque carrega o GRUPO DE
	// COMPARAÇÃO institucional do DGC e alcança unidades fora do escopo do RAC
	// (120038, 120300, …). O que as duas tabelas têm em comum é o título oficial da
	// UG, e é justamente isso que divergiria em silêncio.
	const normalizar = (titulo: string) =>
		titulo
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toUpperCase()
			.replace(/[.\-/]/g, " ")
			.replace(/\s+/g, " ")
			.trim()

	it("concorda no título oficial de toda UG presente nas duas relações", () => {
		const emAmbas = Object.keys(UNIDADES_GESTORAS).filter((codigo) => UG_NAMES[codigo])
		expect(emAmbas.length).toBeGreaterThan(50)

		for (const codigo of emAmbas) {
			expect(normalizar(UNIDADES_GESTORAS[codigo].tituloSiafi), `título da UG ${codigo}`).toBe(normalizar(UG_NAMES[codigo]))
		}
	})
})
