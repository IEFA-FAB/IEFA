/**
 * Nitro plugin — sink central de exceptions server-side.
 *
 * Registrado em vite.config.ts (`nitro({ plugins: [...] })`). Inicializa o OTel
 * no boot do servidor e engancha o hook `error` do Nitro, que dispara em
 * exceptions de SSR e de qualquer handler/server fn que faça rethrow.
 *
 * Domain errors (`handleDomainError` → 403/404/400) NÃO chegam aqui — são
 * respostas HTTP, não throws. Exatamente o que queremos: sem ruído de
 * telemetria para erros de negócio esperados.
 */
import { definePlugin as defineNitroPlugin } from "nitro"
import { initServerOtel, recordServerException } from "./otel.server"

export default defineNitroPlugin((nitroApp) => {
	initServerOtel()

	nitroApp.hooks.hook("error", (error, context) => {
		// h3 v2: shape do event evolui entre rcs — acesso defensivo a path/method.
		const event = context?.event as
			| {
					path?: string
					method?: string
					url?: { pathname?: string }
					req?: { method?: string }
			  }
			| undefined

		recordServerException(error, {
			"http.route": event?.path ?? event?.url?.pathname,
			"http.method": event?.method ?? event?.req?.method,
		})
	})
})
