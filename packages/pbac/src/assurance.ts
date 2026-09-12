/**
 * @module assurance
 * Avaliação PURA da garantia de identidade: dado um contexto e uma exigência, passa ou lança.
 *
 * ## Dois graus, e é isso que resolve o atrito (design.md D2)
 *
 * | Grau      | Regra                                                  | Custo para o usuário          |
 * |-----------|--------------------------------------------------------|-------------------------------|
 * | `session` | a sessão precisa estar em AAL2                          | digitou uma vez, no login     |
 * | `fresh`   | AAL2 **e** fator verificado há no máximo 15 min         | um modal de 6 dígitos na ação |
 *
 * Um grau único ("toda operação sensível pede código fresco") transformaria o operador de
 * liquidação que trabalha 4 horas seguidas em alguém que digita 6 dígitos umas 16 vezes por
 * turno. Ele deixaria o aplicativo aberto ao lado do teclado e o controle viraria teatro.
 *
 * ## Por que é puro, e mora no pacote
 *
 * Os três pontos de autorização do ERP são diferentes — `requireLevel` do `@iefa/pbac/start`
 * (outros apps), `requireAuthWithPermission` do sisub e os guards do `sisub-domain`. Uma
 * avaliação copiada nos três divergiria; a regra fica aqui, uma vez, e cada ponto só a chama.
 * Sem relógio próprio (`now` é parâmetro), sem I/O, sem framework.
 *
 * ## A ordem importa: garantia depois de permissão
 *
 * Quem chama SHALL avaliar o gate de módulo/nível ANTES desta função. Inverter faria alguém
 * sem nenhuma permissão receber um pedido de segundo fator — treinando a pessoa a digitar
 * código para chegar a uma tela que ela não pode ver de qualquer jeito, e revelando que a
 * operação existe.
 */

import { type AssuranceNextStep, AssuranceRequiredError } from "./errors.ts"
import type { UserContext } from "./types.ts"

/** Graus de exigência. `none` é a ausência de exigência, e é o default de toda operação. */
export type AssuranceGrade = "session" | "fresh"

/**
 * O que uma operação exige.
 *
 * O `reason` é obrigatório quando há exigência porque é o texto que o usuário LÊ no modal.
 * Sem ele o modal pediria 6 dígitos sem dizer para quê — e é assim que se treina alguém a
 * digitar código sem ler o motivo, que é o contrário do controle.
 */
export type AssuranceRequirement = { require: "none" } | { require: AssuranceGrade; reason: string }

/** Ausência de exigência. Valor de partida de toda operação, e o rollback natural do piso. */
export const NO_ASSURANCE: AssuranceRequirement = { require: "none" }

/**
 * Janela de elevação do grau `fresh`, em segundos.
 *
 * 15 minutos cobre um lote de concessões de permissão (a ação que mais se faz em sequência)
 * sem cobrir um turno inteiro. A alternativa descartada no desenho — janela deslizante,
 * renovada a cada operação sensível — nunca expiraria num turno de trabalho: seria `session`
 * com a aparência enganosa de frescor.
 */
export const ASSURANCE_FRESHNESS_WINDOW_SECONDS = 15 * 60

export interface AssertAssuranceOptions {
	/** Agora, em epoch de SEGUNDOS (a mesma unidade do `amr` do GoTrue). Default: relógio do processo. */
	now?: number
}

/**
 * Próximo passo para quem foi barrado.
 *
 * `enroll` quando a conta não tem fator — o modal oferece o cadastro ali mesmo e a ação segue
 * depois, porque verificar um fator promove a SESSÃO ATUAL a AAL2 (as outras é que caem), e o
 * formulário aberto na aba sobrevive. `hasVerifiedFactor` ausente cai aqui: mandar cadastrar
 * quem já tem fator dá um erro claro do próprio GoTrue (V2: `403 insufficient_aal`), enquanto
 * mandar digitar código quem não tem fator é um beco sem saída.
 */
function nextStepFor(ctx: UserContext): AssuranceNextStep {
	if (ctx.aal < 2) return ctx.hasVerifiedFactor ? "challenge" : "enroll"
	// AAL2 e ainda assim barrado: só pode ser elevação vencida (grau `fresh`).
	return "step-up"
}

/**
 * Passa em silêncio quando o contexto satisfaz a exigência; lança {@link AssuranceRequiredError}
 * quando não.
 *
 * @param ctx         - Contexto do usuário JÁ autorizado pelo gate de módulo/nível
 * @param requirement - Exigência da operação. `{ require: "none" }` é no-op.
 */
export function assertAssurance(ctx: UserContext, requirement: AssuranceRequirement, options: AssertAssuranceOptions = {}): void {
	// Sai antes de qualquer leitura do contexto: operação de rotina não paga nada, e é a
	// esmagadora maioria delas. Também é o rollback do desenho — zerar o piso devolve o
	// sistema ao comportamento anterior sem migration e sem deploy de banco.
	if (requirement.require === "none") return

	const { require: grade, reason } = requirement

	// Chave de API NUNCA satisfaz grau nenhum (design.md D11). Na prática ela já cairia pelo
	// `aal: 1` logo abaixo — este ramo existe pela MENSAGEM: "digite o código de 6 dígitos"
	// não tem como ser obedecido por uma credencial sem dono na frente do teclado. Quem
	// distingue os dois casos a jusante é `origin` no erro; o `nextStep` da união ("enroll",
	// "challenge", "step-up") descreve passos de usuário, e nenhum deles cabe aqui — a
	// renderização definitiva para o modelo do MCP é a etapa 10 do plano.
	if (ctx.origin === "api-key") {
		throw new AssuranceRequiredError({
			nextStep: "challenge",
			reason,
			grade,
			origin: "api-key",
			message: `${reason} Chaves de API não executam esta operação: ela exige um segundo fator, que só uma sessão interativa pode apresentar.`,
		})
	}

	if (ctx.aal < 2) {
		throw new AssuranceRequiredError({ nextStep: nextStepFor(ctx), reason, grade, origin: ctx.origin })
	}

	if (grade === "session") return

	const now = options.now ?? Math.floor(Date.now() / 1000)
	// `lastFactorAt` nulo com AAL2 significa que o `amr` não trouxe entrada `totp` — token de
	// formato inesperado. Tratar como elevação vencida falha FECHADO e conduz ao desafio, que
	// é exatamente a recomendação do Supabase para AAL menor que o esperado no servidor:
	// costuma ser aba esquecida aberta, não ataque, e a resposta certa é conduzir, não negar.
	const elevatedAt = ctx.lastFactorAt
	if (elevatedAt !== null && now - elevatedAt <= ASSURANCE_FRESHNESS_WINDOW_SECONDS) return

	throw new AssuranceRequiredError({ nextStep: "step-up", reason, grade, origin: ctx.origin })
}

/**
 * Versão booleana, para renderização condicional (esconder um botão que a sessão não alcança).
 *
 * NUNCA use isto como gate: quem decide é `assertAssurance`, no servidor. Esconder o botão é
 * cortesia; o piso é o guard.
 */
export function satisfiesAssurance(ctx: UserContext, requirement: AssuranceRequirement, options: AssertAssuranceOptions = {}): boolean {
	try {
		assertAssurance(ctx, requirement, options)
		return true
	} catch (error) {
		if (error instanceof AssuranceRequiredError) return false
		throw error
	}
}
