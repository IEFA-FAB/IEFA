/**
 * @module comaer/writer-profile
 * Dados fixos do redator e como eles entram no documento.
 *
 * Puro, para poder ser testado sem banco. A regra que importa está em `seedFromProfile`:
 * o perfil preenche o documento NOVO, e nunca sobrescreve o que já foi digitado — quem
 * abre um documento salvo espera encontrá-lo como o deixou, não remendado pelo perfil de
 * hoje.
 */

import { z } from "zod"
import type { DocumentInput } from "./types"

export const WriterProfileSchema = z.object({
	om_name: z.string().nullish(),
	om_acronym: z.string().nullish(),
	om_sector: z.string().nullish(),
	om_address: z.string().nullish(),
	om_phone: z.string().nullish(),
	om_email: z.string().nullish(),
	signer_name: z.string().nullish(),
	signer_rank: z.string().nullish(),
	signer_quadro: z.string().nullish(),
	signer_position: z.string().nullish(),
	city: z.string().nullish(),
	nup_prefix: z.string().nullish(),
})

export type WriterProfile = z.infer<typeof WriterProfileSchema>

export const EMPTY_PROFILE: WriterProfile = {
	om_name: "",
	om_acronym: "",
	om_sector: "",
	om_address: "",
	om_phone: "",
	om_email: "",
	signer_name: "",
	signer_rank: "",
	signer_quadro: "",
	signer_position: "",
	city: "",
	nup_prefix: "",
}

function value(field: string | null | undefined): string {
	return field?.trim() ?? ""
}

/**
 * Preenche um documento em branco com os dados fixos.
 *
 * O sequencial do setor NÃO vem daqui: é contador vivo da seção, e um número sugerido
 * errado só aparece depois do despacho. O prefixo do NUP entra como começo do campo,
 * porque a parte que varia é do processo, não do redator.
 */
export function seedFromProfile(document: DocumentInput, profile: WriterProfile | null): DocumentInput {
	if (!profile) return document
	return {
		...document,
		om: {
			name: value(profile.om_name),
			acronym: value(profile.om_acronym),
			sector: value(profile.om_sector),
			address: value(profile.om_address),
			phone: value(profile.om_phone),
			email: value(profile.om_email),
		},
		city: value(profile.city),
		nup: value(profile.nup_prefix),
		signer: {
			name: value(profile.signer_name),
			rank: value(profile.signer_rank),
			quadro: value(profile.signer_quadro),
			position: value(profile.signer_position),
			om: value(profile.om_acronym),
		},
	}
}

/** O que o formulário mostra como "faltando no seu perfil" — não é erro, é convite. */
export function missingProfileFields(profile: WriterProfile | null): string[] {
	if (!profile) return ["OM", "signatário", "localidade"]
	const missing: string[] = []
	if (!value(profile.om_name)) missing.push("OM")
	if (!value(profile.signer_name)) missing.push("signatário")
	if (!value(profile.city)) missing.push("localidade")
	return missing
}
