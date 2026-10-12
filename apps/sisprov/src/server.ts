import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"

/**
 * Entry do servidor. O `start-plugin-core` resolve `src/server.{ts,tsx,…}`.
 *
 * Sem `createAgentServerEntry` (`@iefa/agent-web`) de propósito: o SISPROV é inteiro
 * autenticado, sem conteúdo público nem tool de agente. Entra quando houver um dos dois
 * (`openspec/changes/sisprov-foundation`, D7).
 */
export default createStartHandler(defaultStreamHandler)
