import { describe, expect, it } from "bun:test"
import { homedir } from "node:os"
import { expandHome } from "./rada.ts"

describe("expandHome", () => {
	it("expande o til inicial", () => {
		expect(expandHome("~/rada-e")).toBe(`${homedir()}/rada-e`)
	})

	it("expande o til sozinho", () => {
		expect(expandHome("~")).toBe(homedir())
	})

	it("não toca caminho absoluto nem relativo", () => {
		expect(expandHome("/srv/rada-e")).toBe("/srv/rada-e")
		expect(expandHome("./acervo")).toBe("./acervo")
	})

	it("não expande til no meio do caminho", () => {
		// `~` só é home no INÍCIO; no meio é nome de diretório comum.
		expect(expandHome("/tmp/~/x")).toBe("/tmp/~/x")
		expect(expandHome("backup~/rada")).toBe("backup~/rada")
	})

	it("nunca devolve caminho relativo para um valor com til — este é o ponto", () => {
		// O `.env.schema` documenta `~/rada-e`, e o shell NÃO expande valor lido de
		// arquivo. Sem a expansão, o acervo caía em `apps/alpha/~/rada-e/`, dentro da
		// árvore de um repositório público e fora de qualquer regra do .gitignore.
		expect(expandHome("~/rada-e").startsWith("/")).toBe(true)
	})
})
