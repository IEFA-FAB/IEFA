/**
 * Regras de separação por gênero e de resolução da variante exibida.
 *
 * Rode com: `bun test src/lib/uniforms/variants.test.ts` (dentro de apps/rumaer).
 */

import { describe, expect, test } from "bun:test"
import type { CirculoHierarquico, Genero } from "@iefa/database/rumaer"
import type { UniformPreviewImage } from "@/server/storage.fn"
import type { UniformListItem } from "@/server/uniforms.fn"
import { expandUniformEntries, previewImagesFor, resolveVariantSelection, uniformEntries, type VariantKey } from "./variants"

/** Uniforme de listagem reduzido ao que as regras leem. */
function uniform(id: string, generos: Genero[]): UniformListItem {
	return { id, generos } as UniformListItem
}

function image(genero: Genero, circulo: CirculoHierarquico, url = `${genero}-${circulo}`): UniformPreviewImage {
	// `placeholder` não entra em nenhuma regra deste módulo (filtro/ordem por gênero e
	// círculo); fica null para o helper continuar declarando só o que é lido aqui.
	return { url, genero, circulo, placeholder: null }
}

function variant(circulo: CirculoHierarquico, genero: Genero, sub_variacao: string | null = null, image_path: string | null = null): VariantKey {
	return { circulo, genero, sub_variacao, image_path }
}

describe("uniformEntries — a lista separa masculino de feminino", () => {
	test("uniforme com os dois gêneros vira dois resultados, masculino primeiro", () => {
		const entries = uniformEntries(uniform("u1", ["masculino", "feminino"]))
		expect(entries.map((e) => e.genero)).toEqual(["masculino", "feminino"])
		expect(entries.map((e) => e.key)).toEqual(["u1:masculino", "u1:feminino"])
	})

	test("a ordem da lista não depende da ordem que veio do banco", () => {
		expect(uniformEntries(uniform("u1", ["feminino", "masculino"])).map((e) => e.genero)).toEqual(["masculino", "feminino"])
	})

	test("uniforme só unissex não separa nada — um resultado, sem gênero", () => {
		const entries = uniformEntries(uniform("u2", ["unissex"]))
		expect(entries).toHaveLength(1)
		expect(entries[0]).toMatchObject({ key: "u2", genero: null })
	})

	test("uniforme com um único gênero rende um resultado, marcado com ele", () => {
		expect(uniformEntries(uniform("u3", ["masculino"]))).toEqual([{ key: "u3", uniform: uniform("u3", ["masculino"]), genero: "masculino" }])
	})

	test("unissex convivendo com os dois gêneros não vira um terceiro resultado", () => {
		expect(uniformEntries(uniform("u4", ["masculino", "feminino", "unissex"])).map((e) => e.genero)).toEqual(["masculino", "feminino"])
	})

	test("uniforme sem variante nenhuma continua aparecendo", () => {
		expect(uniformEntries(uniform("u5", []))).toEqual([{ key: "u5", uniform: uniform("u5", []), genero: null }])
	})

	test("expandir a lista mantém os gêneros de um mesmo uniforme adjacentes e na ordem original", () => {
		const entries = expandUniformEntries([uniform("a", ["masculino", "feminino"]), uniform("b", ["unissex"]), uniform("c", ["feminino"])])
		expect(entries.map((e) => e.key)).toEqual(["a:masculino", "a:feminino", "b", "c"])
	})
})

