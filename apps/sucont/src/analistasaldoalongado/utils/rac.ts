export const RAC_MAPPING: Record<string, string[]> = {
	"Questão 5": ["113810601", "113810606"],
	"Questão 6": ["218913609", "218913610"],
	"Questão 7": ["113110200"],
	// Os sete primeiros códigos estavam com um "8" a mais (`2188810102`), o que dá 10
	// dígitos — conta do SIAFI tem 9, então nunca casavam e as contas ficavam sem
	// rótulo de questão. Correspondem ao grupo 21881 (consignações e depósitos), como
	// os demais da lista; a 21881.04.47 aparece nominalmente na Macrofunção 02.03.18.
	"Questão 8": [
		"218810102",
		"218810104",
		"218810106",
		"218810109",
		"218810128",
		"218810447",
		"218810409",
		"218910100",
		"218910200",
		"218810114",
		"218810129",
		"218810199",
	],
	"Questão 9": ["631510000", "631520000", "631530000", "631540000", "631550000", "631570000", "631100000", "631200000", "631300000", "632100000"],
	"Questão 10": ["897211900"],
	"Questão 11": ["229110000"],
	"Questão 12": ["812310101", "812310201", "811310301", "812310401"],
	"Questão 13": ["115510100", "899920101", "899920102"],
	"Questão 14": ["115610200", "115110101", "115210100", "115310100", "115410100", "115410200"],
	"Questão 15": ["115610300", "115610400"],
	"Questão 16": ["115810201", "115510100", "115610800", "115611000", "115810202", "115610900"],
	"Questão 17": ["115810301"],
	"Questão 18": ["115810500"],
	"Questão 19": ["123119905", "899920201", "899920202"],
	"Questão 20": ["123119901"],
	"Questão 21": ["123110803", "123110804"],
	"Questão 22": ["123110802"],
	"Questão 23": ["123110702", "123110701", "123110122", "123110805", "123119907", "123119908"],
	"Questão 24": ["123210601", "123210605", "123210700"],
	"Questão 25": [
		"124110202",
		"123210124",
		"123210125",
		"123210126",
		"123210127",
		"123210128",
		"123210129",
		"123210132",
		"123210198",
		"123210200",
		"123210606",
		"123219905",
	],
}

export const RAC_DESCRIPTIONS: Record<string, string> = {
	"Questão 5": "Adiantamentos de Diversas Naturezas a Comprovar",
	"Questão 6": "Depósitos para Terceiros",
	"Questão 7": "Suprimento de Fundos",
	"Questão 8": "Consignações e Retenções",
	"Questão 9": "Créditos Informativos",
	"Questão 10": "Valores em Trânsito",
	"Questão 11": "Obrigações com Pessoal",
	"Questão 12": "Dotação Orçamentária",
	"Questão 13": "Almoxarifado e Estoques",
	"Questão 14": "Bens Móveis em Trânsito",
	"Questão 15": "Bens Móveis a Classificar",
	"Questão 16": "Bens Imóveis em Trânsito",
	"Questão 17": "Bens Imóveis a Classificar",
	"Questão 18": "Bens Imóveis de Uso Especial",
	"Questão 19": "Intangíveis",
	"Questão 20": "Bens de Uso Comum do Povo",
	"Questão 21": "Bens Móveis em Poder de Terceiros",
	"Questão 22": "Bens Móveis de Terceiros em Poder da Unidade",
	"Questão 23": "Bens Imóveis em Poder de Terceiros",
	"Questão 24": "Depreciação e Amortização",
	"Questão 25": "Software e Direitos Autorais",
}

export const ACCOUNT_NAMES: Record<string, string> = {
	"631100000": "RP NAO PROCESSADOS A LIQUIDAR",
	"631200000": "RP NAO PROCESSADOS EM LIQUIDACAO",
	"631300000": "RP NAO PROCESSADOS LIQUIDADOS A PAGAR",
	"631510000": "RP NÃO PROCESSADOS CANCELADOS",
	"631520000": "RP PROCESSADOS CANCELADOS",
	"631530000": "RP CANCELADO - RESTABELECIMENTO",
	"631540000": "RP CANCELADO - RESTABELECIMENTO PAGO",
	"631550000": "RP CANCELADO - OUTROS",
	"631570000": "RP CANCELADO - PRESCRIÇÃO",
	"632100000": "RP PROCESSADOS A PAGAR",
}

export const getQuestaoByAccount = (account: string): string | null => {
	for (const [questao, accounts] of Object.entries(RAC_MAPPING)) {
		if (accounts.includes(account)) return questao
	}
	return null
}

export const getRacQuestionTitle = (questao: string): string => {
	return RAC_DESCRIPTIONS[questao] || "Outras Inconsistências"
}

export const getAccountName = (account: string): string => {
	return ACCOUNT_NAMES[account] ? `${account} - ${ACCOUNT_NAMES[account]}` : account
}
