/**
 * Contas do RAC por questão — RENUMERADO para a edição vigente do Roteiro
 * (39 questões, ordenada por bloco de risco na Matriz GUT).
 *
 * As ferramentas nasceram sobre a edição anterior do RAC, que numerava até 43. As
 * duas numerações NÃO têm offset: a nova reordenou as questões por criticidade, e
 * a mesma trilha muda de número de forma imprevisível (a antiga Q5 é a Q33 de
 * hoje, a antiga Q9 é a Q7). Por isso a correspondência foi feita CONTA A CONTA,
 * nunca por semelhança de título — e o resultado bate com as 20 questões que o
 * roteiro vigente marca com o critério "sem movimentação há mais de três meses".
 *
 * As contas 123110803 e 123110804 (bens móveis em poder de terceiros) ficaram de
 * fora: a edição vigente não tem questão que as cubra. Elas continuam sendo
 * analisadas e caem no rótulo de reserva "Outras Inconsistências", que é a verdade
 * — inventar um número para elas afirmaria um controle que o roteiro não tem.
 */
export const RAC_MAPPING: Record<string, string[]> = {
	"Questão 7": ["631510000", "631520000", "631530000", "631540000", "631550000", "631570000", "631100000", "631200000", "631300000", "632100000"],
	"Questão 8": ["123210601", "123210605", "123210700"],
	"Questão 9": ["123119905", "899920201", "899920202"],
	"Questão 10": ["113110200"],
	"Questão 12": ["123110702", "123110701", "123110122", "123110805", "123119907", "123119908"],
	"Questão 13": ["115810500"],
	"Questão 14": ["115610200", "115110101", "115210100", "115310100", "115410100", "115410200"],
	"Questão 15": ["115610300", "115610400"],
	"Questão 17": ["229110000"],
	"Questão 18": ["115810201", "115510100", "115610800", "115611000", "115810202", "115610900"],
	"Questão 19": ["115510100", "899920101", "899920102"],
	"Questão 21": ["218913609", "218913610"],
	"Questão 23": [
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
	"Questão 24": ["115810301"],
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
	"Questão 27": ["812310101", "812310201", "811310301", "812310401"],
	"Questão 31": ["897211900"],
	"Questão 32": ["123119901"],
	"Questão 33": ["113810601", "113810606"],
	"Questão 34": ["123110802"],
}

/**
 * Rótulo de cada questão. Descrevem o GRUPO DE CONTAS, e não o título do roteiro:
 * a edição vigente repete "Acompanhamento dos Estoques" em sete questões
 * diferentes, o que na tela não distinguiria nada. Os rótulos antigos também não
 * serviam — vinham desalinhados das contas desde o repositório de origem (a antiga
 * Q19 dizia "Intangíveis" sobre contas de bens móveis em trânsito).
 */
export const RAC_DESCRIPTIONS: Record<string, string> = {
	"Questão 7": "Restos a Pagar — Contas Orçamentárias (Classe 6)",
	"Questão 8": "Bens Imóveis — Obras em Andamento, Estudos e Projetos, Instalações",
	"Questão 9": "Bens Móveis em Trânsito, a Receber e Enviados",
	"Questão 10": "Suprimento de Fundos",
	"Questão 12": "Bens Móveis — Importações, Elaboração, Convênio, Inservíveis e a Classificar",
	"Questão 13": "Importações em Andamento — Estoques",
	"Questão 14": "Estoques — Sobressalentes a Alienar, Revenda e Matérias-Primas",
	"Questão 15": "Estoques — Sobressalentes em Reparo e a Reparar",
	"Questão 17": "Variação Patrimonial Aumentativa Diferida",
	"Questão 18": "Estoques — Distribuição, Revenda em Trânsito e a Classificar",
	"Questão 19": "Materiais de Consumo em Trânsito e Bens de Estoque",
	"Questão 21": "CPGF — Saque e Fatura",
	"Questão 23": "Consignações, Retenções e Obrigações de Curto Prazo",
	"Questão 24": "Mercadorias para Doação",
	"Questão 25": "Bens Intangíveis e Imóveis — Softwares e SPIUNET",
	"Questão 27": "Contratos em Execução (Classe 8)",
	"Questão 31": "A Entregar (Classe 8)",
	"Questão 32": "Bens Móveis a Alienar",
	"Questão 33": "Devolução de Despesas Estornadas e Valores em Trânsito",
	"Questão 34": "Estoque de Distribuição",
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
