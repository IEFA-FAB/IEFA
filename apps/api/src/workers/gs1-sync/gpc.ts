/**
 * Importador da publicação GPC (Global Product Classification) da GS1.
 *
 * A GS1 publica a taxonomia como JSON aninhado (GPC Browser export):
 * Segment → Family → Class → Brick → Attribute → AttributeValue. Este módulo
 * achata a árvore e faz upsert idempotente em gs1_integration.gpc_brick,
 * gpc_attribute, gpc_attribute_value e gpc_brick_attribute (sempre por chave
 * natural) — reimportar a mesma publicação produz o mesmo estado, sem deletes
 * (padrão dos importadores TACO/IBGE/USDA).
 *
 * Os ATRIBUTOS eram descartados até 20260901120300. São eles que permitem
 * expressar a exigência do edital ("estado de conservação: congelado OU
 * resfriado") e verificar um GTIN contra ela.
 *
 * `segmentCodes` limita o import a um recorte — a taxonomia inteira é grande e
 * a subsistência só fala do segmento de alimentos. Os itens auxiliares (EPI,
 * limpeza) NÃO caem no segmento de alimentos: quem importar só ele deixa 168
 * insumos do catálogo sem classificação possível.
 *
 * O parser é tolerante a variações de caixa nas chaves (Code/code,
 * Description/description/Title, Childs/childs/children) porque exports de
 * versões diferentes do GPC Browser divergem nisso.
 */

import type { createClient } from "@supabase/supabase-js"
import { fetchWithRetry } from "../../lib/fetch-with-retry.ts"

/**
 * Anti-SSRF: o download da publicação é um fetch server-side com URL vinda do
 * chamador (rota admin ou CLI). Só publicações GS1 oficiais, sempre https —
 * e SEM seguir redirects (um 302 para alvo interno/link-local furaria o
 * allowlist verificado só na URL inicial).
 */
const GPC_ALLOWED_HOSTS = /(^|\.)gs1\.org$|(^|\.)gs1br\.org$/
export function isAllowedGpcUrl(raw: string): boolean {
	try {
		const url = new URL(raw)
		return url.protocol === "https:" && GPC_ALLOWED_HOSTS.test(url.hostname)
	} catch {
		return false
	}
}

type SupabaseAny = ReturnType<typeof createClient<any, any, any>>

const CHUNK_SIZE = 500

export interface GpcAttributeRow {
	attribute_code: string
	attribute_title: string
}

export interface GpcAttributeValueRow {
	value_code: string
	value_title: string
	attribute_code: string
}

export interface GpcBrickAttributeRow {
	brick_code: string
	attribute_code: string
}

export interface GpcPublication {
	bricks: GpcBrickRow[]
	attributes: GpcAttributeRow[]
	attributeValues: GpcAttributeValueRow[]
	brickAttributes: GpcBrickAttributeRow[]
}

export interface GpcImportOptions {
	/** Códigos de segmento a importar. Vazio/omitido = a publicação inteira. */
	segmentCodes?: readonly string[]
}

export interface GpcImportSummary {
	bricks: number
	attributes: number
	attributeValues: number
	brickAttributes: number
}

export interface GpcBrickRow {
	brick_code: string
	brick_title: string
	class_code: string
	class_title: string
	family_code: string
	family_title: string
	segment_code: string
	segment_title: string
}

interface GpcNode {
	code: string
	title: string
	children: unknown[]
}

function readNode(raw: unknown): GpcNode | null {
	if (raw == null || typeof raw !== "object") return null
	const obj = raw as Record<string, unknown>
	const code = obj.Code ?? obj.code
	const title = obj.Description ?? obj.description ?? obj.Title ?? obj.title
	const children = obj.Childs ?? obj.childs ?? obj.children ?? []
	if (code == null || title == null) return null
	return {
		code: String(code),
		title: String(title),
		children: Array.isArray(children) ? children : [],
	}
}

/** Raiz do export: array direto, ou embrulhado em { Schema: [...] }. */
function readRoots(json: unknown): unknown[] {
	if (Array.isArray(json)) return json
	if (json != null && typeof json === "object") {
		const obj = json as Record<string, unknown>
		const schema = obj.Schema ?? obj.schema
		if (Array.isArray(schema)) return schema
	}
	return []
}

/**
 * Achata a árvore Segment→Family→Class→Brick→Attribute→Value. Puro, testável.
 *
 * Atributo e valor são deduplicados por código: o mesmo "Estado de
 * conservação" aparece em dezenas de bricks, e gravar um por ocorrência
 * estouraria a PK na primeira reimportação.
 */
