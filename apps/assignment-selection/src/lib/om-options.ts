import type { Person, Vacancy } from "@iefa/database/assignment-selection"
import { localidadesFab } from "@/lib/localidades"

export interface OmOption {
	value: string
	/** `OM · estado`: o que o operador lê e o que a busca casa. */
	label: string
	estado: string
	/** Confirmados nesta OM e vagas do quadro. Informativo: o controle não bloqueia OM cheia. */
	confirmed: number
	total: number | null
}

/**
 * Opções de OM do controlador.
 *
 * Vêm do quadro de vagas da edição, não do mapa de todas as localidades FAB: a função do
 * banco recusa OM fora do quadro, então oferecê-la só adiaria o erro para o meio do evento.
 * Sem quadro cadastrado, cai no mapa de localidades para a tela não ficar sem opção.
 * OM já gravada num militar e ausente do quadro entra também, para o campo não aparecer vazio.
 */
export function buildOmOptions(
	vacancies: readonly Pick<Vacancy, "om" | "estado" | "total_vagas">[],
	persons: readonly Pick<Person, "localidade" | "hide_card">[]
): OmOption[] {
	const confirmedByOm = new Map<string, number>()
	for (const p of persons) {
		if (p.hide_card && p.localidade) confirmedByOm.set(p.localidade, (confirmedByOm.get(p.localidade) ?? 0) + 1)
	}

	const byOm = new Map<string, { estado: string; total: number | null }>()
	for (const v of vacancies) {
		if (!v.om) continue
		const prev = byOm.get(v.om)
		byOm.set(v.om, {
			estado: v.estado ?? prev?.estado ?? localidadesFab[v.om] ?? "",
			total: (prev?.total ?? 0) + (v.total_vagas ?? 0),
		})
	}
	if (byOm.size === 0) {
		for (const [om, estado] of Object.entries(localidadesFab)) byOm.set(om, { estado, total: null })
	}
	for (const p of persons) {
		if (p.localidade && !byOm.has(p.localidade)) byOm.set(p.localidade, { estado: localidadesFab[p.localidade] ?? "", total: null })
	}

	return [...byOm]
		.map(([om, { estado, total }]) => ({
			value: om,
			label: estado ? `${om} · ${estado}` : om,
			estado,
			confirmed: confirmedByOm.get(om) ?? 0,
			total,
		}))
		.sort((a, b) => a.value.localeCompare(b.value, "pt-BR"))
}

/** Estado gravado junto com a OM (o mapa do telão destaca por ele). */
export function estadoForOm(options: readonly OmOption[], om: string): string {
	return options.find((o) => o.value === om)?.estado || localidadesFab[om] || "N/A"
}
