/**
 * Middleware global das server functions: erro com diagnóstico do banco na mensagem sai com o
 * diagnóstico cortado (ver `db-diagnostics.ts`), e o original vai inteiro para o log.
 *
 * Fica na borda, e não em cada `if (error) throw`, porque são ~300 pontos escritos à mão e o
 * próximo nasce igual. Erro que não é `Error` (redirect, notFound) e erro sem diagnóstico
 * passam intocados — inclusive `AssuranceRequiredError`, que a UI lê pela classe.
 */

import { createMiddleware } from "@tanstack/react-start"
import { redactDbDiagnostics } from "./db-diagnostics"

export const dbDiagnosticsMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
	try {
		return await next()
	} catch (error) {
		if (!(error instanceof Error)) throw error
		const publicMessage = redactDbDiagnostics(error.message)
		if (publicMessage === null) throw error
		// biome-ignore lint/suspicious/noConsole: server-side — é onde o diagnóstico do banco tem de ficar
		console.error("[db-diagnostics]", error.message)
		throw new Error(publicMessage)
	}
})
