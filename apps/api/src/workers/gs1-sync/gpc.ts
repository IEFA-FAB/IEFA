/**
 * Importador da publicação GPC (Global Product Classification) da GS1.
 *
 * A GS1 publica a taxonomia como JSON aninhado (GPC Browser export):
 * Segment → Family → Class → Brick (→ Attributes, ignorados). Este módulo
 * achata a árvore por brick e faz upsert idempotente em
 * gs1_integration.gpc_brick (onConflict: brick_code) — reimportar a mesma
 * publicação produz o mesmo estado, sem deletes (padrão dos importadores
 * TACO/IBGE/USDA).
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

// biome-ignore lint/suspicious/noExplicitAny: mesmo padrão de SupabaseAny dos importadores nutricionais
type SupabaseAny = ReturnType<typeof createClient<any, any, any>>

const CHUNK_SIZE = 500

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

/** Achata a árvore Segment→Family→Class→Brick em linhas por brick. Puro, testável. */
export function parseGpcPublication(json: unknown): GpcBrickRow[] {
	const rows: GpcBrickRow[] = []
	for (const rawSegment of readRoots(json)) {
		const segment = readNode(rawSegment)
		if (!segment) continue
		for (const rawFamily of segment.children) {
			const family = readNode(rawFamily)
			if (!family) continue
			for (const rawClass of family.children) {
				const klass = readNode(rawClass)
				if (!klass) continue
				for (const rawBrick of klass.children) {
					const brick = readNode(rawBrick)
					if (!brick) continue
					rows.push({
						brick_code: brick.code,
						brick_title: brick.title,
						class_code: klass.code,
						class_title: klass.title,
						family_code: family.code,
						family_title: family.title,
						segment_code: segment.code,
						segment_title: segment.title,
					})
				}
			}
		}
	}
	return rows
}

/** Upsert em chunks; retorna o nº de bricks gravados. */
export async function persistGpcBricks(supabase: SupabaseAny, rows: GpcBrickRow[]): Promise<number> {
	const syncedAt = new Date().toISOString()
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		const chunk = rows.slice(i, i + CHUNK_SIZE).map((row) => ({ ...row, synced_at: syncedAt }))
		const { error } = await supabase.from("gpc_brick").upsert(chunk, { onConflict: "brick_code" })
		if (error) throw new Error(`Falha ao gravar gpc_brick (chunk ${i / CHUNK_SIZE + 1}): ${error.message}`)
	}
	return rows.length
}

/** Baixa a publicação de `url` e importa. Guard: zero bricks = layout mudou. */
export async function importGpc(supabase: SupabaseAny, url: string): Promise<number> {
	if (!isAllowedGpcUrl(url)) throw new Error("URL não permitida — apenas https em gs1.org/gs1br.org (sem redirects)")
	const res = await fetchWithRetry(url, { redirect: "error" }, { label: "GPC" })
	if (!res.ok) throw new Error(`Download da publicação GPC falhou: HTTP ${res.status}`)
	const json = (await res.json()) as unknown
	const rows = parseGpcPublication(json)
	if (rows.length === 0) throw new Error("GPC: nenhum brick parseado — o layout da publicação mudou?")
	return persistGpcBricks(supabase, rows)
}
