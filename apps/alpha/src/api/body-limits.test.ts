import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { MAX_JSON_BODY_BYTES, MAX_UPLOAD_BODY_BYTES, requestBodyLimit } from "./body-limits.ts"

const app = new Hono()
	.use("/api/v1/*", requestBodyLimit)
	.post("/api/v1/submissions", async (c) => c.json({ size: (await c.req.arrayBuffer()).byteLength }))
	.post("/api/v1/sessions/s/messages", async (c) => c.json({ size: (await c.req.arrayBuffer()).byteLength }))

function post(path: string, bytes: number) {
	return app.request(path, { method: "POST", body: new Uint8Array(bytes), headers: { "content-length": String(bytes) } })
}

describe("requestBodyLimit", () => {
	test("rota JSON: corpo acima do teto é 413 antes do handler", async () => {
		const res = await post("/api/v1/sessions/s/messages", MAX_JSON_BODY_BYTES + 1)
		expect(res.status).toBe(413)
		expect(((await res.json()) as { code: string }).code).toBe("BODY_TOO_LARGE")
	})

	test("rota JSON: corpo dentro do teto passa", async () => {
		expect((await post("/api/v1/sessions/s/messages", 1024)).status).toBe(200)
	})

	test("upload: o teto largo vale só para o POST de submissão", async () => {
		expect((await post("/api/v1/submissions", MAX_JSON_BODY_BYTES + 1)).status).toBe(200)
		expect((await post("/api/v1/submissions", MAX_UPLOAD_BODY_BYTES + 1)).status).toBe(413)
	})
})
