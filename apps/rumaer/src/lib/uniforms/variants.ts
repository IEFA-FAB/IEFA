/**
 * @module uniforms/variants
 * Regras puras de gênero/círculo/variação — separação da lista por gênero e
 * resolução do que a tela de detalhe deve mostrar a partir da URL.
 *
 * Fica separado dos componentes de propósito: nada aqui toca React, rede ou
 * Supabase, então dá para testar a regra sem subir a app.
 */

import type { CirculoHierarquico, Genero } from "@iefa/database/rumaer"
import { CIRCULO_ORDER, GENERO_ORDER } from "@/lib/uniforms/labels"
import type { UniformPreviewImage } from "@/server/storage.fn"
import type { UniformListItem } from "@/server/uniforms.fn"

/** Padrão do catálogo quando a URL não pede nada: oficiais, masculino. */
export const DEFAULT_CIRCULO: CirculoHierarquico = "oficiais"
export const DEFAULT_GENERO: Genero = "masculino"

/**
 * Um resultado da busca da home. Um uniforme com variante masculina E feminina
 * vira DOIS resultados — a ilustração de cada gênero é uma peça diferente, e um
 * card só mostraria uma delas.
 */
export type UniformEntry = {
	/** Chave estável para React e para o link (`id` ou `id:genero`). */
	key: string
	uniform: UniformListItem
	/** `null` quando o uniforme não tem separação por gênero (unissex ou sem variante). */
	genero: Genero | null
}

/** Gêneros com peça própria (unissex não separa nada — é a mesma ilustração). */
function genderedOf(uniform: UniformListItem): Genero[] {
	return uniform.generos.filter((g) => g !== "unissex")
}

/**
 * Expande um uniforme nos resultados que a lista deve mostrar: um por gênero
 * quando há mais de um, um só quando não há o que separar.
 */
export function uniformEntries(uniform: UniformListItem): UniformEntry[] {
	const gendered = genderedOf(uniform)
	if (gendered.length < 2) return [{ key: uniform.id, uniform, genero: gendered[0] ?? null }]
	return GENERO_ORDER.filter((g) => gendered.includes(g)).map((genero) => ({ key: `${uniform.id}:${genero}`, uniform, genero }))
}

/** Expande a lista inteira preservando a ordem dos uniformes (gêneros ficam adjacentes). */
export function expandUniformEntries(uniforms: UniformListItem[]): UniformEntry[] {
	return uniforms.flatMap(uniformEntries)
}

/**
 * Imagens que representam o resultado, na ordem em que devem aparecer.
 * Preferência: o gênero do card > unissex > o resto; dentro disso, `oficiais`
 * primeiro (o padrão do catálogo). Nunca devolve vazio se houver alguma imagem —
 * um card sem ilustração é pior do que um card com a ilustração do gênero vizinho.
 */
export function previewImagesFor(images: UniformPreviewImage[], genero: Genero | null): UniformPreviewImage[] {
	const rank = (img: UniformPreviewImage) => (genero == null || img.genero === genero ? 0 : img.genero === "unissex" ? 1 : 2)
	const best = Math.min(...images.map(rank))
	return images.filter((img) => rank(img) === best).sort((a, b) => circuloRank(a.circulo) - circuloRank(b.circulo))
}

/** `oficiais` primeiro; depois a ordem hierárquica. */
function circuloRank(circulo: CirculoHierarquico): number {
	if (circulo === DEFAULT_CIRCULO) return -1
	return CIRCULO_ORDER.indexOf(circulo)
}

/** O mínimo de uma variante que a resolução precisa conhecer. */
export type VariantKey = { circulo: CirculoHierarquico; genero: Genero; sub_variacao: string | null }

/** O que a URL pode pedir. Qualquer campo pode faltar ou não existir no uniforme. */
export type VariantRequest = { circulo?: CirculoHierarquico; genero?: Genero; sub?: string }

export type VariantSelection = { circulo: CirculoHierarquico; genero: Genero; sub: string | null }

/**
 * Escolhe a variante a exibir. As variantes chegam na ordem de `ordem`, e a
 * primeira de cada nível é o desempate final — mas o padrão pedido (oficiais,
 * masculino) vem antes dela sempre que existir.
 *
 * A resolução é tolerante de propósito: um link compartilhado com `circulo` que
 * este uniforme não tem cai no padrão em vez de quebrar a tela.
 */
export function resolveVariantSelection<V extends VariantKey>(
	variants: readonly V[],
	requested: VariantRequest
): VariantSelection & { variant: V | undefined } {
	const first = variants[0]
	if (!first)
		return { circulo: requested.circulo ?? DEFAULT_CIRCULO, genero: requested.genero ?? DEFAULT_GENERO, sub: requested.sub ?? null, variant: undefined }

	const circulos = variants.map((v) => v.circulo)
	const circulo = pick<CirculoHierarquico>(circulos, [requested.circulo, DEFAULT_CIRCULO], first.circulo)

	const ofCirculo = variants.filter((v) => v.circulo === circulo)
	const genero = pick<Genero>(
		ofCirculo.map((v) => v.genero),
		[requested.genero, DEFAULT_GENERO, "unissex"],
		ofCirculo[0].genero
	)

	const ofGenero = ofCirculo.filter((v) => v.genero === genero)
	const subs = ofGenero.map((v) => v.sub_variacao)
	// `sub` ausente na URL = variação padrão (`null`), que é o que a maioria dos
	// uniformes tem; só cai na primeira variação quando não existe a padrão.
	const sub = pick<string | null>(subs, [requested.sub, null], ofGenero[0].sub_variacao)

	return { circulo, genero, sub, variant: ofGenero.find((v) => v.sub_variacao === sub) ?? ofGenero[0] }
}

/** Primeiro candidato que existe entre os disponíveis; senão, o fallback. */
function pick<T>(available: readonly T[], candidates: readonly (T | undefined)[], fallback: T): T {
	for (const c of candidates) {
		if (c !== undefined && available.includes(c)) return c
	}
	return fallback
}
