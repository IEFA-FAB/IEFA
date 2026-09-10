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
		questaoRAC: "Questão 35",
	},
	{
		account: "115210100",
		description: "PRODUTOS ACABADOS",
		exceptions: ["120065"],
		questaoRAC: "Questão 35",
	},
	{
		account: "115310100",
		description: "PRODUTOS EM ELABORAÇÃO",
		exceptions: ["120065"],
		questaoRAC: "Questão 35",
	},
	{
		account: "115410100",
		description: "MATERIAS-PRIMAS – ARMAZENS PROPRIOS",
		exceptions: ["120065"],
		questaoRAC: "Questão 35",
	},
	{
		account: "115410200",
		description: "MATERIAS-PRIMAS – ARMAZENS DE TERCEIROS",
		exceptions: ["120006"],
		questaoRAC: "Questão 35",
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
		questaoRAC: "Questão 35",
	},
	{
		account: "115610800",
		description: "ALMOXARIFADO EM ELABORAÇÃO",
		exceptions: ["120100"],
		questaoRAC: "Questão 35",
	},
	{
		account: "115611000",
		description: "MATERIAIS DE CONSUMO NÃO LOCALIZADOS",
		exceptions: [],
		questaoRAC: "Questão 35",
	},
	{
		account: "115810202",
		description: "MAT CONS – EST ARMAZÉM TERCEIROS – PARA DISTRIB",
		exceptions: ["120090", "120091"],
		questaoRAC: "Questão 35",
	},
	{
		account: "123110701",
		description: "BENS MÓVEIS EM ELABORAÇÃO",
		exceptions: ["120127", "120108"],
		questaoRAC: "Questão 36",
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
		questaoRAC: "Questão 36",
	},
	{
		account: "123110805",
		description: "BENS MÓVEIS INSERVÍVEIS",
		exceptions: [],
		questaoRAC: "Questão 36",
	},
	{
		account: "123119907",
		description: "BENS NÃO LOCALIZADOS",
		exceptions: [],
		questaoRAC: "Questão 36",
	},
	{
		account: "123210124",
		description: "SALAS",
		exceptions: [],
		questaoRAC: "Questão 37",
	},
	{
		account: "123210125",
		description: "ALFÂNDEGAS",
		exceptions: [],
		questaoRAC: "Questão 37",
	},
	{
		account: "123210126",
		description: "AUTARQUIAS/FUNDAÇÕES",
		exceptions: [],
		questaoRAC: "Questão 37",
	},
	{
		account: "123210127",
		description: "POSTOS DE FISCALIZAÇÃO",
		exceptions: [],
		questaoRAC: "Questão 37",
	},
	{
		account: "123210128",
		description: "BENS DE INFRAESTRUTURA",
		exceptions: [],
		questaoRAC: "Questão 37",
	},
	{
		account: "123210129",
		description: "BENS IMÓVEIS EM PODER DE TERCEIROS",
		exceptions: [],
		questaoRAC: "Questão 37",
	},
	{
		account: "123210132",
		description: "ESPELHO D\u2019ÁGUA",
		exceptions: [],
		questaoRAC: "Questão 37",
	},
	{
		account: "123210198",
		description: "OUTROS BENS IMÓVEIS REGISTRADOS NO SPIUNET",
		exceptions: [],
		questaoRAC: "Questão 37",
	},
	{
		account: "123210200",
		description: "BENS DE USO ESPECIAL NÃO REGISTRADOS SPIUNET",
		exceptions: [],
		questaoRAC: "Questão 37",
	},
	{
		account: "123210606",
		description: "ALMOXARIFADO DE INVERSÕES FIXAS",
		exceptions: ["120088"],
		questaoRAC: "Questão 37",
	},
	{
		account: "123219905",
		description: "BENS IMÓVEIS A CLASSIFICAR",
		exceptions: ["120225", "120255", "120257", "120259", "120260", "120261", "120265"],
		questaoRAC: "Questão 37",
	},
	{
		account: "213110100",
		description: "FORNECEDORES NACIONAIS",
		exceptions: ["120100", "120060"],
		questaoRAC: "Questão 16",
	},
	{
		account: "213210400",
		description: "CONTAS A PAGAR - CREDORES ESTRANGEIROS",
		exceptions: ["120090", "120091"],
		questaoRAC: "Questão 16",
	},
	{
		account: "363110200",
		description: "PERDAS INVOLUNTÁRIAS DE BENS IMÓVEIS",
		exceptions: [],
		questaoRAC: "Questão 30",
	},
	{
		account: "363210100",
		description: "PERDAS INVOLUNTÁRIAS COM SOFTWARES",
		exceptions: [],
		questaoRAC: "Questão 30",
	},
	{
		account: "363210200",
		description: "PERDAS INVOLUNTÁRIAS COM MARCAS/DIR/PATENTES",
		exceptions: [],
		questaoRAC: "Questão 30",
	},
	{
		account: "363210300",
		description: "PERDAS INVOLUNTÁRIAS C/ DIREITO DE USO IMOVEL",
		exceptions: [],
		questaoRAC: "Questão 30",
	},
	{
		account: "363910100",
		description: "OUTRAS PERDAS INVOLUNTÁRIAS",
		exceptions: [],
		questaoRAC: "Questão 30",
	},
	{
		account: "115610900",
		description: "MATERIAIS A CLASSIFICAR",
		exceptions: [],
		questaoRAC: "Questão 26",
	},
	{
		account: "123119908",
		description: "BENS MÓVEIS A CLASSIFICAR",
		exceptions: [],
		questaoRAC: "Questão 26",
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

/**
 * Assunto de cada questão do RAC coberta pelo analista de saldos transitórios.
 *
 * Fonte ÚNICA do rótulo: o número da questão é impresso NA MENSAGEM enviada à UG
 * ("Mapeamento Contábil - Estoques"), e os cartões mantinham a própria cópia
 * desta tabela. Quando a edição atual do RAC renumerou as questões, as cópias
 * ficaram na numeração antiga e passaram a trocar o assunto entre si: a antiga
 * Q26 era Estoques e a atual Q26 é Bens a Classificar.
 */
const RAC_ASSUNTOS: Record<string, string> = {
	"Questão 35": "Estoques",
	"Questão 36": "Bens Móveis",
	"Questão 37": "Bens Imóveis",
	"Questão 16": "Fornecedores e Contas a Pagar",
	"Questão 30": "Perdas Involuntárias",
	"Questão 26": "Bens a Classificar",
}

/**
 * Questões do RAC cobertas pela tabela de contas, na ordem em que aparecem nela.
 *
 * A tela do escopo listava as mesmas questões numa constante à parte — e é uma
 * lista que só se percebe desatualizada lendo a tabela de contas linha a linha.
 */
export const RAC_QUESTOES_NO_ESCOPO: readonly string[] = Array.from(new Set(rules.map((r) => r.questaoRAC)))

/** Assunto curto, usado no título e no corpo da mensagem institucional. */
export function getRacTopic(rac: string): string {
	return RAC_ASSUNTOS[rac] ?? "Saldos Transitórios"
}

/** Descrição longa, usada no cabeçalho da tela. */
export function getRacDescription(rac: string) {
	const assunto = RAC_ASSUNTOS[rac]
	return assunto ? `${assunto} (Saldos que não devem permanecer ao final do mês)` : "Análise de Saldos Transitórios"
}
