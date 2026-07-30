import { createAgentServerEntry } from "@iefa/agent-web/server"
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"
import { DISCOVERY_DOCUMENTS } from "#/lib/agent-discovery"

/**
 * Entry do servidor. O app não tinha nenhum: sem `src/server.{ts,tsx,…}` o
 * `start-plugin-core` cai no entry padrão embutido, que 500 em `Accept` não-HTML.
 */
export default createAgentServerEntry({
	handler: createStartHandler(defaultStreamHandler),
	discoveryDocuments: DISCOVERY_DOCUMENTS,
})