describe("previewImagesFor — cada card mostra a ilustração do seu gênero", () => {
	const images = [image("feminino", "sargentos"), image("masculino", "sargentos"), image("masculino", "oficiais"), image("unissex", "oficiais")]

	test("filtra pelo gênero do card", () => {
		expect(previewImagesFor(images, "feminino").map((i) => i.url)).toEqual(["feminino-sargentos"])
	})

	test("oficiais vem primeiro dentro do gênero — é o padrão do catálogo", () => {
		expect(previewImagesFor(images, "masculino").map((i) => i.url)).toEqual(["masculino-oficiais", "masculino-sargentos"])
	})

	test("sem imagem do gênero, cai no unissex", () => {
		expect(previewImagesFor([image("masculino", "oficiais"), image("unissex", "oficiais")], "feminino").map((i) => i.url)).toEqual(["unissex-oficiais"])
	})

	test("existindo só a do OUTRO gênero, o card fica sem ilustração — não mostra o desenho errado", () => {
		// O card carrega o selo "Feminino"; o desenho masculino nele seria resposta
		// errada com cara de certa, e é justamente a diferença entre os dois que
		// justifica os dois cards existirem.
		expect(previewImagesFor([image("masculino", "oficiais")], "feminino")).toEqual([])
	})

	test("unissex acompanha o gênero mesmo tendo imagem própria, sem trazer a do outro gênero", () => {
		const imgs = [image("masculino", "oficiais"), image("feminino", "oficiais"), image("unissex", "oficiais")]
		expect(previewImagesFor(imgs, "feminino").map((i) => i.url)).toEqual(["feminino-oficiais"])
	})

	test("card sem gênero mostra tudo", () => {
		expect(previewImagesFor(images, null)).toHaveLength(4)
	})

	test("uniforme sem ilustração devolve lista vazia (e não NaN vindo do Math.min)", () => {
		expect(previewImagesFor([], "masculino")).toEqual([])
	})
})

