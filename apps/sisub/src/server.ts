import { createAgentServerEntry } from "@iefa/agent-web/server"
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"
import { DISCOVERY_DOCUMENTS } from "@/lib/agent-discovery"

/**
 * Entry do servidor. O `start-plugin-core` resolve `src/server.{ts,tsx,…}` — o
 * antigo `src/ssr.tsx` era código morto e nunca foi carregado.
 *
 * `createAgentServerEntry` adiciona negociação de Markdown, troca o 500 genérico
 * do Start por 406 e anexa os cabeçalhos `Link` de descoberta.
 */
export default createAgentServerEntry({
	handler: createStartHandler(defaultStreamHandler),
	discoveryDocuments: DISCOVERY_DOCUMENTS,
})
