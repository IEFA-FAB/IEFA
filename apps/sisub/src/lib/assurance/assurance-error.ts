/**
 * @module assurance-error
 * Reconhecimento, no CLIENTE, da negativa por garantia de identidade — e o reenvio da
 * mutação depois da elevação.
 *
 * ## Por que não `instanceof AssuranceRequiredError`
 *
 * O erro nasce em `@iefa/pbac` e é relançado INTEIRO por `handleDomainError`. No caminho de
 * volta, porém, o TanStack Start serializa o erro (`x-tss-serialized`) e o reconstrói no
 * navegador: o seroval copia todas as propriedades próprias (`code`, `nextStep`, `reason`,
 * `grade`, `origin`), mas o que chega é um `Error` comum — a CLASSE não atravessa a
 * fronteira. Um `instanceof` aqui seria sempre falso, e o modal nunca abriria.
 *
 * Por isso a detecção é pelo campo `code === "MFA_REQUIRED"`, que funciona nos dois lados: a
 * instância real (teste, SSR) também o carrega.
 *
 * ## Todo campo ausente cai num default, e nenhum default abre acesso
 *
 * Este módulo lê um objeto que atravessou serialização. Campo faltando ou fora do domínio
 * NÃO pode virar exceção: o usuário ficaria com a mutação recusada e nenhuma tela de volta —
 * exatamente o desfecho que o `nextStep` existe para evitar. O default é sempre o caminho
 * mais conservador (pedir o código), nunca o de deixar passar: quem decide se a operação
 * executa é o servidor, e ele já a recusou.
 *
 * @domain app
 */

import type { AssuranceGrade, AssuranceNextStep } from "@iefa/pbac"

/** O que a UI precisa saber para abrir a tela certa de elevação. */
export interface AssurancePrompt {
	/** Qual das três telas: cadastrar fator, digitar o código, reelevar. */
	nextStep: AssuranceNextStep
	/** Frase que descreve a OPERAÇÃO barrada. Aparece no modal, sempre. */
	reason: string
	/** Grau exigido — muda o texto, nunca o fluxo. */
	grade: AssuranceGrade
	/** Origem da credencial barrada. `api-key` não tem caminho de elevação nenhum. */
	origin: "session" | "api-key"
}

/** Código do erro tipado de `@iefa/pbac`, replicado aqui como literal de comparação. */
const ASSURANCE_ERROR_CODE = "MFA_REQUIRED"

const NEXT_STEPS: readonly AssuranceNextStep[] = ["enroll", "challenge", "step-up"]

/**
 * Texto exibido quando o servidor não mandou `reason`.
 *
 * Genérico de propósito: inventar um motivo específico seria pior que não ter nenhum —
 * "pedimos o código porque você está alterando X" numa operação que era Y treina a pessoa a
 * ignorar o motivo, que é justamente o que sustenta o phishing por código.
 */
export const DEFAULT_ASSURANCE_REASON = "Esta operação exige a confirmação da sua identidade."

function readString(source: Record<string, unknown>, key: string): string | null {
	const value = source[key]
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null
}

/**
 * Extrai o pedido de elevação de um erro qualquer. `null` quando o erro é outra coisa.
 *
 * Olha também `cause`, um nível: quem embrulha o erro da server function num erro próprio
 * (padrão comum em camadas de formulário) continuaria querendo o modal.
 */
export function parseAssuranceRequired(error: unknown): AssurancePrompt | null {
	if (typeof error !== "object" || error === null) return null

	const source = error as Record<string, unknown>
	if (source.code !== ASSURANCE_ERROR_CODE) {
		return "cause" in source && source.cause !== error ? parseAssuranceRequired(source.cause) : null
	}

	const nextStep = source.nextStep
	const grade = source.grade

	return {
		// Passo desconhecido vira `challenge`: pedir o código é o caminho que funciona para
		// quem tem fator, e o modal ainda o corrige para `enroll` ao ver a conta sem fator.
		nextStep: NEXT_STEPS.includes(nextStep as AssuranceNextStep) ? (nextStep as AssuranceNextStep) : "challenge",
		reason: readString(source, "reason") ?? readString(source, "message") ?? DEFAULT_ASSURANCE_REASON,
		// Grau desconhecido vira `fresh`: é o texto mais exigente ("vale por 15 minutos"), e
		// prometer menos do que o sistema cobra é melhor que prometer mais.
		grade: grade === "session" ? "session" : "fresh",
		origin: source.origin === "api-key" ? "api-key" : "session",
	}
}

/**
 * O usuário fechou o modal de elevação. Não é falha do sistema nem da operação.
 *
 * Existe para que a camada de formulário distinga "deu erro" de "eu desisti": um toast
 * vermelho de "não foi possível salvar" depois de um cancelamento deliberado faz a pessoa
 * procurar um problema que não existe. O formulário continua preenchido e a sessão, ativa.
 */
export class ElevationCancelledError extends Error {
	readonly code = "MFA_ELEVATION_CANCELLED" as const
	readonly prompt: AssurancePrompt

	constructor(prompt: AssurancePrompt) {
		super("Confirmação de identidade cancelada.")
		this.name = "ElevationCancelledError"
		this.prompt = prompt
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

/** `true` quando o erro veio de um modal de elevação fechado pelo usuário. */
export function isElevationCancelled(error: unknown): error is ElevationCancelledError {
	return typeof error === "object" && error !== null && (error as Record<string, unknown>).code === "MFA_ELEVATION_CANCELLED"
}

/**
 * Executa a mutação e, se ela for barrada por garantia de identidade, eleva e REEXECUTA.
 *
 * É o coração do requisito "elevação preserva o trabalho em andamento". O que o preserva é o
 * fato de `variables` ser o MESMO valor nas duas execuções: o payload que o formulário montou
 * fica retido neste escopo, e nada relê o estado da tela depois do modal. Por isso também não
 * há redirecionamento — sair da rota descartaria o formulário, que é o que faz as pessoas
 * odiarem segundo fator.
 *
 * Uma tentativa de elevação, e só uma: se a segunda execução for barrada de novo, o erro
 * propaga. Repetir seria um laço de modais contra um servidor que está recusando por outro
 * motivo (relógio, fator removido em outra aba), e o usuário não teria como sair dele.
 */
export async function runWithElevation<TVariables, TData>(
	variables: TVariables,
	run: (variables: TVariables) => Promise<TData>,
	requestElevation: (prompt: AssurancePrompt) => Promise<boolean>
): Promise<TData> {
	try {
		return await run(variables)
	} catch (error) {
		const prompt = parseAssuranceRequired(error)
		if (!prompt) throw error

		const elevated = await requestElevation(prompt)
		if (!elevated) throw new ElevationCancelledError(prompt)

		return await run(variables)
	}
}

/**
 * Qual tela o modal abre, cruzando o `nextStep` do servidor com o que a conta TEM agora.
 *
 * O `nextStep` foi decidido no instante da recusa; o modal abre depois, e entre um e outro a
 * conta pode ter mudado — cadastro concluído em outra aba, fator removido. A contagem de
 * fatores verificados é o fato mais recente, então ela vence. Enquanto a consulta não
 * respondeu (`undefined`), vale o que o servidor disse.
 */
export function resolveElevationStep(nextStep: AssuranceNextStep, verifiedFactorCount: number | undefined): "enroll" | "code" {
	if (verifiedFactorCount === undefined) return nextStep === "enroll" ? "enroll" : "code"
	return verifiedFactorCount === 0 ? "enroll" : "code"
}
