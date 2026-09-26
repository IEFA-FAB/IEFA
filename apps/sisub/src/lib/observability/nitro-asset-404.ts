/**
 * Nitro plugin — 404 de asset com hash nunca vai para o cache.
 *
 * A routeRule de `/assets/**` (vite.config.ts) marca a resposta como
 * `immutable` por um ano, e o Nitro aplica o header também quando o arquivo não
 * existe. No deploy rolante as duas tasks do ECS servem builds diferentes por
 * alguns minutos: o HTML novo pede `kitchen-<hash novo>.js`, o ALB manda a
 * requisição para a task velha e o 404 fica guardado no navegador por um ano.
 * A recuperação de chunk obsoleto recarrega, o navegador serve o 404 do cache e
 * a página fica quebrada até alguém limpar o cache.
 */
import { definePlugin as defineNitroPlugin } from "nitro"

/** Prefixos servidos com `immutable` pelas routeRules. */
const IMMUTABLE_PREFIX = /^\/(?:assets|fonts)\//

export default defineNitroPlugin((nitroApp) => {
	nitroApp.hooks.hook("response", (res, event) => {
		if (res.status === 404 && IMMUTABLE_PREFIX.test(new URL(event.req.url).pathname)) {
			res.headers.set("cache-control", "no-store")
		}
	})
})
