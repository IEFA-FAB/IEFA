/**
 * @module sacdgc/ugs
 * Relação oficial das Unidades Gestoras do COMAER atendidas pelo DGC e o grupo de
 * comparação institucional de cada uma.
 *
 * O grupo é o que define com quem a UG é comparada na análise. Ele NÃO é derivado
 * do nome: a relação abaixo é a classificação da SUCONT. O casamento por nome existe
 * só como último recurso, para UG que apareça na base sem estar mapeada.
 *
 * A DIREF executa por duas UGs (120002 e 120700) e é uma única unidade para efeito
 * de análise — daí `DIREF_UG_CODE`.
 */

/** Código sintético da DIREF: as duas UGs do órgão viram um recorte só. */
export const DIREF_UG_CODE = "120002 e 120700"
const DIREF_UG_NAME = `${DIREF_UG_CODE} - DIRETORIA DE ECON E FINANCAS DA AERONAUTICA`
const DIREF_MEMBERS = new Set(["120002", "120700"])

/** `true` se o código de 6 dígitos é uma das UGs da DIREF. */
export function isDirefUg(code: string): boolean {
	return DIREF_MEMBERS.has(code)
}

export const UG_NAMES: Record<string, string> = {
	"120002": "DIRETORIA DE ECON E FINANCAS DA AERONAUTICA",
	"120004": "BASE AEREA DE BRASILIA",
	"120005": "PREFEITURA DE AERONAUTICA DE BRASILIA",
	"120006": "GRUPAMENTO DE APOIO DE BRASILIA",
	"120007": "PREFEITURA DE AERONAUTICA DE RECIFE",
	"120008": "PRIMEIRO CENTRO INT.DEF.AEREA CONTR.TFG.AEREO",
	"120013": "CENTRO DE LANCAMENTO DE ALCANTARA",
	"120015": "CENTRO DE LANÇAMENTO DA BARREIRA DO INFERNO",
	"120016": "GRUPAMENTO DE APOIO DE S J CAMPOS",
	"120019": "HOSPITAL DE AERONAUTICA DE RECIFE",
	"120021": "TERCEIRO CENTRO INT.DEF.AEREA CONTR.TFG.AEREO",
	"120026": "PARQUE MATERIAL AERONAUTICO DE LAGOA SANTA",
	"120030": "BASE AEREA DO GALEAO",
	"120036": "DEPARTAMENTO DE CONTROLE DO ESPACO AEREO",
	"120038": "DIRETORIA DE MATERIAL AERONAUTICO E BELICO",
	"120039": "GRUPAMENTO DE APOIO DO RIO DE JANEIRO",
	"120040": "HOSPITAL CENTRAL AERONAUTICA",
	"120041": "HOSPITAL DE AERONAUTICA DOS AFONSOS",
	"120042": "HOSPITAL DE FORCA AEREA DO GALEAO",
	"120043": "LABORATORIO QUIMICO-FARMACEUTICO DA AERONAUT.",
	"120045": "PREFEITURA DE AERONAUTICA DO GALEAO",
	"120048": "PARQUE DE MAT. DE ELETRONICA DA AERONAUTICA",
	"120049": "PARQUE DE MATERIAL AERONAUTICO DO GALEAO",
	"120053": "PREFEITURA DE AERONAUTICA DOS AFONSOS",
	"120058": "DIRETORIA DE SAUDE",
	"120060": "ACADEMIA DA FORCA AEREA",
	"120064": "ESCOLA DE ESPECIALISTAS DE AERONAUTICA",
	"120066": "HOSPITAL DE FORCA AEREA DE SAO PAULO",
	"120068": "PARQUE DE MATERIAL AERONAUTICO DE SAO PAULO",
	"120071": "CENTRO LOGISTICO DA AERONAUTICA",
	"120072": "SEGUNDO CENTRO INT.DEF.AEREA CONTR.TFG.AEREO",
	"120075": "BASE AEREA DE CANOAS",
	"120077": "HOSPITAL DE AERONAUTICA DE CANOAS",
	"120082": "BASE AEREA DE MANAUS",
	"120087": "BASE AEREA DE BELEM",
	"120089": "HOSPITAL DE AERONAUTICA DE BELEM",
	"120094": "QUARTO CENTRO INT.DEF.AEREA CONTR.TFG.AEREO",
	"120096": "HOSPITAL DE FORCA AEREA DE BRASILIA",
	"120108": "COMISSAO COORD. DO PROGRAMA ANV DE COMBATE",
	"120110": "DEPARTAMENTO DE CIENCIA E TECNOLOGIA AEROESPACIAL",
	"120115": "COMANDO DE OPERAÇÕES AEROESPACIAIS",
	"120127": "COMISSAO DE IMPLANT.DO SIST.DE CONTR.DO E AER",
	"120132": "DIRETORIA DE ENSINO",
	"120133": "DIRETORIA DE ADMINISTRACAO DA AERONAUTICA",
	"120136": "DIRETORIA DE ADMINISTRACAO DO PESSOAL",
	"120140": "INSTITUTO TECNOLOGICO DE AERONAUTICA",
	"120141": "INSTITUTO DE AERONAUTICA E ESPACO",
	"120154": "HOSPITAL DE AERONAUTICA DE MANAUS",
	"120161": "PREFEITURA DE AERONAUTICA DE BELEM",
	"120300": "GRUPO DE TRANSPORTE ESPECIAL",
	"120460": "GRUPO ESPECIAL DE INSPECAO EM VOO",
	"120502": "PREFEITURA DE AERONAUTICA DE PIRASSUNUNGA",
	"120512": "PREFEITURA DE AERONAUT.DE SAO JOSE DOS CAMPOS",
	"120623": "GRUPAMENTO DE APOIO DOS AFONSOS",
	"120624": "BASE AEREA DE ANAPOLIS",
	"120625": "GRUPAMENTO DE APOIO DO DISTRITO FED",
	"120628": "GRUPAMENTO DE APOIO DE BELEM",
	"120629": "GRUPAMENTO DE APOIO DE CANOAS",
	"120630": "GRUPAMENTO DE APOIO DE MANAUS",
	"120631": "BASE AEREA DE NATAL",
	"120632": "GRUPAMENTO DE APOIO DE RECIFE",
	"120633": "GRUPAMENTO DE APOIO DE SAO PAULO",
	"120636": "GRUPAMENTO DE APOIO DE LAGOA SANTA",
	"120637": "BASE AEREA DE BOA VISTA",
	"120638": "BASE AEREA DE CAMPO GRANDE",
	"120641": "BASE AEREA DE PORTO VELHO",
	"120643": "BASE AEREA DE SANTA MARIA",
	"120645": "GRUPAMENTO DE APOIO DO GALEAO",
	"120669": "BASE AEREA DE SANTA CRUZ",
}

