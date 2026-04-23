export type Classification = "EXCEÇÃO PREVISTA" | "COBRANÇA" | "COBRANÇA COM OBSERVAÇÃO" | "FORA DO ESCOPO PARAMETRIZADO"

export interface ProcessedRow {
	ug: string
	mes: string
	conta: string
	descricao: string
	saldo: number
	classificacao: Classification
	observacao?: string
	questaoRAC?: string
}

interface Rule {
	account: string
	description: string
	exceptions: string[]
	questaoRAC: string
	specialRule?: (ug: string, balance: number) => { classification: Classification; observation?: string } | null
}

export const rules: Rule[] = [
	{
		account: "115110101",
		description: "MERCADORIAS PARA VENDA OU REVENDA",
		exceptions: ["120039", "120100", "120065"],
		questaoRAC: "Questão 26",
	},
	{
		account: "115210100",
		description: "PRODUTOS ACABADOS",
		exceptions: ["120065"],
		questaoRAC: "Questão 26",
	},
	{
		account: "115310100",
		description: "PRODUTOS EM ELABORAÇÃO",
		exceptions: ["120065"],
		questaoRAC: "Questão 26",
	},
	{
		account: "115410100",
		description: "MATERIAS-PRIMAS – ARMAZENS PROPRIOS",
		exceptions: ["120065"],
		questaoRAC: "Questão 26",
	},
	{
		account: "115410200",
		description: "MATERIAS-PRIMAS – ARMAZENS DE TERCEIROS",
		exceptions: ["120006"],
		questaoRAC: "Questão 26",
		specialRule: (ug) => {
			if (ug === "120006") {
				return {
					classification: "EXCEÇÃO PREVISTA",
					observation: "exceção vinculada ao GAP-BR em favor da COPAC",
				}
			}
			return null
		},
	},
	{
		account: "115510100",
		description: "ESTOQUES MERCADORIAS PARA REVENDA EM TRÂNSITO",
		exceptions: ["120039", "120100", "120065"],
		questaoRAC: "Questão 26",
	},
	{
		account: "115610800",
		description: "ALMOXARIFADO EM ELABORAÇÃO",
		exceptions: ["120100"],
		questaoRAC: "Questão 26",
	},
	{
		account: "115611000",
		description: "MATERIAIS DE CONSUMO NÃO LOCALIZADOS",
		exceptions: [],
		questaoRAC: "Questão 26",
	},
	{
		account: "115810202",
		description: "MAT CONS – EST ARMAZÉM TERCEIROS – PARA DISTRIB",
		exceptions: ["120090", "120091"],
		questaoRAC: "Questão 26",
	},
	{
		account: "123110701",
		description: "BENS MÓVEIS EM ELABORAÇÃO",
		exceptions: ["120127", "120108"],
		questaoRAC: "Questão 27",
		specialRule: (ug) => {
			if (["120006", "120195"].includes(ug)) {
				return {
					classification: "COBRANÇA COM OBSERVAÇÃO",
					observation: "120006 e 120195 podem movimentar a conta, porém devem encerrar o mês com saldo zerado.",
				}
			}
			return null
		},
	},
	{
		account: "123110122",
		description: "EQUIP E MAT PERMANENTES VINCULADOS A CONVÊNIO",
		exceptions: [],
		questaoRAC: "Questão 27",
	},
	{
		account: "123110805",
		description: "BENS MÓVEIS INSERVÍVEIS",
		exceptions: [],
		questaoRAC: "Questão 27",
	},
	{
		account: "123119907",
		description: "BENS NÃO LOCALIZADOS",
		exceptions: [],
		questaoRAC: "Questão 27",
	},
	{
		account: "123210124",
		description: "SALAS",
		exceptions: [],
		questaoRAC: "Questão 28",
	},
	{
		account: "123210125",
		description: "ALFÂNDEGAS",
		exceptions: [],
		questaoRAC: "Questão 28",
	},
	{
		account: "123210126",
		description: "AUTARQUIAS/FUNDAÇÕES",
		exceptions: [],
		questaoRAC: "Questão 28",
	},
	{
		account: "123210127",
		description: "POSTOS DE FISCALIZAÇÃO",
		exceptions: [],
		questaoRAC: "Questão 28",
	},
	{
		account: "123210128",
		description: "BENS DE INFRAESTRUTURA",
		exceptions: [],
		questaoRAC: "Questão 28",
	},
	{
		account: "123210129",
		description: "BENS IMÓVEIS EM PODER DE TERCEIROS",
		exceptions: [],
		questaoRAC: "Questão 28",
	},
	{
		account: "123210132",
		description: "ESPELHO D\u2019ÁGUA",
		exceptions: [],
		questaoRAC: "Questão 28",
	},
	{
		account: "123210198",
		description: "OUTROS BENS IMÓVEIS REGISTRADOS NO SPIUNET",
		exceptions: [],
		questaoRAC: "Questão 28",
	},
	{
		account: "123210200",
		description: "BENS DE USO ESPECIAL NÃO REGISTRADOS SPIUNET",
		exceptions: [],
		questaoRAC: "Questão 28",
	},
	{
		account: "123210606",
		description: "ALMOXARIFADO DE INVERSÕES FIXAS",
		exceptions: ["120088"],
		questaoRAC: "Questão 28",
	},
	{
		account: "123219905",
		description: "BENS IMÓVEIS A CLASSIFICAR",
		exceptions: ["120225", "120255", "120257", "120259", "120260", "120261", "120265"],
		questaoRAC: "Questão 28",
	},
	{
		account: "213110100",
		description: "FORNECEDORES NACIONAIS",
		exceptions: ["120100", "120060"],
		questaoRAC: "Questão 31",
	},
	{
		account: "213210400",
		description: "CONTAS A PAGAR - CREDORES ESTRANGEIROS",
		exceptions: ["120090", "120091"],
		questaoRAC: "Questão 31",
	},
	{
		account: "363110200",
		description: "PERDAS INVOLUNTÁRIAS DE BENS IMÓVEIS",
		exceptions: [],
		questaoRAC: "Questão 32",
	},
	{
		account: "363210100",
		description: "PERDAS INVOLUNTÁRIAS COM SOFTWARES",
		exceptions: [],
		questaoRAC: "Questão 32",
	},
	{
		account: "363210200",
		description: "PERDAS INVOLUNTÁRIAS COM MARCAS/DIR/PATENTES",
		exceptions: [],
		questaoRAC: "Questão 32",
	},
	{
		account: "363210300",
		description: "PERDAS INVOLUNTÁRIAS C/ DIREITO DE USO IMOVEL",
		exceptions: [],
		questaoRAC: "Questão 32",
	},
	{
		account: "363910100",
		description: "OUTRAS PERDAS INVOLUNTÁRIAS",
		exceptions: [],
		questaoRAC: "Questão 32",
	},
	{
		account: "115610900",
		description: "MATERIAIS A CLASSIFICAR",
		exceptions: [],
		questaoRAC: "Questão 36",
	},
	{
		account: "123119908",
		description: "BENS MÓVEIS A CLASSIFICAR",
		exceptions: [],
		questaoRAC: "Questão 36",
	},
]