describe("resolveVariantSelection — a URL manda, o padrão é oficiais/masculino", () => {
	const variants = [
		variant("sargentos", "feminino"),
		variant("oficiais", "feminino"),
		variant("oficiais", "masculino"),
		variant("oficiais", "feminino", "gestante"),
	]

	test("sem nada na URL, abre em oficiais/masculino mesmo não sendo a primeira variante", () => {
		expect(resolveVariantSelection(variants, {})).toMatchObject({ circulo: "oficiais", genero: "masculino", sub: null })
	})

	test("o que a URL pede prevalece sobre o padrão", () => {
		expect(resolveVariantSelection(variants, { circulo: "sargentos", genero: "feminino" })).toMatchObject({ circulo: "sargentos", genero: "feminino" })
	})

	test("par pedido que não existe: o gênero é mantido e o círculo cede", () => {
		// `sargentos` só tem feminino nesta fixture. Ceder o gênero (comportamento
		// antigo) devolveria uma tela que contraria o que a pessoa pediu justamente
		// no eixo que mais muda a ilustração; ceder o círculo preserva o pedido
		// visível e ainda entrega uma variante real.
		expect(resolveVariantSelection(variants, { circulo: "sargentos", genero: "masculino" })).toMatchObject({ circulo: "oficiais", genero: "masculino" })
	})

	test("círculo pedido que o uniforme não tem cai em oficiais", () => {
		expect(resolveVariantSelection(variants, { circulo: "cadetes" })).toMatchObject({ circulo: "oficiais", genero: "masculino" })
	})

	test("sub-variação da URL é respeitada quando existe naquele círculo+gênero", () => {
		const selection = resolveVariantSelection(variants, { circulo: "oficiais", genero: "feminino", sub: "gestante" })
		expect(selection.sub).toBe("gestante")
		expect(selection.variant).toEqual(variant("oficiais", "feminino", "gestante"))
	})

	test("sub-variação inexistente volta para a padrão, não para a primeira da lista", () => {
		expect(resolveVariantSelection(variants, { circulo: "oficiais", genero: "feminino", sub: "tropa_montada" }).sub).toBeNull()
	})

	test("sem variante padrão, assume a primeira sub-variação disponível", () => {
		const only = [variant("oficiais", "masculino", "tropa_montada")]
		expect(resolveVariantSelection(only, {}).sub).toBe("tropa_montada")
	})

	test("sem masculino nem feminino, o unissex ganha antes do desempate por ordem", () => {
		const only = [variant("oficiais", "feminino"), variant("oficiais", "unissex")]
		expect(resolveVariantSelection(only, {}).genero).toBe("unissex")
	})

	test("gênero pedido ganha do círculo PADRÃO — o card 'Feminino' não pode abrir o masculino", () => {
		// Regressão: `4º Uniforme A` em prod não tem variante feminina em `oficiais`.
		// Resolvendo `circulo` sempre primeiro, o padrão `oficiais` fechava antes de
		// alguém olhar o gênero pedido e o card feminino abria a versão masculina —
		// e os chips de Gênero, saindo do círculo já resolvido, só ofereciam
		// "Masculino", deixando a versão feminina inalcançável.
		const semFemininoEmOficiais = [variant("oficiais", "masculino"), variant("sargentos", "feminino")]
		expect(resolveVariantSelection(semFemininoEmOficiais, { genero: "feminino" })).toMatchObject({ circulo: "sargentos", genero: "feminino" })
	})

	test("círculo pedido ganha do gênero PADRÃO — caso espelhado", () => {
		const semMasculinoEmCadetes = [variant("oficiais", "masculino"), variant("cadetes", "feminino")]
		expect(resolveVariantSelection(semMasculinoEmCadetes, { circulo: "cadetes" })).toMatchObject({ circulo: "cadetes", genero: "feminino" })
	})

	test("com os dois pedidos e nenhum par possível, o gênero ganha — é o que o card prometeu", () => {
		const semFemininoEmOficiais = [variant("oficiais", "masculino"), variant("sargentos", "feminino")]
		expect(resolveVariantSelection(semFemininoEmOficiais, { circulo: "oficiais", genero: "feminino" })).toMatchObject({
			circulo: "sargentos",
			genero: "feminino",
		})
	})

	test("sem pedido nenhum e sem par padrão possível, o MASCULINO ganha do círculo oficiais", () => {
		// Regressão do `2º Uniforme A`: o círculo `oficiais` só tem variante feminina.
		// Fechando `oficiais` primeiro, a URL sem parâmetro abria em feminino e o
		// "padrão oficiais + masculino" virava só "padrão oficiais".
		const oficiaisSoFeminino = [variant("oficiais", "feminino"), variant("sargentos", "masculino")]
		expect(resolveVariantSelection(oficiaisSoFeminino, {})).toMatchObject({ circulo: "sargentos", genero: "masculino" })
	})

	test("sem nada pedido, o padrão continua oficiais/masculino mesmo com o par existindo longe na ordem", () => {
		const semFemininoEmOficiais = [variant("sargentos", "feminino"), variant("oficiais", "masculino")]
		expect(resolveVariantSelection(semFemininoEmOficiais, {})).toMatchObject({ circulo: "oficiais", genero: "masculino" })
	})

	test("no desempate final, prefere o círculo que TEM ilustração", () => {
		// `4º Uniforme A`: sem feminino em `oficiais`, e o primeiro feminino por ordem
		// (`suboficiais`) não tem imagem. Abrir nele deixaria a tela vazia logo depois
		// de um card que exibia o desenho de `sargentos`.
		const femininoSemImagemPrimeiro = [
			variant("oficiais", "masculino", null, "m.png"),
			variant("suboficiais", "feminino", null, null),
			variant("sargentos", "feminino", null, "f.png"),
		]
		expect(resolveVariantSelection(femininoSemImagemPrimeiro, { genero: "feminino" })).toMatchObject({ circulo: "sargentos", genero: "feminino" })
	})

	test("uniforme sem variante nenhuma não estoura — devolve o padrão e nenhuma variante", () => {
		expect(resolveVariantSelection([], {})).toEqual({ circulo: "oficiais", genero: "masculino", sub: null, variant: undefined })
	})

	test("a variante devolvida é sempre a que casa com a seleção", () => {
		const { circulo, genero, sub, variant: chosen } = resolveVariantSelection(variants, { genero: "feminino" })
		expect(chosen).toMatchObject({ circulo, genero, sub_variacao: sub })
	})
})
