/**
 * Nitro plugin — erro em rota `immutable` nunca vai para o cache.
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

export default defineNitroPlugin((nitroApp) => {
	nitroApp.hooks.hook("response", (res) => {
		// Pelo header e não por prefixo: vale para toda routeRule `immutable`, atual ou futura,
		// e para qualquer erro (404 do build trocado, 5xx de task em drain).
		if (res.status >= 400 && res.headers.get("cache-control")?.includes("immutable")) {
			res.headers.set("cache-control", "no-store")
		}
	})
})
