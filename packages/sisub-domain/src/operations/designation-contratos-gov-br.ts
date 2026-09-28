/**
 * Papel da designação no sisub ↔ função do responsável no Contratos.gov.br.
 *
 * O Contratos.gov.br (Decreto 13.031/2026, art. 3º) guarda o responsável do contrato com uma
 * `funcao` só, e o substituto é outra função: "Gestor" e "Gestor Substituto", "Fiscal Técnico" e
 * "Fiscal Técnico Substituto". O sisub guarda o papel na língua da norma (`role`) e o substituto
 * como marca (`is_substitute`): o substituto exerce o mesmo papel nos afastamentos do titular
 * (Decreto 11.246/2022, arts. 8º e 21 a 24), e multiplicar os valores dobraria os conjuntos de
 * papéis do recebimento sem mudar nenhuma regra. Este mapa faz a ponte, para importar e exportar
 * responsáveis e para mostrar o rótulo que o usuário vê lá.
 *
 * Fonte dos rótulos: o que a API pública devolve em `funcao_id` de
 * `GET https://contratos.comprasnet.gov.br/api/contrato/{contrato_id}/responsaveis` (e em `funcao`
 * na v2), conferido em contratos reais em 2026-09-28, e a tabela "Função Contrato" do código-fonte
 * (`gitlab.com/comprasnet/contratos`, `database/seeds/CodigoItemSeeder.php`, com os códigos
 * internos GESTOR, GESTORSUB, FSCTEC, FSCTECSUB, FSCADM, FSCADMSUB, FSCSET, FSCSETSUB). "Gestor
 * Setorial" aparece na API (contrato com portaria de 16/06/2026) mas não no código-fonte: foi
 * cadastrada como dado; o código interno não é público. "Gestor Setorial Substituto" não apareceu
 * em nenhum contrato conferido, e o mapa não inventa rótulo: o substituto do gestor setorial não
 * tem correspondente até aparecer lá.
 */

import type { DesignationRole } from "./designations.ts"

export interface ContratosGovBrFunctionPair {
	/** Função do titular; `null` quando o Contratos.gov.br não tem função para o papel. */
	holder: string | null
	/** Função do substituto; `null` quando o Contratos.gov.br não tem (ou não se viu) a função. */
	substitute: string | null
}

/**
 * Função no Contratos.gov.br de cada papel do sisub. A comissão de recebimento (Lei 14.133/2021,
 * art. 140, II, b) não é responsável do contrato lá: não tem função.
 */
export const CONTRATOS_GOV_BR_FUNCTIONS: Readonly<Record<DesignationRole, ContratosGovBrFunctionPair>> = {
	gestor: { holder: "Gestor", substitute: "Gestor Substituto" },
	gestor_setorial: { holder: "Gestor Setorial", substitute: null },
	fiscal_tecnico: { holder: "Fiscal Técnico", substitute: "Fiscal Técnico Substituto" },
	fiscal_administrativo: { holder: "Fiscal Administrativo", substitute: "Fiscal Administrativo Substituto" },
	fiscal_setorial: { holder: "Fiscal Setorial", substitute: "Fiscal Setorial Substituto" },
	membro_comissao: { holder: null, substitute: null },
}

/**
 * Funções do Contratos.gov.br sem papel no sisub, com o motivo. A importação as lista como "sem
 * correspondente" em vez de adivinhar o papel.
 */
export const CONTRATOS_GOV_BR_UNMAPPED_FUNCTIONS: Readonly<Record<string, string>> = {
	"Fiscal Titular": "fiscal genérico anterior à separação em técnico, administrativo e setorial: o papel é escolha de quem importa",
	"Fiscal Substituto": "substituto do fiscal genérico: o papel é escolha de quem importa",
	"Fiscal Requisitante": "fiscal da área requisitante, sem correspondente no Decreto 11.246/2022 (art. 19)",
	"Fiscal Requisitante Substituto": "substituto do fiscal requisitante",
	"Responsável no Setor de Contratos": "operador do setor de contratos: não recebe nem fiscaliza",
	"Responsável Unidade Requisitante": "contato da unidade requisitante: não recebe nem fiscaliza",
	"Autoridade Competente": "quem designa (Decreto 11.246/2022, art. 8º), não um designado",
}

/**
 * Função no Contratos.gov.br do papel do sisub, ou `null` quando lá não existe. O papel lido do
 * banco pode ser um que este código ainda não conhece (CHECK alargado antes do deploy): vira
 * `null`, não erro, para a lista de designações não cair.
 */
export function toContratosGovBrFunction(role: DesignationRole, isSubstitute: boolean): string | null {
	const pair: ContratosGovBrFunctionPair | undefined = CONTRATOS_GOV_BR_FUNCTIONS[role]
	if (!pair) return null
	return isSubstitute ? pair.substitute : pair.holder
}

/** Caixa, acento e espaço não distinguem função: "FISCAL TECNICO " é "Fiscal Técnico". */
function normalizeFunctionLabel(label: string): string {
	return label
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase()
}

type MappedRole = { role: DesignationRole; isSubstitute: boolean }

const ROLE_BY_FUNCTION: ReadonlyMap<string, MappedRole> = (() => {
	const map = new Map<string, MappedRole>()
	for (const [role, pair] of Object.entries(CONTRATOS_GOV_BR_FUNCTIONS) as Array<[DesignationRole, ContratosGovBrFunctionPair]>) {
		if (pair.holder) map.set(normalizeFunctionLabel(pair.holder), { role, isSubstitute: false })
		if (pair.substitute) map.set(normalizeFunctionLabel(pair.substitute), { role, isSubstitute: true })
	}
	return map
})()

/**
 * Papel do sisub da função lida no Contratos.gov.br, ou `null` quando ela não tem papel aqui
 * (`CONTRATOS_GOV_BR_UNMAPPED_FUNCTIONS`) ou é desconhecida.
 */
export function fromContratosGovBrFunction(label: string): MappedRole | null {
	return ROLE_BY_FUNCTION.get(normalizeFunctionLabel(label)) ?? null
}
