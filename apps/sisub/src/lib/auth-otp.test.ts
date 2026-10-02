import { describe, expect, test } from "vitest"
import { parseOtpType, readImplicitSession } from "./auth-otp"

describe("readImplicitSession", () => {
	test("lê a sessão do convite no fragmento", () => {
		expect(readImplicitSession("#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=invite")).toEqual({
			accessToken: "a.b.c",
			refreshToken: "r1",
			type: "invite",
		})
	})

	test("sem os dois tokens não há sessão", () => {
		expect(readImplicitSession("")).toBeNull()
		expect(readImplicitSession("#access_token=a.b.c")).toBeNull()
		expect(readImplicitSession("#error=access_denied&error_description=expired")).toBeNull()
	})
})

describe("parseOtpType", () => {
	test("tipo desconhecido cai em recovery; invite é reconhecido", () => {
		expect(parseOtpType("invite")).toBe("invite")
		expect(parseOtpType("qualquer")).toBe("recovery")
	})
})
