/**
 * A sessão de recuperação de senha autentica, mas não pode gerenciar segundo fator.
 *
 * O cenário que este teste guarda é o da spec: quem controla a caixa de e-mail da vítima
 * dispara a recuperação, entra pelo link e — se o sistema deixasse — cadastraria o próprio
 * TOTP, desconectando a vítima de tudo e fechando a porta atrás de si. O `amr` é o único
 * lugar onde a origem da sessão continua escrita depois que o login terminou.
 */

import { describe, expect, test } from "vitest"
import { isRecoveryOriginatedSession, readAuthenticationMethods, readSessionId } from "@/lib/session-claims"

/** Payload no formato que o GoTrue emite. */
function payload(amr: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return { sub: "user-1", aal: "aal1", amr, ...extra }
}

describe("readAuthenticationMethods", () => {
	test("lê método e instante de cada entrada", () => {
		expect(
			readAuthenticationMethods([
				{ method: "password", timestamp: 100 },
				{ method: "totp", timestamp: 200 },
			])
		).toEqual([
			{ method: "password", timestamp: 100 },
			{ method: "totp", timestamp: 200 },
		])
	})

	test("descarta entrada malformada em vez de inventar um método", () => {
		// Um método vindo de lixo participaria de comparações e decidiria acesso.
		expect(readAuthenticationMethods([null, 42, "password", { timestamp: 1 }, { method: "recovery" }])).toEqual([{ method: "recovery", timestamp: null }])
	})

	test("`amr` ausente ou de outro tipo não vira lista", () => {
		expect(readAuthenticationMethods(undefined)).toEqual([])
		expect(readAuthenticationMethods({ method: "recovery" })).toEqual([])
	})
})

describe("isRecoveryOriginatedSession", () => {
	test("sessão aberta por link de recuperação é reconhecida", () => {
		expect(isRecoveryOriginatedSession(payload([{ method: "recovery", timestamp: 1_700_000_000 }]))).toBe(true)
	})

	test("a origem sobrevive às renovações de token", () => {
		// `token_refresh` entra na lista a cada renovação. Se a leitura olhasse só a entrada
		// mais recente, bastaria uma hora aberta para a sessão de recuperação virar sessão comum.
		expect(
			isRecoveryOriginatedSession(
				payload([
					{ method: "recovery", timestamp: 1_700_000_000 },
					{ method: "token_refresh", timestamp: 1_700_003_600 },
				])
			)
		).toBe(true)
	})

	test("sessão de senha não é sessão de recuperação", () => {
		expect(isRecoveryOriginatedSession(payload([{ method: "password", timestamp: 1 }]))).toBe(false)
	})

	test("sessão de senha com segundo fator também não é", () => {
		expect(
			isRecoveryOriginatedSession(
				payload(
					[
						{ method: "password", timestamp: 1 },
						{ method: "totp", timestamp: 2 },
					],
					{ aal: "aal2" }
				)
			)
		).toBe(false)
	})

	test("payload ausente ou sem `amr` falha ABERTO", () => {
		// Este predicado BLOQUEIA a gestão de fatores. Falhar fechado trancaria todo mundo
		// fora do cadastro de MFA no dia em que o formato do token mudasse.
		expect(isRecoveryOriginatedSession(null)).toBe(false)
		expect(isRecoveryOriginatedSession(payload(undefined))).toBe(false)
	})
})

describe("readSessionId", () => {
	test("devolve o `session_id` do token", () => {
		expect(readSessionId(payload([], { session_id: "sess-1" }))).toBe("sess-1")
	})

	test("ausente, vazio ou de outro tipo devolve null — a lista só perde o marcador de 'este dispositivo'", () => {
		expect(readSessionId(payload([]))).toBeNull()
		expect(readSessionId(payload([], { session_id: "" }))).toBeNull()
		expect(readSessionId(payload([], { session_id: 7 }))).toBeNull()
		expect(readSessionId(null)).toBeNull()
	})
})
