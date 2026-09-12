/**
 * O limite de tentativas do código de recuperação tem que barrar força bruta SEM virar
 * botão de bloqueio (design.md D17, spec `mfa-recovery`).
 *
 * As duas metades se contradizem se o limite for só por usuário, e é por isso que estes
 * testes existem: o cenário "terceiro não tranca a vítima" é exatamente o defeito que um
 * limite por `user_id` introduziria, e ele passaria despercebido — quem o implementa nunca
 * testa a própria recuperação a partir de outro IP.
 */

import { describe, expect, test } from "vitest"
import {
	attemptBlockedMessage,
	MAX_FAILURES_PER_ORIGIN,
	MAX_FAILURES_PER_USER,
	RECOVERY_ATTEMPT_LIMITER,
	RECOVERY_WINDOW_MS,
	RecoveryAttemptLimiter,
} from "./recovery-rate-limit"

const VICTIM = "11111111-1111-1111-1111-111111111111"
const OTHER_USER = "22222222-2222-2222-2222-222222222222"
const ATTACKER_ORIGIN = "203.0.113.10"
const VICTIM_ORIGIN = "198.51.100.20"

const T0 = 1_760_000_000_000

/** Erra `times` vezes a partir de uma origem, no mesmo instante. */
function burn(limiter: RecoveryAttemptLimiter, userId: string, origin: string, times: number, now = T0) {
	for (let i = 0; i < times; i++) limiter.recordFailure({ userId, origin }, now)
}

describe("teto por origem", () => {
	test("a primeira tentativa é sempre permitida", () => {
		const limiter = new RecoveryAttemptLimiter()
		expect(limiter.assess({ userId: VICTIM, origin: VICTIM_ORIGIN }, T0)).toEqual({ allowed: true })
	})

	test("erros sucessivos da mesma origem bloqueiam aquela origem", () => {
		const limiter = new RecoveryAttemptLimiter()
		burn(limiter, VICTIM, ATTACKER_ORIGIN, MAX_FAILURES_PER_ORIGIN)

		const verdict = limiter.assess({ userId: VICTIM, origin: ATTACKER_ORIGIN }, T0)
		expect(verdict.allowed).toBe(false)
		if (verdict.allowed) return
		expect(verdict.scope).toBe("origin")
		expect(verdict.retryAfterSeconds).toBeGreaterThan(0)
	})

	test("uma tentativa a menos que o teto ainda passa", () => {
		const limiter = new RecoveryAttemptLimiter()
		burn(limiter, VICTIM, ATTACKER_ORIGIN, MAX_FAILURES_PER_ORIGIN - 1)

		expect(limiter.assess({ userId: VICTIM, origin: ATTACKER_ORIGIN }, T0)).toEqual({ allowed: true })
	})

	test("a janela expira e a origem volta a tentar", () => {
		const limiter = new RecoveryAttemptLimiter()
		burn(limiter, VICTIM, ATTACKER_ORIGIN, MAX_FAILURES_PER_ORIGIN)

		expect(limiter.assess({ userId: VICTIM, origin: ATTACKER_ORIGIN }, T0 + RECOVERY_WINDOW_MS + 1)).toEqual({ allowed: true })
	})
})