export function classifyAccount(
	ug: string,
	accountFull: string,
	balance: number
): {
	classification: Classification
	description: string
	observation?: string
	accountCode: string
	questaoRAC?: string
} {
	const accountCodeMatch = accountFull.match(/^(\d+)/)
	const accountCode = accountCodeMatch ? accountCodeMatch[1] : accountFull

	const rule = rules.find((r) => r.account === accountCode)

	if (!rule) {
		return {
			classification: "FORA DO ESCOPO PARAMETRIZADO",
			description: accountFull,
			accountCode,
		}
	}

	if (rule.specialRule) {
		const special = rule.specialRule(ug, balance)
		if (special) {
			return {
				classification: special.classification,
				description: rule.description,
				observation: special.observation,
				accountCode,
				questaoRAC: rule.questaoRAC,
			}
		}
	}

	if (rule.exceptions.includes(ug)) {
		return {
			classification: "EXCEÇÃO PREVISTA",
			description: rule.description,
			accountCode,
			questaoRAC: rule.questaoRAC,
		}
	}

	return {
		classification: "COBRANÇA",
		description: rule.description,
		accountCode,
		questaoRAC: rule.questaoRAC,
	}
}

export function formatCurrency(value: number) {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value)
}

export function getRacDescription(rac: string) {
	const descriptions: Record<string, string> = {
		"Questão 26": "Estoques (Saldos que não devem permanecer ao final do mês)",
		"Questão 27": "Bens Móveis (Saldos que não devem permanecer ao final do mês)",
		"Questão 28": "Bens Imóveis (Saldos que não devem permanecer ao final do mês)",
		"Questão 31": "Fornecedores e Contas a Pagar (Saldos que não devem permanecer ao final do mês)",
		"Questão 32": "Perdas Involuntárias (Saldos que não devem permanecer ao final do mês)",
		"Questão 36": "Bens a Classificar (Saldos que não devem permanecer ao final do mês)",
	}
	return descriptions[rac] || "Análise de Saldos Transitórios"
}
