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
	// Preenche o VAZIO, nunca por cima. O perfil chega por consulta assíncrona: quem digita a
	// localidade ou o NUP antes dela responder perdia os dois, e isso não é turno de conversa
	// — não havia como desfazer.
	const fill = (current: string | undefined, stored: string | null | undefined): string => ((current ?? "").trim() === "" ? value(stored) : (current ?? ""))
	return {
		...document,
		om: {
			name: fill(document.om.name, profile.om_name),
			acronym: fill(document.om.acronym, profile.om_acronym),
			sector: fill(document.om.sector, profile.om_sector),
			address: fill(document.om.address, profile.om_address),
			phone: fill(document.om.phone, profile.om_phone),
			email: fill(document.om.email, profile.om_email),
		},
		city: fill(document.city, profile.city),
		nup: fill(document.nup, profile.nup_prefix),
		signer: {
			name: fill(document.signer.name, profile.signer_name),
			rank: fill(document.signer.rank, profile.signer_rank),
			quadro: fill(document.signer.quadro, profile.signer_quadro),
			position: fill(document.signer.position, profile.signer_position),
			om: fill(document.signer.om, profile.om_acronym),
		},
	}
}

/** O que o formulário mostra como "faltando no seu perfil" — não é erro, é convite. */
export function missingProfileFields(profile: WriterProfile | null): string[] {
	// Os nomes são os RÓTULOS dos campos: "OM" mandava a pessoa procurar um campo com esse
	// nome, que não existe atrás do botão Editar.
	if (!profile) return ["Nome da OM", "Nome do signatário", "Localidade padrão"]
	const missing: string[] = []
	if (!value(profile.om_name)) missing.push("Nome da OM")
	if (!value(profile.signer_name)) missing.push("Nome do signatário")
	if (!value(profile.city)) missing.push("Localidade padrão")
	return missing
}