export function parseGpcPublication(json: unknown, options: GpcImportOptions = {}): GpcPublication {
	const wanted = new Set((options.segmentCodes ?? []).map((code) => String(code).trim()).filter((code) => code !== ""))

	const bricks: GpcBrickRow[] = []
	const attributes = new Map<string, GpcAttributeRow>()
	const attributeValues = new Map<string, GpcAttributeValueRow>()
	const brickAttributes = new Map<string, GpcBrickAttributeRow>()

	for (const rawSegment of readRoots(json)) {
		const segment = readNode(rawSegment)
		if (!segment) continue
		if (wanted.size > 0 && !wanted.has(segment.code)) continue
		for (const rawFamily of segment.children) {
			const family = readNode(rawFamily)
			if (!family) continue
			for (const rawClass of family.children) {
				const klass = readNode(rawClass)
				if (!klass) continue
				for (const rawBrick of klass.children) {
					const brick = readNode(rawBrick)
					if (!brick) continue
					bricks.push({
						brick_code: brick.code,
						brick_title: brick.title,
						class_code: klass.code,
						class_title: klass.title,
						family_code: family.code,
						family_title: family.title,
						segment_code: segment.code,
						segment_title: segment.title,
					})

					for (const rawAttribute of brick.children) {
						const attribute = readNode(rawAttribute)
						if (!attribute) continue
						attributes.set(attribute.code, { attribute_code: attribute.code, attribute_title: attribute.title })
						brickAttributes.set(`${brick.code}:${attribute.code}`, { brick_code: brick.code, attribute_code: attribute.code })

						for (const rawValue of attribute.children) {
							const value = readNode(rawValue)
							if (!value) continue
							attributeValues.set(value.code, { value_code: value.code, value_title: value.title, attribute_code: attribute.code })
						}
					}
				}
			}
		}
	}

	return {
		bricks,
		attributes: [...attributes.values()],
		attributeValues: [...attributeValues.values()],
		brickAttributes: [...brickAttributes.values()],
	}
}

async function upsertChunks<T extends object>(supabase: SupabaseAny, table: string, rows: readonly T[], onConflict: string, syncedAt: string): Promise<number> {
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		const chunk = rows.slice(i, i + CHUNK_SIZE).map((row) => ({ ...row, synced_at: syncedAt }))
		const { error } = await supabase.from(table).upsert(chunk, { onConflict })
		if (error) throw new Error(`Falha ao gravar ${table} (chunk ${i / CHUNK_SIZE + 1}): ${error.message}`)
	}
	return rows.length
}

/**
 * Upsert em chunks, na ordem das FKs: atributo → valor → brick → vínculo.
 * Inverter a ordem faz o valor referenciar um atributo que ainda não existe.
 */
export async function persistGpcPublication(supabase: SupabaseAny, publication: GpcPublication): Promise<GpcImportSummary> {
	const syncedAt = new Date().toISOString()
	return {
		attributes: await upsertChunks(supabase, "gpc_attribute", publication.attributes, "attribute_code", syncedAt),
		attributeValues: await upsertChunks(supabase, "gpc_attribute_value", publication.attributeValues, "value_code", syncedAt),
		bricks: await upsertChunks(supabase, "gpc_brick", publication.bricks, "brick_code", syncedAt),
		brickAttributes: await upsertChunks(supabase, "gpc_brick_attribute", publication.brickAttributes, "brick_code,attribute_code", syncedAt),
	}
}

/** Baixa a publicação de `url` e importa. Guard: zero bricks = layout mudou. */
export async function importGpc(supabase: SupabaseAny, url: string, options: GpcImportOptions = {}): Promise<GpcImportSummary> {
	if (!isAllowedGpcUrl(url)) throw new Error("URL não permitida — apenas https em gs1.org/gs1br.org (sem redirects)")
	const res = await fetchWithRetry(url, { redirect: "error" }, { label: "GPC" })
	if (!res.ok) throw new Error(`Download da publicação GPC falhou: HTTP ${res.status}`)
	const json = (await res.json()) as unknown
	const publication = parseGpcPublication(json, options)
	if (publication.bricks.length === 0) {
		throw new Error(
			options.segmentCodes?.length
				? `GPC: nenhum brick parseado nos segmentos ${options.segmentCodes.join(", ")} — código de segmento errado ou layout mudou?`
				: "GPC: nenhum brick parseado — o layout da publicação mudou?"
		)
	}
	return persistGpcPublication(supabase, publication)
}
