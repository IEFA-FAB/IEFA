/**
 * Registry de fontes normativas.
 *
 * A tabela `alpha.normative_source` é a fonte da verdade sobre o que existe,
 * qual a URL base e se está habilitado; o código só resolve qual adapter
 * atende cada `id`. Fonte declarada no banco sem adapter registrado aqui é
 * erro explícito, não silêncio.
 */

import { supabase } from "../db/supabase.ts"
import { createAguAdapter } from "./agu/adapter.ts"
import { createLegislacaoAdapter, LEGISLACAO_SOURCES } from "./legislacao/adapter.ts"
import type { NormativeSourceAdapter, NormativeSourceRow } from "./types.ts"

type AdapterFactory = (baseUrl: string) => NormativeSourceAdapter

const ADAPTERS: Record<string, AdapterFactory> = {
	"agu-modelos-14133": createAguAdapter,
	// A URL de cada norma vem do próprio registry no banco; a config declarada
	// em LEGISLACAO_SOURCES traz tipo de documento e título canônico.
	...Object.fromEntries(
		LEGISLACAO_SOURCES.map((config) => [config.id, (baseUrl: string) => createLegislacaoAdapter({ ...config, url: baseUrl || config.url })] as const)
	),
}

export async function listSources(): Promise<NormativeSourceRow[]> {
	const { data, error } = await supabase
		.from("normative_source")
		.select("id, authority, kind, base_url, cadence, enabled, last_checked_at, last_error")
		.order("id")

	if (error) throw new Error(`listagem de fontes falhou: ${error.message}`)
	return (data ?? []) as NormativeSourceRow[]
}

export async function getSource(id: string): Promise<NormativeSourceRow | null> {
	const { data, error } = await supabase
		.from("normative_source")
		.select("id, authority, kind, base_url, cadence, enabled, last_checked_at, last_error")
		.eq("id", id)
		.maybeSingle()

	if (error) throw new Error(`consulta da fonte ${id} falhou: ${error.message}`)
	return (data as NormativeSourceRow | null) ?? null
}

export function hasAdapter(id: string): boolean {
	return id in ADAPTERS
}

export function resolveAdapter(source: NormativeSourceRow): NormativeSourceAdapter {
	const factory = ADAPTERS[source.id]
	if (!factory) {
		throw new Error(`fonte '${source.id}' não tem adapter registrado — implemente em src/sources/ e registre no registry`)
	}
	return factory(source.base_url)
}