/** Ordem de apresentação dos grupos — a mesma usada pela SUCONT. */
export const GROUP_ORDER = [
	"Parques",
	"Hospitais",
	"Bases Aéreas",
	"CINDACTA",
	"Ensino",
	"Institutos",
	"GAP",
	"Prefeituras",
	"Diretorias e ODS",
	"Outros",
] as const

export type UgGroup = (typeof GROUP_ORDER)[number]

const GROUP_BY_CODE: Record<string, UgGroup> = {
	"120026": "Parques",
	"120048": "Parques",
	"120049": "Parques",
	"120068": "Parques",

	"120019": "Hospitais",
	"120040": "Hospitais",
	"120041": "Hospitais",
	"120042": "Hospitais",
	"120066": "Hospitais",
	"120077": "Hospitais",
	"120089": "Hospitais",
	"120096": "Hospitais",
	"120154": "Hospitais",

	"120004": "Bases Aéreas",
	"120030": "Bases Aéreas",
	"120075": "Bases Aéreas",
	"120082": "Bases Aéreas",
	"120087": "Bases Aéreas",
	"120624": "Bases Aéreas",
	"120631": "Bases Aéreas",
	"120637": "Bases Aéreas",
	"120638": "Bases Aéreas",
	"120641": "Bases Aéreas",
	"120643": "Bases Aéreas",
	"120669": "Bases Aéreas",

	"120008": "CINDACTA",
	"120021": "CINDACTA",
	"120072": "CINDACTA",
	"120094": "CINDACTA",

	"120060": "Ensino",
	"120064": "Ensino",
	"120140": "Ensino",

	"120141": "Institutos",

	"120006": "GAP",
	"120016": "GAP",
	"120039": "GAP",
	"120623": "GAP",
	"120625": "GAP",
	"120628": "GAP",
	"120629": "GAP",
	"120630": "GAP",
	"120632": "GAP",
	"120633": "GAP",
	"120636": "GAP",
	"120645": "GAP",

	"120005": "Prefeituras",
	"120007": "Prefeituras",
	"120045": "Prefeituras",
	"120053": "Prefeituras",
	"120161": "Prefeituras",
	"120502": "Prefeituras",
	"120512": "Prefeituras",

	"120002": "Diretorias e ODS",
	"120036": "Diretorias e ODS",
	"120038": "Diretorias e ODS",
	"120058": "Diretorias e ODS",
	"120110": "Diretorias e ODS",
	"120132": "Diretorias e ODS",
	"120133": "Diretorias e ODS",
	"120136": "Diretorias e ODS",

	"120013": "Outros",
	"120015": "Outros",
	"120043": "Outros",
	"120071": "Outros",
	"120108": "Outros",
	"120115": "Outros",
	"120127": "Outros",
	"120300": "Outros",
	"120460": "Outros",
}

