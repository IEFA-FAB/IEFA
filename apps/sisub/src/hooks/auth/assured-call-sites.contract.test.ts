/**
 * Contrato dos CALL SITES das operações classificadas.
 *
 * O servidor já sabe recusar (`AssuranceRequiredError`) e o cliente já sabe elevar
 * (`useAssuredMutation` / `useAssuredAction`). O que não tem dono é o meio: uma tela que chama
 * uma server function classificada com `useMutation` cru continua compilando, continua passando
 * em todos os testes e continua verde em produção — até o dia em que a chave de
 * `ASSURANCE_ENFORCEMENT` subir. Aí, e só aí, ela mostra "Erro ao adicionar: Esta operação
 * altera permissões de acesso" e descarta o formulário. O defeito nasce hoje e aparece meses
 * depois, no pior momento: exatamente o formato que este repo fecha com contrato.
 *
 * A varredura é de código-fonte, como `elevation-ux.contract.test.ts` e
 * `server-fn-auth.contract.test.ts`: o app não tem runner de DOM, e a invariante ("o arquivo que
 * chama a fn classificada também importa o wrapper") é estrutural o bastante para ser lida do
 * arquivo.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { classifiedOperations } from "@/server/assurance-registry"

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, "..", "..")

/**
 * Arquivos que legitimamente citam uma operação classificada sem elevar, com o motivo.
 *
 * Sem motivo escrito a isenção vira lixeira e o contrato morre — é a mesma disciplina do
 * `EXEMPT` do inventário de cookies do `@iefa/legal-kit`.
 */
const EXEMPT: Record<string, string> = {
	"hooks/data/useMfa.ts":
		"cadastro e remoção do PRÓPRIO fator. Exigir elevação aqui trancaria toda conta sem fator fora do cadastro — o piso destas operações é o do GoTrue, não o do registro.",
	"hooks/data/useMfaRecovery.ts":
		"códigos de recuperação da própria conta. O consumo roda em AAL1 por definição: quem usa um código é quem acabou de perder o segundo fator.",
	"lib/assurance/session-elevation.ts": "é o MOTOR da elevação — ele chama `verifyMfaEnrollmentFn` para PRODUZIR o AAL2 que o modal precisa.",
	"lib/mfa-admin-reset.ts": "só tipos e constantes do reset administrativo; quem chama a fn é `hooks/data/useAdminMfa.ts`, que eleva.",
}

/** Símbolos que provam que o arquivo sabe elevar. */
const ELEVATION_SYMBOLS = ["useAssuredMutation", "useAssuredAction", "runWithElevation"]

/**
 * Remove comentários antes de procurar o nome da fn.
 *
 * Sem isso, a tela de auditoria reprovaria por citar `createUserPermissionFn` numa frase que
 * explica por que a coluna mostra o nome cru — e a "correção" seria apagar a explicação.
 */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

function collectClientFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			// `server/` é o outro lado da fronteira, e `test/` são fixtures.
			if (entry.name === "server" && dir === srcDir) continue
			if (entry.name === "test" && dir === srcDir) continue
			collectClientFiles(full, out)
			continue
		}
		if (!/\.tsx?$/.test(entry.name)) continue
		if (entry.name.includes(".test.") || entry.name.endsWith(".server.ts") || entry.name === "routeTree.gen.ts") continue
		out.push(full)
	}
	return out
}

const clientFiles = collectClientFiles(srcDir).map((file) => ({
	path: relative(srcDir, file).replaceAll("\\", "/"),
	code: stripComments(readFileSync(file, "utf8")),
}))

describe("toda chamada de operação classificada sabe elevar", () => {
	test("a varredura encontrou arquivos (proteção contra um teste que passa vazio)", () => {
		expect(clientFiles.length).toBeGreaterThan(100)
		expect(classifiedOperations().length).toBeGreaterThan(10)
	})

	test("nenhum call site de operação classificada chama a fn sem o wrapper de elevação", () => {
		const offenders: string[] = []

		for (const { operation } of classifiedOperations()) {
			// A chamada, não a menção: `nomeDaFn(` ou `nomeDaFn` num import não bastam — o que
			// interessa é o arquivo que a INVOCA.
			const callPattern = new RegExp(`\\b${operation}\\s*\\(`)

			for (const file of clientFiles) {
				if (!callPattern.test(file.code)) continue
				if (file.path in EXEMPT) continue
				if (ELEVATION_SYMBOLS.some((symbol) => file.code.includes(symbol))) continue
				offenders.push(`${file.path} chama ${operation}`)
			}
		}

		expect(
			offenders.sort(),
			"call site de operação classificada sem `useAssuredMutation`/`useAssuredAction`: quando o piso subir, a recusa vira erro cru e o formulário se perde"
		).toEqual([])
	})

	test("EXEMPT não tem entrada obsoleta", () => {
		const known = new Set(clientFiles.map((file) => file.path))
		const stale = Object.keys(EXEMPT).filter((path) => !known.has(path))
		expect(stale, "isenções apontando para arquivo que não existe mais — remova-as").toEqual([])
	})

	test("toda isenção tem motivo escrito", () => {
		const mudas = Object.entries(EXEMPT).filter(([, reason]) => reason.trim().length < 40)
		expect(
			mudas.map(([path]) => path),
			"isenção sem motivo legível vira lixeira"
		).toEqual([])
	})
})
