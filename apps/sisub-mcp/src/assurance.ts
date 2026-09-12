/**
 * @module assurance
 * Trava preventiva do despacho: nenhuma tool com exigência de garantia de identidade roda
 * por aqui.
 *
 * ## Por que ela existe se hoje nenhuma tool é classificada
 *
 * As tools atuais leem catálogo e escrevem planejamento (templates, cardápios, receitas) —
 * nada classificado como `"session"` ou `"fresh"` no registro do sisub
 * (`apps/sisub/src/server/assurance-registry.ts`). A trava é para o dia em que uma for: a
 * forma normal de a proteção falhar não é alguém desligá-la, é alguém acrescentar uma tool
 * que chama uma operation protegida sem lembrar que existia proteção. Sem este ponto, essa
 * tool nasceria executando por chave de API exatamente a operação que o segundo fator
 * deveria cobrir — e ninguém seria avisado.
 *
 * ## Nenhuma credencial do MCP satisfaz grau nenhum, e isso é decisão, não limitação
 *
 * Os dois caminhos de `auth.ts` fixam `aal: 1`: a chave de API porque é credencial de prazo
 * longo sem senha e sem segundo fator (design.md D11), e o JWT porque ler o `aal` de um token
 * colado num cliente MCP elevaria a execução de um agente com a prova de identidade que a
 * pessoa deu ao NAVEGADOR. Logo, operação classificada aqui é operação que não acontece — e a
 * mensagem tem que dizer isso ao modelo, não convidá-lo a tentar de novo.
 *
 * ## A mensagem é escrita para o modelo ler e corrigir
 *
 * Mesma convenção do orçamento de payload (`tools/shared.ts`): o texto volta como resultado de
 * tool, INTEIRO, no prompt do turno seguinte. Um erro genérico ("permissão insuficiente")
 * manda o modelo tentar outra vez com outros argumentos, queimando turnos numa operação que
 * nenhum argumento destrava. Daí o formato: o que foi barrado, por quê, e qual é a única ação
 * que resolve — a pessoa executar no SISUB.
 */

import { AssuranceRequiredError, type AssuranceRequirement, assertAssurance, NO_ASSURANCE, type UserContext } from "@iefa/pbac"
import { resolveCredential } from "./auth.ts"
import { type ToolCallResult, toolError } from "./tools/shared.ts"

/**
 * Exigência de garantia por tool, pelo NOME da tool.
 *
 * Vazio hoje, e essa é a afirmação: nenhuma tool do MCP alcança operação classificada. Quem
 * escrever uma que alcance acrescenta a entrada aqui, com o mesmo grau e o mesmo `reason` da
 * operação no registro do sisub — que segue sendo a fonte única da classificação.
 *
 * O default é `NO_ASSURANCE`, e não "erro por tool desconhecida", porque este caminho roda
 * dentro da chamada do usuário: tool sem entrada é tool de rotina, que é a esmagadora maioria.
 */
export const MCP_TOOL_ASSURANCE: Readonly<Record<string, AssuranceRequirement>> = {}

/** Endereço que a pessoa abre para executar o que a credencial não executa. */
const SISUB_URL = process.env.SISUB_PUBLIC_URL ?? "https://sisub.iefa.com.br"

function deniedMessage(toolName: string, error: AssuranceRequiredError): string {
	const origem =
		error.origin === "api-key"
			? "Chaves de API não apresentam segundo fator: elas nunca satisfazem esta exigência."
			: "A sessão usada por um cliente MCP não é elevada a segundo fator: ela nunca satisfaz esta exigência."

	return (
		`A tool "${toolName}" exige verificação em duas etapas (grau "${error.grade}") e não pode ser executada por esta credencial. ` +
		`${origem} ${error.reason} ` +
		`Não tente novamente, com estes ou com outros argumentos — nenhum argumento destrava esta operação. ` +
		`Informe ao usuário que ele precisa executá-la diretamente no SISUB (${SISUB_URL}) e siga com o restante da tarefa.`
	)
}

export interface EnforceToolAssuranceOptions {
	/** Classificação em vigor. Injetável para teste; em produção é {@link MCP_TOOL_ASSURANCE}. */
	registry?: Readonly<Record<string, AssuranceRequirement>>
	/** Resolução da credencial. Injetável para teste; em produção é `resolveCredential`. */
	resolve?: (credential: string) => Promise<UserContext>
}

/**
 * Devolve o resultado de erro quando a tool exige garantia que esta credencial não dá, e
 * `null` quando o despacho pode seguir.
 *
 * A credencial só é resolvida quando há exigência: tool de rotina não paga nenhuma ida a mais
 * ao banco, e hoje isso significa nenhuma ida a mais em nenhuma chamada. Resolver de verdade
 * (em vez de deduzir a origem pelo prefixo `smcp_`) é o que impede esta trava de envelhecer —
 * quem decide `aal`/`origin` continua sendo `auth.ts`, num lugar só.
 */
export async function enforceToolAssurance(toolName: string, credential: string, options: EnforceToolAssuranceOptions = {}): Promise<ToolCallResult | null> {
	const { registry = MCP_TOOL_ASSURANCE, resolve = resolveCredential } = options
	const requirement = registry[toolName] ?? NO_ASSURANCE
	if (requirement.require === "none") return null

	const ctx = await resolve(credential)
	try {
		assertAssurance(ctx, requirement)
		return null
	} catch (error) {
		if (error instanceof AssuranceRequiredError) return toolError(deniedMessage(toolName, error))
		throw error
	}
}
