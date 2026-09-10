import { describe, expect, it } from "bun:test"
import { AgentStateAnnotation } from "./state.ts"
import { buildTurnInput } from "./turn-input.ts"

/**
 * Canais que NÃO são zerados no começo do turno, e o motivo de cada um. Campo de estado
 * novo entra aqui com uma justificativa ou entra no `buildTurnInput` — o teste abaixo não
 * deixa uma terceira opção, que é o que aconteceu com `retrieval_iterations`.
 */
const NOT_RESET: Record<string, string> = {
	messages: "é o histórico da conversa — a única coisa que DEVE atravessar os turnos",
	session_id: "identifica a conversa; vem preenchido no input",
	user_id: "identifica o usuário; vem preenchido no input",
	min_rerank_threshold: "configuração, não contabilidade de turno",
	intent: "o roteador é o primeiro nó do turno e sempre o reescreve",
	original_query: "escrito pelo roteador junto com o `intent`",
	// Os quatro abaixo são `T | undefined`, e o LangGraph IGNORA chave com `undefined` no
	// input: não há como zerá-los daqui. Quem os neutraliza é `grading_retries: 0` e
	// `retrieval_iterations: 0`, que fecham os ramos que os leem antes de serem reescritos
	// no turno. `retrieval_outcome` existe justamente por causa desta limitação.
	grounding_check: "só é lido com `grading_retries > 0`, que é zerado; o grader reescreve antes",
	generated_response_draft: "o grader reescreve antes de qualquer leitura",
	termination_reason: "substituído por `retrieval_outcome`, que aceita `null` e reseta",
	final_response: "todo nó terminal escreve o seu antes de a resposta ser montada",
}

describe("buildTurnInput", () => {
	const input = buildTurnInput("o que é um TTAC?", "sessao-1", "usuario-1") as Record<string, unknown>

	it("zera a contabilidade de recuperação do turno", () => {
		expect(input.retrieval_iterations).toBe(0)
		// Lido pelo `query_log` em TODO turno: sem o reset, a reformulação da pergunta
		// anterior é registrada como se fosse a desta.
		expect(input.reformulated_query).toBeNull()
		expect(input.grading_retries).toBe(0)
		expect(input.search_query).toBe("")
		expect(input.retrieval_outcome).toBeNull()
		expect(input.retrieval_halted).toBe(false)
		expect(input.has_sufficient_context).toBe(false)
	})

	it("mantém a pergunta e a identificação", () => {
		expect(input.session_id).toBe("sessao-1")
		expect(input.user_id).toBe("usuario-1")
		expect((input.messages as unknown[]).length).toBe(1)
	})

	// O LangGraph ignora chave com valor `undefined`: o canal fica com o valor do turno
	// anterior. Um "reset" assim é pior que nenhum, porque parece feito.
	it("não tenta resetar com undefined", () => {
		for (const [key, value] of Object.entries(input)) {
			// `null` é definido e reseta; `undefined` é ignorado pelo LangGraph.
			expect(`${key}=${value === undefined ? "undefined" : "definido"}`).toBe(`${key}=definido`)
		}
	})

	// A trava: campo de estado novo que guarde contabilidade de turno tem de ser zerado
	// aqui, ou declarado em `NOT_RESET` com o motivo.
	it("cobre todo canal de estado, ou justifica a exceção", () => {
		const channels = Object.keys(AgentStateAnnotation.spec)
		const semTratamento = channels.filter((channel) => !(channel in input) && !(channel in NOT_RESET))

		expect(semTratamento).toEqual([])
	})
})
