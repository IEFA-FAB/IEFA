// Extraído de routes/subitens-genericos.tsx (port do sucontsubitem): leitura da UG
// pelo código de seis dígitos dentro do texto da coluna "UG Executora".
import { CONFERENTES_MAPPING, UG_INFO } from "#/subitens/constants"

export const getConferente = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && CONFERENTES_MAPPING[match[0]]) return CONFERENTES_MAPPING[match[0]]
	return "Não atribuído"
}

export const getOdsForUg = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) return UG_INFO[match[0]].ods
	return "OUTROS"
}

export const getOrgaoSuperiorForUg = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) return UG_INFO[match[0]].orgaoSuperior
	return "OUTROS"
}

export const formatUgName = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) return `${ugString} (${UG_INFO[match[0]].sigla})`
	return ugString
}

export const formatUgFull = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) {
		const info = UG_INFO[match[0]]
		return `UG ${match[0]} (${info.sigla}), subordinada ao ${info.orgaoSuperior} / ${info.ods}`
	}
	return ugString
}
