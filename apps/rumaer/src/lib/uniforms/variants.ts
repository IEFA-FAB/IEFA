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
 * Imagens que representam o resultado, na ordem em que devem aparecer:
 * o gênero do card, ou unissex quando o gênero não tem ilustração própria.
 * Dentro disso, `oficiais` primeiro (o padrão do catálogo).
 *
 * A ilustração do OUTRO gênero nunca entra. O card carrega o selo "Feminino";
 * mostrar o desenho masculino nele seria uma resposta errada com cara de certa,
 * e o card existe justamente porque os dois desenhos são peças diferentes.
 * Sem imagem do gênero, o card assume o estado "sem ilustração".
 */
export function previewImagesFor(images: UniformPreviewImage[], genero: Genero | null): UniformPreviewImage[] {
	const eligible = images.filter((img) => genero == null || img.genero === genero || img.genero === "unissex")
	const proprias = eligible.filter((img) => img.genero === genero)
	const escolhidas = genero != null && proprias.length > 0 ? proprias : eligible
	return escolhidas.sort((a, b) => circuloRank(a.circulo) - circuloRank(b.circulo))
}

/** `oficiais` primeiro; depois a ordem hierárquica. */
function circuloRank(circulo: CirculoHierarquico): number {
	if (circulo === DEFAULT_CIRCULO) return -1
	return CIRCULO_ORDER.indexOf(circulo)
}

/**
 * O mínimo de uma variante que a resolução precisa conhecer. `image_path` é
 * opcional e serve só de desempate: entre variantes igualmente válidas, abrir
 * numa que tem ilustração é melhor do que abrir numa vazia.
 */
export type VariantKey = { circulo: CirculoHierarquico; genero: Genero; sub_variacao: string | null; image_path?: string | null }

/** O que a URL pode pedir. Qualquer campo pode faltar ou não existir no uniforme. */
export type VariantRequest = { circulo?: CirculoHierarquico; genero?: Genero; sub?: string }

export type VariantSelection = { circulo: CirculoHierarquico; genero: Genero; sub: string | null }

/**
 * Escolhe a variante a exibir. As variantes chegam na ordem de `ordem`, e a
 * primeira de cada nível é o desempate final — mas o padrão do catálogo
 * (oficiais, masculino) vem antes dela sempre que existir.
 *
 * **O eixo que a URL pediu é resolvido primeiro.** Um pedido explícito não pode
 * perder para o PADRÃO do outro eixo: resolvendo `circulo` sempre antes, o card
 * "4º Uniforme A — Feminino" (que linka só `?genero=feminino`) abria a versão
 * masculina, porque o uniforme não tem variante feminina em `oficiais` e o padrão
 * `oficiais` era fechado antes de alguém olhar o gênero pedido. Pior: os chips de
 * Gênero saíam do círculo já resolvido, então a versão feminina ficava
 * inalcançável a partir do card que a anunciou.
 *
 * Com os DOIS pedidos na URL e nenhuma variante satisfazendo ambos, o gênero
 * ganha: é o que o card prometeu e o que mais muda a ilustração.
 *
 * A resolução é tolerante de propósito: um link com `circulo` que este uniforme
 * não tem cai no padrão em vez de quebrar a tela.
 */
export function resolveVariantSelection<V extends VariantKey>(
	variants: readonly V[],
	requested: VariantRequest
): VariantSelection & { variant: V | undefined } {
	const first = variants[0]
	if (!first)
		return { circulo: requested.circulo ?? DEFAULT_CIRCULO, genero: requested.genero ?? DEFAULT_GENERO, sub: requested.sub ?? null, variant: undefined }

	// Último desempate: entre variantes igualmente válidas, a que TEM ilustração.
	// Sem isto o `4º Uniforme A` feminino abria em `suboficiais` (sem imagem)
	// enquanto o card que levou até lá exibia o desenho de `sargentos`.
	const fallback = (pool: readonly V[]) => pool.find((v) => v.image_path) ?? pool[0]

	const resolveGenero = (pool: readonly V[]) =>
		pick<Genero>(
			pool.map((v) => v.genero),
			[requested.genero, DEFAULT_GENERO, "unissex"],
			fallback(pool).genero
		)
	const resolveCirculo = (pool: readonly V[]) =>
		pick<CirculoHierarquico>(
			pool.map((v) => v.circulo),
			[requested.circulo, DEFAULT_CIRCULO],
			fallback(pool).circulo
		)

	// O gênero é resolvido primeiro, EXCETO quando a URL pediu círculo e não pediu
	// gênero — aí quem tem pedido explícito abre. Com o par padrão disponível a
	// ordem não muda nada; ela só decide quando `oficiais`+`masculino` é impossível,
	// e aí o gênero ganha. Foi o que faltava no `2º Uniforme A`, cujo círculo
	// `oficiais` só tem variante feminina: resolvendo círculo primeiro, a URL sem
	// parâmetro nenhum abria em FEMININO, contrariando o padrão do catálogo.
	const generoFirst = requested.genero !== undefined || requested.circulo === undefined

	let circulo: CirculoHierarquico
	let genero: Genero
	if (generoFirst) {
		genero = resolveGenero(variants)
		circulo = resolveCirculo(variants.filter((v) => v.genero === genero))
	} else {
		circulo = resolveCirculo(variants)
		genero = resolveGenero(variants.filter((v) => v.circulo === circulo))
	}

	const ofGenero = variants.filter((v) => v.circulo === circulo && v.genero === genero)
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
