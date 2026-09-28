/**
 * Nitro plugin — toda resposta diz de qual build ela veio (`x-sisub-build`).
 *
 * Inclusive os erros que o h3 monta sozinho (server function desconhecida, 5xx de task em
 * drain): é justamente nesses que a aba precisa saber se falou com uma versão diferente da
 * dela. Quem lê é o `fetch` das server functions (`server-fn-fetch.ts`).
 */
import { definePlugin as defineNitroPlugin } from "nitro"

import { BUILD_ID, BUILD_ID_HEADER } from "./build-id"

export default defineNitroPlugin((nitroApp) => {
	nitroApp.hooks.hook("response", (res) => {
		res.headers.set(BUILD_ID_HEADER, BUILD_ID)
	})
})
