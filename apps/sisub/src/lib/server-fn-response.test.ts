import { describe, expect, it } from "vitest"

import { BUILD_ID_HEADER, compareBuildIds } from "./build-id"
import { checkServerFnResponse, describeTransportFailure, ServerFnTransportError } from "./server-fn-response"

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
}

// O corpo exato que o h3 devolve quando a task não conhece a server function (deploy rolante).
const UNHANDLED = { status: 500, unhandled: true, message: "HTTPError" }

describe("checkServerFnResponse", () => {
	it("deixa passar sucesso, erro serializado e resposta crua do handler", async () => {
		const ok = json({ recipe: { id: "r1" } }, 200)
		expect(await checkServerFnResponse(ok)).toBe(ok)
		const domainError = json({ t: 1 }, 500, { "x-tss-serialized": "true" })
		expect(await checkServerFnResponse(domainError)).toBe(domainError)
		const raw = new Response("csv", { status: 500, headers: { "content-type": "text/csv", "x-tss-raw": "true" } })
		expect(await checkServerFnResponse(raw)).toBe(raw)
	})

	it("deixa passar o notFound() do servidor, que o TanStack relança", async () => {
		const notFound = json({ isNotFound: true }, 404)
		expect(await checkServerFnResponse(notFound)).toBe(notFound)
	})

	it("recusa o erro do h3 que o TanStack tomaria por resultado", async () => {
		// Antes: "Nova versão criada com sucesso", rascunho apagado e nada gravado.
		const outcome = await checkServerFnResponse(json(UNHANDLED, 500)).then(
			() => null,
			(error: unknown) => error
		)
		expect(outcome).toBeInstanceOf(ServerFnTransportError)
		expect((outcome as ServerFnTransportError).status).toBe(500)
		expect((outcome as ServerFnTransportError).message).toContain("não confirmou")
	})

	it("diz que o SISUB está sendo atualizado quando a resposta veio de outro build", async () => {
		const outcome = await checkServerFnResponse(json(UNHANDLED, 500, { [BUILD_ID_HEADER]: "1700000000000" }), "1800000000000").then(
			() => null,
			(error: unknown) => error as ServerFnTransportError
		)
		expect(outcome?.fromOtherBuild).toBe(true)
		expect(outcome?.message).toContain("sendo atualizado")
	})

	it("troca a página de erro do ALB por mensagem legível", async () => {
		const html = new Response("<html><body>502 Bad Gateway</body></html>", { status: 502, headers: { "content-type": "text/html" } })
		const outcome = await checkServerFnResponse(html).then(
			() => null,
			(error: unknown) => error as ServerFnTransportError
		)
		expect(outcome).toBeInstanceOf(ServerFnTransportError)
		expect(outcome?.message).not.toContain("<html>")
		expect(outcome?.message).toContain("sendo atualizado")
	})

	it("deixa o texto curto do próprio TanStack seguir (ele lança com a mensagem)", async () => {
		const methodNotAllowed = new Response("expected POST method. Got GET", { status: 405, headers: { "content-type": "text/plain" } })
		expect(await checkServerFnResponse(methodNotAllowed)).toBe(methodNotAllowed)
	})
})

describe("describeTransportFailure", () => {
	it("avisa que pode ter gravado quando a resposta se perdeu depois do servidor", () => {
		expect(describeTransportFailure(504, false)).toContain("pode ter sido gravada")
		expect(describeTransportFailure(0, false)).toContain("conexão com o SISUB caiu")
		expect(describeTransportFailure(500, false)).not.toContain("pode ter sido gravada")
	})
})

describe("compareBuildIds", () => {
	it("ordena pelo instante do build", () => {
		expect(compareBuildIds("200", "100")).toBe(1)
		expect(compareBuildIds("100", "200")).toBe(-1)
		expect(compareBuildIds("100", "100")).toBe(0)
	})

	it("não compara o que não é id de build", () => {
		expect(compareBuildIds(null, "100")).toBeNull()
		expect(compareBuildIds("dev", "100")).toBeNull()
		expect(compareBuildIds("100", "")).toBeNull()
	})
})
