/**
 * `withSessionIdentity` é o ponto onde a garantia self-only das server functions deixa de ser
 * comentário e passa a ser código. Se ela falhar, o `userId` que o cliente mandou volta a
 * decidir de quem é o dado — e nenhuma das fns que a usam tem como perceber.
 *
 * O caso da ordem do spread tem teste próprio de propósito: era exatamente essa a garantia
 * frágil em `forecast.fn.ts` (`{ ...data, userId }` — inverter a ordem entregava o alvo ao
 * cliente sem quebrar nada).
 */

import { describe, expect, test } from "vitest"
import { type SessionIdentity, withSessionIdentity } from "@/lib/session-identity"

const session: SessionIdentity = { userId: "session-user", email: "session@fab.mil.br" }

describe("withSessionIdentity", () => {
	test("sobrescreve o userId escolhido pelo cliente", () => {
		const payload = { userId: "victim-user", startDate: "2026-09-01", endDate: "2026-09-07" }

		expect(withSessionIdentity(payload, session, ["userId"])).toEqual({
			userId: "session-user",
			startDate: "2026-09-01",
			endDate: "2026-09-07",
		})
	})

	test("sobrescreve o email escolhido pelo cliente", () => {
		const payload = { email: "victim@fab.mil.br", messHallId: 3 }

		expect(withSessionIdentity(payload, session, ["email"])).toEqual({ email: "session@fab.mil.br", messHallId: 3 })
	})

	test("sobrescreve os dois campos quando ambos são nomeados", () => {
		const payload = { userId: "victim-user", email: "victim@fab.mil.br", nrOrdem: "1234567" }

		expect(withSessionIdentity(payload, session, ["userId", "email"])).toEqual({
			userId: "session-user",
			email: "session@fab.mil.br",
			nrOrdem: "1234567",
		})
	})

	test("aceita a forma snake_case do campo", () => {
		const payload = { user_id: "victim-user", date: "2026-09-01" }

		expect(withSessionIdentity(payload, session, ["user_id"]).user_id).toBe("session-user")
	})

	test("não deixa a chave do payload vencer a da sessão, qualquer que seja a ordem das chaves", () => {
		// Regressão do padrão frágil: `{ ...data, userId }` só funcionava porque o override
		// vinha DEPOIS. Aqui o resultado não pode depender disso.
		const first = withSessionIdentity({ userId: "victim-user", date: "2026-09-01" }, session, ["userId"])
		const second = withSessionIdentity({ date: "2026-09-01", userId: "victim-user" }, session, ["userId"])

		expect(first.userId).toBe("session-user")
		expect(second.userId).toBe("session-user")
	})

	test("não muta o payload recebido", () => {
		const payload = { userId: "victim-user", messHallId: 1 }
		withSessionIdentity(payload, session, ["userId"])

		expect(payload.userId).toBe("victim-user")
	})

	test("preserva campos que não são de identidade, inclusive os falsy", () => {
		const payload = { userId: "victim-user", willEat: false, messHallId: 0, notes: "" }

		expect(withSessionIdentity(payload, session, ["userId"])).toEqual({
			userId: "session-user",
			willEat: false,
			messHallId: 0,
			notes: "",
		})
	})

	test("email vazio da sessão continua vencendo o email do cliente", () => {
		// Conta sem email no JWT: gravar string vazia é o comportamento herdado
		// (`syncUserEmail` faz o mesmo). O que não pode é aceitar o do cliente no lugar.
		const anonymous: SessionIdentity = { userId: "session-user", email: "" }

		expect(withSessionIdentity({ email: "victim@fab.mil.br" }, anonymous, ["email"]).email).toBe("")
	})
})