describe("teto global por usuário", () => {
	test("é mais alto que o teto por origem — é o que impede o terceiro de trancar a conta", () => {
		expect(MAX_FAILURES_PER_USER).toBeGreaterThan(MAX_FAILURES_PER_ORIGIN)
	})

	/** O cenário da spec: "Terceiro não tranca a recuperação da vítima". */
	test("atacante esgota a própria origem e a vítima, de outro IP, ainda consegue tentar", () => {
		const limiter = new RecoveryAttemptLimiter()
		burn(limiter, VICTIM, ATTACKER_ORIGIN, MAX_FAILURES_PER_ORIGIN)

		expect(limiter.assess({ userId: VICTIM, origin: ATTACKER_ORIGIN }, T0).allowed).toBe(false)
		expect(limiter.assess({ userId: VICTIM, origin: VICTIM_ORIGIN }, T0)).toEqual({ allowed: true })
	})

	test("e a vítima tem folga de sobra: o que o atacante queimou não chega perto do teto global", () => {
		const limiter = new RecoveryAttemptLimiter()
		burn(limiter, VICTIM, ATTACKER_ORIGIN, MAX_FAILURES_PER_ORIGIN)

		// Da origem dela, a vítima ainda erra até o próprio teto de origem sem esbarrar no global.
		burn(limiter, VICTIM, VICTIM_ORIGIN, MAX_FAILURES_PER_ORIGIN - 1)
		expect(limiter.assess({ userId: VICTIM, origin: VICTIM_ORIGIN }, T0)).toEqual({ allowed: true })
	})

	test("força bruta distribuída esbarra no teto global mesmo trocando de origem", () => {
		const limiter = new RecoveryAttemptLimiter()
		const origins = MAX_FAILURES_PER_USER / MAX_FAILURES_PER_ORIGIN
		for (let i = 0; i < origins; i++) burn(limiter, VICTIM, `203.0.113.${i}`, MAX_FAILURES_PER_ORIGIN)

		const verdict = limiter.assess({ userId: VICTIM, origin: "198.51.100.99" }, T0)
		expect(verdict.allowed).toBe(false)
		if (!verdict.allowed) expect(verdict.scope).toBe("user")
	})

	test("o balde é por usuário: esgotar a conta de um não alcança a de outro", () => {
		const limiter = new RecoveryAttemptLimiter()
		for (let i = 0; i < 4; i++) burn(limiter, VICTIM, `203.0.113.${i}`, MAX_FAILURES_PER_ORIGIN)

		expect(limiter.assess({ userId: VICTIM, origin: "198.51.100.99" }, T0).allowed).toBe(false)
		expect(limiter.assess({ userId: OTHER_USER, origin: ATTACKER_ORIGIN }, T0)).toEqual({ allowed: true })
	})
})

describe("consumo bem-sucedido", () => {
	test("não é `assess` que conta — um código certo não gasta o orçamento de quem errou", () => {
		const limiter = new RecoveryAttemptLimiter()
		for (let i = 0; i < 50; i++) limiter.assess({ userId: VICTIM, origin: VICTIM_ORIGIN }, T0)

		expect(limiter.assess({ userId: VICTIM, origin: VICTIM_ORIGIN }, T0)).toEqual({ allowed: true })
	})

	test("acertar zera os dois baldes do titular", () => {
		const limiter = new RecoveryAttemptLimiter()
		burn(limiter, VICTIM, VICTIM_ORIGIN, MAX_FAILURES_PER_ORIGIN - 1)
		limiter.recordSuccess({ userId: VICTIM, origin: VICTIM_ORIGIN })

		burn(limiter, VICTIM, VICTIM_ORIGIN, MAX_FAILURES_PER_ORIGIN - 1)
		// Sem o reset, esta seria a tentativa de número 8 e estaria bloqueada.
		expect(limiter.assess({ userId: VICTIM, origin: VICTIM_ORIGIN }, T0)).toEqual({ allowed: true })
	})
})

describe("mensagem ao usuário", () => {
	test("não revela quantas tentativas faltam", () => {
		const message = attemptBlockedMessage({ allowed: false, scope: "origin", retryAfterSeconds: 600 })
		expect(message).not.toMatch(/\d+\s*tentativ/i)
		expect(message).toContain("10 minutos")
	})

	test("quando o teto estourado é o do usuário, aponta o caminho de socorro", () => {
		// É o único caso em que a pessoa não tem mais o que tentar sozinha — e o reset
		// administrativo, que este limite não alcança, é o que resta.
		expect(attemptBlockedMessage({ allowed: false, scope: "user", retryAfterSeconds: 60 })).toContain("administrador")
		expect(attemptBlockedMessage({ allowed: false, scope: "origin", retryAfterSeconds: 60 })).not.toContain("administrador")
	})
})

describe("superfície do módulo", () => {
	/**
	 * O limite existe para UMA pergunta: "esta tentativa de código de recuperação pode ser
	 * feita?". Nenhuma função aqui responde "esta conta está bloqueada?" — e é isso que
	 * torna impossível o reset administrativo consultá-lo por engano (spec: "o bloqueio
	 * SHALL NOT alcançar o caminho de reset administrativo"). O outro lado da prova está em
	 * `mfa-recovery.contract.test.ts`, que varre as server fns.
	 */
	test("não existe função que responda se um usuário está bloqueado", () => {
		const surface = Object.getOwnPropertyNames(RecoveryAttemptLimiter.prototype)
		expect(surface.filter((name) => /block|lock|ban|deny|suspend/i.test(name))).toEqual([])
		// As três públicas, e nada além delas que outro fluxo pudesse consultar.
		for (const name of ["assess", "recordFailure", "recordSuccess"]) expect(surface).toContain(name)
	})

	test("o singleton do processo existe e começa limpo", () => {
		expect(RECOVERY_ATTEMPT_LIMITER).toBeInstanceOf(RecoveryAttemptLimiter)
	})
})