/** Nome oficial no formato "CODIGO - NOME". Código fora da relação vira um rótulo explícito. */
export function ugDisplayName(code: string): string {
	if (code === DIREF_UG_CODE) return DIREF_UG_NAME
	const name = UG_NAMES[code]
	return name ? `${code} - ${name}` : `${code} - UG FORA DA RELAÇÃO OFICIAL`
}

/**
 * Grupo de comparação da UG. Aceita o código puro ("120004") ou o nome completo
 * ("120004 - BASE AEREA DE BRASILIA") — a base traz ora um, ora o outro.
 */
export function identifyGroup(codeOrName: string): UgGroup {
	const trimmed = codeOrName.trim()
	if (trimmed.startsWith(DIREF_UG_CODE)) return "Diretorias e ODS"

	const code = trimmed.match(/^(\d{6})/)?.[1] ?? ""
	const mapped = GROUP_BY_CODE[code]
	if (mapped) return mapped

	// Último recurso: UG que apareceu na base sem estar na relação da SUCONT.
	const upper = (UG_NAMES[code] ?? trimmed).toUpperCase()
	if (upper.includes("GRUPAMENTO DE APOIO")) return "GAP"
	if (upper.includes("BASE AEREA")) return "Bases Aéreas"
	if (upper.includes("HOSPITAL")) return "Hospitais"
	if (upper.includes("PREFEITURA")) return "Prefeituras"
	if (upper.includes("PARQUE DE MAT") || upper.includes("PARQUE MAT")) return "Parques"
	if (upper.includes("CINDACTA") || upper.includes("CENTRO INT.DEF.AEREA")) return "CINDACTA"
	if (upper.includes("ACADEMIA") || upper.includes("ESCOLA") || upper.includes("INSTITUTO TECNOLOGICO")) return "Ensino"
	if (upper.includes("INSTITUTO DE") || upper.includes("LABORATORIO")) return "Institutos"
	if (upper.includes("DIRETORIA") || upper.includes("DEPARTAMENTO") || upper.includes("COMANDO")) return "Diretorias e ODS"
	return "Outros"
}
